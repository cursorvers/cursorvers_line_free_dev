// supabase/functions/ingest-hij/index.ts
// Health-ISAC Japan メール取り込み Edge Function
// Google Apps Script or 手動転送からのJSON POSTを受け取り、hij_rawテーブルに保存

import { createClient } from "@supabase/supabase-js";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  createCorsPreflightResponse,
  getCorsOrigin,
} from "../_shared/http-utils.ts";
import { DISCORD_SAFE_MESSAGE_LIMIT, splitMessage } from "../_shared/utils.ts";

const log = createLogger("ingest-hij");

// 入力ペイロードの型定義
interface IngestPayload {
  message_id: string;
  sent_at: string;
  subject: string;
  body: string;
}

async function parseIngestPayload(req: Request): Promise<
  | { ok: true; body: IngestPayload }
  | { ok: false; status: number; error: string }
> {
  const rawBody = await req.text();
  if (!rawBody.trim()) {
    return { ok: false, status: 400, error: "Request body must be valid JSON" };
  }

  try {
    const parsed = JSON.parse(rawBody) as Partial<IngestPayload> | null;
    const body = parsed && typeof parsed === "object"
      ? {
        message_id: parsed.message_id ?? "",
        sent_at: parsed.sent_at ?? "",
        subject: parsed.subject ?? "",
        body: parsed.body ?? "",
      }
      : { message_id: "", sent_at: "", subject: "", body: "" };
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid JSON" };
  }
}

// TLP抽出関数
function extractTLP(text: string): string | null {
  // TLP:GREEN, TLP:AMBER, TLP:RED, TLP:CLEAR をマッチ
  const match = text.match(/TLP:\s*(GREEN|AMBER|RED|CLEAR)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

// APIキー検証用（簡易認証）
const INGEST_API_KEY = Deno.env.get("INGEST_HIJ_API_KEY");

// Discord 設定
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const SEC_BRIEF_CHANNEL_ID = Deno.env.get("SEC_BRIEF_CHANNEL_ID");

// 単一メール用システムプロンプト（generate-sec-brief の SYSTEM_PROMPT を簡略化）
const SINGLE_EMAIL_SYSTEM_PROMPT =
  `あなたは日本の医療機関向けサイバーセキュリティ顧問です。
入力として、1通のサイバーセキュリティニュースの本文テキストが与えられます。
これを医療機関の院長・事務長・IT担当が読めるブリーフに変換してください。

【絶対に出力してはいけない情報】
- 「Health-ISAC」「H-ISAC」などの情報共有組織の名称
- TLPコード（TLP:GREEN、TLP:AMBER等）
- 「情報共有コミュニティ」「ISAC」などの表現

【情報源の記載ルール】
以下の表現は禁止：× 「複数の報道」「各種報道」「セキュリティ研究者」「専門家」
必ず具体的な情報源を記載：○ 「Proofpoint (2024-11)」「CISA Alert AA24-242A」「CVE-2024-XXXXX」
入力テキストに具体的な情報源がなくても、あなたの知識から該当する実在の報告書・アラートを引用してください。

【出力フォーマット（Markdownテキストのみ）】

📋 **本ブリーフは、公開されているサイバーセキュリティ情報をもとに、医療機関向けに編集したものです。**

---

## タイトル（簡潔に）
📅 公開日: YYYY-MM-DD
📰 情報源: 具体名 (日付)

概要: 3〜5文（攻撃手法、標的、規模を含む）

影響: 診療所・中小病院への具体的影響

アクション:
- 【院長・事務長】具体的な行動
- 【IT担当】具体的な技術対応
- 【看護師長・部門長】現場への周知事項

【制約】
- 原文をコピーしない。自分の言葉でパラフレーズ
- Markdownテキストのみ出力（JSON不要）
- 最大2000文字以内`;

// Prompt Injection 対策: LLM に渡す前に危険パターンを除去
function sanitizeForPrompt(text: string): string {
  return text
    .replace(/---\s*(?:IGNORE|SYSTEM|OVERRIDE).*?---/gis, "")
    .replace(/ignore\s+(?:previous|above|all|prior)\s+instructions?/gi, "")
    .replace(/(?:you\s+are\s+now|new\s+role|act\s+as)\b/gi, "")
    .replace(/system\s*prompt/gi, "")
    .substring(0, 10_000);
}

// OpenAI GPT-4o-mini で単一メールの AI ブリーフを生成
async function generateBrief(
  subject: string,
  body: string,
): Promise<string | null> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    log.warn("OPENAI_API_KEY not set, skipping AI brief");
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SINGLE_EMAIL_SYSTEM_PROMPT },
          {
            role: "user",
            content: `件名: ${sanitizeForPrompt(subject)}\n\n${
              sanitizeForPrompt(body)
            }`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      log.error("OpenAI API error in generateBrief", { errorText });
      return null;
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    log.error("generateBrief failed", { errorMessage: String(err) });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Discord チャンネルにメッセージ送信（plain text、splitMessage 対応）
async function postBriefToDiscord(text: string): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN || !SEC_BRIEF_CHANNEL_ID) {
    log.info("Discord credentials not set, skipping notification");
    return false;
  }

  const chunks = splitMessage(text, DISCORD_SAFE_MESSAGE_LIMIT);

  for (const chunk of chunks) {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${SEC_BRIEF_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: chunk }),
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      log.error("Discord post failed", { errorText });
      return false;
    }
  }

  return true;
}

// TLP:AMBER/RED 用の制限付き Embed 送信
async function postRestrictedEmbed(
  subject: string,
  tlp: string,
): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN || !SEC_BRIEF_CHANNEL_ID) {
    return false;
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${SEC_BRIEF_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [{
          title: `🔒 制限付き情報を受信`,
          description:
            `件名: ${subject}\n\n⚠️ この情報は配布制限があるため、本文は表示されません。\n詳細は管理者にお問い合わせください。`,
          color: tlp === "RED" ? 0xff0000 : 0xffbf00,
        }],
      }),
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    log.error("Discord restricted embed failed", { errorText });
    return false;
  }

  return true;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORSプリフライト対応
  if (req.method === "OPTIONS") {
    return createCorsPreflightResponse(req);
  }

  // リクエストごとにCORSオリジンを取得
  const corsOrigin = getCorsOrigin(req.headers.get("Origin"));
  const responseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOrigin,
  };

  // POSTのみ許可
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: responseHeaders,
    });
  }

  // APIキー検証（設定されている場合のみ）
  if (INGEST_API_KEY) {
    const apiKey = req.headers.get("X-API-Key");
    if (apiKey !== INGEST_API_KEY) {
      log.warn("Invalid API key attempt");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: responseHeaders,
      });
    }
  }

  try {
    const parsedPayload = await parseIngestPayload(req);
    if (!parsedPayload.ok) {
      log.warn("Rejected ingest request", {
        method: req.method,
        status: parsedPayload.status,
        error: parsedPayload.error,
        contentType: req.headers.get("content-type"),
        contentLength: req.headers.get("content-length"),
      });
      return new Response(JSON.stringify({ error: parsedPayload.error }), {
        status: parsedPayload.status,
        headers: responseHeaders,
      });
    }

    const payload = parsedPayload.body;

    // 必須フィールドの検証
    if (!payload.message_id || !payload.sent_at || !payload.body) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          details: "message_id, sent_at, body are required",
        }),
        {
          status: 400,
          headers: responseHeaders,
        },
      );
    }

    // TLPを本文または件名から抽出
    const tlp = extractTLP(payload.body) || extractTLP(payload.subject || "");

    // Supabaseクライアント初期化
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // hij_rawテーブルに挿入
    const { data, error } = await supabase.from("hij_raw").insert({
      message_id: payload.message_id,
      sent_at: payload.sent_at,
      subject: payload.subject || null,
      tlp,
      raw_text: payload.body,
    }).select("id").single();

    if (error) {
      // 重複エラー（UNIQUE制約違反）の場合は200を返す（冪等性）
      if (error.code === "23505") {
        log.info("Duplicate message_id", { messageId: payload.message_id });
        return new Response(
          JSON.stringify({
            status: "duplicate",
            message: "Message already exists",
            message_id: payload.message_id,
          }),
          {
            status: 200,
            headers: responseHeaders,
          },
        );
      }

      log.error("DB Insert Error", { errorMessage: error.message });
      return new Response(
        JSON.stringify({ error: "Database Error", details: error.message }),
        {
          status: 500,
          headers: responseHeaders,
        },
      );
    }

    log.info("Ingested message", {
      messageId: payload.message_id,
      tlp: tlp || "none",
      recordId: data.id,
    });

    // --- Discord 通知フロー ---
    let aiBrief = false;

    if (tlp === "AMBER" || tlp === "RED") {
      // TLP:AMBER/RED → 制限付き Embed（本文非表示）
      await postRestrictedEmbed(payload.subject || "(件名なし)", tlp);
      log.info("Posted restricted embed", { tlp });
    } else {
      // TLP:GREEN/CLEAR/null → AI ブリーフ生成を試行
      const brief = await generateBrief(
        payload.subject || "(件名なし)",
        payload.body,
      );

      if (brief) {
        // AI ブリーフを plain markdown で投稿
        const posted = await postBriefToDiscord(brief);
        aiBrief = posted;
        log.info("AI brief result", { generated: true, posted });
      } else {
        // Fallback: 生テキストを Embed で投稿
        const truncatedBody = payload.body.length > 1500
          ? payload.body.substring(0, 1500) + "\n…_(truncated)_"
          : payload.body;

        await postBriefToDiscord(
          `📨 **${payload.subject || "(件名なし)"}**\n\n${truncatedBody}`,
        );
        log.info("Posted raw fallback embed");
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        id: data.id,
        message_id: payload.message_id,
        tlp,
        ai_brief: aiBrief,
      }),
      {
        status: 200,
        headers: responseHeaders,
      },
    );
  } catch (err) {
    log.error("Request processing error", {
      errorMessage: extractErrorMessage(err),
    });
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: String(err) }),
      {
        status: 500,
        headers: responseHeaders,
      },
    );
  }
});
