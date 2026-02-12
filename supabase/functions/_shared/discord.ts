/**
 * Discord API Adapter
 * Role付与/剥奪、招待生成などの共通処理
 * All endpoint URLs are sourced from DISCORD_ENDPOINTS (no inline URLs).
 *
 * @see discord-endpoints.ts for endpoint definitions
 * @see Plans.md Phase 5-4
 */

import { createLogger } from "./logger.ts";
import { extractErrorMessage } from "./error-utils.ts";
import { maskDiscordUserId } from "./masking-utils.ts";
import { DISCORD_ENDPOINTS } from "./discord-endpoints.ts";

const log = createLogger("discord");

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID") ?? "";
const DISCORD_ROLE_ID = Deno.env.get("DISCORD_ROLE_ID") ?? "";
const DISCORD_FREE_ROLE_ID = Deno.env.get("DISCORD_FREE_ROLE_ID") ?? "";
const DISCORD_INVITE_CHANNEL_ID = Deno.env.get("DISCORD_INVITE_CHANNEL_ID") ??
  "";

// Rate Limit リトライ設定
const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5000;

interface DiscordResult {
  success: boolean;
  error?: string;
}

/**
 * Rate Limit対応のfetchラッパー（タイムアウト付き）
 * 429エラー時はRetry-Afterを尊重して自動リトライ
 * @param url リクエストURL
 * @param options fetchオプション
 * @param retries リトライ回数
 * @param timeoutMs タイムアウト（ミリ秒）
 */
async function fetchWithRateLimit(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (response.status === 429 && retries > 0) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader
        ? parseFloat(retryAfterHeader) * 1000
        : DEFAULT_RETRY_DELAY_MS;

      log.warn("Discord rate limited, retrying", {
        retryAfterMs,
        retriesLeft: retries - 1,
      });

      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      return fetchWithRateLimit(url, options, retries - 1, timeoutMs);
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Discord招待リンクを生成
 * @param maxAge 有効期限（秒）デフォルト2週間
 * @param maxUses 使用回数制限 デフォルト1回
 */
export async function createDiscordInvite(
  maxAge: number = 1209600,
  maxUses: number = 1,
): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_INVITE_CHANNEL_ID) {
    log.warn(
      "Discord credentials not configured (BOT_TOKEN or INVITE_CHANNEL_ID missing)",
    );
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetchWithRateLimit(
      DISCORD_ENDPOINTS.channelInvite.build(DISCORD_INVITE_CHANNEL_ID),
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_age: maxAge,
          max_uses: maxUses,
          unique: true,
        }),
      },
    );

    if (!response.ok) {
      log.error("Failed to create Discord invite", {
        status: response.status,
      });
      return { success: false, error: `API error: ${response.status}` };
    }

    const invite = await response.json();
    const inviteUrl = `https://discord.gg/${invite.code}`;
    log.info("Discord invite created", {
      inviteCodePrefix: invite.code.slice(0, 4) + "***",
    });
    return { success: true, inviteUrl };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Discord invite creation error", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Discord Roleを付与
 */
export async function addDiscordRole(
  discordUserId: string,
  roleId?: string,
): Promise<DiscordResult> {
  const targetRoleId = roleId ?? DISCORD_ROLE_ID;

  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !targetRoleId) {
    log.warn("Discord credentials not configured for role assignment");
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetchWithRateLimit(
      DISCORD_ENDPOINTS.memberRole.build(
        DISCORD_GUILD_ID,
        discordUserId,
        targetRoleId,
      ),
      {
        method: DISCORD_ENDPOINTS.memberRole.method,
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      },
    );

    if (!response.ok) {
      log.error("Failed to add Discord role", {
        status: response.status,
        discordUserId: maskDiscordUserId(discordUserId),
      });
      return { success: false, error: `API error: ${response.status}` };
    }

    log.info("Discord role added", {
      discordUserId: maskDiscordUserId(discordUserId),
      roleId: targetRoleId,
    });
    return { success: true };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Discord role add error", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Discord Roleを剥奪
 */
export async function removeDiscordRole(
  discordUserId: string,
  roleId?: string,
): Promise<DiscordResult> {
  const targetRoleId = roleId ?? DISCORD_ROLE_ID;

  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !targetRoleId) {
    log.warn("Discord credentials not configured for role removal");
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetchWithRateLimit(
      DISCORD_ENDPOINTS.memberRoleRemove.build(
        DISCORD_GUILD_ID,
        discordUserId,
        targetRoleId,
      ),
      {
        method: DISCORD_ENDPOINTS.memberRoleRemove.method,
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      },
    );

    // 404 = ユーザーがサーバーにいない or ロールを持っていない → 成功扱い
    if (response.status === 404) {
      log.info("Discord role not found (already removed or user left)", {
        discordUserId: maskDiscordUserId(discordUserId),
      });
      return { success: true };
    }

    if (!response.ok) {
      log.error("Failed to remove Discord role", {
        status: response.status,
        discordUserId: maskDiscordUserId(discordUserId),
      });
      return { success: false, error: `API error: ${response.status}` };
    }

    log.info("Discord role removed", {
      discordUserId: maskDiscordUserId(discordUserId),
      roleId: targetRoleId,
    });
    return { success: true };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Discord role remove error", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Discord DMを送信
 */
export async function sendDiscordDM(
  discordUserId: string,
  message: string,
): Promise<DiscordResult> {
  if (!DISCORD_BOT_TOKEN) {
    log.warn("Discord bot token not configured");
    return { success: false, error: "Discord bot token not configured" };
  }

  try {
    // まずDMチャンネルを作成
    const channelResponse = await fetchWithRateLimit(
      DISCORD_ENDPOINTS.dmChannel.build(),
      {
        method: DISCORD_ENDPOINTS.dmChannel.method,
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient_id: discordUserId,
        }),
      },
    );

    if (!channelResponse.ok) {
      log.error("Failed to create DM channel", {
        status: channelResponse.status,
      });
      return { success: false, error: `Cannot create DM channel` };
    }

    const channel = await channelResponse.json();

    // DMを送信
    const messageResponse = await fetchWithRateLimit(
      DISCORD_ENDPOINTS.channelMessage.build(channel.id),
      {
        method: DISCORD_ENDPOINTS.channelMessage.method,
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: message }),
      },
    );

    if (!messageResponse.ok) {
      log.error("Failed to send DM", {
        status: messageResponse.status,
      });
      return { success: false, error: `Cannot send DM` };
    }

    log.info("Discord DM sent", {
      discordUserId: maskDiscordUserId(discordUserId),
    });
    return { success: true };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Discord DM error", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Discord Roleを入れ替え（旧ロール削除 + 新ロール付与）
 * いずれかが失敗しても、もう一方は試行する
 */
export async function swapDiscordRole(
  discordUserId: string,
  oldRoleId: string,
  newRoleId: string,
): Promise<DiscordResult> {
  const removeResult = await removeDiscordRole(discordUserId, oldRoleId);
  const addResult = await addDiscordRole(discordUserId, newRoleId);

  if (!removeResult.success && !addResult.success) {
    return {
      success: false,
      error: `Remove: ${removeResult.error}, Add: ${addResult.error}`,
    };
  }

  if (!addResult.success) {
    return { success: false, error: `Add failed: ${addResult.error}` };
  }

  return { success: true };
}

/**
 * Free Role IDを取得するヘルパー
 */
export function getDiscordFreeRoleId(): string {
  return DISCORD_FREE_ROLE_ID;
}

/**
 * Paid Role IDを取得するヘルパー
 */
export function getDiscordPaidRoleId(): string {
  return DISCORD_ROLE_ID;
}
