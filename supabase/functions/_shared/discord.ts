/**
 * Discord API ユーティリティ
 * Role付与/剥奪、招待生成などの共通処理
 */

import { createLogger } from "./logger.ts";

const log = createLogger("discord");

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID") ?? "";
const DISCORD_ROLE_ID = Deno.env.get("DISCORD_ROLE_ID") ?? "";

interface DiscordResult {
  success: boolean;
  error?: string;
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
  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    log.warn("Discord credentials not configured");
    return { success: false, error: "Discord credentials not configured" };
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/invites`,
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
      const errorText = await response.text();
      log.error("Failed to create Discord invite", {
        status: response.status,
        errorText,
      });
      return { success: false, error: `API error: ${response.status}` };
    }

    const invite = await response.json();
    const inviteUrl = `https://discord.gg/${invite.code}`;
    log.info("Discord invite created", { inviteUrl });
    return { success: true, inviteUrl };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
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
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}/roles/${targetRoleId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      },
    );

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      log.warn("Discord rate limited", { retryAfter });
      return {
        success: false,
        error: `Rate limited, retry after ${retryAfter}s`,
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Failed to add Discord role", {
        status: response.status,
        errorText,
        discordUserId: discordUserId.slice(-4),
      });
      return { success: false, error: `API error: ${response.status}` };
    }

    log.info("Discord role added", {
      discordUserId: discordUserId.slice(-4),
      roleId: targetRoleId,
    });
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
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
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}/roles/${targetRoleId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      },
    );

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      log.warn("Discord rate limited", { retryAfter });
      return {
        success: false,
        error: `Rate limited, retry after ${retryAfter}s`,
      };
    }

    // 404 = ユーザーがサーバーにいない or ロールを持っていない → 成功扱い
    if (response.status === 404) {
      log.info("Discord role not found (already removed or user left)", {
        discordUserId: discordUserId.slice(-4),
      });
      return { success: true };
    }

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Failed to remove Discord role", {
        status: response.status,
        errorText,
        discordUserId: discordUserId.slice(-4),
      });
      return { success: false, error: `API error: ${response.status}` };
    }

    log.info("Discord role removed", {
      discordUserId: discordUserId.slice(-4),
      roleId: targetRoleId,
    });
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
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
    const channelResponse = await fetch(
      `https://discord.com/api/v10/users/@me/channels`,
      {
        method: "POST",
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
      const errorText = await channelResponse.text();
      log.error("Failed to create DM channel", {
        status: channelResponse.status,
        errorText,
      });
      return { success: false, error: `Cannot create DM channel` };
    }

    const channel = await channelResponse.json();

    // DMを送信
    const messageResponse = await fetch(
      `https://discord.com/api/v10/channels/${channel.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: message }),
      },
    );

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      log.error("Failed to send DM", {
        status: messageResponse.status,
        errorText,
      });
      return { success: false, error: `Cannot send DM` };
    }

    log.info("Discord DM sent", {
      discordUserId: discordUserId.slice(-4),
    });
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("Discord DM error", { errorMessage });
    return { success: false, error: errorMessage };
  }
}
