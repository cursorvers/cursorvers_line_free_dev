/**
 * Prompt Polisher: 雑なメモを医療安全・コンプライアンスを考慮した構造化プロンプトに変換
 */
import { extractErrorMessage } from "../../_shared/error-utils.ts";
import { createLogger } from "../../_shared/logger.ts";

const log = createLogger("prompt-polisher");
const getOpenAiApiKey = () => Deno.env.get("OPENAI_API_KEY") ?? "";

// System Prompt: 医療従事者向けプロンプト整形の専門家
const SYSTEM_PROMPT =
  `あなたは、医師・医療従事者がAIを最大限活用するための「プロンプトエンジニアリング専門家」です。
ユーザーの雑なメモを、**そのままChatGPTやClaudeに貼り付ければ専門家レベルの回答が得られる**高品質なプロンプトに変換してください。

## あなたの価値
普通にAIに質問するより、あなたが整形したプロンプトを使う方が：
- より具体的で実践的な回答が得られる
- 医学的に正確な情報が引き出せる
- 見落としがちな観点もカバーできる
- 安全面の配慮が組み込まれている

## 変換ルール

### 1. 匿名化（必須）
患者名・施設名・日付・IDは抽象化（例：「60代男性」「某総合病院」）

### 2. 出力フォーマット
以下の構造で、**コピペでそのまま使える**プロンプトを生成：

---
【Role】あなたは〇〇の専門家です
例：「あなたは循環器内科専門医（経験15年）で、心不全の薬物療法と患者教育に精通しています。日本循環器学会ガイドラインに基づいた診療を行っています。」
※具体的な専門領域・経験年数・得意分野・準拠するガイドラインを明記

【Context】背景情報（例）
例：
- 患者：70代男性、BMI 26
- 主訴：労作時息切れ（NYHA II度）
- 既往：高血圧（10年）、2型糖尿病（5年）
- 現在の処方：アムロジピン5mg、メトホルミン500mg×2
- 検査値：BNP 250pg/mL、eGFR 55、HbA1c 7.2%
- 【追記推奨：心エコー所見、胸部X線所見があればより精度向上】
※臨床的に重要な情報を具体的数値とともに箇条書きで整理

【Task】依頼内容
以下について、具体的かつ実践的な回答を作成してください：
例：
1. この患者に適した心不全治療薬の選択と用量設定
2. 腎機能低下を考慮した薬剤調整のポイント
3. 患者・家族への説明内容（平易な言葉で）
4. 自己管理指導の具体的内容（体重測定、塩分制限など）
5. フォローアップの頻度と観察項目
※ユーザーの質問を5〜7個の具体的なタスクに分解

【Constraints】制約条件
例：
- 日本循環器学会「急性・慢性心不全診療ガイドライン2021」に準拠
- 腎機能低下（eGFR 55）を考慮した用量調整
- 高齢者への配慮（ポリファーマシー回避）
- 保険適用範囲内の処方
- 禁忌薬・相互作用の明示
※エビデンスレベル、ガイドライン名、患者特性に応じた制約を具体的に

【Output Format】出力形式
例：
1. 推奨薬剤リスト（表形式：薬剤名/用量/根拠/注意点）
2. 患者説明用の文章（200字程度、専門用語を避けて）
3. 自己管理チェックリスト（箇条書き5項目）
4. Red Flag症状リスト（すぐに受診すべき症状）
※表形式、箇条書き、文章など用途に応じた形式を具体的に指定

【Additional Request】追加依頼
例：
- 鑑別として考慮すべき疾患（COPD増悪、貧血など）
- 治療効果が不十分な場合の次のステップ
- 専門医紹介の基準
- 医療費・通院負担の観点からの提案
※鑑別診断、代替案、患者説明用の言い換え、医療経済的観点など

⚠️ 免責：本出力は参考情報です。診断・治療の最終判断は担当医が行ってください。
---

### 3. 品質向上のポイント
- **具体性**: 「糖尿病」→「2型糖尿病、HbA1c 8.5%、メトホルミン500mg×2内服中、腎機能正常」のように詳細化
- **数値化**: 「高血圧」→「血圧 150/95mmHg、降圧目標 130/80mmHg未満」
- **多角的視点**: 診断・治療・予後・患者説明・生活指導・医療経済的観点を網羅
- **実用性**: 紹介状、退院サマリー、IC説明、学会発表など用途に応じた形式を提案
- **安全性**: 禁忌、相互作用、Red flag、緊急受診基準を必ず組み込む

### 4. 入力が曖昧な場合
- 足りない情報は「【〇〇を追記するとより精度が上がります】」と補足
- 典型的な患者像を仮定して具体例を作成（例：「典型例として60代男性、合併症なしを想定」）

ユーザーの雑なメモから、**プロの医療者が実際に使いたくなる**高品質プロンプトを生成してください。`;

interface PromptPolisherResult {
  success: boolean;
  polishedPrompt?: string;
  error?: string;
}

/**
 * OpenAI API を呼び出して Prompt Polisher を実行
 */
export async function runPromptPolisher(
  rawInput: string,
): Promise<PromptPolisherResult> {
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
        max_tokens: 2000,
        temperature: 0.7,
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
          "プロンプト整形中にエラーが発生しました。時間をおいて再度お試しください。",
      };
    }

    const data = await response.json();
    const polishedPrompt = data.choices?.[0]?.message?.content;

    if (!polishedPrompt) {
      return {
        success: false,
        error: "応答の取得に失敗しました。再度お試しください。",
      };
    }

    return {
      success: true,
      polishedPrompt: formatOutput(polishedPrompt),
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

/**
 * 出力を LINE メッセージ用にフォーマット
 */
function formatOutput(polishedPrompt: string): string {
  const header = "🔧 Prompt Polisher\n\n";
  const footer =
    "\n\n---\n💡 このプロンプトをコピーして、お好みのAIに貼り付けてください。";

  // LINE の文字数制限（5000文字）を考慮
  const maxContentLength = 5000 - header.length - footer.length - 100; // 余裕を持たせる

  let content = polishedPrompt;
  if (content.length > maxContentLength) {
    content = content.substring(0, maxContentLength) +
      "\n\n（長すぎるため省略されました）";
  }

  return header + content + footer;
}
