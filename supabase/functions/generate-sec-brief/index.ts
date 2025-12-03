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

1. 原文の文章をコピーしてはいけません。必ず自分の言葉でパラフレーズしてください。
2. 情報源の名称（Health-ISACなど）やTLPコード（TLP:GREEN等）は一切出してはいけません。
3. 診療所〜中小病院の日本の医療機関にとって重要なトピックだけを最大4件選びます。
4. 各トピックについて、「概要」「医療機関への影響」「今から2週間以内にやるべき行動」に分解してください。
5. 出力は必ず後述のJSONスキーマに完全準拠させてください。文章だけの出力は不可です。
6. body_markdownはDiscordに投稿できる形式で、見やすいMarkdownにしてください。`;

// ユーザープロンプトテンプレート
function buildUserPrompt(combinedText: string, weekStart: string): string {
  return `次のテキストは、ある週に配信されたサイバーセキュリティニュースの日本語本文です。
これらをまとめて読み、以下のJSONスキーマに従って出力してください。

【JSONスキーマ】
{
  "title": string,              // Discord投稿のタイトル（例: "医療セキュリティ・ブリーフ｜2025-12-02週"）
  "week_start": "${weekStart}", // 週の開始日（この値を使ってください）
  "topics": [                   // 最大4件
    {
      "id": string,             // "t1", "t2" など
      "category": string,       // "remote_work" | "vendor_risk" | "vulnerability" | "network" | "payment" | "privacy" | "other"
      "title": string,          // トピックの見出し
      "summary": string,        // 2〜3行の概要
      "impact_on_clinics": string, // 診療所・中小病院への影響
      "actions": string[]       // 今から2週間以内にやるべき具体的アクション（2〜4項目）
    }
  ],
  "mindmap": string,            // テキスト形式のマインドマップ（インデントで階層表現）
  "body_markdown": string       // Discordに投稿する完成済みMarkdown（見やすく整形）
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

    return new Response(
      JSON.stringify({
        status: "success",
        id: insertedBrief.id,
        title: brief.title,
        week_start: brief.week_start,
        topics_count: brief.topics.length,
        source_count: sourceIds.length,
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

