const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID") ?? "";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // /bot-info: Bot Token の検証
  if (url.pathname.endsWith("/bot-info")) {
    if (!DISCORD_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "No bot token" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
    });
    const data = await res.json();
    return new Response(JSON.stringify({
      status: res.status,
      bot: data.username,
      id: data.id,
      guilds_hint: "Call /guilds to see joined servers"
    }), { headers: { "Content-Type": "application/json" } });
  }

  // /guilds: Bot が参加しているサーバー一覧
  if (url.pathname.endsWith("/guilds")) {
    if (!DISCORD_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "No bot token" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
    });
    const data = await res.json();
    return new Response(JSON.stringify({
      configured_guild_id: DISCORD_GUILD_ID,
      joined_guilds: data
    }), { headers: { "Content-Type": "application/json" } });
  }

  // /members: サーバーメンバー一覧
  if (url.pathname.endsWith("/members")) {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members?limit=100`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
    );
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status, headers: { "Content-Type": "application/json" }
      });
    }
    const members = data.map((m: { user: { id: string; username: string; bot?: boolean }; nick?: string; joined_at: string; roles: string[] }) => ({
      id: m.user.id,
      username: m.user.username,
      nickname: m.nick || null,
      is_bot: m.user.bot || false,
      joined_at: m.joined_at,
      roles: m.roles
    }));
    return new Response(JSON.stringify({
      total: members.length,
      members
    }), { headers: { "Content-Type": "application/json" } });
  }

  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    return new Response(JSON.stringify({
      error: "Missing credentials",
      has_token: !!DISCORD_BOT_TOKEN,
      has_guild: !!DISCORD_GUILD_ID
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}?with_counts=true`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(JSON.stringify({
        error: "Discord API error",
        status: res.status,
        detail: errorText
      }), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    const data = await res.json();
    return new Response(JSON.stringify({
      name: data.name,
      member_count: data.approximate_member_count,
      online: data.approximate_presence_count
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Exception",
      message: String(err)
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
