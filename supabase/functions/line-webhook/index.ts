/**
 * LINE公式アカウント用 Webhook エントリポイント（Pocket Defense Tool）
 * 主要ロジックは lib/ 以下に分割
 *
 * 認証コード方式:
 * - 有料会員決済時にメールで認証コードを送信
 * - ユーザーがLINEで認証コードを入力
 * - コード検証成功でDiscord招待を送信
 */
import { createClient } from "@supabase/supabase-js";
import { anonymizeUserId, createLogger } from "../_shared/logger.ts";
import {
  isCodeExpired,
  isVerificationCodeFormat,
  normalizeCode,
} from "../_shared/verification-code.ts";

const log = createLogger("line-webhook");

// lib モジュール - 定数・型
import {
  CONTACT_FORM_URL,
  COURSE_KEYWORDS,
  type DiagnosisKeyword,
  DISCORD_INVITE_URL,
  SERVICES_LP_URL,
} from "./lib/constants.ts";

// lib モジュール - LINE API
import {
  pushText,
  type QuickReply,
  replyText,
  verifyLineSignature,
} from "./lib/line-api.ts";

// lib モジュール - Quick Reply
import {
  buildBackButtonQuickReply,
  buildDiagnosisQuickReply,
  buildNewsletterConfirmQuickReply,
  buildServicesQuickReply,
} from "./lib/quick-reply.ts";

// lib モジュール - ユーザー状態管理
import {
  clearDiagnosisState,
  clearPendingEmail,
  clearUserState,
  getDiagnosisState,
  getPendingEmail,
  getToolMode,
  setPendingEmail,
  setToolMode,
  updateDiagnosisState,
} from "./lib/user-state.ts";

// lib モジュール - レート制限
import {
  getHourlyPolishCount,
  getHourlyRiskCheckCount,
  MAX_POLISH_PER_HOUR,
} from "./lib/rate-limit.ts";

// lib モジュール - 機能
import { runPromptPolisher } from "./lib/prompt-polisher.ts";
import { runRiskChecker } from "./lib/risk-checker.ts";
import { buildCourseEntryMessage } from "./lib/course-router.ts";
import {
  buildConclusionMessage,
  buildDiagnosisStartMessage,
  buildQuestionMessage,
  type DiagnosisState,
  getConclusion,
  getFlowForKeyword,
  getNextQuestion,
  getTotalQuestions,
  isValidAnswer,
} from "./lib/diagnosis-flow.ts";
import {
  getArticlesByIds,
  getArticlesByTag,
} from "./lib/note-recommendations.ts";

// =======================
// 型定義
// =======================

type InteractionType = "prompt_polisher" | "risk_checker" | "course_entry";

interface LineUserSource {
  userId?: string;
  type: "user" | "group" | "room" | string;
}

interface LineTextMessage {
  id: string;
  type: "text";
  text: string;
}

interface LinePostback {
  data: string;
}

interface LineEvent {
  type: "message" | "postback" | string;
  replyToken?: string;
  source: LineUserSource;
  message?: LineTextMessage;
  postback?: LinePostback;
}

interface LineWebhookRequestBody {
  destination?: string;
  events: LineEvent[];
}

// =======================
// 環境変数 & クライアント
// =======================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const MAX_INPUT_LENGTH = Number(Deno.env.get("MAX_INPUT_LENGTH") ?? "3000");
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
  "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  log.warn("Supabase environment variables are not fully set");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// =======================
// 共通ヘルパー
// =======================

function bucketLength(len: number | null | undefined): string | null {
  if (len == null) return null;
  if (len <= 100) return "0-100";
  if (len <= 300) return "100-300";
  if (len <= 1000) return "300-1000";
  return "1000+";
}

function normalizeKeyword(raw: string): string {
  return raw.replace(/　/g, " ").trim();
}

// メールアドレス形式かどうかを判定
function isEmailFormat(text: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(text.trim());
}

// メールアドレスを正規化
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function detectCourseKeyword(text: string): DiagnosisKeyword | null {
  const normalized = normalizeKeyword(text);
  const match = COURSE_KEYWORDS.find((kw) => kw === normalized);
  return match ?? null;
}

// Supabase users: line_user_id から user.id を解決 or 作成
async function getOrCreateUser(lineUserId: string): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    log.error("getOrCreateUser select error", { errorMessage: error.message });
    throw error;
  }

  if (data?.id) return data.id;

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({ line_user_id: lineUserId })
    .select("id")
    .single();

  if (insertError || !inserted) {
    log.error("getOrCreateUser insert error", {
      errorMessage: insertError?.message,
    });
    throw insertError;
  }

  return inserted.id;
}

// interaction_logs への記録
interface LogOptions {
  userId: string;
  interactionType: InteractionType;
  courseKeyword?: DiagnosisKeyword | null;
  riskFlags?: string[] | null;
  inputLength?: number | null;
}

async function logInteraction(opts: LogOptions) {
  const { userId, interactionType, courseKeyword, riskFlags, inputLength } =
    opts;

  const lengthBucket = bucketLength(inputLength);

  const { error } = await supabase.from("interaction_logs").insert({
    user_id: userId,
    interaction_type: interactionType,
    course_keyword: courseKeyword ?? null,
    risk_flags: riskFlags ?? [],
    length_bucket: lengthBucket,
  });

  if (error) {
    log.error("logInteraction error", { errorMessage: error.message });
  }
}

// =======================
// 機能ハンドラー
// =======================

// メールアドレス登録ハンドラー（LINE上でメールを入力 → members保存 → Discord招待返信）
async function handleEmailRegistration(
  email: string,
  lineUserId: string,
  optInEmail: boolean,
  replyToken?: string,
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  try {
    // 既存レコードを確認（emailまたはline_user_idで）
    type MemberRecord = {
      id: string;
      email: string | null;
      line_user_id: string | null;
      tier: string | null;
    };
    let existingRecord: MemberRecord | null = null;

    const { data: emailRecord } = await supabase
      .from("members")
      .select("id,email,line_user_id,tier")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (emailRecord) {
      existingRecord = emailRecord as MemberRecord;
    } else {
      const { data: lineRecord } = await supabase
        .from("members")
        .select("id,email,line_user_id,tier")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      existingRecord = lineRecord as MemberRecord | null;
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      email: normalizedEmail,
      line_user_id: lineUserId,
      tier: existingRecord?.tier ?? "free",
      status: "active",
      opt_in_email: optInEmail,
      updated_at: now,
    };

    let error;
    if (existingRecord) {
      // 既存レコードを更新（有料会員のtierは変更しない）
      const paidTiers = ["library", "master"];
      if (paidTiers.includes(existingRecord.tier ?? "")) {
        // 有料会員の場合はline_user_idとemailの紐付けのみ
        const { error: updateError } = await supabase
          .from("members")
          .update({
            email: normalizedEmail,
            line_user_id: lineUserId,
            updated_at: now,
          })
          .eq("id", existingRecord.id);
        error = updateError;
      } else {
        const { error: updateError } = await supabase
          .from("members")
          .update(payload)
          .eq("id", existingRecord.id);
        error = updateError;
      }
    } else {
      // 新規作成
      const { error: insertError } = await supabase
        .from("members")
        .insert(payload);
      error = insertError;
    }

    if (error) {
      log.error("Email registration DB error", { errorMessage: error.message });
      if (replyToken) {
        await replyText(
          replyToken,
          "登録処理中にエラーが発生しました。しばらくしてから再度お試しください。",
        );
      }
      return;
    }

    // 成功 → Discord招待URLを返信
    if (replyToken) {
      await replyText(
        replyToken,
        [
          "🎉 登録完了！特典をGETしました",
          "",
          "━━━━━━━━━━━━━━━",
          "🎁 あなたの特典",
          "━━━━━━━━━━━━━━━",
          "",
          "📚 Discordコミュニティ",
          "🤖 注目のAI記事要約（毎日更新）",
          "🛡️ 医療向けセキュリティレポート",
          "💬 Q&A・相談チャンネル",
          "⚡ 開発効率化Tips",
          "📎 資料・リンク集",
          "",
          "▼ Discord参加はこちら",
          DISCORD_INVITE_URL,
          "",
          "━━━━━━━━━━━━━━━",
          "💎 さらに活用したい方へ",
          "━━━━━━━━━━━━━━━",
          "",
          "【Library Member】月額¥2,980",
          "🌟 無料特典すべて ＋",
          "📝 有料記事の全文閲覧",
          "⚡ 検証済みプロンプト集",
          "",
          "▼ 詳細・お申込み",
          SERVICES_LP_URL,
        ].join("\n"),
      );
    }

    log.info("Email registered", {
      email: normalizedEmail.slice(0, 5) + "***",
    });
  } catch (err) {
    log.error("Email registration error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    if (replyToken) {
      await replyText(
        replyToken,
        "エラーが発生しました。時間をおいて再度お試しください。",
      );
    }
  }
}

// 認証コード検証ハンドラー（有料会員のLINE紐付け）
async function handleVerificationCode(
  code: string,
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  try {
    // 認証コードで会員を検索
    const { data: member, error: fetchError } = await supabase
      .from("members")
      .select(
        "id, email, tier, verification_code, verification_expires_at, line_user_id",
      )
      .eq("verification_code", code)
      .maybeSingle();

    if (fetchError) {
      log.error("Verification code lookup error", {
        errorMessage: fetchError.message,
      });
      if (replyToken) {
        await replyText(
          replyToken,
          "エラーが発生しました。もう一度お試しください。",
        );
      }
      return;
    }

    if (!member) {
      log.info("Invalid verification code", {
        code: code.slice(0, 2) + "****",
        userId: anonymizeUserId(lineUserId),
      });
      if (replyToken) {
        await replyText(
          replyToken,
          [
            "❌ 認証コードが見つかりません",
            "",
            "以下をご確認ください：",
            "・コードが正しく入力されていますか？",
            "・有効期限（14日）が過ぎていませんか？",
            "",
            "問題が解決しない場合は、",
            "決済時のメールアドレスと共にお問い合わせください。",
          ].join("\n"),
        );
      }
      return;
    }

    // 有効期限チェック
    if (
      member.verification_expires_at &&
      isCodeExpired(member.verification_expires_at)
    ) {
      log.info("Verification code expired", {
        code: code.slice(0, 2) + "****",
        email: member.email?.slice(0, 5) + "***",
      });
      if (replyToken) {
        await replyText(
          replyToken,
          [
            "⏰ 認証コードの有効期限が切れています",
            "",
            "決済から14日以上経過しました。",
            "お手数ですが、サポートまでお問い合わせください。",
            "",
            CONTACT_FORM_URL,
          ].join("\n"),
        );
      }
      return;
    }

    // 既にLINE紐付け済みの場合
    if (member.line_user_id) {
      if (member.line_user_id === lineUserId) {
        if (replyToken) {
          await replyText(
            replyToken,
            [
              "✅ すでに認証済みです",
              "",
              "Discord コミュニティへの参加がまだの場合：",
              DISCORD_INVITE_URL,
            ].join("\n"),
          );
        }
      } else {
        log.warn("Verification code already used by different LINE user", {
          code: code.slice(0, 2) + "****",
          existingLineUser: member.line_user_id.slice(-4),
          newLineUser: lineUserId.slice(-4),
        });
        if (replyToken) {
          await replyText(
            replyToken,
            [
              "❌ このコードは既に別のアカウントで使用されています",
              "",
              "1人1アカウントでのご利用をお願いしています。",
              "お心当たりがない場合は、サポートまでお問い合わせください。",
            ].join("\n"),
          );
        }
      }
      return;
    }

    // LINE紐付けを実行
    const { error: updateError } = await supabase
      .from("members")
      .update({
        line_user_id: lineUserId,
        verification_code: null,
        verification_expires_at: null,
        discord_invite_sent: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id);

    if (updateError) {
      log.error("Failed to link LINE user", {
        memberId: member.id,
        errorMessage: updateError.message,
      });
      if (replyToken) {
        await replyText(
          replyToken,
          "エラーが発生しました。もう一度お試しください。",
        );
      }
      return;
    }

    log.info("Verification successful, LINE linked", {
      email: member.email?.slice(0, 5) + "***",
      lineUserId: lineUserId.slice(-4),
      tier: member.tier,
    });

    // Discord招待を生成して送信
    const discordBotToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const guildId = Deno.env.get("DISCORD_GUILD_ID");

    let discordInviteUrl = DISCORD_INVITE_URL; // フォールバック用

    if (discordBotToken && guildId) {
      try {
        const inviteResponse = await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/invites`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${discordBotToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              max_age: 1209600, // 2週間
              max_uses: 1,
              unique: true,
            }),
          },
        );

        if (inviteResponse.ok) {
          const invite = await inviteResponse.json();
          discordInviteUrl = `https://discord.gg/${invite.code}`;
          log.info("Discord invite created for verification", {
            email: member.email?.slice(0, 5) + "***",
          });
        } else {
          log.warn("Failed to create Discord invite, using fallback", {
            status: inviteResponse.status,
          });
        }
      } catch (err) {
        log.error("Discord invite creation error", {
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 認証完了メッセージを送信
    const tierDisplayName = member.tier === "master"
      ? "Master Class"
      : "Library Member";

    if (replyToken) {
      await replyText(
        replyToken,
        [
          "🎉 認証完了！",
          "",
          `【${tierDisplayName}】へようこそ！`,
          "",
          "━━━━━━━━━━━━━━━",
          "📚 Discord コミュニティ",
          "━━━━━━━━━━━━━━━",
          "",
          "▼ 以下のリンクから参加してください",
          discordInviteUrl,
          "",
          "※ このリンクは2週間有効・1回限りです",
          "",
          "参加後、サーバー内で",
          `/join email:${member.email}`,
          "を実行してロールを取得してください。",
        ].join("\n"),
      );
    }
  } catch (err) {
    log.error("Verification code handling error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// Prompt Polisher ハンドラー（プレフィックスありでもなしでも動作）
async function handlePromptPolisher(
  rawInput: string,
  lineUserId: string,
  userId: string,
  replyToken?: string,
): Promise<void> {
  if (rawInput.length > MAX_INPUT_LENGTH) {
    if (replyToken) {
      await replyText(
        replyToken,
        `入力が長すぎます（${MAX_INPUT_LENGTH}文字以内）。`,
      );
    }
    return;
  }

  const { count: hourlyCount, nextAvailable } = await getHourlyPolishCount(
    userId,
  );
  if (hourlyCount >= MAX_POLISH_PER_HOUR) {
    if (replyToken) {
      const waitMinutes = nextAvailable
        ? Math.max(1, Math.ceil((nextAvailable.getTime() - Date.now()) / 60000))
        : 60;
      await replyText(
        replyToken,
        [
          `⏳ 利用上限に達しました（1時間に${MAX_POLISH_PER_HOUR}回まで）`,
          "",
          `約${waitMinutes}分後に再度ご利用いただけます。`,
          "",
          "💡 より多くご利用されたい方は、",
          "Library Memberへのアップグレードをご検討ください。",
        ].join("\n"),
      );
    }
    return;
  }

  if (replyToken) {
    await replyText(
      replyToken,
      "プロンプトを整えています。数秒お待ちください。",
    );
  }

  void (async () => {
    try {
      const result = await runPromptPolisher(rawInput);
      if (result.success && result.polishedPrompt) {
        const msg = result.polishedPrompt +
          "\n\n---\n💬 ご質問は Discord で\n" + DISCORD_INVITE_URL;
        await pushText(lineUserId, msg);
      } else {
        await pushText(lineUserId, result.error ?? "エラーが発生しました。");
      }
    } catch (err) {
      log.error("prompt_polisher error", {
        userId: anonymizeUserId(lineUserId),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      await pushText(
        lineUserId,
        "エラーが発生しました。時間をおいて再度お試しください。",
      );
    }
  })();

  await logInteraction({
    userId,
    interactionType: "prompt_polisher",
    inputLength: rawInput.length,
  });
}

// Risk Checker ハンドラー（プレフィックスありでもなしでも動作）
async function handleRiskChecker(
  rawInput: string,
  lineUserId: string,
  userId: string,
  replyToken?: string,
): Promise<void> {
  if (rawInput.length > MAX_INPUT_LENGTH) {
    if (replyToken) {
      await replyText(
        replyToken,
        `入力が長すぎます（${MAX_INPUT_LENGTH}文字以内）。`,
      );
    }
    return;
  }

  const { count: hourlyCount, nextAvailable } = await getHourlyRiskCheckCount(
    userId,
  );
  if (hourlyCount >= MAX_POLISH_PER_HOUR) {
    if (replyToken) {
      const waitMinutes = nextAvailable
        ? Math.max(1, Math.ceil((nextAvailable.getTime() - Date.now()) / 60000))
        : 60;
      await replyText(
        replyToken,
        [
          `⏳ 利用上限に達しました（1時間に${MAX_POLISH_PER_HOUR}回まで）`,
          "",
          `約${waitMinutes}分後に再度ご利用いただけます。`,
          "",
          "💡 より多くご利用されたい方は、",
          "Library Memberへのアップグレードをご検討ください。",
        ].join("\n"),
      );
    }
    return;
  }

  if (replyToken) {
    await replyText(
      replyToken,
      "リスクチェックを実行しています。数秒お待ちください。",
    );
  }

  void (async () => {
    try {
      const result = await runRiskChecker(rawInput);
      if (result.success && result.formattedMessage) {
        const msg = result.formattedMessage +
          "\n\n---\n💬 詳しい相談は Discord で\n" + DISCORD_INVITE_URL;
        await pushText(lineUserId, msg);
      } else {
        await pushText(lineUserId, result.error ?? "エラーが発生しました。");
      }
    } catch (err) {
      log.error("risk_checker error", {
        userId: anonymizeUserId(lineUserId),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      await pushText(
        lineUserId,
        "エラーが発生しました。時間をおいて再度お試しください。",
      );
    }
  })();

  await logInteraction({
    userId,
    interactionType: "risk_checker",
    inputLength: rawInput.length,
  });
}

// =======================
// Dispatcher 本体
// =======================

async function handleEvent(event: LineEvent): Promise<void> {
  try {
    log.debug("Event received", { eventType: event.type });

    const source = event.source;
    const replyToken = event.replyToken;

    if (!source.userId) {
      log.debug("No userId - skipping");
      return;
    }
    const lineUserId = source.userId;
    log.debug("Processing event", { userId: anonymizeUserId(lineUserId) });

    const userId = await getOrCreateUser(lineUserId);

    // ========================================
    // Follow イベント（友だち追加時）
    // ========================================
    if (event.type === "follow") {
      log.info("Follow event", { userId: anonymizeUserId(lineUserId) });

      // 有料決済済み（認証コード保留中）かどうかを確認
      const { data: pendingPaidMember } = await supabase
        .from("members")
        .select("email, tier, verification_code")
        .not("verification_code", "is", null)
        .in("tier", ["library", "master"])
        .is("line_user_id", null)
        .limit(1);

      // 有料会員で認証コード保留中の場合は、コード入力を促すメッセージ
      // 注: 厳密には誰の決済かは特定できないが、UXとして案内
      const hasPendingPaidMembers = pendingPaidMember &&
        pendingPaidMember.length > 0;

      if (replyToken) {
        if (hasPendingPaidMembers) {
          // 有料会員向けメッセージ
          await replyText(
            replyToken,
            [
              "🎉 友だち追加ありがとうございます！",
              "",
              "━━━━━━━━━━━━━━━",
              "💎 有料会員の方",
              "━━━━━━━━━━━━━━━",
              "",
              "決済完了メールに記載された",
              "【6桁の認証コード】を入力してください",
              "",
              "例: ABC123",
              "",
              "━━━━━━━━━━━━━━━",
              "🎁 無料特典の方",
              "━━━━━━━━━━━━━━━",
              "",
              "メールアドレスを入力してください",
              "例: your@email.com",
            ].join("\n"),
          );
        } else {
          // 通常の無料会員向けメッセージ
          await replyText(
            replyToken,
            [
              "🎉 友だち追加ありがとうございます！",
              "",
              "━━━━━━━━━━━━━━━",
              "🎁 無料特典（メール登録で即GET）",
              "━━━━━━━━━━━━━━━",
              "",
              "📚 Discordコミュニティ参加",
              "🤖 注目のAI記事要約（毎日更新）",
              "🛡️ 医療向けセキュリティレポート",
              "💬 Q&A・相談チャンネル",
              "⚡ 開発効率化Tips",
              "📎 資料・リンク集",
              "",
              "━━━━━━━━━━━━━━━",
              "",
              "▼ メールアドレスを入力して特典GET",
              "📱 左下のキーボードアイコンをタップ",
              "例: your@email.com",
            ].join("\n"),
          );
        }
      }
      return;
    }

    let text: string | null = null;
    if (event.type === "message" && event.message?.type === "text") {
      text = event.message.text;
    } else if (event.type === "postback" && event.postback?.data) {
      text = event.postback.data;
    }

    if (!text) return;

    const trimmed = text.trim();
    console.log("[line-webhook] received text:", trimmed, "user:", lineUserId);

    // ========================================
    // 0) ツールモード中の処理（最優先）
    // ========================================
    const toolMode = await getToolMode(lineUserId);
    log.debug("Tool mode check", {
      mode: toolMode,
      userId: anonymizeUserId(lineUserId),
    });

    if (toolMode) {
      // 「キャンセル」「戻る」でモードを終了
      if (
        trimmed === "キャンセル" || trimmed === "cancel" || trimmed === "戻る"
      ) {
        await clearUserState(lineUserId);
        if (replyToken) {
          await replyText(
            replyToken,
            "モードを終了しました。\n\n下のボタンから選んでください。",
            buildServicesQuickReply(),
          );
        }
        return;
      }

      // プロンプト整形モード → 入力をそのままPolish
      if (toolMode === "polish") {
        log.debug("Processing polish mode", { inputLength: trimmed.length });
        await clearUserState(lineUserId); // 1回使ったらモード終了
        await handlePromptPolisher(trimmed, lineUserId, userId, replyToken);
        return;
      }

      // リスクチェックモード → 入力をそのままチェック
      if (toolMode === "risk_check") {
        log.debug("Processing risk_check mode", {
          inputLength: trimmed.length,
        });
        await clearUserState(lineUserId); // 1回使ったらモード終了
        await handleRiskChecker(trimmed, lineUserId, userId, replyToken);
        return;
      }
    }

    // ========================================
    // 0.5) メルマガ同意確認のpostback処理
    // ========================================
    if (trimmed === "email_opt_in=yes" || trimmed === "email_opt_in=no") {
      const pendingEmail = await getPendingEmail(lineUserId);
      if (!pendingEmail) {
        if (replyToken) {
          await replyText(
            replyToken,
            "セッションが切れました。もう一度メールアドレスを入力してください。",
          );
        }
        return;
      }

      const optIn = trimmed === "email_opt_in=yes";
      await clearPendingEmail(lineUserId);
      await handleEmailRegistration(
        pendingEmail,
        lineUserId,
        optIn,
        replyToken,
      );
      return;
    }

    // ========================================
    // 0.6) 認証コード入力の検知 → 有料会員認証
    // ========================================
    if (isVerificationCodeFormat(trimmed)) {
      const code = normalizeCode(trimmed);
      log.info("Verification code detected", {
        code: code.slice(0, 2) + "****",
        userId: anonymizeUserId(lineUserId),
      });

      try {
        await handleVerificationCode(code, lineUserId, replyToken);
      } catch (err) {
        log.error("Verification code handling error", {
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        if (replyToken) {
          await replyText(
            replyToken,
            "エラーが発生しました。もう一度お試しください。",
          );
        }
      }
      return;
    }

    // ========================================
    // 0.7) メールアドレス入力の検知 → 同意確認ボタン表示
    // ========================================
    if (isEmailFormat(trimmed)) {
      log.info("Email detected", { email: trimmed.slice(0, 5) + "***" });

      // 同期的に処理（バックグラウンドではなくawaitで待つ）
      try {
        const normalizedEmail = normalizeEmail(trimmed);

        await setPendingEmail(lineUserId, normalizedEmail);
        log.debug("Pending email saved");

        // Reply APIで確認メッセージ送信（Quick Reply付き）
        if (replyToken) {
          const text = [
            "📧 メール登録",
            `${trimmed}`,
            "",
            "━━━━━━━━━━━━━━━",
            "📬 メルマガ内容",
            "━━━━━━━━━━━━━━━",
            "・AIを活用した副業最前線",
            "・「経験知」をAIで増幅させる思考法",
            "・「有料級」限定コンテンツ配信",
            "",
            "配信しますか？",
            "※ いつでも配信停止できます",
          ].join("\n");

          const res = await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              replyToken,
              messages: [{
                type: "text",
                text: text,
                quickReply: buildNewsletterConfirmQuickReply(),
              }],
            }),
          });
          log.debug("Newsletter confirmation sent", { status: res.status });
        }
      } catch (err) {
        log.error("Email handling error", {
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        if (replyToken) {
          await replyText(
            replyToken,
            "エラーが発生しました。もう一度お試しください。",
          );
        }
      }

      return;
    }

    // ========================================
    // 1) 明示的プレフィックスコマンド
    // ========================================

    // Prompt Polisher（プレフィックス付き）
    if (trimmed.startsWith("洗練:") || trimmed.startsWith("polish:")) {
      const rawInput = trimmed.replace(/^洗練:|^polish:/, "").trim();
      await handlePromptPolisher(rawInput, lineUserId, userId, replyToken);
      return;
    }

    // Risk Checker（プレフィックス付き）
    if (trimmed.startsWith("check:") || trimmed.startsWith("チェック:")) {
      const rawInput = trimmed.replace(/^check:|^チェック:/, "").trim();
      await handleRiskChecker(rawInput, lineUserId, userId, replyToken);
      return;
    }

    // ========================================
    // 1) 診断フロー中かチェック
    // ========================================
    const diagnosisState = await getDiagnosisState(lineUserId);

    if (diagnosisState) {
      // 「キャンセル」で診断を中断
      if (trimmed === "キャンセル" || trimmed === "cancel") {
        await clearDiagnosisState(lineUserId);
        if (replyToken) {
          await replyText(
            replyToken,
            "診断を中断しました。\n\n下のボタンから再度お試しください。",
            buildDiagnosisQuickReply(),
          );
        }
        return;
      }

      // 回答が有効かチェック
      if (!isValidAnswer(diagnosisState, trimmed)) {
        if (replyToken) {
          const question = getNextQuestion(diagnosisState);
          if (question) {
            const { text: questionText, quickReply } = buildQuestionMessage(
              question,
              diagnosisState.layer,
            );
            await replyText(
              replyToken,
              "選択肢から選んでください。\n\n" + questionText,
              quickReply as QuickReply,
            );
          }
        }
        return;
      }

      // 回答を記録し、次のレイヤーへ
      const newState: DiagnosisState = {
        ...diagnosisState,
        layer: diagnosisState.layer + 1,
        answers: [...diagnosisState.answers, trimmed],
      };

      // 総質問数を取得
      const totalQ = getTotalQuestions(newState.keyword);

      // 全問回答完了 → 結論を表示
      if (newState.answers.length >= totalQ) {
        const articleIds = getConclusion(newState);
        let articles = articleIds ? getArticlesByIds(articleIds) : [];

        // タグベースのフォールバック（記事IDが見つからない場合）
        if (articles.length === 0) {
          const interest = newState.answers[1]; // layer2の回答
          if (interest) {
            articles = getArticlesByTag(interest, 3);
            log.debug("Using tag-based fallback", {
              interest,
              articleCount: articles.length,
            });
          } else {
            log.warn("No interest found in answers", {
              answers: newState.answers,
            });
          }
        }

        if (articles.length > 0) {
          const conclusionMessage = buildConclusionMessage(newState, articles);
          if (replyToken) {
            await replyText(replyToken, conclusionMessage);
          }
        } else {
          // 記事が見つからない場合のフォールバック
          if (replyToken) {
            await replyText(
              replyToken,
              [
                `【${newState.keyword}】診断完了`,
                "",
                "ご回答ありがとうございました。",
                "関連記事の準備中です。",
                "",
                "---",
                "💬 詳しくは Discord でご相談ください",
                DISCORD_INVITE_URL,
              ].join("\n"),
            );
          }
        }

        await clearDiagnosisState(lineUserId);
        await logInteraction({
          userId,
          interactionType: "course_entry",
          courseKeyword: newState.keyword,
          inputLength: trimmed.length,
        });
        return;
      }

      // 次の質問を表示
      await updateDiagnosisState(lineUserId, newState);
      const nextQuestion = getNextQuestion(newState);
      if (nextQuestion && replyToken) {
        const { text: questionText, quickReply } = buildQuestionMessage(
          nextQuestion,
          newState.layer,
          totalQ,
        );
        await replyText(replyToken, questionText, quickReply as QuickReply);
      }
      return;
    }

    // ========================================
    // 1.5) 「診断」→ クイック診断フロー開始（3問）
    // ========================================
    if (trimmed === "診断") {
      console.log("[line-webhook] start quick diagnosis for user:", lineUserId);
      const flow = getFlowForKeyword("クイック診断");
      const startMessage = flow
        ? buildDiagnosisStartMessage("クイック診断")
        : null;
      if (flow && startMessage && replyToken) {
        const initialState: DiagnosisState = {
          keyword: "クイック診断",
          layer: 1,
          answers: [],
        };
        try {
          await updateDiagnosisState(lineUserId, initialState);
          console.log(
            "[line-webhook] diagnosis state initialized for user:",
            lineUserId,
          );
        } catch (err) {
          console.error(
            "[line-webhook] updateDiagnosisState error (start quick diagnosis)",
            err,
          );
        }
        await replyText(
          replyToken,
          startMessage.text,
          startMessage.quickReply as QuickReply,
        );
      } else {
        console.warn(
          "[line-webhook] quick diagnosis flow or startMessage missing",
        );
      }
      return;
    }

    // ========================================
    // 2) 診断キーワード → すべて3層フロー
    // ========================================
    const courseKeyword = detectCourseKeyword(trimmed);
    if (courseKeyword) {
      const flow = getFlowForKeyword(courseKeyword);
      if (flow) {
        const startMessage = buildDiagnosisStartMessage(courseKeyword);
        if (startMessage && replyToken) {
          // 診断状態を初期化
          const initialState: DiagnosisState = {
            keyword: courseKeyword,
            layer: 1,
            answers: [],
          };
          await updateDiagnosisState(lineUserId, initialState);
          await replyText(
            replyToken,
            startMessage.text,
            startMessage.quickReply as QuickReply,
          );
        }
        return;
      }

      // フローが定義されていない場合のフォールバック（通常は発生しない）
      const courseMessage = buildCourseEntryMessage(courseKeyword);
      if (replyToken) {
        await replyText(replyToken, courseMessage);
      }
      await logInteraction({
        userId,
        interactionType: "course_entry",
        courseKeyword,
        inputLength: trimmed.length,
      });
      return;
    }

    // ========================================
    // 3) 「特典」→ メール登録でDiscord招待
    // ========================================
    if (trimmed === "特典" || trimmed === "特典GET") {
      // 既にメール登録済みか確認
      const { data: existingMember } = await supabase
        .from("members")
        .select("email")
        .eq("line_user_id", lineUserId)
        .maybeSingle();

      if (existingMember?.email) {
        // 登録済み → Discord URLを再送 + 特典内容リマインド
        if (replyToken) {
          await replyText(
            replyToken,
            [
              "✅ 登録済みです！特典をご活用ください",
              "",
              "━━━━━━━━━━━━━━━",
              "🎁 あなたの特典",
              "━━━━━━━━━━━━━━━",
              "",
              "📚 Discordコミュニティ",
              "🤖 注目のAI記事要約（毎日更新）",
              "🛡️ 医療向けセキュリティレポート",
              "💬 Q&A・相談チャンネル",
              "⚡ 開発効率化Tips",
              "📎 資料・リンク集",
              "",
              "▼ Discord参加はこちら",
              DISCORD_INVITE_URL,
            ].join("\n"),
          );
        }
      } else {
        // 未登録 → メール入力を促す
        if (replyToken) {
          await replyText(
            replyToken,
            [
              "━━━━━━━━━━━━━━━",
              "🎁 無料特典（メール登録で即GET）",
              "━━━━━━━━━━━━━━━",
              "",
              "📚 Discordコミュニティ参加",
              "🤖 注目のAI記事要約（毎日更新）",
              "🛡️ 医療向けセキュリティレポート",
              "💬 Q&A・相談チャンネル",
              "⚡ 開発効率化Tips",
              "📎 資料・リンク集",
              "",
              "━━━━━━━━━━━━━━━",
              "",
              "▼ メールアドレスを入力して特典GET",
              "📱 左下のキーボードアイコンをタップ",
              "例: your@email.com",
            ].join("\n"),
          );
        }
      }
      return;
    }

    // ========================================
    // 3.5) 「コミュニティ」→ 特典案内へ誘導
    // ========================================
    if (trimmed === "コミュニティ") {
      if (replyToken) {
        await replyText(
          replyToken,
          [
            "Discord コミュニティへの参加は、",
            "メールアドレス登録が必要です。",
            "",
            "「特典」と入力するか、",
            "リッチメニューの「特典GET」をタップしてください。",
          ].join("\n"),
        );
      }
      return;
    }

    // ========================================
    // 4) 「お問い合わせ」→ 問い合わせフォーム
    // ========================================
    if (trimmed === "お問い合わせ" || trimmed === "問い合わせ") {
      if (replyToken) {
        await replyText(
          replyToken,
          [
            "📧 お問い合わせ",
            "",
            "ご質問・ご相談は以下のフォームからお願いします。",
            "",
            "▼ お問い合わせフォーム",
            CONTACT_FORM_URL,
          ].join("\n"),
        );
      }
      return;
    }

    // ========================================
    // 5) 「サービス一覧」→ サービス選択メニュー
    // ========================================
    if (trimmed === "サービス一覧") {
      if (replyToken) {
        await replyText(
          replyToken,
          [
            "✨ Cursorvers Edu サービス",
            "",
            "【無料】LINE上で使えるツール",
            "・プロンプト整形",
            "・リスクチェック",
            "・AI導入診断",
            "",
            "【有料】Library Member ¥2,980/月",
            "・有料記事の全文閲覧",
            "・検証済みプロンプト集",
            "・Master Class への充当可能",
            "",
            "▼ 詳細・お申込みはこちら",
            SERVICES_LP_URL,
            "",
            "▼ または下のボタンから選択",
          ].join("\n"),
          buildServicesQuickReply(),
        );
      }
      return;
    }

    // ========================================
    // 6) 「サービス詳細」→ LP へのリンク
    // ========================================
    if (trimmed === "サービス詳細を見る") {
      if (replyToken) {
        await replyText(
          replyToken,
          [
            "📖 サービス詳細ページ",
            "",
            "各プランの詳細・料金はこちらでご確認いただけます。",
            "",
            "▼ サービス一覧（Web）",
            SERVICES_LP_URL,
          ].join("\n"),
        );
      }
      return;
    }

    // ========================================
    // 7) 「プロンプト整形の使い方」→ プロンプト整形モードに入る
    // ========================================
    if (trimmed === "プロンプト整形の使い方") {
      // プロンプト整形モードを設定
      await setToolMode(lineUserId, "polish");

      if (replyToken) {
        await replyText(
          replyToken,
          [
            "🔧 プロンプト整形モード",
            "",
            "整形したい文章をそのまま入力してください。",
            "普通にAIに聞くより高品質な回答を引き出せる",
            "構造化プロンプトに変換します。",
            "",
            "📱 左下の「キーボード」アイコンをタップ",
            "",
            "【入力例】",
            "糖尿病患者の食事指導について教えて",
          ].join("\n"),
          buildBackButtonQuickReply(),
        );
      }
      return;
    }

    // ========================================
    // 8) 「リスクチェックの使い方」→ リスクチェックモードに入る
    // ========================================
    if (trimmed === "リスクチェックの使い方") {
      // リスクチェックモードを設定
      await setToolMode(lineUserId, "risk_check");

      if (replyToken) {
        await replyText(
          replyToken,
          [
            "🛡️ リスクチェックモード",
            "",
            "チェックしたい文章をそのまま入力してください。",
            "医療広告・個人情報・医学的妥当性などの",
            "リスクを分析します。",
            "",
            "📱 左下の「キーボード」アイコンをタップ",
            "",
            "【入力例】",
            "この治療法で必ず治ります",
          ].join("\n"),
          buildBackButtonQuickReply(),
        );
      }
      return;
    }

    // ========================================
    // 9) ヘルプメッセージ
    // ========================================
    if (replyToken) {
      const helpMessage = [
        "Pocket Defense Tool",
        "",
        "■ プロンプト整形",
        "「洗練:」の後に文章を入力",
        "",
        "■ リスクチェック",
        "「check:」の後に文章を入力",
        "",
        "■ AI導入情報・お問い合わせ",
        "下のボタンから選んでください ↓",
      ].join("\n");

      await replyText(replyToken, helpMessage, buildDiagnosisQuickReply());
    }
  } catch (err) {
    log.error("handleEvent error", {
      errorMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error
        ? err.stack?.split("\n").slice(0, 3).join(" | ")
        : undefined,
    });
  }
}

// =======================
// HTTP エントリポイント
// =======================

Deno.serve(async (req: Request): Promise<Response> => {
  log.debug("Request received", { method: req.method });

  // GET リクエストは疎通確認用
  if (req.method === "GET") {
    return new Response("OK - line-webhook is running", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  log.debug("Request body received", { bodyLength: rawBody.length });

  // LINE 署名検証
  const valid = await verifyLineSignature(req, rawBody);
  if (!valid) {
    log.warn("Signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }
  log.debug("Signature verified");

  let body: LineWebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookRequestBody;
  } catch (err) {
    log.error("JSON parse error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return new Response("Bad Request", { status: 400 });
  }

  const events = body.events ?? [];

  // 全イベントを処理してから200を返す
  try {
    await Promise.all(events.map((ev) => handleEvent(ev)));
    log.debug("All events processed", { eventCount: events.length });
  } catch (err) {
    log.error("Event processing error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  return new Response("OK", { status: 200 });
});
