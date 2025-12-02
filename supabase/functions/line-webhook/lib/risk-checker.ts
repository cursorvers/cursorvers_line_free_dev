// supabase/functions/line-webhook/lib/risk-checker.ts
// Risk Checker: 文章のリスクカテゴリを判定し、修正案を提示

import type { RiskCategory, RiskLevel, RiskCheckResult } from "./types.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

// System Prompt: リスクチェッカー
const SYSTEM_PROMPT = `あなたは、医療従事者向けの文章リスクチェッカーです。
ユーザーから送られてくる文章を分析し、以下のリスクカテゴリについて判定してください。

## リスクカテゴリ

1. **adv_advertising**（医療広告・誇大表現）
   - 「必ず治る」「絶対に効く」等の誇大表現
   - 医療広告ガイドライン違反の可能性がある表現

2. **pii_leakage**（個人情報・再識別リスク）
   - 患者名、施設名、日付、ID等の特定可能情報
   - 組み合わせによる再識別リスク

3. **clinical_quality**（医学的な妥当性）
   - エビデンスに基づかない主張
   - 誤解を招く可能性のある医学的表現

4. **contract_tax**（契約・税務）
   - 契約上の問題がある表現
   - 税務上のリスクがある記述

5. **ai_governance**（ガバナンス・コンプライアンス一般）
   - AI利用に関するガバナンス上の問題
   - 組織のコンプライアンスに抵触する可能性

## 判定基準

各カテゴリについて、以下の3段階で危険度を判定してください：
- **safe**: 問題なし
- **caution**: 注意が必要（修正を推奨）
- **danger**: 危険（即座に修正が必要）

## 出力形式

必ず以下のJSON形式で出力してください：

\`\`\`json
{
  "results": [
    {
      "category": "カテゴリ名",
      "level": "safe|caution|danger",
      "suggestion": "1行の修正案（問題がない場合は空文字）"
    }
  ],
  "summary": "全体の要約（2-3文）"
}
\`\`\`

## 注意事項

- 問題がないカテゴリも含めて、全5カテゴリについて判定してください
- 修正案は具体的かつ簡潔に（例：「『必ず治癒します』→『改善が期待できます』に修正」）
- 医療従事者向けなので、専門用語は適度に使用してOK`;

interface RiskCheckerResponse {
  success: boolean;
  results?: RiskCheckResult[];
  summary?: string;
  formattedMessage?: string;
  error?: string;
  riskFlags?: RiskCategory[];
}

/**
 * OpenAI API を呼び出して Risk Checker を実行
 */
export async function runRiskChecker(
  rawInput: string
): Promise<RiskCheckerResponse> {
  if (!OPENAI_API_KEY) {
    return {
      success: false,
      error: "OpenAI API キーが設定されていません。管理者に連絡してください。",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawInput },
        ],
        max_tokens: 1500,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[risk-checker] OpenAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return {
          success: false,
          error: "現在混み合っています。しばらくしてから再度お試しください。",
        };
      }
      
      return {
        success: false,
        error: "リスクチェック中にエラーが発生しました。時間をおいて再度お試しください。",
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        success: false,
        error: "応答の取得に失敗しました。再度お試しください。",
      };
    }

    // JSON パース
    let parsed: { results: RiskCheckResult[]; summary: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[risk-checker] Failed to parse JSON:", content);
      return {
        success: false,
        error: "応答の解析に失敗しました。再度お試しください。",
      };
    }

    // caution または danger のカテゴリを抽出
    const riskFlags = parsed.results
      .filter((r) => r.level === "caution" || r.level === "danger")
      .map((r) => r.category as RiskCategory);

    return {
      success: true,
      results: parsed.results,
      summary: parsed.summary,
      riskFlags,
      formattedMessage: formatOutput(parsed.results, parsed.summary),
    };
  } catch (err) {
    console.error("[risk-checker] Unexpected error:", err);
    return {
      success: false,
      error: "予期せぬエラーが発生しました。時間をおいて再度お試しください。",
    };
  }
}

/**
 * 出力を LINE メッセージ用にフォーマット
 */
function formatOutput(results: RiskCheckResult[], summary: string): string {
  const header = "🛡️ Risk Checker\n⚡ GPT-5.1 × 専用プロンプトで分析\n\n";
  
  // カテゴリ名の日本語マッピング
  const categoryNames: Record<string, string> = {
    adv_advertising: "医療広告・誇大表現",
    pii_leakage: "個人情報・再識別リスク",
    clinical_quality: "医学的妥当性",
    contract_tax: "契約・税務",
    ai_governance: "ガバナンス・コンプライアンス",
  };

  // レベルの絵文字マッピング
  const levelEmoji: Record<string, string> = {
    safe: "✅",
    caution: "⚠️",
    danger: "🚨",
  };

  let body = "";
  
  // 危険度が高い順にソート
  const sortedResults = [...results].sort((a, b) => {
    const order = { danger: 0, caution: 1, safe: 2 };
    return (order[a.level] ?? 2) - (order[b.level] ?? 2);
  });

  for (const result of sortedResults) {
    const emoji = levelEmoji[result.level] ?? "❓";
    const name = categoryNames[result.category] ?? result.category;
    body += `${emoji} ${name}\n`;
    
    if (result.suggestion && result.level !== "safe") {
      body += `   → ${result.suggestion}\n`;
    }
    body += "\n";
  }

  const footer = `📝 総評\n${summary}\n\n---\n💡 修正後、再度チェックすることをお勧めします。`;
  
  return header + body + footer;
}

