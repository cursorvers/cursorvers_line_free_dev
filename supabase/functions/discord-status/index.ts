import { parseRequiredJsonBody } from "../_shared/http-utils.ts";

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID") ?? "";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // /bot-info: Bot Token の検証
  if (url.pathname.endsWith("/bot-info")) {
    if (!DISCORD_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "No bot token" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });
    const data = await res.json();
    return new Response(
      JSON.stringify({
        status: res.status,
        bot: data.username,
        id: data.id,
        guilds_hint: "Call /guilds to see joined servers",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // /guilds: Bot が参加しているサーバー一覧
  if (url.pathname.endsWith("/guilds")) {
    if (!DISCORD_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "No bot token" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });
    const data = await res.json();
    return new Response(
      JSON.stringify({
        configured_guild_id: DISCORD_GUILD_ID,
        joined_guilds: data,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // /webhooks: チャンネルWebhook一覧
  if (url.pathname.endsWith("/webhooks")) {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/webhooks`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    );
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const webhooks = data.map((
      w: { id: string; name: string; channel_id: string; token?: string },
    ) => ({
      id: w.id,
      name: w.name,
      channel_id: w.channel_id,
      url: w.token
        ? `https://discord.com/api/webhooks/${w.id}/${w.token}`
        : null,
    }));
    return new Response(
      JSON.stringify({
        total: webhooks.length,
        webhooks,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // /create-webhook: Webhook作成
  if (url.pathname.endsWith("/create-webhook")) {
    if (!DISCORD_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const parsedBody = await parseRequiredJsonBody<{
      channel_id?: string;
      name?: string;
    }>(req);
    if (!parsedBody.ok) {
      return new Response(JSON.stringify({ error: parsedBody.error }), {
        status: parsedBody.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = parsedBody.body;
    const { channel_id, name } = body;
    if (!channel_id || !name) {
      return new Response(
        JSON.stringify({ error: "channel_id and name required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channel_id}/webhooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
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
        id: data.id,
        name: data.name,
        channel_id: data.channel_id,
        url: `https://discord.com/api/webhooks/${data.id}/${data.token}`,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // /channels: サーバーチャンネル一覧
  if (url.pathname.endsWith("/channels")) {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/channels`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    );
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    // テキストチャンネルのみ抽出（type: 0）
    const channels = data
      .filter((c: { type: number }) => c.type === 0)
      .map((c: { id: string; name: string; parent_id: string | null }) => ({
        id: c.id,
        name: c.name,
        category_id: c.parent_id,
      }));
    return new Response(
      JSON.stringify({
        total: channels.length,
        channels,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // /send-message: チャンネルにメッセージ送信
  if (url.pathname.endsWith("/send-message")) {
    if (!DISCORD_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const parsedBody = await parseRequiredJsonBody<{
      channel_id?: string;
      content?: string;
      embeds?: unknown[];
    }>(req);
    if (!parsedBody.ok) {
      return new Response(JSON.stringify({ error: parsedBody.error }), {
        status: parsedBody.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = parsedBody.body;
    const { channel_id, content, embeds } = body;
    if (!channel_id || (!content && !embeds)) {
      return new Response(
        JSON.stringify({
          error: "channel_id and (content or embeds) required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channel_id}/messages`,
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

  // /bot-permissions: Bot権限確認
  if (url.pathname.endsWith("/bot-permissions")) {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Bot自身の情報を取得
    const botRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });
    const botData = await botRes.json();

    // Guildでの Bot メンバー情報を取得
    const memberRes = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${botData.id}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    );
    const memberData = await memberRes.json();

    // Guild ロール一覧を取得
    const rolesRes = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/roles`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    );
    const rolesData = await rolesRes.json();

    // Bot のロールをマッピング
    const botRoles = memberData.roles?.map((roleId: string) => {
      const role = rolesData.find((r: { id: string }) => r.id === roleId);
      return role
        ? { id: role.id, name: role.name, permissions: role.permissions }
        : { id: roleId };
    }) || [];

    return new Response(
      JSON.stringify({
        bot_id: botData.id,
        bot_name: botData.username,
        roles: botRoles,
        hint: "MANAGE_WEBHOOKS permission = 0x20000000 (536870912)",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // /members: サーバーメンバー一覧
  if (url.pathname.endsWith("/members")) {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members?limit=100`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    );
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const members = data.map((
      m: {
        user: { id: string; username: string; bot?: boolean };
        nick?: string;
        joined_at: string;
        roles: string[];
      },
    ) => ({
      id: m.user.id,
      username: m.user.username,
      nickname: m.nick || null,
      is_bot: m.user.bot || false,
      joined_at: m.joined_at,
      roles: m.roles,
    }));
    return new Response(
      JSON.stringify({
        total: members.length,
        members,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    return new Response(
      JSON.stringify({
        error: "Missing credentials",
        has_token: !!DISCORD_BOT_TOKEN,
        has_guild: !!DISCORD_GUILD_ID,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}?with_counts=true`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    );

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(
        JSON.stringify({
          error: "Discord API error",
          status: res.status,
          detail: errorText,
        }),
        { status: res.status, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({
        name: data.name,
        member_count: data.approximate_member_count,
        online: data.approximate_presence_count,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Exception",
        message: String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
