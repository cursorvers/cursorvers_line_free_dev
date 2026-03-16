// supabase/functions/discord-bot/index.ts
// Discord Bot Edge Function
// - /join: Library Member認証
// - /sec-brief-latest: 最新ドラフトのプレビュー
// - /sec-brief-publish: ドラフトを#sec-briefに公開

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import nacl from "tweetnacl";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { createLogger } from "../_shared/logger.ts";
import { maskEmail, maskId } from "../_shared/masking-utils.ts";
import { EMAIL_REGEX } from "../_shared/validation-utils.ts";
import {
  DISCORD_SAFE_MESSAGE_LIMIT,
  hexToUint8Array,
  splitMessage,
} from "../_shared/utils.ts";

const log = createLogger("discord-bot");

// --- 定数 ---
const DISCORD_API_TIMEOUT = 2000; // Discord API タイムアウト (ms)
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_SECONDS: 60,
  ACTION: "discord_join",
} as const;

// 環境変数（起動時に検証）
const DISCORD_PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "";
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_ROLE_ID = Deno.env.get("DISCORD_ROLE_ID") ?? "";
const DISCORD_FREE_ROLE_ID = Deno.env.get("DISCORD_FREE_ROLE_ID") ?? "";
const SEC_BRIEF_CHANNEL_ID = Deno.env.get("SEC_BRIEF_CHANNEL_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Discord Interaction型定義
interface DiscordInteraction {
  type: number;
  data?: {
    name: string;
    options?: Array<{ name: string; value: string }>;
  };
  member?: {
    user: { id: string };
    roles: string[];
  };
  guild_id?: string;
  channel_id?: string;
}

Deno.serve(async (req) => {
  // 0. 環境変数の検証
  if (
    !DISCORD_PUBLIC_KEY || !DISCORD_BOT_TOKEN || !supabase || !DISCORD_ROLE_ID
  ) {
    log.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // 1. Discordからの署名を検証 (必須)
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  const body = await req.text();

  if (
    !signature || !timestamp || !verifySignature(signature, timestamp, body)
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  const interaction: DiscordInteraction = JSON.parse(body);

  // 2. Ping応答 (Discordとの接続確認用)
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. コマンドルーティング
  if (interaction.type === 2) {
    const commandName = interaction.data?.name;

    switch (commandName) {
      case "join":
        return handleJoin(interaction, supabase);
      case "sec-brief-latest":
        return handleSecBriefLatest(supabase);
      case "sec-brief-publish":
        return handleSecBriefPublish(interaction, supabase);
      default:
        return new Response("Unknown command", { status: 400 });
    }
  }

  return new Response("Unknown interaction type", { status: 400 });
});

// ============================================
// /join コマンドハンドラ
// ============================================
async function handleJoin(
  interaction: DiscordInteraction,
  supabase: SupabaseClient,
): Promise<Response> {
  const rawEmail = interaction.data?.options?.find((o) => o.name === "email")
    ?.value;
  const email = typeof rawEmail === "string"
    ? rawEmail.trim().toLowerCase()
    : typeof rawEmail === "number"
    ? String(rawEmail).trim().toLowerCase()
    : "";
  const userId = interaction.member?.user.id;
  const guildId = interaction.guild_id;

  if (!userId || !guildId) {
    return jsonResponse({
      type: 4,
      data: {
        content:
          "⛔ **エラー**: リクエスト情報が不足しています。もう一度お試しください。",
        flags: 64,
      },
    });
  }

  // guild_id 検証: 正規サーバーからのリクエストのみ受け付け
  const expectedGuildId = Deno.env.get("DISCORD_GUILD_ID") ?? "";
  if (expectedGuildId && guildId !== expectedGuildId) {
    log.warn("Invalid guild_id in /join command", {
      guildId,
      expectedGuildId,
    });
    return jsonResponse({
      type: 4,
      data: {
        content: "⛔ **エラー**: このサーバーではコマンドを使用できません。",
        flags: 64,
      },
    });
  }

  const isAllowed = await checkRateLimit(supabase, userId);
  if (!isAllowed) {
    return jsonResponse({
      type: 4,
      data: {
        content: "⚠️ 試行回数が上限に達しました。1分後に再度お試しください。",
        flags: 64,
      },
    });
  }

  if (!email) {
    return jsonResponse({
      type: 4,
      data: {
        content:
          "⛔ **エラー**: メールアドレスを入力してください。\n使い方: `/join email:your@email.com`",
        flags: 64,
      },
    });
  }

  if (!EMAIL_REGEX.test(email)) {
    return jsonResponse({
      type: 4,
      data: {
        content:
          `⛔ **エラー**: メールアドレスの形式が正しくありません。\n例: yourname@example.com`,
        flags: 64,
      },
    });
  }

  // メールアドレスで検索（members テーブル。全tier対象で検索し、コード側で分岐）
  const { data: member, error } = await supabase
    .from("members")
    .select(
      "id,email,discord_user_id,tier,status,stripe_customer_id,stripe_subscription_id",
    )
    .eq("email", email)
    .maybeSingle();

  if (error || !member) {
    await recordAttempt(supabase, userId, false, {
      email: maskEmail(email) ?? "***",
    });
    return jsonResponse({
      type: 4,
      data: {
        content:
          `⛔ **エラー**: そのメールアドレス (${email}) が見つかりません。\nLINEで友だち追加してメールアドレスを登録してください。\n既に登録済みの方は、登録時のメールアドレスを正確に入力してください。`,
        flags: 64,
      },
    });
  }

  // /join は有料プラン（library/master）専用
  const paidTiers = ["library", "master"];
  const isPaid = paidTiers.includes(member.tier ?? "");

  if (!isPaid) {
    await recordAttempt(supabase, userId, false, {
      email: maskEmail(email) ?? "***",
    });
    return jsonResponse({
      type: 4,
      data: {
        content:
          "ℹ️ このコマンドは有料プラン会員専用です。\n無料メンバーの方は、Discordに参加するだけで無料特典チャンネルにアクセスできます。\n\n💎 有料プランへのアップグレードはこちら:\nhttps://cursorvers.com/services",
        flags: 64,
      },
    });
  }

  // 有料会員だがサブスクが無効な場合
  if (member.status !== "active") {
    await recordAttempt(supabase, userId, false, {
      email: maskEmail(email) ?? "***",
    });
    return jsonResponse({
      type: 4,
      data: {
        content:
          "⛔ **エラー**: サブスクリプションが無効です。\n有効なサブスクリプションが必要です。再度お申込みいただくか、管理者にお問い合わせください。",
        flags: 64,
      },
    });
  }

  if (member.discord_user_id && member.discord_user_id !== userId) {
    return jsonResponse({
      type: 4,
      data: {
        content:
          "⛔ **エラー**: このメールアドレスは既に別のDiscordアカウントに紐づいています。心当たりがない場合は管理者に連絡してください。",
        flags: 64,
      },
    });
  }

  // Paidロール付与 (Discord API) with timeout + rate-limit handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCORD_API_TIMEOUT);

  try {
    const roleRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${DISCORD_ROLE_ID}`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
        signal: controller.signal,
      },
    );

    if (roleRes.status === 429) {
      const retryAfter = roleRes.headers.get("Retry-After");
      return jsonResponse({
        type: 4,
        data: {
          content: `⚠️ Discordのレート制限中です。${
            retryAfter ? `${retryAfter}秒後` : "しばらくして"
          }再度お試しください。`,
          flags: 64,
        },
      });
    }

    if (!roleRes.ok) {
      const errorText = await roleRes.text();
      log.error("Role assignment failed", { errorText });
      return jsonResponse({
        type: 4,
        data: {
          content: "⚠️ ロールの付与に失敗しました。管理者に連絡してください。",
          flags: 64,
        },
      });
    }
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    log.error("Role assignment request failed", {
      isTimeout,
      errorMessage: extractErrorMessage(err),
    });
    return jsonResponse({
      type: 4,
      data: {
        content: isTimeout
          ? "⚠️ タイムアウトしました。少し待ってから再度お試しください。"
          : "⚠️ ロール付与リクエストでエラーが発生しました。再度お試しください。",
        flags: 64,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  // Freeロールを削除（昇格処理）
  if (DISCORD_FREE_ROLE_ID) {
    try {
      await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${DISCORD_FREE_ROLE_ID}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
        },
      );
    } catch (err) {
      // Freeロール削除失敗は致命的ではない
      log.warn("Failed to remove free role during upgrade", {
        errorMessage: extractErrorMessage(err),
      });
    }
  }

  // DB更新 (Discord IDを紐付け)
  const { error: updateError } = await supabase
    .from("members")
    .update({ discord_user_id: userId })
    .eq("id", member.id);

  if (updateError) {
    log.error("DB update error (discord_user_id)", {
      errorMessage: updateError.message,
    });
    return jsonResponse({
      type: 4,
      data: {
        content:
          "⚠️ ロールは付与されましたが、アカウント紐付けの保存に失敗しました。管理者に連絡してください。",
        flags: 64,
      },
    });
  }

  await recordAttempt(supabase, userId, true, {
    email: maskEmail(email) ?? "***",
  });

  // ウェルカムメッセージをチャンネルに公開投稿
  const channelId = interaction.channel_id;
  const tierLabel = member.tier === "master"
    ? "Master Class"
    : "Library Member";

  if (channelId) {
    try {
      await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content:
              `🎉 <@${userId}>さん、**Cursorvers ${tierLabel}**へようこそ！`,
          }),
        },
      );
    } catch (err) {
      // ウェルカムメッセージ送信失敗はログのみ（認証自体は成功）
      log.warn("Failed to send welcome message", {
        errorMessage: extractErrorMessage(err),
      });
    }
  }

  return jsonResponse({
    type: 4,
    data: {
      content:
        `🎉 **認証成功！**\n${tierLabel}の権限を付与しました。\n左側のメニューに限定チャンネルが表示されているか確認してください。`,
      flags: 64,
    },
  });
}

async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
): Promise<boolean> {
  try {
    const windowStart = new Date(
      Date.now() - RATE_LIMIT.WINDOW_SECONDS * 1000,
    ).toISOString();

    const { count, error } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("identifier", identifier)
      .eq("action", RATE_LIMIT.ACTION)
      .gte("attempted_at", windowStart);

    if (error) {
      log.warn("Rate limit check failed, allowing request", {
        errorMessage: error.message,
      });
      return true;
    }

    const attempts = count ?? 0;
    if (attempts >= RATE_LIMIT.MAX_ATTEMPTS) {
      log.warn("Rate limit exceeded", {
        identifier: maskId(identifier),
        attempts,
        limit: RATE_LIMIT.MAX_ATTEMPTS,
      });
      return false;
    }

    return true;
  } catch (err) {
    log.warn("Rate limit check exception, allowing request", {
      errorMessage: extractErrorMessage(err),
    });
    return true;
  }
}

async function recordAttempt(
  supabase: SupabaseClient,
  identifier: string,
  success: boolean,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("rate_limits").insert({
      identifier,
      action: RATE_LIMIT.ACTION,
      success,
      metadata,
    });
  } catch (err) {
    log.warn("Failed to record rate limit attempt", {
      errorMessage: extractErrorMessage(err),
    });
  }
}

// ============================================
// /sec-brief-latest コマンドハンドラ
// 最新のドラフトをephemeralでプレビュー
// ============================================
async function handleSecBriefLatest(
  supabase: SupabaseClient,
): Promise<Response> {
  const { data, error } = await supabase
    .from("sec_brief")
    .select("id,title,body_markdown")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.error("DB Error in handleSecBriefLatest", {
      errorMessage: error.message,
    });
    return jsonResponse({
      type: 4,
      data: {
        content: "⚠️ データベースエラーが発生しました。",
        flags: 64,
      },
    });
  }

  if (!data) {
    return jsonResponse({
      type: 4,
      data: {
        content: "📭 公開待ちのドラフトがありません。",
        flags: 64,
      },
    });
  }

  // Discordメッセージは2000文字制限があるため、長い場合は切り詰める
  let content = data.body_markdown;
  if (content.length > DISCORD_SAFE_MESSAGE_LIMIT) {
    content = content.substring(0, DISCORD_SAFE_MESSAGE_LIMIT) +
      "\n\n... (続きあり)";
  }

  return jsonResponse({
    type: 4,
    data: {
      content: `📋 **ドラフト・プレビュー**\n\n${content}`,
      flags: 64, // ephemeral: 自分にだけ見えるメッセージ
    },
  });
}

// ============================================
// /sec-brief-publish コマンドハンドラ
// ドラフトを#sec-briefに公開してstatusをpublishedに変更
// ============================================
async function handleSecBriefPublish(
  interaction: DiscordInteraction,
  supabase: SupabaseClient,
): Promise<Response> {
  // 管理者ロールチェック
  const adminRoleId = Deno.env.get("DISCORD_ADMIN_ROLE_ID") ?? "";
  const memberRoles = interaction.member?.roles ?? [];
  if (adminRoleId && !memberRoles.includes(adminRoleId)) {
    return jsonResponse({
      type: 4,
      data: {
        content: "⛔ **エラー**: このコマンドは管理者のみが実行できます。",
        flags: 64,
      },
    });
  }

  // 最新のドラフトを取得
  const { data, error } = await supabase
    .from("sec_brief")
    .select("id,title,body_markdown")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.error("DB Error in handleSecBriefPublish", {
      errorMessage: error.message,
    });
    return jsonResponse({
      type: 4,
      data: {
        content: "⚠️ データベースエラーが発生しました。",
        flags: 64,
      },
    });
  }

  if (!data) {
    return jsonResponse({
      type: 4,
      data: {
        content: "📭 公開できるドラフトがありません。",
        flags: 64,
      },
    });
  }

  // #sec-briefチャンネルIDの確認
  const channelId = SEC_BRIEF_CHANNEL_ID;
  if (!channelId) {
    log.error("SEC_BRIEF_CHANNEL_ID not set");
    return jsonResponse({
      type: 4,
      data: {
        content:
          "⚠️ `SEC_BRIEF_CHANNEL_ID` が設定されていません。管理者に連絡してください。",
        flags: 64,
      },
    });
  }

  // Discordの#sec-briefチャンネルにメッセージを投稿
  // 2000文字制限を考慮して分割投稿
  const bodyMarkdown = data.body_markdown;
  const chunks = splitMessage(bodyMarkdown, DISCORD_SAFE_MESSAGE_LIMIT);

  for (let i = 0; i < chunks.length; i++) {
    const sendRes = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: chunks[i] }),
      },
    );

    if (!sendRes.ok) {
      const errorText = await sendRes.text();
      log.error("Failed to send message to #sec-brief", { errorText });
      return jsonResponse({
        type: 4,
        data: {
          content: `⚠️ #sec-brief への投稿に失敗しました: ${errorText}`,
          flags: 64,
        },
      });
    }
  }

  // ステータスをpublishedに更新
  const { error: updateError } = await supabase
    .from("sec_brief")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  if (updateError) {
    log.error("DB Update Error in handleSecBriefPublish", {
      errorMessage: updateError.message,
    });
    // メッセージは投稿済みなので警告のみ
    return jsonResponse({
      type: 4,
      data: {
        content:
          "✅ #sec-brief に投稿しましたが、ステータス更新に失敗しました。手動で確認してください。",
        flags: 64,
      },
    });
  }

  log.info("Published sec_brief", { briefId: data.id, title: data.title });

  return jsonResponse({
    type: 4,
    data: {
      content:
        `✅ **公開完了！**\n\n「${data.title}」を #sec-brief に投稿しました。`,
      flags: 64,
    },
  });
}

// ============================================
// ユーティリティ関数
// ============================================

// レスポンス生成
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

// 署名検証
function verifySignature(
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + body),
      hexToUint8Array(signature),
      hexToUint8Array(DISCORD_PUBLIC_KEY),
    );
  } catch {
    return false;
  }
}

// hexToUint8Array と splitMessage は _shared/utils.ts からインポート
