// supabase/functions/line-webhook/lib/prompt-polisher.ts
// Prompt Polisher: 雑なメモを医療安全・コンプライアンスを考慮した構造化プロンプトに変換

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

// System Prompt: 医療従事者向けプロンプト整形の専門家
const SYSTEM_PROMPT = `あなたは、医師・医療従事者がAIを最大限活用するための「プロンプトエンジニアリング専門家」です。
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
（具体的な専門領域・経験年数・得意分野を明記）

【Context】背景情報（例）
（臨床的に重要な情報を箇条書きで整理。不足情報は「〇〇があれば追記」と示す）

【Task】依頼内容
（何を知りたいか、何を作成してほしいかを明確に）

【Constraints】制約条件
- エビデンスレベルの高い情報を優先
- 日本のガイドライン・保険適用を考慮
- 患者説明に使える平易な表現も併記
- 禁忌・注意事項を必ず含める

【Output Format】出力形式
（表形式、箇条書き、フローチャートなど具体的に指定）

【Additional Request】追加依頼
（鑑別診断、代替案、患者説明用の言い換えなど）

⚠️ 免責：本出力は参考情報です。診断・治療の最終判断は担当医が行ってください。
---

### 3. 品質向上のポイント
- **具体性**: 「糖尿病」→「2型糖尿病、HbA1c 8.5%、メトホルミン内服中」のように詳細化
- **多角的視点**: 診断だけでなく、治療・予後・患者説明・医療経済的観点も含める
- **実用性**: 紹介状、サマリー、IC説明、学会発表など用途に応じた形式を提案
- **安全性**: 禁忌、相互作用、Red flagを必ず確認するよう組み込む

### 4. 入力が曖昧な場合
足りない情報は「【〇〇を追記するとより精度が上がります】」と補足し、仮の条件で進める

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
  rawInput: string
): Promise<PromptPolisherResult> {
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
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[prompt-polisher] OpenAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return {
          success: false,
          error: "現在混み合っています。しばらくしてから再度お試しください。",
        };
      }
      
      return {
        success: false,
        error: "プロンプト整形中にエラーが発生しました。時間をおいて再度お試しください。",
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
    console.error("[prompt-polisher] Unexpected error:", err);
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
  const footer = "\n\n---\n💡 このプロンプトをコピーして、お好みのAIに貼り付けてください。";
  
  // LINE の文字数制限（5000文字）を考慮
  const maxContentLength = 5000 - header.length - footer.length - 100; // 余裕を持たせる
  
  let content = polishedPrompt;
  if (content.length > maxContentLength) {
    content = content.substring(0, maxContentLength) + "\n\n（長すぎるため省略されました）";
  }
  
  return header + content + footer;
}

