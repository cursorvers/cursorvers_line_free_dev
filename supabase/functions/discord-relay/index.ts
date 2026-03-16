import { parseRequiredJsonBody } from "../_shared/http-utils.ts";

/**
 * Discord Relay Function
 * n8n からの投稿を正しいチャンネルにルーティング
 *
 * エンドポイント:
 * - POST /x-posts: X投稿 → #ownerのつぶやき
 * - POST /cybersecurity: サイバーセキュリティ → #サイバーセキュリティレポート
 * - POST /line-event: LINEイベント → #system-monitor（Bot API）
 * - POST /line-alerts: LINE送信エラー → #system-monitor（Bot API、content自動整形）
 * - GET  /admin/messages: チャンネルの最新メッセージ一覧
 * - POST /admin/purge: Bot投稿の一括削除
 */

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const ADMIN_SECRET = Deno.env.get("DISCORD_ADMIN_SECRET") ?? "";
const RELAY_API_KEY = Deno.env.get("DISCORD_RELAY_API_KEY") ?? "";

const DISCORD_CONTENT_MAX = 1900; // Discord limit 2000 - margin for truncation suffix

/**
 * 重複投稿防止: Discord チャンネルの直近メッセージと照合
 * - 直近 DEDUP_CHECK_LIMIT 件のメッセージを取得
 * - 同一コンテンツがあれば重複として拒否
 * - ステートレス（毎回 Discord API で確認）
 */
const DEDUP_CHECK_LIMIT = 10;

async function computeHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 32);
}

async function isDuplicateInChannel(
  channelId: string,
  content: string,
): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN) return false;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=${DEDUP_CHECK_LIMIT}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    );
    if (!res.ok) return false;

    const messages = (await res.json()) as Array<{
      content: string;
      timestamp: string;
    }>;

    const contentHash = await computeHash(content);
    for (const msg of messages) {
      if (!msg.content) continue;
      const msgHash = await computeHash(msg.content);
      if (msgHash === contentHash) return true;
    }
  } catch {
    // API 失敗時は重複チェックをスキップ（投稿を優先）
  }
  return false;
}

// Discord Markdown Injection 対策: @everyone メンション・偽リンクを無効化
function sanitizeDiscordContent(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@ $1")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match: string, label: string, url: string) => {
        try {
          const parsed = new URL(url);
          if (!["http:", "https:"].includes(parsed.protocol)) return label;
          return `[${label}](<${url}>)`; // suppress preview
        } catch {
          return label;
        }
      },
    );
}

/**
 * LINE アラート content のクリーンアップ
 * - URL エンコードされた JSON をデコード
 * - Flex Message JSON ダンプを要約に置換
 * - 長すぎるメッセージを truncate + Discord sanitize
 */
function cleanLineAlertContent(raw: string): string {
  let content = raw;

  // URL エンコード検出 → デコード
  if (content.includes("%7B") || content.includes("%22")) {
    try {
      content = decodeURIComponent(content);
    } catch {
      // デコード失敗時はそのまま続行
    }
  }

  // Flex Message JSON ダンプを除去し、エラー要約のみ残す
  // ReDoS 安全: 単純なキーワード検索 + indexOf で判定
  const hasFlexType = /"type"\s*:\s*"(?:flex|bubble|carousel)"/i.test(content);
  if (hasFlexType || content.includes('"flexMessage"')) {
    const jsonStart = content.search(/\{\s*"(?:type|flexMessage|altText)"/);
    if (jsonStart > 0) {
      content = content.substring(0, jsonStart).trim() +
        "\n_(Flex Message JSON は省略)_";
    } else if (jsonStart === 0) {
      content = "_(LINE Flex Message 送信エラー — JSON 省略)_";
    }
  }

  // truncate
  if (content.length > DISCORD_CONTENT_MAX) {
    content = content.substring(0, DISCORD_CONTENT_MAX) + "\n…_(truncated)_";
  }

  return sanitizeDiscordContent(content);
}

/**
 * サイバーセキュリティ content の検証・整形
 * - 空コンテンツ拒否
 * - JSON ダンプの除去
 * - 長すぎるメッセージの truncate
 */
function validateCybersecurityContent(
  content?: string,
  subject?: string,
  snippet?: string,
): { valid: boolean; message?: string; error?: string } {
  // content も subject もなければ拒否
  if (!content && !subject) {
    return { valid: false, error: "content or subject is required" };
  }

  let message: string;

  if (content) {
    message = String(content).trim();
  } else {
    message = `🔐 **${subject}**\n`;
    if (snippet) {
      message += `\n${String(snippet).trim()}`;
    }
  }

  // 空文字チェック
  if (message.length === 0) {
    return { valid: false, error: "empty content" };
  }

  // JSON ダンプの検出・除去（生のJSONが投稿されるのを防ぐ）
  if (message.startsWith("{") || message.startsWith("[")) {
    try {
      JSON.parse(message);
      return { valid: false, error: "raw JSON payload rejected" };
    } catch {
      // JSON ではない → OK
    }
  }

  // truncate
  if (message.length > DISCORD_CONTENT_MAX) {
    message = message.substring(0, DISCORD_CONTENT_MAX) +
      "\n…_(truncated)_";
  }

  return { valid: true, message };
}

/**
 * Admin エンドポイントの認証チェック
 */
function verifyAdminAuth(req: Request): boolean {
  const authHeader = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET) return false;
  return authHeader === ADMIN_SECRET;
}

/**
 * チャンネルの最新メッセージを取得
 */
async function listChannelMessages(
  channelId: string,
  limit = 50,
): Promise<Response> {
  if (!DISCORD_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing bot token" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`,
    {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    },
  );

  const data = await res.json();
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // メッセージを要約形式で返す
  const messages = (data as Array<{
    id: string;
    content: string;
    author: { id: string; username: string; bot?: boolean };
    timestamp: string;
    embeds?: unknown[];
    webhook_id?: string;
  }>).map((msg) => ({
    id: msg.id,
    content: msg.content?.substring(0, 200),
    webhook_id: msg.webhook_id,
    author: msg.author.username,
    is_bot: msg.author.bot ?? false,
    timestamp: msg.timestamp,
    has_embeds: (msg.embeds?.length ?? 0) > 0,
  }));

  return new Response(JSON.stringify({ count: messages.length, messages }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Discord Snowflake ID から作成日時を抽出
 */
function snowflakeToDate(id: string): Date {
  const DISCORD_EPOCH = 1420070400000n;
  const snowflake = BigInt(id);
  const timestamp = Number((snowflake >> 22n) + DISCORD_EPOCH);
  return new Date(timestamp);
}

/**
 * メッセージの一括削除（個別削除 + Bulk Delete 自動切替）
 * - 14日以内: Bulk Delete API（2件以上）
 * - 14日超: 個別削除 API（rate limit 対応）
 */
async function purgeMessages(
  channelId: string,
  messageIds: string[],
): Promise<Response> {
  if (!DISCORD_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing bot token" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (messageIds.length === 0) {
    return new Response(JSON.stringify({ error: "No message IDs provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 14日境界で分類（Bulk Delete API は14日以内のみ対応）
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recent: string[] = [];
  const old: string[] = [];
  for (const id of messageIds) {
    const created = snowflakeToDate(id);
    if (created.getTime() > fourteenDaysAgo) {
      recent.push(id);
    } else {
      old.push(id);
    }
  }

  const results: { deleted: string[]; failed: string[]; errors: string[] } = {
    deleted: [],
    failed: [],
    errors: [],
  };

  // 14日以内: Bulk Delete（2件以上）または個別削除（1件）
  if (recent.length >= 2) {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/bulk-delete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: recent }),
      },
    );
    if (res.ok || res.status === 204) {
      results.deleted.push(...recent);
    } else {
      const error = await res.json();
      results.errors.push(`bulk-delete: ${JSON.stringify(error)}`);
      // fallback: 個別削除を試行
      old.push(...recent);
      recent.length = 0;
    }
  } else if (recent.length === 1) {
    old.push(...recent);
    recent.length = 0;
  }

  // 14日超 + fallback: 個別削除（rate limit 対応: 500ms 間隔）
  for (const id of old) {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      },
    );
    if (res.ok || res.status === 204) {
      results.deleted.push(id);
    } else {
      let errMsg = `status ${res.status}`;
      try {
        const error = await res.json();
        errMsg = JSON.stringify(error);
      } catch {
        // ignore parse error
      }
      results.failed.push(id);
      results.errors.push(`${id}: ${errMsg}`);
    }
    // rate limit 対策
    if (old.indexOf(id) < old.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const success = results.deleted.length > 0;
  return new Response(
    JSON.stringify({
      success,
      deleted: results.deleted.length,
      failed: results.failed.length,
      details: results,
    }),
    {
      status: success ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// チャンネルID (Bot API用)
const CHANNELS = {
  OWNER_TWEETS: "1444566050711801957", // ☎-ownerのつぶやき
  CYBERSECURITY: "1443611660894998748", // 📘-サイバーセキュリティレポート
  SYSTEM_MONITOR: "1443582135322804285", // 🖥-system-monitor
};

async function sendToChannel(
  channelId: string,
  content?: string,
  embeds?: unknown[],
): Promise<Response> {
  if (!DISCORD_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing bot token" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, embeds }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message_id: data.id,
      channel_id: data.channel_id,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

async function parseRelayBody<T>(req: Request): Promise<
  | { ok: true; body: T }
  | { ok: false; response: Response }
> {
  const parsed = await parseRequiredJsonBody<T>(req);
  if (!parsed.ok) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: parsed.error }), {
        status: parsed.status,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return parsed;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // API Key 認証（/admin/* と /health 以外の POST エンドポイント）
  const isPublicPost = req.method === "POST" &&
    !url.pathname.includes("/admin/");
  if (isPublicPost && RELAY_API_KEY) {
    const apiKey = req.headers.get("X-API-Key");
    if (apiKey !== RELAY_API_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // POST /x-posts: X投稿 → #ownerのつぶやき
  if (url.pathname.endsWith("/x-posts")) {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedBody = await parseRelayBody<{
      content?: string;
      embeds?: unknown[];
      text?: string;
      url?: string;
      author?: string;
    }>(req);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.body;
    const { content, embeds, text, url: postUrl, author } = body;

    // n8n からのフォーマットに対応
    let message = content;
    if (!message && text) {
      message = `📱 **${author || "X投稿"}**\n${text}`;
      if (postUrl) {
        message += `\n🔗 ${postUrl}`;
      }
    }

    return await sendToChannel(CHANNELS.OWNER_TWEETS, message, embeds);
  }

  // POST /cybersecurity: サイバーセキュリティ → #サイバーセキュリティレポート
  if (url.pathname.endsWith("/cybersecurity")) {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedBody = await parseRelayBody<{
      content?: string;
      embeds?: unknown[];
      subject?: string;
      snippet?: string;
      from?: string;
    }>(req);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.body;
    const { content, embeds, subject, snippet, from } = body;

    // コンテンツ検証（空、生JSON等を拒否）
    const validation = validateCybersecurityContent(content, subject, snippet);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error, rejected: true }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Gmail フォーマット: from を付与
    let message = validation.message!;
    if (!content && subject && from) {
      message = `🔐 **${subject}**\n📧 From: ${from}\n`;
      if (snippet) {
        message += `\n${String(snippet).trim()}`;
      }
    }

    // 重複投稿チェック（直近メッセージと照合）
    if (await isDuplicateInChannel(CHANNELS.CYBERSECURITY, message)) {
      return new Response(
        JSON.stringify({
          rejected: true,
          error: "duplicate content found in recent channel messages",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    return await sendToChannel(CHANNELS.CYBERSECURITY, message, embeds);
  }

  // POST /line-event: LINE イベント → #system-monitor (Bot API)
  if (url.pathname.endsWith("/line-event")) {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedBody = await parseRelayBody<{
      content?: string;
      embeds?: unknown[];
    }>(req);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.body;
    const { content, embeds } = body;

    const sanitized = content
      ? sanitizeDiscordContent(String(content))
      : undefined;

    return await sendToChannel(CHANNELS.SYSTEM_MONITOR, sanitized, embeds);
  }

  // POST /line-alerts: LINE 送信エラー → #system-monitor (Bot API)
  if (url.pathname.endsWith("/line-alerts")) {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedBody = await parseRelayBody<{
      content?: string;
      embeds?: unknown[];
    }>(req);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.body;
    const { content, embeds } = body;

    // content のクリーンアップ（URL デコード + Flex JSON 除去 + truncate）
    const cleaned = content
      ? cleanLineAlertContent(String(content))
      : undefined;

    return await sendToChannel(CHANNELS.SYSTEM_MONITOR, cleaned, embeds);
  }

  // GET /admin/messages: チャンネルのメッセージ一覧（admin認証必須）
  if (url.pathname.endsWith("/admin/messages")) {
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!verifyAdminAuth(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const channelId = url.searchParams.get("channel") ||
      CHANNELS.CYBERSECURITY;
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50"),
      100,
    );

    return await listChannelMessages(channelId, limit);
  }

  // POST /admin/purge: メッセージ一括削除（admin認証必須）
  if (url.pathname.endsWith("/admin/purge")) {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!verifyAdminAuth(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedBody = await parseRelayBody<{
      channel_id?: string;
      message_ids?: string[];
    }>(req);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.body;
    const { channel_id, message_ids } = body;

    if (
      !Array.isArray(message_ids) || message_ids.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "message_ids array required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 100件制限（Discord API制約）
    if (message_ids.length > 100) {
      return new Response(
        JSON.stringify({ error: "Maximum 100 messages per request" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return await purgeMessages(
      channel_id || CHANNELS.CYBERSECURITY,
      message_ids,
    );
  }

  // ヘルスチェック
  if (url.pathname.endsWith("/health")) {
    return new Response(
      JSON.stringify({
        status: "ok",
        channels: CHANNELS,
        endpoints: [
          "/x-posts",
          "/cybersecurity",
          "/line-event",
          "/line-alerts",
          "/admin/messages",
          "/admin/purge",
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      error: "Not found",
      available_endpoints: [
        "/x-posts",
        "/cybersecurity",
        "/line-event",
        "/line-alerts",
        "/admin/messages",
        "/admin/purge",
        "/health",
      ],
    }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
});
