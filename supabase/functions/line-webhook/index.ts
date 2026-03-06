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
import { createDiscordInvite } from "../_shared/discord.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { anonymizeUserId, createLogger } from "../_shared/logger.ts";
import {
  maskEmail,
  maskLineUserId,
  maskVerificationCode,
} from "../_shared/masking-utils.ts";
import {
  isCodeExpired,
  isVerificationCodeFormat,
  normalizeCode,
} from "../_shared/verification-code.ts";
import { isValidEmail as isEmailFormat } from "../_shared/validation-utils.ts";

const log = createLogger("line-webhook");

// lib モジュール - 定数・型
import {
  CONTACT_FORM_URL,
  type DiagnosisKeyword,
  DISCORD_INVITE_URL,
  SERVICES_LP_URL,
} from "./lib/constants.ts";

// lib モジュール - LINE API
import { pushText, replyText, verifyLineSignature } from "./lib/line-api.ts";

// lib モジュール - Quick Reply
import { buildNewsletterConfirmQuickReply } from "./lib/quick-reply.ts";

// lib モジュール - ユーザー状態管理
import {
  clearPendingEmail,
  clearUserState,
  getPendingEmail,
  setPendingEmail,
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

// lib モジュール - ハンドラー（リファクタリング後）
import {
  checkToolMode,
  dispatchMenuCommand,
  handleFollowEvent,
  handleHelp,
  handleToolModeCancel,
  matchMenuCommand,
} from "./lib/event-handlers.ts";
import {
  detectCourseKeyword,
  getDiagnosisStateForUser,
  handleCourseKeywordStart,
  handleDiagnosisAnswer,
  handleDiagnosisCancel,
  handleQuickDiagnosisStart,
} from "./lib/diagnosis-handlers.ts";
import {
  formatPaymentHistoryMessage,
  getPaymentHistoryByLineUserId,
  isPaymentHistoryCommand,
} from "./lib/payment-history.ts";

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

// メールアドレスを正規化
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
      status: string | null;
    };
    let existingRecord: MemberRecord | null = null;

    const { data: emailRecord } = await supabase
      .from("members")
      .select("id,email,line_user_id,tier,status")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (emailRecord) {
      existingRecord = emailRecord as MemberRecord;
    } else {
      const { data: lineRecord } = await supabase
        .from("members")
        .select("id,email,line_user_id,tier,status")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      existingRecord = lineRecord as MemberRecord | null;
    }

    // LINE IDで既存レコードが見つかり、かつ既にメールが登録されている場合
    // 異なるメールアドレスでの上書きを防止
    if (
      existingRecord &&
      existingRecord.email &&
      existingRecord.email !== normalizedEmail
    ) {
      log.info("Email already registered for this LINE ID", {
        lineUserId: maskLineUserId(lineUserId),
        existingEmail: maskEmail(existingRecord.email),
      });
      if (replyToken) {
        await replyText(
          replyToken,
          [
            "✅ 既にメールアドレスが登録されています",
            "",
            `登録済み: ${existingRecord.email.slice(0, 3)}***@***`,
            "",
            "別のメールアドレスに変更する場合は、",
            "お問い合わせください。",
          ].join("\n"),
        );
      }
      return;
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      email: normalizedEmail,
      line_user_id: lineUserId,
      tier: existingRecord?.tier ?? "free",
      status: existingRecord?.status ?? "free",
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
      email: maskEmail(normalizedEmail),
    });
  } catch (err) {
    log.error("Email registration error", {
      errorMessage: extractErrorMessage(err),
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
        code: maskVerificationCode(code),
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
        code: maskVerificationCode(code),
        email: maskEmail(member.email),
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
          code: maskVerificationCode(code),
          existingLineUser: maskLineUserId(member.line_user_id),
          newLineUser: maskLineUserId(lineUserId),
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

    // LINE紐付けを実行（楽観的ロック: line_user_idがnullの場合のみ更新）
    // Note: discord_invite_sent は Discord招待送信成功後に別途更新
    const { data: updateResult, error: updateError } = await supabase
      .from("members")
      .update({
        line_user_id: lineUserId,
        verification_code: null,
        verification_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id)
      .is("line_user_id", null) // 楽観的ロック: 未紐付けの場合のみ更新
      .select("id");

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

    // 更新されなかった場合（レースコンディション検出）
    if (!updateResult || updateResult.length === 0) {
      // 現在のレコードを再取得して状況を確認
      const { data: currentRecord } = await supabase
        .from("members")
        .select("line_user_id, discord_invite_sent")
        .eq("id", member.id)
        .maybeSingle();

      if (currentRecord?.line_user_id === lineUserId) {
        // 同じLINE IDで既に紐付け済み（同一ユーザーの重複リクエスト）
        log.info("Already linked with same LINE ID", {
          memberId: member.id,
          lineUserId: maskLineUserId(lineUserId),
        });
        if (replyToken) {
          await replyText(
            replyToken,
            [
              "✅ 既に認証完了しています",
              "",
              "Discordコミュニティへの参加がまだの方は",
              "以下のリンクからご参加ください。",
              "",
              DISCORD_INVITE_URL,
            ].join("\n"),
          );
        }
      } else {
        // 別のLINE IDで紐付け済み
        log.warn(
          "Race condition: LINE already linked by different user",
          {
            memberId: member.id,
            requestedLineUserId: maskLineUserId(lineUserId),
          },
        );
        if (replyToken) {
          await replyText(
            replyToken,
            [
              "⚠️ このコードは既に使用されています",
              "",
              "別のLINEアカウントで認証済みです。",
              "問題がある場合はサポートまでお問い合わせください。",
            ].join("\n"),
          );
        }
      }
      return;
    }

    log.info("Verification successful, LINE linked", {
      email: maskEmail(member.email),
      lineUserId: maskLineUserId(lineUserId),
      tier: member.tier,
    });

    // Discord招待を生成して送信
    let discordInviteUrl = DISCORD_INVITE_URL; // フォールバック用

    const inviteResult = await createDiscordInvite();
    if (inviteResult.success && inviteResult.inviteUrl) {
      discordInviteUrl = inviteResult.inviteUrl;
      log.info("Discord invite created for verification", {
        email: maskEmail(member.email),
      });
    } else {
      log.warn("Failed to create Discord invite, using fallback", {
        error: inviteResult.error,
      });
    }

    // 認証完了メッセージを送信
    const tierDisplayName = member.tier === "master"
      ? "Master Class"
      : "Library Member";

    let discordInviteSent = false;
    if (replyToken) {
      const replySent = await replyText(
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

      if (replySent) {
        discordInviteSent = true;
      } else {
        // reply失敗時はpushでフォールバック
        log.warn("Reply failed, trying push fallback", {
          lineUserId: maskLineUserId(lineUserId),
        });
        const pushSent = await pushText(
          lineUserId,
          [
            "🎉 認証完了！",
            "",
            `【${tierDisplayName}】へようこそ！`,
            "",
            "▼ Discord コミュニティ参加はこちら",
            discordInviteUrl,
          ].join("\n"),
        );
        discordInviteSent = pushSent;
      }
    }

    // Discord招待送信成功時のみフラグを更新
    if (discordInviteSent) {
      await supabase
        .from("members")
        .update({ discord_invite_sent: true })
        .eq("id", member.id);
    } else {
      log.warn("Discord invite not sent, flag remains false for retry", {
        memberId: member.id,
      });
    }
  } catch (err) {
    log.error("Verification code handling error", {
      errorMessage: extractErrorMessage(err),
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
        errorMessage: extractErrorMessage(err),
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
        errorMessage: extractErrorMessage(err),
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
// Dispatcher 本体（リファクタリング版）
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
    // 1) Follow イベント（友だち追加時）
    // ========================================
    if (event.type === "follow") {
      await handleFollowEvent(lineUserId, replyToken);
      return;
    }

    // テキスト抽出
    let text: string | null = null;
    if (event.type === "message" && event.message?.type === "text") {
      text = event.message.text;
    } else if (event.type === "postback" && event.postback?.data) {
      text = event.postback.data;
    }
    if (!text) return;

    const trimmed = text.trim();
    log.debug("Received text", {
      text: trimmed,
      userId: anonymizeUserId(lineUserId),
    });

    // ========================================
    // 2) ツールモード中の処理（最優先）
    // ========================================
    const toolMode = await checkToolMode(lineUserId);
    if (toolMode) {
      if (isCancelCommand(trimmed)) {
        await handleToolModeCancel(lineUserId, replyToken);
        return;
      }
      if (toolMode === "polish") {
        await clearUserState(lineUserId);
        await handlePromptPolisher(trimmed, lineUserId, userId, replyToken);
        return;
      }
      if (toolMode === "risk_check") {
        await clearUserState(lineUserId);
        await handleRiskChecker(trimmed, lineUserId, userId, replyToken);
        return;
      }
    }

    // ========================================
    // 3) メルマガ同意確認のpostback処理
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
    // 4) 認証コード入力の検知 → 有料会員認証
    // ========================================
    if (isVerificationCodeFormat(trimmed)) {
      const code = normalizeCode(trimmed);
      log.info("Verification code detected", {
        code: maskVerificationCode(code),
        userId: anonymizeUserId(lineUserId),
      });
      try {
        await handleVerificationCode(code, lineUserId, replyToken);
      } catch (err) {
        log.error("Verification code handling error", {
          errorMessage: extractErrorMessage(err),
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
    // 5) メールアドレス入力の検知 → 同意確認ボタン表示
    // ========================================
    if (isEmailFormat(trimmed)) {
      await handleEmailInput(trimmed, lineUserId, replyToken);
      return;
    }

    // ========================================
    // 6) 明示的プレフィックスコマンド
    // ========================================
    if (trimmed.startsWith("洗練:") || trimmed.startsWith("polish:")) {
      const rawInput = trimmed.replace(/^洗練:|^polish:/, "").trim();
      await handlePromptPolisher(rawInput, lineUserId, userId, replyToken);
      return;
    }
    if (trimmed.startsWith("check:") || trimmed.startsWith("チェック:")) {
      const rawInput = trimmed.replace(/^check:|^チェック:/, "").trim();
      await handleRiskChecker(rawInput, lineUserId, userId, replyToken);
      return;
    }

    // ========================================
    // 7) 診断フロー中かチェック
    // ========================================
    const diagnosisState = await getDiagnosisStateForUser(lineUserId);
    if (diagnosisState) {
      if (isCancelCommand(trimmed)) {
        await handleDiagnosisCancel(lineUserId, replyToken);
        return;
      }
      // メニューコマンドは診断中でも優先処理（Discord導線を維持）
      const menuCommandInDiagnosis = matchMenuCommand(trimmed);
      if (menuCommandInDiagnosis) {
        await dispatchMenuCommand(
          menuCommandInDiagnosis,
          lineUserId,
          replyToken,
        );
        return;
      }
      await handleDiagnosisAnswer(
        lineUserId,
        userId,
        diagnosisState,
        trimmed,
        replyToken,
        logInteraction,
      );
      return;
    }

    // ========================================
    // 8) 「診断」→ クイック診断フロー開始
    // ========================================
    if (trimmed === "診断") {
      await handleQuickDiagnosisStart(lineUserId, replyToken);
      return;
    }

    // ========================================
    // 9) 診断キーワード → 3層フロー
    // ========================================
    const courseKeyword = detectCourseKeyword(trimmed);
    if (courseKeyword) {
      await handleCourseKeywordStart(
        lineUserId,
        userId,
        courseKeyword,
        replyToken,
        logInteraction,
      );
      return;
    }

    // ========================================
    // 10) 支払い履歴照会
    // ========================================
    if (isPaymentHistoryCommand(trimmed)) {
      log.info("Payment history requested", {
        userId: anonymizeUserId(lineUserId),
      });
      const result = await getPaymentHistoryByLineUserId(lineUserId);
      const message = formatPaymentHistoryMessage(result);
      if (replyToken) {
        await replyText(replyToken, message);
      }
      return;
    }

    // ========================================
    // 11) メニューコマンド
    // ========================================
    const menuCommand = matchMenuCommand(trimmed);
    if (menuCommand) {
      await dispatchMenuCommand(menuCommand, lineUserId, replyToken);
      return;
    }

    // ========================================
    // 12) ヘルプメッセージ（デフォルト）
    // ========================================
    await handleHelp(replyToken);
  } catch (err) {
    log.error("handleEvent error", {
      errorMessage: extractErrorMessage(err),
      stack: err instanceof Error
        ? err.stack?.split("\n").slice(0, 3).join(" | ")
        : undefined,
    });
  }
}

// キャンセルコマンド判定
function isCancelCommand(text: string): boolean {
  return text === "キャンセル" || text === "cancel" || text === "戻る";
}

// メールアドレス入力処理
async function handleEmailInput(
  email: string,
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  log.info("Email detected", { email: maskEmail(email) });

  try {
    const normalizedEmail = normalizeEmail(email);
    await setPendingEmail(lineUserId, normalizedEmail);
    log.debug("Pending email saved");

    if (replyToken) {
      const text = [
        "メール登録",
        `${email}`,
        "",
        "━━━━━━━━━━━━━━━",
        "メルマガ内容",
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
      errorMessage: extractErrorMessage(err),
    });
    if (replyToken) {
      await replyText(
        replyToken,
        "エラーが発生しました。もう一度お試しください。",
      );
    }
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
      errorMessage: extractErrorMessage(err),
    });
    return new Response("Bad Request", { status: 400 });
  }

  const events = body.events ?? [];

  // 全イベントを処理してから200を返す（1つの失敗が他に影響しないようallSettled使用）
  const results = await Promise.allSettled(events.map((ev) => handleEvent(ev)));

  // 失敗したイベントを個別にログ
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failures.length > 0) {
    for (const failure of failures) {
      log.error("Event processing failed", {
        errorMessage: extractErrorMessage(failure.reason),
      });
    }
  }

  log.debug("All events processed", {
    eventCount: events.length,
    successCount: results.filter((r) => r.status === "fulfilled").length,
    failureCount: failures.length,
  });

  return new Response("OK", { status: 200 });
});
