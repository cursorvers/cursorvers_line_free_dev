/**
 * Discord Gateway Bot - Auto Free Role Assignment
 *
 * Listens for GUILD_MEMBER_ADD events via Discord Gateway WebSocket
 * and automatically assigns DISCORD_FREE_ROLE_ID to new members.
 *
 * This is a standalone persistent process, separate from the
 * Edge Function-based discord-bot (slash commands).
 *
 * Deploy: Fly.io, Railway, or any persistent Deno runtime
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN
 *   DISCORD_GUILD_ID
 *   DISCORD_FREE_ROLE_ID
 */

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");
const DISCORD_FREE_ROLE_ID = Deno.env.get("DISCORD_FREE_ROLE_ID");

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const API_BASE = "https://discord.com/api/v10";

// Gateway Intents: GUILDS (1 << 0) + GUILD_MEMBERS (1 << 1)
const INTENTS = (1 << 0) | (1 << 1);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface GatewayPayload {
  op: number;
  d: unknown;
  s?: number | null;
  t?: string | null;
}

interface GuildMemberAddData {
  guild_id: string;
  user: { id: string; username: string };
  roles: string[];
}

function log(level: string, message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "discord-gateway-bot",
    message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Assign a role to a guild member with retry logic
 */
async function assignRole(
  userId: string,
  roleId: string,
  retries = MAX_RETRIES,
): Promise<boolean> {
  const url =
    `${API_BASE}/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      });

      if (response.ok || response.status === 204) {
        return true;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseFloat(retryAfter) * 1000
          : RETRY_DELAY_MS;
        log("warn", "Rate limited, retrying", {
          attempt,
          retryAfterMs: delayMs,
        });
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      log("error", "Role assignment failed", {
        status: response.status,
        userId: userId.slice(-4),
      });
      return false;
    } catch (err) {
      log("error", "Role assignment request error", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  return false;
}

/**
 * Handle GUILD_MEMBER_ADD event
 */
function handleMemberAdd(data: GuildMemberAddData) {
  if (data.guild_id !== DISCORD_GUILD_ID) return;
  if (!DISCORD_FREE_ROLE_ID) {
    log("warn", "DISCORD_FREE_ROLE_ID not set, skipping role assignment");
    return;
  }

  // Skip if user already has the Free role (shouldn't happen on join, but safety check)
  if (data.roles.includes(DISCORD_FREE_ROLE_ID)) {
    log("info", "Member already has Free role", {
      userId: data.user.id.slice(-4),
    });
    return;
  }

  log("info", "New member joined, assigning Free role", {
    userId: data.user.id.slice(-4),
    username: data.user.username,
  });

  // Fire and forget - don't block the event loop
  assignRole(data.user.id, DISCORD_FREE_ROLE_ID).then((success) => {
    if (success) {
      log("info", "Free role assigned successfully", {
        userId: data.user.id.slice(-4),
      });
    } else {
      log("error", "Failed to assign Free role after retries", {
        userId: data.user.id.slice(-4),
      });
    }
  });
}

/**
 * Connect to Discord Gateway and maintain connection
 */
async function connectGateway(): Promise<void> {
  let sequenceNumber: number | null = null;
  let heartbeatInterval: number | null = null;
  let heartbeatTimer: number | undefined;
  let sessionId: string | null = null;
  let resumeGatewayUrl: string | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;

  function connect(url: string) {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      log("info", "Gateway WebSocket connected");
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      const payload: GatewayPayload = JSON.parse(event.data as string);

      if (payload.s !== null && payload.s !== undefined) {
        sequenceNumber = payload.s;
      }

      switch (payload.op) {
        // Dispatch (event)
        case 0: {
          if (payload.t === "READY") {
            const ready = payload.d as {
              session_id: string;
              resume_gateway_url: string;
            };
            sessionId = ready.session_id;
            resumeGatewayUrl = ready.resume_gateway_url;
            log("info", "Gateway READY", { sessionId });
          }

          if (payload.t === "GUILD_MEMBER_ADD") {
            handleMemberAdd(payload.d as GuildMemberAddData);
          }
          break;
        }

        // Heartbeat request
        case 1: {
          ws.send(JSON.stringify({ op: 1, d: sequenceNumber }));
          break;
        }

        // Hello
        case 10: {
          const hello = payload.d as { heartbeat_interval: number };
          heartbeatInterval = hello.heartbeat_interval;

          // Start heartbeat loop
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => {
            ws.send(JSON.stringify({ op: 1, d: sequenceNumber }));
          }, heartbeatInterval);

          // Send Identify or Resume
          if (sessionId && resumeGatewayUrl) {
            ws.send(JSON.stringify({
              op: 6,
              d: {
                token: DISCORD_BOT_TOKEN,
                session_id: sessionId,
                seq: sequenceNumber,
              },
            }));
            log("info", "Sent Resume");
          } else {
            ws.send(JSON.stringify({
              op: 2,
              d: {
                token: DISCORD_BOT_TOKEN,
                intents: INTENTS,
                properties: {
                  os: "linux",
                  browser: "cursorvers-gateway-bot",
                  device: "cursorvers-gateway-bot",
                },
              },
            }));
            log("info", "Sent Identify");
          }
          break;
        }

        // Heartbeat ACK
        case 11:
          break;

        // Reconnect
        case 7: {
          log("info", "Gateway requested reconnect");
          ws.close(4000, "Reconnect requested");
          break;
        }

        // Invalid Session
        case 9: {
          const resumable = payload.d as boolean;
          log("warn", "Invalid session", { resumable });
          if (!resumable) {
            sessionId = null;
            resumeGatewayUrl = null;
          }
          setTimeout(() => {
            const reconnectUrl = resumable && resumeGatewayUrl
              ? `${resumeGatewayUrl}/?v=10&encoding=json`
              : GATEWAY_URL;
            connect(reconnectUrl);
          }, 1000 + Math.random() * 4000);
          break;
        }
      }
    };

    ws.onerror = (event) => {
      log("error", "Gateway WebSocket error", {
        error: String(event),
      });
    };

    ws.onclose = (event) => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      log("warn", "Gateway WebSocket closed", {
        code: event.code,
        reason: event.reason,
      });

      // Non-resumable close codes
      const nonResumableCodes = [4004, 4010, 4011, 4012, 4013, 4014];
      if (nonResumableCodes.includes(event.code)) {
        log("error", "Fatal gateway close code, not reconnecting", {
          code: event.code,
        });
        Deno.exit(1);
      }

      reconnectAttempts++;
      if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        log("error", "Max reconnect attempts reached, exiting");
        Deno.exit(1);
      }

      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempts),
        30000,
      );
      log("info", "Reconnecting", { attempt: reconnectAttempts, delayMs: delay });

      setTimeout(() => {
        const reconnectUrl = resumeGatewayUrl
          ? `${resumeGatewayUrl}/?v=10&encoding=json`
          : GATEWAY_URL;
        connect(reconnectUrl);
      }, delay);
    };
  }

  connect(GATEWAY_URL);

  // Keep process alive
  await new Promise(() => {});
}

// Startup validation
if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !DISCORD_FREE_ROLE_ID) {
  log("error", "Missing required environment variables", {
    hasToken: !!DISCORD_BOT_TOKEN,
    hasGuildId: !!DISCORD_GUILD_ID,
    hasFreeRoleId: !!DISCORD_FREE_ROLE_ID,
  });
  Deno.exit(1);
}

log("info", "Discord Gateway Bot starting", {
  guildId: DISCORD_GUILD_ID,
});

connectGateway();
