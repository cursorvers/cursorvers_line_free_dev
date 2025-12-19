// supabase/functions/line-webhook/index.ts
// LINE公式アカウント用 Webhook エントリポイント（Pocket Defense Tool）
// 主要ロジックは lib/ 以下に分割

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// lib モジュール - 定数・型
import { DISCORD_INVITE_URL, CONTACT_FORM_URL, SERVICES_LP_URL, COURSE_KEYWORDS, type DiagnosisKeyword } from "./lib/constants.ts";

// lib モジュール - LINE API
import { verifyLineSignature, replyText, pushText, replyRaw, type QuickReply } from "./lib/line-api.ts";

// lib モジュール - Quick Reply
import {
  buildDiagnosisQuickReply,
  buildServicesQuickReply,
  buildBackButtonQuickReply,
  buildNewsletterConfirmQuickReply,
} from "./lib/quick-reply.ts";

// lib モジュール - ユーザー状態管理
import {
  getUserState,
  updateUserState,
  clearUserState,
  getDiagnosisState,
  updateDiagnosisState,
  clearDiagnosisState,
  setToolMode,
  getToolMode,
  setPendingEmail,
  getPendingEmail,
  clearPendingEmail,
  type UserMode,
  type UserState,
} from "./lib/user-state.ts";

// lib モジュール - レート制限
import { getHourlyPolishCount, getHourlyRiskCheckCount, MAX_POLISH_PER_HOUR } from "./lib/rate-limit.ts";

// lib モジュール - 機能
import { runPromptPolisher } from "./lib/prompt-polisher.ts";
import { runRiskChecker } from "./lib/risk-checker.ts";
import { buildCourseEntryMessage } from "./lib/course-router.ts";
import {
  type DiagnosisState,
  getFlowForKeyword,
  getNextQuestion,
  getConclusion,
  isValidAnswer,
  buildQuestionMessage,
  buildConclusionMessage,
  buildDiagnosisStartMessage,
  getTotalQuestions,
} from "./lib/diagnosis-flow.ts";
import { getArticlesByIds, getArticlesByTag } from "./lib/note-recommendations.ts";

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
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_INPUT_LENGTH = Number(Deno.env.get("MAX_INPUT_LENGTH") ?? "3000");
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[line-webhook] Supabase environment variables are not fully set.");
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
    console.error("[line-webhook] getOrCreateUser select error", error);
    throw error;
  }

  if (data?.id) return data.id;

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({ line_user_id: lineUserId })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[line-webhook] getOrCreateUser insert error", insertError);
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
    console.error("[line-webhook] logInteraction error", error);
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
  replyToken?: string
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  try {
    // 既存レコードを確認（emailまたはline_user_idで）
    let existingRecord: { id: string; email: string | null; line_user_id: string | null; tier: string | null } | null = null;

    const { data: emailRecord } = await supabase
      .from("members")
      .select("id,email,line_user_id,tier")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (emailRecord) {
      existingRecord = emailRecord as typeof existingRecord;
    } else {
      const { data: lineRecord } = await supabase
        .from("members")
        .select("id,email,line_user_id,tier")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      existingRecord = lineRecord as typeof existingRecord;
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
      console.error("[line-webhook] Email registration DB error:", error);
      if (replyToken) {
        await replyText(replyToken, "登録処理中にエラーが発生しました。しばらくしてから再度お試しください。");
      }
      return;
    }

    // 成功 → Discord招待URLを返信
    if (replyToken) {
      await replyText(replyToken, [
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
      ].join("\n"));
    }

    console.log("[line-webhook] Email registered:", normalizedEmail.slice(0, 5) + "***");

  } catch (err) {
    console.error("[line-webhook] Email registration error:", err);
    if (replyToken) {
      await replyText(replyToken, "エラーが発生しました。時間をおいて再度お試しください。");
    }
  }
}

// Prompt Polisher ハンドラー（プレフィックスありでもなしでも動作）
async function handlePromptPolisher(
  rawInput: string,
  lineUserId: string,
  userId: string,
  replyToken?: string
): Promise<void> {

  if (rawInput.length > MAX_INPUT_LENGTH) {
    if (replyToken) {
      await replyText(replyToken, `入力が長すぎます（${MAX_INPUT_LENGTH}文字以内）。`);
    }
    return;
  }

  const { count: hourlyCount, nextAvailable } = await getHourlyPolishCount(userId);
  if (hourlyCount >= MAX_POLISH_PER_HOUR) {
    if (replyToken) {
      const waitMinutes = nextAvailable 
        ? Math.max(1, Math.ceil((nextAvailable.getTime() - Date.now()) / 60000))
        : 60;
      await replyText(replyToken, [
        `⏳ 利用上限に達しました（1時間に${MAX_POLISH_PER_HOUR}回まで）`,
        "",
        `約${waitMinutes}分後に再度ご利用いただけます。`,
        "",
        "💡 より多くご利用されたい方は、",
        "Library Memberへのアップグレードをご検討ください。",
      ].join("\n"));
    }
    return;
  }

  if (replyToken) {
    await replyText(replyToken, "プロンプトを整えています。数秒お待ちください。");
  }

  void (async () => {
    try {
      const result = await runPromptPolisher(rawInput);
      if (result.success && result.polishedPrompt) {
        const msg = result.polishedPrompt + "\n\n---\n💬 ご質問は Discord で\n" + DISCORD_INVITE_URL;
        await pushText(lineUserId, msg);
      } else {
        await pushText(lineUserId, result.error ?? "エラーが発生しました。");
      }
    } catch (err) {
      console.error("[line-webhook] prompt_polisher error", err);
      await pushText(lineUserId, "エラーが発生しました。時間をおいて再度お試しください。");
    }
  })();

  await logInteraction({ userId, interactionType: "prompt_polisher", inputLength: rawInput.length });
}

// Risk Checker ハンドラー（プレフィックスありでもなしでも動作）
async function handleRiskChecker(
  rawInput: string,
  lineUserId: string,
  userId: string,
  replyToken?: string
): Promise<void> {

  if (rawInput.length > MAX_INPUT_LENGTH) {
    if (replyToken) {
      await replyText(replyToken, `入力が長すぎます（${MAX_INPUT_LENGTH}文字以内）。`);
    }
    return;
  }

  const { count: hourlyCount, nextAvailable } = await getHourlyRiskCheckCount(userId);
  if (hourlyCount >= MAX_POLISH_PER_HOUR) {
    if (replyToken) {
      const waitMinutes = nextAvailable 
        ? Math.max(1, Math.ceil((nextAvailable.getTime() - Date.now()) / 60000))
        : 60;
      await replyText(replyToken, [
        `⏳ 利用上限に達しました（1時間に${MAX_POLISH_PER_HOUR}回まで）`,
        "",
        `約${waitMinutes}分後に再度ご利用いただけます。`,
        "",
        "💡 より多くご利用されたい方は、",
        "Library Memberへのアップグレードをご検討ください。",
      ].join("\n"));
    }
    return;
  }

  if (replyToken) {
    await replyText(replyToken, "リスクチェックを実行しています。数秒お待ちください。");
  }

  void (async () => {
    try {
      const result = await runRiskChecker(rawInput);
      if (result.success && result.formattedMessage) {
        const msg = result.formattedMessage + "\n\n---\n💬 詳しい相談は Discord で\n" + DISCORD_INVITE_URL;
        await pushText(lineUserId, msg);
      } else {
        await pushText(lineUserId, result.error ?? "エラーが発生しました。");
      }
    } catch (err) {
      console.error("[line-webhook] risk_checker error", err);
      await pushText(lineUserId, "エラーが発生しました。時間をおいて再度お試しください。");
    }
  })();

  await logInteraction({ userId, interactionType: "risk_checker", inputLength: rawInput.length });
}

// =======================
// Dispatcher 本体
// =======================

async function handleEvent(event: LineEvent): Promise<void> {
  try {
    console.log("[line-webhook] 📥 イベント受信:", event.type);

    const source = event.source;
    const replyToken = event.replyToken;

    if (!source.userId) {
      console.log("[line-webhook] ⚠️ userId なし - スキップ");
      return;
    }
    const lineUserId = source.userId;
    console.log("[line-webhook] 🔍 検証中... userId:", lineUserId.slice(-8));

  const userId = await getOrCreateUser(lineUserId);

  // ========================================
  // Follow イベント（友だち追加時）
  // ========================================
  if (event.type === "follow") {
    console.log("[line-webhook] Follow event from:", lineUserId);
    if (replyToken) {
      await replyText(replyToken, [
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
      ].join("\n"));
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

  // ========================================
  // 0) ツールモード中の処理（最優先）
  // ========================================
  const toolMode = await getToolMode(lineUserId);
  console.log("[line-webhook] toolMode:", toolMode, "for user:", lineUserId);
  
  if (toolMode) {
    // 「キャンセル」「戻る」でモードを終了
    if (trimmed === "キャンセル" || trimmed === "cancel" || trimmed === "戻る") {
      await clearUserState(lineUserId);
      if (replyToken) {
        await replyText(replyToken, "モードを終了しました。\n\n下のボタンから選んでください。", buildServicesQuickReply());
      }
      return;
    }

    // プロンプト整形モード → 入力をそのままPolish
    if (toolMode === "polish") {
      console.log("[line-webhook] Processing polish mode with input:", trimmed.substring(0, 50));
      await clearUserState(lineUserId); // 1回使ったらモード終了
      await handlePromptPolisher(trimmed, lineUserId, userId, replyToken);
      return;
    }

    // リスクチェックモード → 入力をそのままチェック
    if (toolMode === "risk_check") {
      console.log("[line-webhook] Processing risk_check mode with input:", trimmed.substring(0, 50));
      await clearUserState(lineUserId); // 1回使ったらモード終了
      await handleRiskChecker(trimmed, lineUserId, userId, replyToken);
      return;
    }
  }

  // デバッグ: 入力内容を確認
  console.log("[line-webhook] trimmed input:", trimmed);
  console.log("[line-webhook] isEmailFormat result:", isEmailFormat(trimmed));

  // ========================================
  // 0.5) メルマガ同意確認のpostback処理
  // ========================================
  if (trimmed === "email_opt_in=yes" || trimmed === "email_opt_in=no") {
    const pendingEmail = await getPendingEmail(lineUserId);
    if (!pendingEmail) {
      if (replyToken) {
        await replyText(replyToken, "セッションが切れました。もう一度メールアドレスを入力してください。");
      }
      return;
    }

    const optIn = trimmed === "email_opt_in=yes";
    await clearPendingEmail(lineUserId);
    await handleEmailRegistration(pendingEmail, lineUserId, optIn, replyToken);
    return;
  }

  // ========================================
  // 0.6) メールアドレス入力の検知 → 同意確認ボタン表示
  // ========================================
  if (isEmailFormat(trimmed)) {
    console.log("[line-webhook] ✅ Email detected:", trimmed.slice(0, 5) + "***");

    // 同期的に処理（バックグラウンドではなくawaitで待つ）
    try {
      const normalizedEmail = normalizeEmail(trimmed);
      console.log("[line-webhook] Normalized email:", normalizedEmail.slice(0, 5) + "***");

      await setPendingEmail(lineUserId, normalizedEmail);
      console.log("[line-webhook] ✅ Pending email saved");

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
        console.log("[line-webhook] ✅ Newsletter confirmation sent:", res.status);
      }
    } catch (err) {
      console.error("[line-webhook] ❌ Email handling error:", err instanceof Error ? err.message : String(err));
      if (replyToken) {
        await replyText(replyToken, "エラーが発生しました。もう一度お試しください。");
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
        await replyText(replyToken, "診断を中断しました。\n\n下のボタンから再度お試しください。", buildDiagnosisQuickReply());
      }
      return;
    }

    // 回答が有効かチェック
    if (!isValidAnswer(diagnosisState, trimmed)) {
      if (replyToken) {
        const question = getNextQuestion(diagnosisState);
        if (question) {
          const { text: questionText, quickReply } = buildQuestionMessage(question, diagnosisState.layer);
          await replyText(
            replyToken,
            "選択肢から選んでください。\n\n" + questionText,
            quickReply as QuickReply
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
          console.log(`[line-webhook] Using tag-based fallback for "${interest}", found ${articles.length} articles`);
        } else {
          console.error(`[line-webhook] No interest found in answers:`, newState.answers);
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
          await replyText(replyToken, [
            `【${newState.keyword}】診断完了`,
            "",
            "ご回答ありがとうございました。",
            "関連記事の準備中です。",
            "",
            "---",
            "💬 詳しくは Discord でご相談ください",
            DISCORD_INVITE_URL,
          ].join("\n"));
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
      const { text: questionText, quickReply } = buildQuestionMessage(nextQuestion, newState.layer, totalQ);
      await replyText(replyToken, questionText, quickReply as QuickReply);
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
        await replyText(replyToken, startMessage.text, startMessage.quickReply as QuickReply);
      }
      return;
    }

    // フローが定義されていない場合のフォールバック（通常は発生しない）
    const courseMessage = buildCourseEntryMessage(courseKeyword);
    if (replyToken) {
      await replyText(replyToken, courseMessage);
    }
    await logInteraction({ userId, interactionType: "course_entry", courseKeyword, inputLength: trimmed.length });
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
        await replyText(replyToken, [
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
        ].join("\n"));
      }
    } else {
      // 未登録 → メール入力を促す
      if (replyToken) {
        await replyText(replyToken, [
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
        ].join("\n"));
      }
    }
    return;
  }

  // ========================================
  // 3.5) 「コミュニティ」→ 特典案内へ誘導
  // ========================================
  if (trimmed === "コミュニティ") {
    if (replyToken) {
      await replyText(replyToken, [
        "Discord コミュニティへの参加は、",
        "メールアドレス登録が必要です。",
        "",
        "「特典」と入力するか、",
        "リッチメニューの「特典GET」をタップしてください。",
      ].join("\n"));
    }
    return;
  }

  // ========================================
  // 4) 「お問い合わせ」→ 問い合わせフォーム
  // ========================================
  if (trimmed === "お問い合わせ" || trimmed === "問い合わせ") {
    if (replyToken) {
      await replyText(replyToken, [
        "📧 お問い合わせ",
        "",
        "ご質問・ご相談は以下のフォームからお願いします。",
        "",
        "▼ お問い合わせフォーム",
        CONTACT_FORM_URL,
      ].join("\n"));
    }
    return;
  }

  // ========================================
  // 5) 「サービス一覧」→ サービス選択メニュー
  // ========================================
  if (trimmed === "サービス一覧") {
    if (replyToken) {
      await replyText(replyToken, [
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
      ].join("\n"), buildServicesQuickReply());
    }
    return;
  }

  // ========================================
  // 6) 「サービス詳細」→ LP へのリンク
  // ========================================
  if (trimmed === "サービス詳細を見る") {
    if (replyToken) {
      await replyText(replyToken, [
        "📖 サービス詳細ページ",
        "",
        "各プランの詳細・料金はこちらでご確認いただけます。",
        "",
        "▼ サービス一覧（Web）",
        SERVICES_LP_URL,
      ].join("\n"));
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
      await replyText(replyToken, [
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
      ].join("\n"), buildBackButtonQuickReply());
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
      await replyText(replyToken, [
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
      ].join("\n"), buildBackButtonQuickReply());
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
    console.error("[line-webhook] ❌ handleEvent エラー:", err instanceof Error ? err.message : String(err));
    console.error("[line-webhook] Stack:", err instanceof Error ? err.stack : "no stack");
  }
}

// =======================
// HTTP エントリポイント
// =======================

serve(async (req: Request): Promise<Response> => {
  console.log("[line-webhook] 🚀 リクエスト受信:", req.method);

  // GET リクエストは疎通確認用
  if (req.method === "GET") {
    return new Response("OK - line-webhook is running", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  console.log("[line-webhook] 📦 Body長さ:", rawBody.length);

  // LINE 署名検証
  const valid = await verifyLineSignature(req, rawBody);
  if (!valid) {
    console.error("[line-webhook] ❌ 署名検証失敗");
    return new Response("Invalid signature", { status: 401 });
  }
  console.log("[line-webhook] ✅ 署名検証OK");

  let body: LineWebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookRequestBody;
  } catch (err) {
    console.error("[line-webhook] JSON parse error", err);
    return new Response("Bad Request", { status: 400 });
  }

  const events = body.events ?? [];

  // 全イベントを処理してから200を返す
  try {
    await Promise.all(events.map((ev) => handleEvent(ev)));
    console.log("[line-webhook] ✅ 全イベント処理完了");
  } catch (err) {
    console.error("[line-webhook] ❌ イベント処理エラー:", err);
  }

  return new Response("OK", { status: 200 });
});
