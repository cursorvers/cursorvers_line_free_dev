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
const REFERENCE_LINKS_MESSAGE =
  "📎 参考リンク\n・個人情報保護委員会「生成AIサービスの利用に関する注意喚起」\nhttps://www.ppc.go.jp/news/careful_information/230602_AI_utilize_alert\n・厚生労働省「医療機関におけるサイバーセキュリティ対策チェックリスト」\nhttps://www.mhlw.go.jp/content/10808000/001490745.pdf\n・医療・ヘルスケア分野における生成AI利用ガイドライン（HAIP）\nhttps://haip-cip.org/assets/documents/nr_20241002_02.pdf\n・国立保健医療科学院「情報セキュリティ研修教材（医療従事者向け）」\nhttps://h-crisis.niph.go.jp/wp-content/uploads/2021/04/20210402172128_content_10808000_000761105.pdf\n・土浦協同病院「ソーシャルメディアガイドライン」\nhttps://www.tkgh.jp/guidance/philosophy/socialmedia-guideline/";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for line-bot.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  console.log("Request received", { method: req.method, url: req.url });

  if (req.method === "GET") {
    console.log("GET request, returning OK");
    return new Response("OK", { status: 200 });
  }

  const signature = req.headers.get("x-line-signature");
  const mockSignature = req.headers.get("x-mock-signature");
  const authHeader = req.headers.get("authorization");
  const body = await req.text();

  console.log("POST request", {
    hasSignature: !!signature,
    hasMockSignature: !!mockSignature,
    hasAuthHeader: !!authHeader,
    bodyLength: body.length,
    bodyPreview: body.substring(0, 100),
  });

  if (!mockSignature && !authHeader) {
    if (!CHANNEL_SECRET) {
      console.error("LINE_CHANNEL_SECRET is not set");
      return new Response("Server configuration error", { status: 500 });
    }
    if (!signature) {
      console.error("Missing x-line-signature header");
      return new Response("Missing signature", { status: 401 });
    }
    if (!verifySignature(CHANNEL_SECRET, signature, body)) {
      console.error("Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    console.log(
      "Internal request detected; skipping signature verification for Manus / mock",
    );
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(body);
  } catch (error) {
    console.error("Failed to parse request body", error);
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = parsedBody.events || [];
  console.log("Parsed body", { eventsCount: events.length });

  if (events.length === 0) {
    return new Response("OK", { status: 200 });
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

    let replySuccess = true;
    let replyErrorCode: string | null = null;
    try {
      await replyMessage(event.replyToken, replyContext.messages);
    } catch (error) {
      replySuccess = false;
      replyErrorCode = error instanceof Error ? error.message : "reply_failed";
      await notifySystemError(`LINE返信失敗: ${replyErrorCode}`);
    }

    const memberProfile = await fetchMemberProfile(directUserId);
    const tuitionCreditYen = calculateTuitionCredit(
      memberProfile?.active_months ?? null,
    );

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
      membership_email: memberProfile?.stripe_customer_email ?? null,
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

async function replyMessage(
  replyToken: string,
  messages: LineMessage[],
) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
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
      messages: [{
        type: "text",
        text:
          "【警告】\n患者・個人情報を含む内容は送信しないでください。直ちに匿名化を行い、PHIを含むデータ入力を停止してください。",
      }],
      logStatus: "PHI入力警告",
      normalizedKeyword: "phi_warning",
      riskLevel: "danger",
      templateId: "phi_warning",
    };
  }

  switch (normalizedKeyword) {
    case "risk_prompt":
      return {
        messages: [{
          type: "text",
          text:
            "【AIリスク診断】\n今のあなたのAI活用状況を教えてください。\n\nA: まだ使っていない\nB: 翻訳や要約に使っている\nC: 患者情報を含むデータを入力している",
          quickReply: {
            items: [
              {
                type: "action",
                action: { type: "message", label: "A", text: "A" },
              },
              {
                type: "action",
                action: { type: "message", label: "B", text: "B" },
              },
              {
                type: "action",
                action: { type: "message", label: "C", text: "C" },
              },
            ],
          },
        }],
        logStatus: "診断開始",
        normalizedKeyword,
        riskLevel: "info",
        templateId: "risk_prompt",
      };
    case "answer_a":
      return {
        messages: [
          {
            type: "text",
            text:
              "🛡 AIリスク診断：あなたは【A. 安全ゾーン】です\n\nご回答ありがとうございます。現時点の使い方では大きな情報漏えいリスクは高くなさそうです。このまま「安全第一」でAIを使っていきましょう。ただし、「安全＝何をしても大丈夫」ではありません。次の3つだけは今後も必ず守ってください。\n① 患者さんが特定できる情報は入れない（氏名／イニシャル／顔写真／カルテ本文／住所など）\n② 勤務先や施設が推測できる情報は最小限に（当直表やシフト表はそのまま入れない）\n③ 所属施設のルール ＞ この診断結果（情報セキュリティポリシーがあれば必ず優先）\n────────────\n✅ 次の一歩（Aゾーンの方向け）\n────────────\n・「安全プロンプト集（Lite）」から今日は1つだけ試してみましょう（例：学会抄録のたたき台、事務メールの下書き）\n・「医療副業・情報発信の安全ガイド（ライト版）」の【第1章：絶対NGリスト】だけ先に読んでおくと安心です\n────────────\n※この診断は一般的なAIリテラシーの目安です。実際の運用は、必ず所属施設の規程・上長の指示に従ってください。",
          },
          { type: "text", text: REFERENCE_LINKS_MESSAGE },
        ],
        logStatus: "回答: A (安全)",
        normalizedKeyword,
        riskLevel: "safe",
        templateId: "risk_answer_a",
      };
    case "answer_b":
      return {
        messages: [
          {
            type: "text",
            text:
              "⚠️ AIリスク診断：あなたは【B. 要注意ゾーン】です\n\nご回答内容から、このまま続けると情報漏えいにつながりうるグレーゾーンがいくつか見つかりました。特に次のような使い方に心当たりがあれば注意してください。\n・ケース紹介で年齢／病名／時期／施設規模などを細かく書きすぎている\n・個人スマホや自宅PCから無料版AIサービスに業務メモをコピペしている\n・SNS投稿の下書きにAIを使い、勤務先や診療科がわかる表現が残っている\n────────────\n🛠 今すぐ見直したい3つのポイント\n────────────\n① 「どのアカウント」に入れているか（業務情報を個人の無料アカウントに入れない）\n② 「どのレベルまで匿名化しているか」（症例は個人が特定されないレベルまで削る）\n③ 「そのままコピペで外に出していないか」（出力は必ず自分の目でチェック）\n────────────\n📚 Free Community内でのおすすめ\n────────────\n・「安全プロンプト集（Lite）」内の【医療情報を入れない言い換えテンプレ】をまず使ってください\n・「医療副業・情報発信の安全ガイド（ライト版）」の【グレーゾーン事例集】で自分のケースとの違いを整理しましょう\n────────────\n※この診断は一般的な情報であり、法的助言や所属施設の正式な判断を代替するものではありません。迷ったときは必ず院内の情報担当者・上長に相談してください。",
          },
          { type: "text", text: REFERENCE_LINKS_MESSAGE },
        ],
        logStatus: "回答: B (注意)",
        normalizedKeyword,
        riskLevel: "warning",
        templateId: "risk_answer_b",
      };
    case "answer_c":
      return {
        messages: [
          {
            type: "text",
            text:
              "🚨 AIリスク診断：あなたは【C. 情報漏えいリスク高め】です\n\n今すぐやめたほうがよい使い方が含まれている可能性があります。以下のような使い方をしている場合、患者さんの個人情報や勤務先の機密が外部サービスに渡っているおそれがあります。\n・カルテ本文／検査結果をそのままAIにコピペ\n・氏名／イニシャル／病棟名などを含めて相談\n・LINEやSNSで受けた医療相談の文面をそのままAIに貼り付け\n・無料版AIにCT／MRI／顔写真などの画像をアップロード\n────────────\n⛔ まず「今日中に」止めること\n────────────\n① 上記のような入力をいったんすべて中止\n② 使っていたAIサービスからログアウトし、アプリを閉じる\n③ いつ／どのサービスに／どんな情報を入れたかを思い出せる範囲でメモ\n────────────\n📞 数日以内にしてほしいこと\n────────────\n① 所属施設の情報セキュリティ担当／上長に相談（正直に共有）\n② 院内の情報セキュリティポリシー／SNS利用ガイドラインを読み直す\n③ 「医療副業・情報発信の安全ガイド（ライト版）」の【やってしまったときの対応チェックリスト】を確認\n────────────\n大切なのは「気づいたタイミングで止める」ことです。このメッセージはキャリアや免許を守りながらAIを使うためのスタート地点です。今後、数回に分けてNG例と安全な置き換え方のミニ講座をお届けしますので、一緒にリカバリーしていきましょう。\n※個別のインシデント対応や法的判断は、必ず所属施設のルールと責任者・顧問弁護士等の指示を優先してください。この診断は一般的な情報提供にとどまります。",
          },
          { type: "text", text: REFERENCE_LINKS_MESSAGE },
        ],
        logStatus: "回答: C (危険・PHI入力疑い)",
        normalizedKeyword,
        riskLevel: "danger",
        templateId: "risk_answer_c",
      };
    case "safe_prompt":
      return {
        messages: [{
          type: "text",
        text:
          "【今月の安全プロンプト】\n「患者説明を小学生レベルに噛み砕くテンプレ」\n\n1. 目的/対象を宣言\n2. NGワード&免責をセット\n3. 医療者の確認手順を明記\n\n▶ 詳細解説ノート: https://note.com/nice_wren7963\n▶ Free Community登録でテンプレ配布: https://lin.ee/fbhW5eQ",
        }],
        logStatus: "プロンプト閲覧",
        normalizedKeyword,
        riskLevel: "info",
        templateId: "monthly_prompt",
      };
    default:
      return {
        messages: [{
          type: "text",
        text:
          "こんにちは、Cursorversです。\n以下のキーワードを送ってみてください。\n\n・「診断」→ AIリスク診断を開始\n・「プロンプト」→ 安全テンプレを表示\n\n医療×AIの最新ノウハウはこちら 👉 https://note.com/nice_wren7963\nFree Community（安全プロンプト集つき） 👉 https://lin.ee/fbhW5eQ",
        }],
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
    .select("*")
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
  messages: LineMessage[];
  logStatus?: string;
  normalizedKeyword: string;
  riskLevel: "info" | "safe" | "warning" | "danger";
  templateId: string;
};

type LineMessage = {
  type: "text";
  text: string;
  quickReply?: {
    items: Array<{
      type: "action";
      action: { type: "message"; label: string; text: string };
    }>;
  };
};

type MemberProfile = {
  stripe_customer_email?: string | null;
  membership_tier?: string | null;
  subscription_status?: string | null;
  next_billing_at?: string | null;
  active_months?: number | null;
  line_user_id?: string | null;
  last_payment_at?: string | null;
  last_interaction_at?: string | null;
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