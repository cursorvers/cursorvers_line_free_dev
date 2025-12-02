// supabase/functions/line-webhook/index.ts
// LINE公式アカウント用 Webhook エントリポイント（Pocket Defense Tool）
// - 型定義
// - dispatcher（Prompt Polisher / Risk Checker / 診断キーワード）
// - logInteraction helper
// OpenAI呼び出しや個別ロジックは lib/ 以下に切り出す

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// lib モジュール
import { DISCORD_INVITE_URL, CONTACT_FORM_URL, SERVICES_LP_URL, COURSE_KEYWORDS, type DiagnosisKeyword } from "./lib/constants.ts";
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
import { getArticlesByIds } from "./lib/note-recommendations.ts";

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

const LINE_CHANNEL_ACCESS_TOKEN =
  Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_POLISH_PER_HOUR = Number(Deno.env.get("MAX_POLISH_PER_HOUR") ?? "10");
const MAX_INPUT_LENGTH = Number(Deno.env.get("MAX_INPUT_LENGTH") ?? "3000");

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET) {
  console.warn(
    "[line-webhook] LINE environment variables are not fully set."
  );
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[line-webhook] Supabase environment variables are not fully set."
  );
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

function detectCourseKeyword(text: string): DiagnosisKeyword | null {
  const normalized = normalizeKeyword(text);
  const match = COURSE_KEYWORDS.find((kw) => kw === normalized);
  return match ?? null;
}

// LINE 署名検証
async function verifyLineSignature(
  req: Request,
  rawBody: string
): Promise<boolean> {
  if (!LINE_CHANNEL_SECRET) return false;
  const signature = req.headers.get("x-line-signature");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const hmac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hashArray = Array.from(new Uint8Array(hmac));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  return hashBase64 === signature;
}

// クイックリプライアイテムの型
interface QuickReplyItem {
  type: "action";
  action: {
    type: "message" | "postback";
    label: string;
    text?: string;
    data?: string;
  };
}

interface QuickReply {
  items: QuickReplyItem[];
}

// LINE 返信（reply API）
async function replyText(replyToken: string, text: string, quickReply?: QuickReply) {
  if (!replyToken) return;
  const message: Record<string, unknown> = { type: "text", text };
  if (quickReply) {
    message.quickReply = quickReply;
  }
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
    }),
  });
}

// 診断キーワード選択用のクイックリプライを生成
function buildDiagnosisQuickReply(): QuickReply {
  return {
    items: [
      // 診断キーワード
      ...COURSE_KEYWORDS.map((keyword) => ({
        type: "action" as const,
        action: {
          type: "message" as const,
          label: keyword.replace("診断", ""), // ラベルは短く
          text: keyword,
        },
      })),
      // お問い合わせボタン
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "お問い合わせ",
          text: "お問い合わせ",
        },
      },
    ],
  };
}

// サービス一覧用のクイックリプライを生成（コミュニティは別メニューに集約）
function buildServicesQuickReply(): QuickReply {
  return {
    items: [
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "プロンプト整形",
          text: "プロンプト整形の使い方",
        },
      },
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "リスクチェック",
          text: "リスクチェックの使い方",
        },
      },
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "サービス詳細（Web）",
          text: "サービス詳細を見る",
        },
      },
    ],
  };
}

// 「戻る」ボタン付きクイックリプライ（ツールモード用）
function buildBackButtonQuickReply(): QuickReply {
  return {
    items: [
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "← 戻る",
          text: "戻る",
        },
      },
    ],
  };
}

// LINE push（非同期で結果を送る用）
async function pushText(lineUserId: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });
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

// 直近1時間の利用回数をチェック（汎用）
async function getHourlyUsageCount(
  userId: string, 
  interactionType: string
): Promise<{ count: number; nextAvailable: Date | null }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneHourAgoIso = oneHourAgo.toISOString();

  const { data, error } = await supabase
    .from("interaction_logs")
    .select("created_at")
    .eq("user_id", userId)
    .eq("interaction_type", interactionType)
    .gte("created_at", oneHourAgoIso)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[line-webhook] getHourlyUsageCount error for ${interactionType}:`, error);
    return { count: 0, nextAvailable: null };
  }

  const count = data?.length ?? 0;
  
  // 5回以上使っている場合、最初の利用から1時間後を計算
  let nextAvailable: Date | null = null;
  if (count >= MAX_POLISH_PER_HOUR && data && data.length > 0) {
    const oldestUsage = new Date(data[0].created_at);
    nextAvailable = new Date(oldestUsage.getTime() + 60 * 60 * 1000);
  }

  return { count, nextAvailable };
}

// Prompt Polisher 用
async function getHourlyPolishCount(userId: string) {
  return getHourlyUsageCount(userId, "prompt_polisher");
}

// Risk Checker 用
async function getHourlyRiskCheckCount(userId: string) {
  return getHourlyUsageCount(userId, "risk_checker");
}

// =======================
// ユーザー状態管理（診断フロー & ツールモード）
// =======================

// ユーザー状態の型（診断 or ツールモード）
type UserMode = "polish" | "risk_check" | null;

interface UserState {
  mode?: UserMode;
  diagnosis?: DiagnosisState;
}

// ユーザー状態を取得
async function getUserState(lineUserId: string): Promise<UserState | null> {
  const { data, error } = await supabase
    .from("users")
    .select("diagnosis_state")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.error("[line-webhook] getUserState error", error);
    return null;
  }

  return data?.diagnosis_state as UserState | null;
}

// ユーザー状態を更新
async function updateUserState(
  lineUserId: string,
  state: UserState | null
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ diagnosis_state: state })
    .eq("line_user_id", lineUserId);

  if (error) {
    console.error("[line-webhook] updateUserState error", error);
  }
}

// ユーザー状態をクリア
async function clearUserState(lineUserId: string): Promise<void> {
  await updateUserState(lineUserId, null);
}

// 診断状態を取得（後方互換）
async function getDiagnosisState(lineUserId: string): Promise<DiagnosisState | null> {
  const state = await getUserState(lineUserId);
  return state?.diagnosis ?? null;
}

// 診断状態を更新（後方互換）
async function updateDiagnosisState(
  lineUserId: string,
  diagnosisState: DiagnosisState | null
): Promise<void> {
  if (diagnosisState) {
    await updateUserState(lineUserId, { diagnosis: diagnosisState });
  } else {
    await clearUserState(lineUserId);
  }
}

// 診断状態をクリア（後方互換）
async function clearDiagnosisState(lineUserId: string): Promise<void> {
  await clearUserState(lineUserId);
}

// ツールモードを設定
async function setToolMode(lineUserId: string, mode: UserMode): Promise<void> {
  console.log("[line-webhook] Setting tool mode:", mode, "for user:", lineUserId);
  await updateUserState(lineUserId, { mode });
}

// ツールモードを取得
async function getToolMode(lineUserId: string): Promise<UserMode> {
  const state = await getUserState(lineUserId);
  return state?.mode ?? null;
}

// =======================
// 機能ハンドラー
// =======================

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
  const source = event.source;
  const replyToken = event.replyToken;

  if (!source.userId) return;
  const lineUserId = source.userId;

  const userId = await getOrCreateUser(lineUserId);

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
      const articles = articleIds ? getArticlesByIds(articleIds) : [];
      
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
  // 3) 「コミュニティ」→ Discord
  // ========================================
  if (trimmed === "コミュニティ") {
    if (replyToken) {
      await replyText(replyToken, [
        "🎉 Cursorvers コミュニティへようこそ！",
        "",
        "Discord で医療 × AI の最新情報や、",
        "他のメンバーとの交流ができます。",
        "",
        "▼ 参加はこちら",
        DISCORD_INVITE_URL,
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
        "LINE上で使えるツールと、",
        "詳細ページへのリンクをご用意しています。",
        "",
        "▼ 下のボタンから選んでください",
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
}

// =======================
// HTTP エントリポイント
// =======================

serve(async (req: Request): Promise<Response> => {
  // GET リクエストは疎通確認用
  if (req.method === "GET") {
    return new Response("OK - line-webhook is running", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // LINE 署名検証
  const valid = await verifyLineSignature(req, rawBody);
  if (!valid) {
    console.error("[line-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let body: LineWebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookRequestBody;
  } catch (err) {
    console.error("[line-webhook] JSON parse error", err);
    return new Response("Bad Request", { status: 400 });
  }

  const events = body.events ?? [];
  
  // 各イベントは並列で処理（ただしOpenAI部分は非同期キックのみ）
  await Promise.all(events.map((ev) => handleEvent(ev)));

  // replyMessage は handleEvent 内で済ませているので、ここは常に 200 でOK
  return new Response("OK", { status: 200 });
});

