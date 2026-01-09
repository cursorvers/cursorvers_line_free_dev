// supabase/functions/line-webhook/lib/risk-checker.ts
// Risk Checker: 文章のリスクカテゴリを判定し、修正案を提示

import { extractErrorMessage } from "../../_shared/error-utils.ts";
import { createLogger } from "../../_shared/logger.ts";
import { DISCORD_INVITE_URL } from "./constants.ts";
import type { RiskCategory, RiskCheckResult } from "./types.ts";

const log = createLogger("risk-checker");

const getOpenAiApiKey = () => Deno.env.get("OPENAI_API_KEY") ?? "";

// System Prompt: リスクチェッカー（点数化＋ガイドライン明示対応）
const SYSTEM_PROMPT = `あなたは、医療従事者向けの文章リスクチェッカーです。
ユーザーから送られてくる文章を分析し、リスクを**100点満点で点数化**して判定してください。

## リスクカテゴリと配点（各20点満点、合計100点）

### 1. adv_advertising（医療広告・誇大表現）20点
**参照ガイドライン：医療広告ガイドライン（厚生労働省）**
- 「必ず治る」「絶対に効く」「日本一」→ 0点（ガイドライン違反）
- 「改善が期待できる」「効果が報告されている」→ 20点
- 軽微な誇大表現 → 10点
- 問題点があれば「医療広告ガイドライン第○条に抵触の可能性」と明記

### 2. pii_leakage（個人情報・再識別リスク）20点
**参照ガイドライン：3省2ガイドライン（医療情報システムの安全管理に関するガイドライン）、個人情報保護法**
- 実名・具体的日付・患者ID記載 → 0点（3省2ガイドライン違反）
- 抽象化済み（60代男性、某病院など）→ 20点
- 組み合わせで再識別可能 → 5-10点
- 問題点があれば「3省2ガイドライン○章に抵触の可能性」と明記

### 3. clinical_quality（医学的妥当性）20点
**参照基準：各学会ガイドライン、Mindsガイドライン**
- エビデンスなし・誤情報・古い治療法 → 0点
- ガイドライン準拠・正確 → 20点
- 一部不正確・古い情報 → 10点
- 問題点があれば「○○学会ガイドラインと異なる」等と明記

### 4. contract_tax（契約・税務リスク）20点
**参照：医師法、所得税法、労働基準法**
- 無許可の自費診療・脱税示唆 → 0点
- 問題なし → 20点
- 軽微なリスク → 10点

### 5. ai_governance（AIガバナンス）20点
**参照ガイドライン：AI事業者ガイドライン（経産省）、EU AI Act**
- AI生成を人間の意見と誤認させる → 0点
- 適切な免責・AI利用明示 → 20点
- 一部不十分 → 10点
- 問題点があれば「AI事業者ガイドライン○章に抵触の可能性」と明記

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
      "guideline": "抵触の可能性があるガイドライン名（問題なければ空文字）",
      "issue": "問題点の具体的な説明（なければ空文字）",
      "suggestion": "具体的な修正案（問題がない場合は空文字）"
    }
  ],
  "summary": "全体の要約：なぜこの点数なのか、何が問題で何が安全かを2-3文で説明",
  "actionRequired": true
}
\`\`\`

## grade の基準
- A: 90-100点（安全）
- B: 70-89点（注意）
- C: 50-69点（要修正）
- D: 0-49点（危険）

## 重要
- 全5カテゴリについて必ず判定
- **なぜその点数なのか**を summary で明確に説明
- 問題があるカテゴリには**具体的なガイドライン名**を guideline に記載
- 修正案は「〇〇→△△に変更」の形式で具体的に`;

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
  rawInput: string,
): Promise<RiskCheckerResponse> {
  const openAiApiKey = getOpenAiApiKey();
  if (!openAiApiKey) {
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
        Authorization: `Bearer ${openAiApiKey}`,
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
      log.error("OpenAI API error", { status: response.status, errorText });

      if (response.status === 429) {
        return {
          success: false,
          error: "現在混み合っています。しばらくしてから再度お試しください。",
        };
      }

      return {
        success: false,
        error:
          "リスクチェック中にエラーが発生しました。時間をおいて再度お試しください。",
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
    interface ParsedResult {
      totalScore: number;
      grade: string;
      results: Array<{
        category: string;
        score: number;
        maxScore: number;
        level: string;
        guideline?: string;
        issue?: string;
        suggestion?: string;
      }>;
      summary: string;
      actionRequired: boolean;
    }

    let parsed: ParsedResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      log.error("Failed to parse JSON", { content: content.slice(0, 200) });
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
      results: parsed.results as RiskCheckResult[],
      summary: parsed.summary,
      riskFlags,
      formattedMessage: formatOutput(parsed),
    };
  } catch (err) {
    log.error("Unexpected error", {
      errorMessage: extractErrorMessage(err),
    });
    return {
      success: false,
      error: "予期せぬエラーが発生しました。時間をおいて再度お試しください。",
    };
  }
}

// リスクカテゴリに対応するnote記事（実際の記事URLにマッピング）
const RISK_NOTE_ARTICLES: Record<
  string,
  Array<{ title: string; url: string }>
> = {
  // 医療広告・誇大表現 → 3省2ガイドライン、医療AI導入関連
  adv_advertising: [
    {
      title: "3省2ガイドライン解説",
      url: "https://note.com/nice_wren7963/n/n292021a47632",
    },
    {
      title: "医療AIの導入が失敗する理由",
      url: "https://note.com/nice_wren7963/n/nc0d61899b04d",
    },
  ],
  // 個人情報・再識別リスク → データガバナンス、3省2ガイドライン
  pii_leakage: [
    {
      title: "3省2ガイドライン解説",
      url: "https://note.com/nice_wren7963/n/n292021a47632",
    },
    {
      title: "患者主権の医療データ革命",
      url: "https://note.com/nice_wren7963/n/nc48a5f57a7a7",
    },
    {
      title: "JDLA生成AI契約ガイドライン",
      url: "https://note.com/nice_wren7963/n/n3f579313f6fc",
    },
  ],
  // 医学的妥当性 → 臨床知、エビデンス関連
  clinical_quality: [
    {
      title: "エビデンスに基づく情報発信",
      url: "https://note.com/nice_wren7963/n/ne7c234de3eda",
    },
    {
      title: "医療AIの経済性評価",
      url: "https://note.com/nice_wren7963/n/n806443fb0964",
    },
    {
      title: "臨床医の思考の危機",
      url: "https://note.com/nice_wren7963/n/n189afd44578a",
    },
  ],
  // 契約・税務 → 副業、契約関連（該当記事がない場合は一般記事）
  contract_tax: [
    {
      title: "JDLA生成AI契約ガイドライン",
      url: "https://note.com/nice_wren7963/n/n3f579313f6fc",
    },
    { title: "記事一覧", url: "https://note.com/nice_wren7963/all" },
  ],
  // AIガバナンス → EU AI Act、ガバナンス関連
  ai_governance: [
    {
      title: "EU AI Actという設計図",
      url: "https://note.com/nice_wren7963/n/na37ff5135e78",
    },
    {
      title: "AIセキュリティ分科会の議論",
      url: "https://note.com/nice_wren7963/n/n2d16a1295c7b",
    },
    {
      title: "AI事業者ガイドライン解説",
      url: "https://note.com/nice_wren7963/n/n39a2a19bf491",
    },
  ],
};

// カテゴリ名の日本語マッピング
const CATEGORY_NAMES: Record<string, string> = {
  adv_advertising: "医療広告",
  pii_leakage: "個人情報",
  clinical_quality: "医学的妥当性",
  contract_tax: "契約・税務",
  ai_governance: "AIガバナンス",
};

// ランク判定
function getGradeInfo(
  totalScore: number,
): { grade: string; emoji: string; text: string } {
  if (totalScore >= 90) {
    return { grade: "A", emoji: "🟢", text: "安全（そのまま使用可能）" };
  } else if (totalScore >= 70) {
    return { grade: "B", emoji: "🟡", text: "注意（軽微な修正推奨）" };
  } else if (totalScore >= 50) {
    return { grade: "C", emoji: "🟠", text: "要修正（使用前に修正必要）" };
  } else {
    return { grade: "D", emoji: "🔴", text: "危険（大幅な修正必要）" };
  }
}

interface ParsedResponse {
  totalScore: number;
  grade: string;
  results: Array<{
    category: string;
    score: number;
    maxScore: number;
    level: string;
    guideline?: string;
    issue?: string;
    suggestion?: string;
  }>;
  summary: string;
  actionRequired: boolean;
}

/**
 * 出力を LINE メッセージ用にフォーマット（点数化＋ガイドライン明示版）
 */
function formatOutput(parsed: ParsedResponse): string {
  const { totalScore, results, summary } = parsed;
  const gradeInfo = getGradeInfo(totalScore);

  // ヘッダー：スコアとランク
  let output = "🛡️ Risk Checker\n\n";
  output += `📊 ${totalScore}点 / 100点\n`;
  output +=
    `${gradeInfo.emoji} ランク ${gradeInfo.grade}：${gradeInfo.text}\n\n`;

  // リスクがある項目だけ表示（点数の根拠を明示）
  const riskyResults = results.filter((r) => r.level !== "safe");
  const safeResults = results.filter((r) => r.level === "safe");

  if (riskyResults.length > 0) {
    output += "⚠️ 減点項目\n";
    for (const r of riskyResults) {
      const name = CATEGORY_NAMES[r.category] ?? r.category;
      const emoji = r.level === "danger" ? "🚨" : "⚠️";
      const deduction = r.maxScore - r.score;
      output += `${emoji} ${name}（-${deduction}点）\n`;

      // ガイドライン名を明示
      if (r.guideline) {
        output += `　📋 ${r.guideline}\n`;
      }

      // 問題点と修正案
      if (r.issue) {
        output += `　問題：${r.issue}\n`;
      }
      if (r.suggestion) {
        output += `　→ ${r.suggestion}\n`;
      }
    }
    output += "\n";
  }

  if (safeResults.length > 0) {
    output += "✅ 問題なし：";
    output += safeResults.map((r) => CATEGORY_NAMES[r.category] ?? r.category)
      .join("、");
    output += "\n\n";
  }

  // 総評（なぜこの点数なのか）
  output += `📝 総評\n${summary}\n\n`;

  // リスクがある場合、関連note記事へ誘導（カテゴリに応じて自動選別）
  if (riskyResults.length > 0) {
    output += "---\n📖 詳しい対策・解説\n";

    // 重複を避けて最大3件まで表示
    const shownUrls = new Set<string>();
    let count = 0;

    for (const r of riskyResults) {
      const articles = RISK_NOTE_ARTICLES[r.category];
      if (articles && count < 3) {
        for (const article of articles) {
          if (!shownUrls.has(article.url) && count < 3) {
            output += `▶ ${article.title}\n${article.url}\n`;
            shownUrls.add(article.url);
            count++;
            break; // 各カテゴリから1件ずつ
          }
        }
      }
    }
  }

  // Discordへの誘導
  output += `\n---\n💬 詳しい相談は Discord で\n${DISCORD_INVITE_URL}`;

  return output;
}
