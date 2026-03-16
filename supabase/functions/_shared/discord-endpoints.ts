/**
 * Discord API Endpoint Spec - Single source of truth for all Discord API URLs
 *
 * Each endpoint defines:
 * - build(): URL construction with required parameter validation
 * - method: HTTP method
 * - okStatuses: Status codes that indicate success
 *
 * @see Plans.md Phase 5-4
 */

// ============================================
// Types
// ============================================

export interface EndpointSpec {
  readonly build: (...args: string[]) => string;
  readonly method: string;
  readonly okStatuses: readonly number[];
  readonly description: string;
}

// ============================================
// Constants
// ============================================

const BASE_URL = "https://discord.com/api/v10" as const;

function requireParam(value: string | undefined, name: string): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Discord API: required parameter '${name}' is empty or missing`,
    );
  }
  return value;
}

// ============================================
// Endpoint Definitions (SSOT)
// ============================================

export const DISCORD_ENDPOINTS = {
  /** Create a channel invite */
  channelInvite: {
    build: (channelId: string) => {
      requireParam(channelId, "channelId");
      return `${BASE_URL}/channels/${channelId}/invites`;
    },
    method: "POST",
    okStatuses: [200, 201],
    description: "Create channel invite",
  },

  /** Add a role to a guild member */
  memberRole: {
    build: (guildId: string, userId: string, roleId: string) => {
      requireParam(guildId, "guildId");
      requireParam(userId, "userId");
      requireParam(roleId, "roleId");
      return `${BASE_URL}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
    },
    method: "PUT",
    okStatuses: [204],
    description: "Add role to guild member",
  },

  /** Remove a role from a guild member */
  memberRoleRemove: {
    build: (guildId: string, userId: string, roleId: string) => {
      requireParam(guildId, "guildId");
      requireParam(userId, "userId");
      requireParam(roleId, "roleId");
      return `${BASE_URL}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
    },
    method: "DELETE",
    okStatuses: [204, 404],
    description: "Remove role from guild member",
  },

  /** Create a DM channel with a user */
  dmChannel: {
    build: () => `${BASE_URL}/users/@me/channels`,
    method: "POST",
    okStatuses: [200],
    description: "Create DM channel",
  },

  /** Send a message to a channel */
  channelMessage: {
    build: (channelId: string) => {
      requireParam(channelId, "channelId");
      return `${BASE_URL}/channels/${channelId}/messages`;
    },
    method: "POST",
    okStatuses: [200],
    description: "Send channel message",
  },

  /** Create a guild channel (e.g. Forum) */
  guildChannel: {
    build: (guildId: string) => {
      requireParam(guildId, "guildId");
      return `${BASE_URL}/guilds/${guildId}/channels`;
    },
    method: "POST",
    okStatuses: [200, 201],
    description: "Create guild channel",
  },

  /** Create a Forum thread (start thread in forum channel) */
  forumThread: {
    build: (channelId: string) => {
      requireParam(channelId, "channelId");
      return `${BASE_URL}/channels/${channelId}/threads`;
    },
    method: "POST",
    okStatuses: [200, 201],
    description: "Create forum thread",
  },

  /** Update channel settings (e.g. available_tags for Forum) */
  channelTags: {
    build: (channelId: string) => {
      requireParam(channelId, "channelId");
      return `${BASE_URL}/channels/${channelId}`;
    },
    method: "PATCH",
    okStatuses: [200],
    description: "Update channel settings",
  },

  /** Get messages in a channel (supports ?limit=N) */
  channelMessages: {
    build: (channelId: string) => {
      requireParam(channelId, "channelId");
      return `${BASE_URL}/channels/${channelId}/messages`;
    },
    method: "GET",
    okStatuses: [200],
    description: "Get channel messages",
  },

  /** Edit a specific message */
  editMessage: {
    build: (channelId: string, messageId: string) => {
      requireParam(channelId, "channelId");
      requireParam(messageId, "messageId");
      return `${BASE_URL}/channels/${channelId}/messages/${messageId}`;
    },
    method: "PATCH",
    okStatuses: [200],
    description: "Edit message",
  },
} as const satisfies Record<string, EndpointSpec>;

export type EndpointName = keyof typeof DISCORD_ENDPOINTS;
