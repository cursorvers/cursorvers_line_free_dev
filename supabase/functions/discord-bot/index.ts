// supabase/functions/discord-bot/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const DISCORD_PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
const DISCORD_ROLE_ID = Deno.env.get("DISCORD_ROLE_ID")!;

serve(async (req) => {
  // 1. Discordからの署名を検証 (必須)
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  const body = await req.text();

  if (!signature || !timestamp || !verifySignature(signature, timestamp, body)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(body);

  // 2. Ping応答 (Discordとの接続確認用)
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. コマンド処理 (/join email)
  if (interaction.type === 2 && interaction.data.name === "join") {
    const email = interaction.data.options?.find((o: any) => o.name === "email")?.value;
    const userId = interaction.member.user.id;
    const guildId = interaction.guild_id;

    if (!email) {
      return jsonResponse({
        type: 4,
        data: { 
          content: "⛔ **エラー**: メールアドレスを入力してください。\n使い方: `/join email:your@email.com`",
          flags: 64
        }
      });
    }

    // Supabaseチェック
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // メールアドレスで検索
    const { data: member, error } = await supabase
      .from("library_members")
      .select("*")
      .eq("stripe_customer_email", email)
      .eq("status", "active")
      .single();

    if (error || !member) {
      return jsonResponse({
        type: 4,
        data: { 
          content: `⛔ **エラー**: そのメールアドレス (${email}) の決済情報が見つかりません。\nStripeで決済したメールアドレスを正確に入力してください。`,
          flags: 64 // 自分にだけ見えるメッセージ
        }
      });
    }

    // ロール付与 (Discord API)
    const roleRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${DISCORD_ROLE_ID}`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      }
    );

    if (!roleRes.ok) {
      const errorText = await roleRes.text();
      console.error(`Role assignment failed: ${errorText}`);
      return jsonResponse({
        type: 4,
        data: { content: "⚠️ ロールの付与に失敗しました。管理者に連絡してください。", flags: 64 }
      });
    }

    // DB更新 (Discord IDを紐付け)
    await supabase
      .from("library_members")
      .update({ discord_user_id: userId })
      .eq("id", member.id);

    return jsonResponse({
      type: 4,
      data: { content: "🎉 **認証成功！**\nLibrary Memberの権限を付与しました。\n左側のメニューに限定チャンネルが表示されているか確認してください。" }
    });
  }

  return new Response("Unknown command", { status: 400 });
});

// --- Helper: レスポンス生成 ---
function jsonResponse(body: any) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

// --- Helper: 署名検証 ---
function verifySignature(signature: string, timestamp: string, body: string): boolean {
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + body),
      hexToUint8Array(signature),
      hexToUint8Array(DISCORD_PUBLIC_KEY)
    );
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
}


