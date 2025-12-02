// supabase/functions/line-webhook/lib/risk-checker.ts
// Risk Checker: 文章のリスクカテゴリを判定し、修正案を提示

import type { RiskCategory, RiskLevel, RiskCheckResult } from "./types.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

// System Prompt: リスクチェッカー（点数化対応）
const SYSTEM_PROMPT = `あなたは、医療従事者向けの文章リスクチェッカーです。
ユーザーから送られてくる文章を分析し、リスクを**100点満点で点数化**して判定してください。

## リスクカテゴリと配点（各20点満点、合計100点）

1. **adv_advertising**（医療広告・誇大表現）20点
   - 「必ず治る」「絶対に効く」→ 0点
   - 「改善が期待できる」「効果が報告されている」→ 20点
   - 軽微な誇大表現 → 10点

2. **pii_leakage**（個人情報・再識別リスク）20点
   - 実名・具体的日付・ID記載 → 0点
   - 抽象化済み（60代男性、某病院など）→ 20点
   - 組み合わせで特定可能 → 5-10点

3. **clinical_quality**（医学的妥当性）20点
   - エビデンスなし・誤情報 → 0点
   - ガイドライン準拠・正確 → 20点
   - 一部不正確・古い情報 → 10点

4. **contract_tax**（契約・税務リスク）20点
   - 明確な違反・リスク → 0点
   - 問題なし → 20点
   - 軽微なリスク → 10点

5. **ai_governance**（AIガバナンス）20点
   - AI利用の明示なし・誤解を招く → 0点
   - 適切な免責・利用明示 → 20点
   - 一部不十分 → 10点

## 総合評価の基準
- 90-100点：🟢 安全（そのまま使用可能）
- 70-89点：🟡 注意（軽微な修正推奨）
- 50-69点：🟠 要修正（使用前に修正必要）
- 0-49点：🔴 危険（使用不可、大幅な修正必要）

## 出力形式

必ず以下のJSON形式で出力してください：

\`\`\`json
{
  "totalScore": 85,
  "grade": "A|B|C|D",
  "results": [
    {
      "category": "カテゴリ名",
      "score": 20,
      "maxScore": 20,
      "level": "safe|caution|danger",
      "issue": "問題点（なければ空文字）",
      "suggestion": "具体的な修正案（問題がない場合は空文字）"
    }
  ],
  "summary": "全体の要約と結論（このまま使えるか、修正が必要か明確に）",
  "actionRequired": true または false
}
\`\`\`

## grade の基準
- A: 90-100点（安全）
- B: 70-89点（注意）
- C: 50-69点（要修正）
- D: 0-49点（危険）

## 注意事項
- 全5カテゴリについて必ず判定
- 修正案は「〇〇→△△に変更」の形式で具体的に
- actionRequired は修正が必要な場合 true`;

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
        model: "gpt-4o",
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

// リスクカテゴリに対応するnote記事URL
const RISK_NOTE_ARTICLES: Record<string, { title: string; url: string }> = {
  adv_advertising: {
    title: "医療広告ガイドライン解説",
    url: "https://note.com/nice_wren7963/all",
  },
  pii_leakage: {
    title: "医療データ・個人情報の取り扱い",
    url: "https://note.com/nice_wren7963/all",
  },
  clinical_quality: {
    title: "エビデンスに基づく情報発信",
    url: "https://note.com/nice_wren7963/all",
  },
  contract_tax: {
    title: "医師の副業・契約の注意点",
    url: "https://note.com/nice_wren7963/all",
  },
  ai_governance: {
    title: "AIガバナンス・コンプライアンス",
    url: "https://note.com/nice_wren7963/all",
  },
};

/**
 * 出力を LINE メッセージ用にフォーマット（点数化・シンプル版）
 */
function formatOutput(results: RiskCheckResult[], summary: string): string {
  // カテゴリ名の日本語マッピング
  const categoryNames: Record<string, string> = {
    adv_advertising: "医療広告",
    pii_leakage: "個人情報",
    clinical_quality: "医学的妥当性",
    contract_tax: "契約・税務",
    ai_governance: "AIガバナンス",
  };

  // スコア計算（safe=20, caution=10, danger=0）
  const scoreMap: Record<string, number> = { safe: 20, caution: 10, danger: 0 };
  let totalScore = 0;
  for (const r of results) {
    totalScore += scoreMap[r.level] ?? 0;
  }

  // ランク判定
  let grade: string;
  let gradeEmoji: string;
  let gradeText: string;
  if (totalScore >= 90) {
    grade = "A";
    gradeEmoji = "🟢";
    gradeText = "安全（そのまま使用可能）";
  } else if (totalScore >= 70) {
    grade = "B";
    gradeEmoji = "🟡";
    gradeText = "注意（軽微な修正推奨）";
  } else if (totalScore >= 50) {
    grade = "C";
    gradeEmoji = "🟠";
    gradeText = "要修正（使用前に修正必要）";
  } else {
    grade = "D";
    gradeEmoji = "🔴";
    gradeText = "危険（大幅な修正必要）";
  }

  // ヘッダー：スコアとランク
  let output = "🛡️ Risk Checker\n\n";
  output += `📊 ${totalScore}点 / 100点\n`;
  output += `${gradeEmoji} ランク ${grade}：${gradeText}\n\n`;

  // リスクがある項目だけ表示
  const riskyResults = results.filter(r => r.level !== "safe");
  const safeResults = results.filter(r => r.level === "safe");

  if (riskyResults.length > 0) {
    output += "⚠️ 要確認\n";
    for (const r of riskyResults) {
      const name = categoryNames[r.category] ?? r.category;
      const emoji = r.level === "danger" ? "🚨" : "⚠️";
      output += `${emoji} ${name}\n`;
      if (r.suggestion) {
        output += `　→ ${r.suggestion}\n`;
      }
    }
    output += "\n";
  }

  if (safeResults.length > 0) {
    output += "✅ 問題なし：";
    output += safeResults.map(r => categoryNames[r.category] ?? r.category).join("、");
    output += "\n\n";
  }

  // 総評
  output += `📝 ${summary}\n\n`;

  // リスクがある場合、関連note記事へ誘導
  if (riskyResults.length > 0) {
    output += "---\n📖 詳しい対策はこちら\n";
    // 重複を避けて最大2件まで表示
    const shownUrls = new Set<string>();
    let count = 0;
    for (const r of riskyResults) {
      const article = RISK_NOTE_ARTICLES[r.category];
      if (article && !shownUrls.has(article.url) && count < 2) {
        output += `${article.url}\n`;
        shownUrls.add(article.url);
        count++;
      }
    }
  }

  return output;
}

