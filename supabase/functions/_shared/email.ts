/**
 * メール送信モジュール
 * Resend API を使用したトランザクショナルメール送信
 *
 * 環境変数:
 * - RESEND_API_KEY: Resend APIキー
 * - EMAIL_FROM_ADDRESS: 送信元アドレス (例: noreply@cursorvers.com)
 */
import { createLogger } from "./logger.ts";
import { withRetry } from "./retry.ts";
import { extractErrorMessage } from "./error-utils.ts";

const log = createLogger("email");

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") ??
  "Cursorvers <noreply@cursorvers.com>";

const RESEND_API_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
}

/**
 * メールを送信
 * - Resend API を使用
 * - リトライ付き（最大3回）
 * - タイムアウト 10秒
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const { to, subject, html, text } = payload;

  if (!RESEND_API_KEY) {
    log.warn("RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email service not configured" };
  }

  try {
    let messageId: string | undefined;

    await withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(RESEND_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: EMAIL_FROM_ADDRESS,
              to: [to],
              subject,
              html,
              text: text ?? stripHtml(html),
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Resend API error: ${response.status} - ${errorText}`,
            );
          }

          const result = await response.json();
          messageId = result.id;

          log.info("Email sent", {
            to: maskEmailWithDomain(to),
            subject,
            messageId,
          });
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        maxRetries: MAX_RETRIES,
        initialDelay: 1000,
        maxDelay: 5000,
        onRetry: (attempt, error) => {
          log.warn("Email send failed, retrying", {
            attempt,
            to: maskEmailWithDomain(to),
            error: extractErrorMessage(error),
          });
        },
      },
    );

    return { success: true, messageId };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Email send failed", {
      to: maskEmailWithDomain(to),
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * HTMLからプレーンテキストを抽出（シンプル実装）
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * メールアドレスをマスク（ログ用 - ドメイン表示版）
 * 例: "user@example.com" → "us***@example.com"
 */
function maskEmailWithDomain(email: string): string {
  const parts = email.split("@");
  const local = parts[0] ?? "";
  const domain = parts[1];
  if (!domain) return "***";
  const maskedLocal = local.slice(0, 2) + "***";
  return `${maskedLocal}@${domain}`;
}

// ============================================
// 有料会員向けテンプレートメール
// ============================================

const LINE_FRIEND_URL = Deno.env.get("LINE_FRIEND_URL") ?? "";

// LINE_FRIEND_URL が未設定の場合のチェック関数
function getLineFriendUrl(): string {
  if (!LINE_FRIEND_URL) {
    log.error("LINE_FRIEND_URL is not configured");
    throw new Error("LINE_FRIEND_URL environment variable is required");
  }
  return LINE_FRIEND_URL;
}

/**
 * 有料会員登録完了メール（LINE登録案内）
 */
export async function sendPaidMemberWelcomeEmail(
  to: string,
  verificationCode: string,
  tierName: string,
): Promise<EmailResult> {
  const subject = `【Cursorvers】${tierName}へようこそ - LINE登録のご案内`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .code-box { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
    .code { font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #667eea; font-family: monospace; }
    .button { display: inline-block; background: #06C755; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px 0; }
    .steps { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .step { display: flex; align-items: flex-start; margin: 15px 0; }
    .step-num { background: #667eea; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; flex-shrink: 0; }
    .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>ご購入ありがとうございます！</h1>
    <p>${tierName} へようこそ</p>
  </div>
  <div class="content">
    <p>Cursorvers をご利用いただきありがとうございます。</p>
    <p><strong>Discord コミュニティへの招待は、LINE 登録後にお届けします。</strong></p>

    <div class="steps">
      <h3>登録手順（3ステップ）</h3>
      <div class="step">
        <div class="step-num">1</div>
        <div>以下のボタンから LINE 友だち追加</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div>LINE で以下の認証コードを送信</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div>Discord 招待が届きます！</div>
      </div>
    </div>

    <div class="code-box">
      <p style="margin: 0 0 10px 0; color: #666;">認証コード</p>
      <div class="code">${verificationCode}</div>
      <p style="margin: 10px 0 0 0; color: #888; font-size: 12px;">有効期限: 14日間</p>
    </div>

    <p style="text-align: center;">
      <a href="${getLineFriendUrl()}" class="button">LINE 友だち追加</a>
    </p>

    <p style="color: #666; font-size: 14px;">
      ※ LINE 追加後、認証コードをそのまま送信してください<br>
      ※ 14日以内に登録されない場合、別途ご案内メールをお送りします
    </p>
  </div>
  <div class="footer">
    <p>Cursorvers - AI x 医療 x セキュリティ</p>
    <p>このメールに心当たりがない場合は無視してください</p>
  </div>
</body>
</html>
`.trim();

  return await sendEmail({ to, subject, html });
}

/**
 * リマインダーメール（LINE未登録者向け）
 */
export async function sendReminderEmail(
  to: string,
  verificationCode: string,
  daysSincePurchase: number,
): Promise<EmailResult> {
  const subject =
    "【Cursorvers】LINE登録のリマインド - Discord招待をお待ちしています";

  const urgencyNote = daysSincePurchase >= 10
    ? "※ あと数日で有効期限が切れます。お早めにご登録ください。"
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .content { background: #fff9e6; padding: 25px; border-radius: 10px; border: 1px solid #ffd700; }
    .code-box { background: #fff; border: 2px dashed #667eea; padding: 15px; text-align: center; margin: 15px 0; border-radius: 8px; }
    .code { font-size: 28px; font-weight: bold; letter-spacing: 3px; color: #667eea; font-family: monospace; }
    .button { display: inline-block; background: #06C755; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; }
    .urgent { color: #e74c3c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="content">
    <h2>LINE 登録がまだ完了していません</h2>
    <p>ご購入から ${daysSincePurchase} 日が経過しました。Discord コミュニティへの招待をお待ちしています！</p>
    ${urgencyNote ? `<p class="urgent">${urgencyNote}</p>` : ""}

    <div class="code-box">
      <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">認証コード</p>
      <div class="code">${verificationCode}</div>
    </div>

    <p style="text-align: center;">
      <a href="${getLineFriendUrl()}" class="button">LINE 友だち追加</a>
    </p>

    <p style="font-size: 14px; color: #666;">
      LINE を追加後、上記のコードを送信するだけで完了です。
    </p>
  </div>
</body>
</html>
`.trim();

  return await sendEmail({ to, subject, html });
}

/**
 * 最終手段: Discord招待を直接メール送信
 */
export async function sendDirectDiscordInviteEmail(
  to: string,
  discordInviteUrl: string,
  tierName: string,
): Promise<EmailResult> {
  const subject = `【Cursorvers】Discord コミュニティへの招待 - ${tierName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .content { background: #f0f0f0; padding: 25px; border-radius: 10px; }
    .button { display: inline-block; background: #5865F2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
    .note { background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="content">
    <h2>Discord コミュニティへご招待</h2>
    <p>LINE 登録が完了しなかったため、Discord 招待を直接お送りします。</p>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${discordInviteUrl}" class="button">Discord に参加する</a>
    </p>

    <p style="font-size: 14px; color: #666;">
      ※ この招待リンクは 1回限り・2週間有効 です<br>
      ※ 参加後、サーバー内で <code>/join email:${to}</code> を実行して認証してください
    </p>

    <div class="note">
      <strong>LINE 登録もお待ちしています！</strong><br>
      日次の AI ニュース配信や通知は LINE 経由でお届けします。<br>
      <a href="${getLineFriendUrl()}">LINE 友だち追加はこちら</a>
    </div>
  </div>
</body>
</html>
`.trim();

  return await sendEmail({ to, subject, html });
}
