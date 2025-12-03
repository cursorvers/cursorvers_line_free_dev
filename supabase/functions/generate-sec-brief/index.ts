// supabase/functions/generate-sec-brief/index.ts
// 週次セキュリティ・ブリーフ生成 Edge Function
// 直近7日分のhij_rawからLLMで要約を生成し、sec_briefテーブルに保存

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// トピックカテゴリの型定義
type SecBriefTopicCategory =
  | "remote_work"
  | "vendor_risk"
  | "vulnerability"
  | "network"
  | "payment"
  | "privacy"
  | "other";

// トピックの型定義
interface SecBriefTopic {
  id: string;
  category: SecBriefTopicCategory;
  title: string;
  source_date: string;           // 元の報告日
  sources: string[];             // 引用元（報告機関、CVE番号、報道元など）
  summary: string;
  impact_on_clinics: string;
  actions: string[];
}

// LLMレスポンスの型定義
interface LLMResponse {
  title: string;
  week_start: string;
  topics: SecBriefTopic[];
  mindmap: string;
  body_markdown: string;
}

// システムプロンプト
const SYSTEM_PROMPT = `あなたは日本の医療機関向けサイバーセキュリティ顧問です。
入力として、ある週に配信された複数のサイバーセキュリティニュースの本文テキストが与えられます。
以下の制約条件を必ず守ってください。

【絶対に出力してはいけない情報】
- 「Health-ISAC」「H-ISAC」などの情報共有組織の名称
- TLPコード（TLP:GREEN、TLP:AMBER等）
- 「情報共有コミュニティ」「ISAC」などの表現

【必ず出力する情報】
- 元のニュースソース（公開情報）を必ず引用してください
  例: 「CISA（米サイバーセキュリティ庁）」「CVE-2025-XXXX」「FBI/IC3」「○○社セキュリティアドバイザリ」「○○新聞報道」など
- 各トピックの元の報告日または公開日

【その他の制約】
1. 原文の文章をコピーしてはいけません。必ず自分の言葉でパラフレーズしてください。
2. 診療所〜中小病院の日本の医療機関にとって重要なトピックだけを最大4件選びます。
3. 各トピックについて、「概要」「医療機関への影響」「今から2週間以内にやるべき行動」に分解してください。
4. 出力は必ず後述のJSONスキーマに完全準拠させてください。
5. body_markdownはDiscordに投稿できる形式で、見やすいMarkdownにしてください。
   - 冒頭に「📋 本ブリーフは、公開されているサイバーセキュリティ情報をもとに、医療機関向けに編集したものです。」を含めてください。
   - 各トピックに「📅 公開日」と「📰 情報源」を明記してください。`;

// ユーザープロンプトテンプレート
function buildUserPrompt(combinedText: string, weekStart: string): string {
  return `次のテキストは、ある週に収集されたサイバーセキュリティニュースの日本語本文です。
これらをまとめて読み、以下のJSONスキーマに従って出力してください。

【重要】各トピックには必ず「元のニュースソース」と「公開日」を含めてください。
情報源が不明な場合は「複数の報道」などと記載してください。

【JSONスキーマ】
{
  "title": string,              // Discord投稿のタイトル（例: "医療セキュリティ・ブリーフ｜2025-12-02週"）
  "week_start": "${weekStart}", // 週の開始日（この値を使ってください）
  "topics": [                   // 最大4件
    {
      "id": string,             // "t1", "t2" など
      "category": string,       // "remote_work" | "vendor_risk" | "vulnerability" | "network" | "payment" | "privacy" | "other"
      "title": string,          // トピックの見出し
      "source_date": string,    // 元の公開日（例: "2025-11-28"）
      "sources": string[],      // 情報源の配列（例: ["CISA警告", "CVE-2025-1234"]）
      "summary": string,        // 2〜3行の概要
      "impact_on_clinics": string, // 診療所・中小病院への影響
      "actions": string[]       // 今から2週間以内にやるべき具体的アクション（2〜4項目）
    }
  ],
  "mindmap": string,            // テキスト形式のマインドマップ（インデントで階層表現）
  "body_markdown": string       // Discordに投稿する完成済みMarkdown（見やすく整形、情報源を明記）
}

【この週のニュース本文】
<<<
${combinedText}
>>>`;
}

// 週の開始日（月曜日）を計算
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 月曜日に調整
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

// GitHub Actions cron用のAPIキー検証
const GENERATE_API_KEY = Deno.env.get("GENERATE_SEC_BRIEF_API_KEY");

// Discord設定
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const SEC_BRIEF_CHANNEL_ID = Deno.env.get("SEC_BRIEF_CHANNEL_ID");

// Discordメッセージ分割（2000文字制限対応）
function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

// Discordに自動投稿
async function postToDiscord(bodyMarkdown: string): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN || !SEC_BRIEF_CHANNEL_ID) {
    console.log("Discord credentials not set, skipping auto-publish");
    return false;
  }

  const chunks = splitMessage(bodyMarkdown, 1900);

  for (const chunk of chunks) {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${SEC_BRIEF_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: chunk }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Discord post failed: ${errorText}`);
      return false;
    }
  }

  return true;
}

serve(async (req: Request): Promise<Response> => {
  // CORSプリフライト対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      },
    });
  }

  // POSTのみ許可
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // APIキー検証（設定されている場合のみ）
  if (GENERATE_API_KEY) {
    const apiKey = req.headers.get("X-API-Key");
    if (apiKey !== GENERATE_API_KEY) {
      console.error("Invalid API key");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 直近7日分のhij_rawを取得（TLP:GREEN or null のみ）
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const { data: rows, error: fetchError } = await supabase
      .from("hij_raw")
      .select("*")
      .gte("sent_at", weekAgo.toISOString())
      .lte("sent_at", now.toISOString())
      .or("tlp.eq.GREEN,tlp.is.null")
      .order("sent_at", { ascending: true });

    if (fetchError) {
      console.error("DB Fetch Error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Database Error", details: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!rows || rows.length === 0) {
      console.log("No data for this week");
      return new Response(
        JSON.stringify({ status: "no_data", message: "No hij_raw records for this week" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${rows.length} records for the past 7 days`);

    // 本文を結合
    const combinedText = rows
      .map((r) => `【${r.subject || "No Subject"}】\n${r.raw_text}`)
      .join("\n\n----\n\n");

    // 週の開始日を計算
    const weekStart = getWeekStart(now);

    // OpenAI API呼び出し
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      console.error("OPENAI_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Configuration Error", details: "OPENAI_API_KEY not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(combinedText, weekStart) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error("OpenAI API Error:", errorText);
      return new Response(
        JSON.stringify({ error: "LLM Error", details: errorText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiJson = await openaiRes.json();
    const brief: LLMResponse = JSON.parse(openaiJson.choices[0].message.content);

    console.log(`Generated brief: ${brief.title}, ${brief.topics.length} topics`);

    // sec_briefテーブルに挿入
    const sourceIds = rows.map((r) => r.id);

    const { data: insertedBrief, error: insertError } = await supabase
      .from("sec_brief")
      .insert({
        week_start: brief.week_start,
        title: brief.title,
        topics: brief.topics,
        mindmap: brief.mindmap,
        body_markdown: brief.body_markdown,
        source_ids: sourceIds,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("DB Insert Error:", insertError);
      return new Response(
        JSON.stringify({ error: "Database Error", details: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Inserted sec_brief: ${insertedBrief.id}`);

    // 自動でDiscordに投稿
    let published = false;
    const discordSuccess = await postToDiscord(brief.body_markdown);
    
    if (discordSuccess) {
      // ステータスをpublishedに更新
      const { error: updateError } = await supabase
        .from("sec_brief")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", insertedBrief.id);

      if (updateError) {
        console.error("Status update error:", updateError);
      } else {
        published = true;
        console.log(`Auto-published to Discord: ${brief.title}`);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        id: insertedBrief.id,
        title: brief.title,
        week_start: brief.week_start,
        topics_count: brief.topics.length,
        source_count: sourceIds.length,
        published: published,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Request processing error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

