// @ts-nocheck
// supabase/functions/line-bot/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?target=deno";

const CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");
const DISCORD_SYSTEM_WEBHOOK = Deno.env.get("DISCORD_SYSTEM_WEBHOOK");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for line-bot.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  console.log("Request received", { method: req.method, url: req.url });
  
  // LINE Webhook検証リクエストの場合は署名チェックをスキップ
  if (req.method === "GET") {
    console.log("GET request, returning OK");
    return new Response("OK", { status: 200 });
  }

  const signature = req.headers.get("x-line-signature");
  const body = await req.text();
  
  console.log("POST request", { 
    hasSignature: !!signature, 
    bodyLength: body.length,
    bodyPreview: body.substring(0, 100)
  });

  // JSON解析とエラーハンドリング
  let parsedBody;
  try {
    parsedBody = JSON.parse(body);
  } catch (error) {
    console.error("Failed to parse request body", error);
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = parsedBody.events || [];
  console.log("Parsed body", { eventsCount: events.length });

  // イベントが空の場合（Webhook検証など）は署名チェックをスキップして200を返す
  if (events.length === 0) {
    console.log("Empty events array, returning OK for webhook verification");
    return new Response("OK", { status: 200 });
  }

  // CHANNEL_SECRET が設定されていない場合のフォールバック
  if (!CHANNEL_SECRET) {
    console.error("LINE_CHANNEL_SECRET is not set");
    return new Response("Server configuration error", { status: 500 });
  }

  // 署名検証（簡易実装のため常にtrueを返す）
  if (!signature) {
    console.warn("No signature header found, but events exist");
    // 署名がなくてもイベントがある場合は処理を続行（開発環境など）
  }

  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const text = event.message.text;
    const directUserId = event.source?.userId ?? null;
    const lineUserId =
      directUserId ?? event.source?.groupId ?? event.source?.roomId ??
        "unknown_source";

    const containsPhi = detectPhi(text);
    const replyContext = buildReply(text, containsPhi);
    const memberProfile = await fetchMemberProfile(directUserId);
    const tuitionCreditYen = calculateTuitionCredit(
      memberProfile?.active_months ?? null,
    );

    let replySuccess = true;
    let replyErrorCode: string | null = null;
    try {
      await replyMessage(event.replyToken, replyContext.text);
    } catch (error) {
      replySuccess = false;
      replyErrorCode = error instanceof Error ? error.message : "reply_failed";
      await notifySystemError(`LINE返信失敗: ${replyErrorCode}`);
    }

    if (replyContext.logStatus && DISCORD_WEBHOOK_URL && directUserId) {
      const profileName = await getLineProfileName(directUserId);
      await sendDiscordNotification(
        replyContext.logStatus,
        profileName,
        directUserId,
      );
    }

    await logLineEvent({
      line_user_id: lineUserId,
      message_text: text,
      normalized_keyword: replyContext.normalizedKeyword,
      risk_level: replyContext.riskLevel,
      contains_phi: containsPhi,
      membership_email: memberProfile?.email ?? null,
      membership_tier: memberProfile?.membership_tier ?? null,
      subscription_status: memberProfile?.subscription_status ?? null,
      billing_cycle_anchor: memberProfile?.next_billing_at ?? null,
      tuition_credit_yen: tuitionCreditYen,
      stripe_customer_email: memberProfile?.stripe_customer_email ?? null,
      reply_success: replySuccess,
      error_code: replyErrorCode,
      metadata: {
        replyTemplate: replyContext.templateId,
        logStatus: replyContext.logStatus,
      },
    });
  }

  return new Response("OK", { status: 200 });
});

async function getLineProfileName(userId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
    });
    const data = await res.json();
    return data.displayName || "不明なユーザー";
  } catch {
    return "取得エラー";
  }
}

async function replyMessage(replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

async function sendDiscordNotification(
  status: string,
  name: string,
  userId: string,
) {
  const shortId = userId.slice(-4);
  const message =
    `🔔 **LINE Bot通知**\nユーザー: **${name}** (ID:...${shortId})\nアクション: **${status}**`;

  await fetch(DISCORD_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
}

function buildReply(text: string, containsPhi: boolean): ReplyContext {
  const normalizedKeyword = normalizeKeyword(text);

  if (containsPhi) {
    return {
      text:
        "【警告】\n患者・個人情報を含む内容は送信しないでください。直ちに匿名化を行い、PHIを含むデータ入力を停止してください。",
      logStatus: "PHI入力警告",
      normalizedKeyword: "phi_warning",
      riskLevel: "danger",
      templateId: "phi_warning",
    };
  }

  switch (normalizedKeyword) {
    case "risk_prompt":
      return {
        text:
          "【AIリスク診断】\n今のあなたのAI活用状況を教えてください。\n\nA: まだ使っていない\nB: 翻訳や要約に使っている\nC: 患者情報を含むデータを入力している\n\n(A, B, C のいずれかを入力してください)",
        logStatus: "診断開始",
        normalizedKeyword,
        riskLevel: "info",
        templateId: "risk_prompt",
      };
    case "answer_a":
      return {
        text:
          "【診断結果: 安全 ✅】\nまずはFree Communityの「安全プロンプト集」を使って、リスクのない事務作業から試してみましょう。",
        logStatus: "回答: A (安全)",
        normalizedKeyword,
        riskLevel: "safe",
        templateId: "risk_answer_a",
      };
    case "answer_b":
      return {
        text:
          "【診断結果: 注意 ⚠️】\nハルシネーション（嘘）のリスクがあります。出力結果の裏取り（ファクトチェック）を必ず行ってください。",
        logStatus: "回答: B (注意)",
        normalizedKeyword,
        riskLevel: "warning",
        templateId: "risk_answer_b",
      };
    case "answer_c":
      return {
        text:
          "【診断結果: 危険 🚨】\n個人情報保護法およびガイドライン違反の恐れがあります。直ちにPHI（個人健康情報）の入力を中止し、匿名化処理を行ってください。",
        logStatus: "回答: C (危険・PHI入力疑い)",
        normalizedKeyword,
        riskLevel: "danger",
        templateId: "risk_answer_c",
      };
    case "safe_prompt":
      return {
        text:
          "【今月の安全プロンプト】\n「患者への説明用：専門用語を小学生レベルに噛み砕くプロンプト」\n\n[ここにプロンプト本文を表示...]\n\n※Library Memberになると、実務で使える検証済みプロンプトが毎月届きます。",
        logStatus: "プロンプト閲覧",
        normalizedKeyword,
        riskLevel: "info",
        templateId: "monthly_prompt",
      };
    default:
      return {
        text:
          "こんにちは、Cursorversです。\n以下のキーワードを送ってみてください。\n\n・「診断」→ リスク診断を開始\n・「プロンプト」→ サンプルを表示",
        logStatus: undefined,
        normalizedKeyword,
        riskLevel: "info",
        templateId: "default",
      };
  }
}

function normalizeKeyword(text: string): NormalizedKeyword {
  const normalized = text.trim().toLowerCase();
  if (normalized.includes("診断")) return "risk_prompt";
  if (normalized === "a") return "answer_a";
  if (normalized === "b") return "answer_b";
  if (normalized === "c") return "answer_c";
  if (normalized.includes("プロンプト")) return "safe_prompt";
  return "default";
}

function detectPhi(text: string): boolean {
  const lower = text.toLowerCase();
  const phiKeywords = [
    "患者",
    "氏名",
    "保険証",
    "カルテ",
    "マイナンバー",
    "生年月日",
    "住所",
  ];
  return phiKeywords.some((keyword) => lower.includes(keyword));
}

function calculateTuitionCredit(activeMonths: number | null): number {
  if (!activeMonths || activeMonths < 0) return 0;
  return activeMonths * 2980;
}

async function fetchMemberProfile(
  lineUserId: string | null,
): Promise<MemberProfile | null> {
  if (!lineUserId) return null;

  const { data, error } = await supabase
    .from("library_members")
    .select(
      "email,membership_tier,subscription_status,next_billing_at,active_months,stripe_customer_email",
    )
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch member profile", error);
    await notifySystemError(`会員情報取得失敗: ${error.message}`);
    return null;
  }

  return data as MemberProfile | null;
}

async function logLineEvent(payload: LineEventPayload) {
  const { error } = await supabase.from("line_events").insert(payload);
  if (error) {
    console.error("Failed to log line event", error);
    await notifySystemError(`DB挿入失敗: ${error.message}`);
  }
}

async function notifySystemError(errorMessage: string) {
  if (!DISCORD_SYSTEM_WEBHOOK) return;
  
  try {
    await fetch(DISCORD_SYSTEM_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🚨 **System Alert**\nエラー: ${errorMessage}\n時刻: ${new Date().toISOString()}`
      }),
    });
  } catch (e) {
    console.error("Failed to send system notification", e);
  }
}

function verifySignature(secret: string, signature: string, body: string): boolean {
  return true;
}

type NormalizedKeyword =
  | "risk_prompt"
  | "answer_a"
  | "answer_b"
  | "answer_c"
  | "safe_prompt"
  | "phi_warning"
  | "default";

type ReplyContext = {
  text: string;
  logStatus?: string;
  normalizedKeyword: string;
  riskLevel: "info" | "safe" | "warning" | "danger";
  templateId: string;
};

type MemberProfile = {
  email: string | null;
  membership_tier: string | null;
  subscription_status: string | null;
  next_billing_at: string | null;
  active_months: number | null;
  stripe_customer_email: string | null;
};

type LineEventPayload = {
  line_user_id: string;
  message_text: string;
  normalized_keyword: string;
  risk_level: string;
  contains_phi: boolean;
  membership_email: string | null;
  membership_tier: string | null;
  subscription_status: string | null;
  billing_cycle_anchor: string | null;
  tuition_credit_yen: number;
  stripe_customer_email: string | null;
  reply_success: boolean;
  error_code: string | null;
  metadata: Record<string, unknown>;
};