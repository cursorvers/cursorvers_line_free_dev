// supabase/functions/discord-bot/index.ts
// Discord Bot Edge Function
// - /join: Library Member認証
// - /sec-brief-latest: 最新ドラフトのプレビュー
// - /sec-brief-publish: ドラフトを#sec-briefに公開

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

// 環境変数（起動時に検証）
const DISCORD_PUBLIC_KEY = "741f9a907cd23cbe07422ee483463e93440ffc74419aa46fe60824eb817de4cf";
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_ROLE_ID = Deno.env.get("DISCORD_ROLE_ID") ?? "";
const SEC_BRIEF_CHANNEL_ID = Deno.env.get("SEC_BRIEF_CHANNEL_ID") ?? "";

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

serve(async (req) => {
  // GETリクエストに対応（ヘルスチェック用）
  if (req.method === "GET") {
    return new Response("Discord Bot is running", { status: 200 });
  }

  // 0. 環境変数の検証
  console.log("DISCORD_PUBLIC_KEY length:", DISCORD_PUBLIC_KEY.length);
  console.log("DISCORD_PUBLIC_KEY:", DISCORD_PUBLIC_KEY);
  if (!DISCORD_PUBLIC_KEY || !DISCORD_BOT_TOKEN) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // 1. Discordからの署名を検証 (必須)
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  const body = await req.text();

  console.log("Signature:", signature);
  console.log("Timestamp:", timestamp);
  console.log("Body:", body);
  
  const isValid = verifySignature(signature, timestamp, body);
  console.log("Signature valid:", isValid);
  
  // 署名検証を有効化
  if (!signature || !timestamp || !isValid) {
    console.error("Signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }
  console.log("✅ Signature verification passed");

  const interaction: DiscordInteraction = JSON.parse(body);

  // 2. Ping応答 (Discordとの接続確認用)
  if (interaction.type === 1) {
    console.log("Returning PING response");
    const response = new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
    console.log("Response status:", response.status);
    return response;
  }

  // 3. コマンドルーティング
  if (interaction.type === 2) {
    const commandName = interaction.data?.name;

    // Supabaseクライアント初期化
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    switch (commandName) {
      case "join":
        return handleJoin(interaction, supabase);
      case "sec-brief-latest":
        return handleSecBriefLatest(supabase);
      case "sec-brief-publish":
        return handleSecBriefPublish(interaction, supabase);
      case "post-article":
        return handlePostArticle(interaction, supabase);
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
  supabase: SupabaseClient
): Promise<Response> {
  const email = interaction.data?.options?.find((o) => o.name === "email")?.value;
  const userId = interaction.member?.user.id;
  const guildId = interaction.guild_id;

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

    // メールアドレスで検索
    const { data: member, error } = await supabase
      .from("members")
      .select("*")
      .eq("email", email)
      .eq("status", "active")
      .single();

    if (error || !member) {
      return jsonResponse({
        type: 4,
        data: { 
          content: `⛔ **エラー**: そのメールアドレス (${email}) の決済情報が見つかりません。\nStripeで決済したメールアドレスを正確に入力してください。`,
        flags: 64,
      },
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
      data: {
        content: "⚠️ ロールの付与に失敗しました。管理者に連絡してください。",
        flags: 64,
      },
      });
    }

    // DB更新 (Discord IDを紐付け)
    await supabase
      .from("members")
      .update({ discord_user_id: userId })
      .eq("id", member.id);

    return jsonResponse({
      type: 4,
    data: {
      content:
        "🎉 **認証成功！**\nLibrary Memberの権限を付与しました。\n左側のメニューに限定チャンネルが表示されているか確認してください。",
    },
    });
  }

// ============================================
// /sec-brief-latest コマンドハンドラ
// 最新のドラフトをephemeralでプレビュー
// ============================================
async function handleSecBriefLatest(supabase: SupabaseClient): Promise<Response> {
  const { data, error } = await supabase
    .from("sec_brief")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("DB Error:", error);
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
  if (content.length > 1900) {
    content = content.substring(0, 1900) + "\n\n... (続きあり)";
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
  supabase: SupabaseClient
): Promise<Response> {
  // 最新のドラフトを取得
  const { data, error } = await supabase
    .from("sec_brief")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("DB Error:", error);
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
    console.error("SEC_BRIEF_CHANNEL_ID not set");
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
  const chunks = splitMessage(bodyMarkdown, 1900);

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
      }
    );

    if (!sendRes.ok) {
      const errorText = await sendRes.text();
      console.error(`Failed to send message to #sec-brief: ${errorText}`);
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
    console.error("DB Update Error:", updateError);
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

  console.log(`Published sec_brief: ${data.id}, title: ${data.title}`);

  return jsonResponse({
    type: 4,
    data: {
      content: `✅ **公開完了！**\n\n「${data.title}」を #sec-brief に投稿しました。`,
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
  body: string
): boolean {
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

function hexToUint8Array(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) {
    throw new Error("Invalid hex string");
  }
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

// メッセージを指定文字数で分割
function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 改行位置で分割を試みる
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // 改行が見つからない場合はスペースで分割
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // それでも見つからない場合は強制分割
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

// ============================================
// /post-article コマンドハンドラ
// 記事URLを解析してトレンド情報共有チャンネルに投稿
// ============================================
async function handlePostArticle(
  interaction: DiscordInteraction,
  supabase: SupabaseClient
): Promise<Response> {
  const url = interaction.data?.options?.find((o) => o.name === "url")?.value;
  const userId = interaction.member?.user.id;

  if (!url) {
    return jsonResponse({
      type: 4,
      data: {
        content: "⛔ **エラー**: URLを入力してください。\n使い方: `/post-article url:https://example.com/article`",
        flags: 64,
      },
    });
  }

  // URLの形式を簡易チェック
  try {
    new URL(url);
  } catch {
    return jsonResponse({
      type: 4,
      data: {
        content: "⛔ **エラー**: 有効なURLを入力してください。",
        flags: 64,
      },
    });
  }

  // 即座に「処理中」メッセージを返す
  const processingResponse = jsonResponse({
    type: 4,
    data: {
      content: "⏳ 記事を解析中です...",
      flags: 64, // ephemeral
    },
  });

  // バックグラウンドで記事を解析・投稿
  (async () => {
    try {
      // 1. 記事のメタデータを取得
      const metadata = await fetchArticleMetadata(url);

      // 2. Gemini APIで記事を要約
      const summary = await summarizeArticle(url, metadata);

      // 3. トレンド情報共有チャンネルIDを取得
      const TREND_CHANNEL_ID = Deno.env.get("TREND_CHANNEL_ID") ?? "";
      if (!TREND_CHANNEL_ID) {
        throw new Error("TREND_CHANNEL_ID is not configured");
      }

      // 4. Discord Embedメッセージを作成
      const embed: any = {
        title: metadata.title || "タイトル不明",
        description: summary.substring(0, 4096), // Embedのdescriptionは4096文字まで
        url: url,
        color: 0x5865F2, // Discord Blurple
        footer: {
          text: `投稿者: ${userId}`,
        },
        timestamp: new Date().toISOString(),
      };

      if (metadata.image) {
        embed.image = { url: metadata.image };
      }

      // 5. Discordチャンネルに投稿
      const postRes = await fetch(
        `https://discord.com/api/v10/channels/${TREND_CHANNEL_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            embeds: [embed],
          }),
        }
      );

      if (!postRes.ok) {
        const errorText = await postRes.text();
        console.error(`Discord post failed: ${errorText}`);
        throw new Error(`Discord API error: ${postRes.status}`);
      }

      const postedMessage = await postRes.json();

      // 6. Supabaseに投稿履歴を保存
      await supabase.from("article_posts").insert({
        article_url: url,
        article_title: metadata.title,
        article_description: metadata.description,
        article_image_url: metadata.image,
        summary: summary,
        discord_message_id: postedMessage.id,
        discord_channel_id: TREND_CHANNEL_ID,
        posted_by: userId,
        status: "posted",
      });

      console.log(`✅ Article posted successfully: ${url}`);
    } catch (error) {
      console.error(`❌ Failed to post article: ${error.message}`);

      // エラーをSupabaseに記録
      await supabase.from("article_posts").insert({
        article_url: url,
        posted_by: userId,
        discord_channel_id: Deno.env.get("TREND_CHANNEL_ID") ?? "",
        status: "failed",
        error_message: error.message,
      });
    }
  })();

  return processingResponse;
}

// ============================================
// 記事のメタデータを取得
// ============================================
async function fetchArticleMetadata(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
}> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CursorversBot/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // OGPタグからメタデータを抽出
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

    // OGPがない場合は通常のtitleタグから取得
    const fallbackTitleMatch = html.match(/<title>([^<]+)<\/title>/);

    const metadata = {
      title: titleMatch?.[1] || fallbackTitleMatch?.[1],
      description: descMatch?.[1],
      image: imageMatch?.[1],
    };

    console.log(`Metadata extracted for ${url}:`, JSON.stringify(metadata));

    return metadata;
  } catch (error) {
    console.error(`Failed to fetch metadata: ${error.message}`);
    return {};
  }
}

// ============================================
// Gemini APIで記事を要約
// ============================================
async function summarizeArticle(url: string, metadata: any): Promise<string> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  if (!GEMINI_API_KEY) {
    // Gemini APIが設定されていない場合は、メタデータのdescriptionを返す
    return metadata.description || "要約を生成できませんでした。";
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `以下の記事を3〜5文で要約してください。要約は日本語で、重要なポイントを簡潔にまとめてください。

記事URL: ${url}
タイトル: ${metadata.title || "不明"}
説明: ${metadata.description || "なし"}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summary) {
      throw new Error("No summary generated");
    }

    return summary.trim();
  } catch (error) {
    console.error(`Failed to generate summary: ${error.message}`);
    return metadata.description || "要約を生成できませんでした。";
  }
}
