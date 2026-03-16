/**
 * Discord API ユーティリティ
 * Role付与/剥奪、招待生成などの共通処理
 */

import { createLogger } from "./logger.ts";
import { extractErrorMessage } from "./error-utils.ts";
import { maskDiscordUserId } from "./masking-utils.ts";

const log = createLogger("discord");

const DEFAULT_CLIENT_ROOM_CATEGORY_ID = "1463892771608723518";
const DEFAULT_ADMIN_BOT_ID = "1447704583374639165";

// Rate Limit リトライ設定
const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5000;

interface DiscordResult {
  success: boolean;
  error?: string;
}

interface DiscordConfig {
  botToken: string;
  guildId: string;
  roleId: string;
  clientRoomCategoryId: string;
  adminBotId: string;
}

interface DiscordChannelOverwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

interface DiscordGuildChannel {
  id: string;
  parent_id?: string | null;
  permission_overwrites?: DiscordChannelOverwrite[];
}

function getDiscordConfig(): DiscordConfig {
  return {
    botToken: Deno.env.get("DISCORD_BOT_TOKEN") ?? "",
    guildId: Deno.env.get("DISCORD_GUILD_ID") ?? "",
    roleId: Deno.env.get("DISCORD_ROLE_ID") ?? "",
    clientRoomCategoryId: Deno.env.get("DISCORD_CLIENT_ROOM_CATEGORY_ID") ??
      DEFAULT_CLIENT_ROOM_CATEGORY_ID,
    adminBotId: Deno.env.get("DISCORD_ADMIN_BOT_ID") ?? DEFAULT_ADMIN_BOT_ID,
  };
}

function sanitizeDiscordChannelName(username: string): string {
  const normalized = username
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);

  return normalized || `client-${crypto.randomUUID().slice(0, 8)}`;
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
  const { botToken, guildId } = getDiscordConfig();

  if (!botToken || !guildId) {
    log.warn("Discord credentials not configured");
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetchWithRateLimit(
      `https://discord.com/api/v10/guilds/${guildId}/invites`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
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
    log.info("Discord invite created", { inviteUrl });
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
  const { botToken, guildId, roleId: defaultRoleId } = getDiscordConfig();
  const targetRoleId = roleId ?? defaultRoleId;

  if (!botToken || !guildId || !targetRoleId) {
    log.warn("Discord credentials not configured for role assignment");
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetchWithRateLimit(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${targetRoleId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${botToken}`,
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
  const { botToken, guildId, roleId: defaultRoleId } = getDiscordConfig();
  const targetRoleId = roleId ?? defaultRoleId;

  if (!botToken || !guildId || !targetRoleId) {
    log.warn("Discord credentials not configured for role removal");
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetchWithRateLimit(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${targetRoleId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bot ${botToken}`,
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

export async function findExistingClientRoom(
  discordUserId: string,
): Promise<string | null> {
  const { botToken, guildId, clientRoomCategoryId } = getDiscordConfig();

  if (!botToken || !guildId) {
    log.warn("Discord credentials not configured for client room lookup");
    throw new Error("Discord credentials not configured");
  }

  try {
    const response = await fetchWithRateLimit(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorMessage = `API error: ${response.status}`;
      log.error("Failed to fetch Discord guild channels", {
        status: response.status,
        discordUserId: maskDiscordUserId(discordUserId),
      });
      throw new Error(errorMessage);
    }

    const channels = await response.json() as DiscordGuildChannel[];
    const existingChannel = channels.find((channel) =>
      channel.parent_id === clientRoomCategoryId &&
      channel.permission_overwrites?.some((overwrite) =>
        overwrite.id === discordUserId
      )
    );

    return existingChannel?.id ?? null;
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Discord client room lookup error", {
      errorMessage,
      discordUserId: maskDiscordUserId(discordUserId),
    });
    throw err;
  }
}

export async function createClientRoom(
  discordUserId: string,
  username: string,
): Promise<{ success: boolean; channelId?: string; error?: string }> {
  const {
    botToken,
    guildId,
    clientRoomCategoryId,
    adminBotId,
  } = getDiscordConfig();

  if (!botToken || !guildId) {
    log.warn("Discord credentials not configured for client room creation");
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetchWithRateLimit(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sanitizeDiscordChannelName(username),
          type: 0,
          parent_id: clientRoomCategoryId,
          permission_overwrites: [
            {
              id: guildId,
              type: 0,
              allow: "0",
              deny: "3072",
            },
            {
              id: discordUserId,
              type: 1,
              allow: "68608",
              deny: "0",
            },
            {
              id: adminBotId,
              type: 1,
              allow: "269564944",
              deny: "0",
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      log.error("Failed to create Discord client room", {
        status: response.status,
        discordUserId: maskDiscordUserId(discordUserId),
      });
      return { success: false, error: `API error: ${response.status}` };
    }

    const channel = await response.json() as { id?: string };
    log.info("Discord client room created", {
      discordUserId: maskDiscordUserId(discordUserId),
      channelId: channel.id,
    });
    return { success: true, channelId: channel.id };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Discord client room creation error", {
      errorMessage,
      discordUserId: maskDiscordUserId(discordUserId),
    });
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
  const { botToken } = getDiscordConfig();

  if (!botToken) {
    log.warn("Discord bot token not configured");
    return { success: false, error: "Discord bot token not configured" };
  }

  try {
    // まずDMチャンネルを作成
    const channelResponse = await fetchWithRateLimit(
      `https://discord.com/api/v10/users/@me/channels`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
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
      `https://discord.com/api/v10/channels/${channel.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
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
