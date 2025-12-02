// supabase/functions/line-webhook/lib/prompt-polisher.ts
// Prompt Polisher: 雑なメモを医療安全・コンプライアンスを考慮した構造化プロンプトに変換

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

// System Prompt: 医療従事者向けプロンプト整形役
const SYSTEM_PROMPT = `あなたは、医師・医療従事者を主対象としたプロンプト整形の専門家です。
ユーザーから送られてくる「雑なメモ」を、医療安全とコンプライアンスを考慮した「構造化プロンプト」に変換してください。

## 変換ルール

### 1. 匿名化（必須）
入力に患者名・施設名・正確な日付・ID等が含まれていても、出力では必ず抽象化してください。
- 患者名 → 「Xさん」「患者A」
- 施設名 → 「某クリニック」「A病院」
- 日付 → 「数年前」「先月」「最近」
- ID・番号 → 「ID:XXXX」

### 2. 出力フォーマット（必須）
以下の6セクションを必ず含めてください：

# ロール
（このプロンプトを受け取るAIに期待する役割）

# タスク
（達成したいこと）

# 入力情報
（箇条書きで必要な情報を列挙）

# 制約条件（Defense）
（守るべきルール・禁止事項）

# 出力形式
（期待する出力の形式・構造）

# 免責の一文
（必ず以下を含める：「本出力は参考情報であり、診断・治療の最終判断は担当医が行ってください。」）

### 3. 医療広告ガイドライン遵守
- 「必ず治る」「絶対に効く」等の表現は避ける
- 「改善が期待できる」「効果が報告されている」等の適切な表現に誘導

### 4. 簡潔さ
- 各セクションは簡潔に
- 冗長な説明は避ける
- 箇条書きを活用する

入力されたメモがどんなに雑でも、上記フォーマットに沿って整形してください。`;

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
        model: "gpt-4o-mini",
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
  const header = "【Prompt Polisher】\n構造化プロンプトに変換しました：\n\n";
  const footer = "\n\n---\n💡 このプロンプトをコピーして、お好みのAIツールでご利用ください。";
  
  // LINE の文字数制限（5000文字）を考慮
  const maxContentLength = 5000 - header.length - footer.length - 100; // 余裕を持たせる
  
  let content = polishedPrompt;
  if (content.length > maxContentLength) {
    content = content.substring(0, maxContentLength) + "\n\n（長すぎるため省略されました）";
  }
  
  return header + content + footer;
}

