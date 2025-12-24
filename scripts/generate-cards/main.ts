/**
 * AI Card Generator for LINE Daily Brief
 * OpenAI API を使用してカードを自動生成し、Supabase に挿入
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Types
type CardTheme = "ai_gov" | "tax" | "law" | "biz" | "career" | "asset" | "general";

interface GeneratedCard {
  body: string;
  theme: CardTheme;
  content_hash: string;
}

// Theme descriptions for OpenAI prompt
const THEME_DESCRIPTIONS: Record<CardTheme, string> = {
  ai_gov: "医療AI・ヘルスケアDX・デジタル医療政策",
  tax: "税務・節税・確定申告・医師の税金対策",
  law: "医療法務・契約・開業手続き・労働法",
  biz: "クリニック経営・事業戦略・マーケティング",
  career: "医師のキャリア・転職・働き方改革",
  asset: "資産形成・投資・不動産・老後資金",
  general: "医師向けの一般的な情報・ライフハック",
};

/**
 * SHA-256 hash
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * OpenAI API でカードを生成
 */
async function generateCardsWithOpenAI(
  theme: CardTheme,
  count: number,
  apiKey: string
): Promise<string[]> {
  const themeDesc = THEME_DESCRIPTIONS[theme];

  const prompt = `あなたは医師向けの情報発信を行うLINE Botのコンテンツ作成者です。

以下のテーマで、医師が日々の業務や生活に役立つ短いTips（1-2文、50-100文字程度）を${count}個作成してください。

テーマ: ${theme} (${themeDesc})

要件:
- 医師の視点で実用的かつ具体的な内容
- 堅すぎず、親しみやすいトーン
- 各Tipは独立して意味が通じること
- 絵文字は使わない

出力形式（JSONのみ、説明不要）:
["Tip1の内容", "Tip2の内容", ...]`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "[]";

  // Extract JSON from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Failed to parse OpenAI response: ${content}`);
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Supabase にカードを挿入
 */
async function insertCards(
  supabaseUrl: string,
  supabaseKey: string,
  cards: GeneratedCard[]
): Promise<{ inserted: number; skipped: number }> {
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get existing hashes
  const { data: existing } = await client
    .from("line_cards")
    .select("content_hash");
  const existingHashes = new Set((existing || []).map((r) => r.content_hash));

  // Filter duplicates
  const newCards = cards.filter((c) => !existingHashes.has(c.content_hash));
  const skipped = cards.length - newCards.length;

  if (newCards.length === 0) {
    return { inserted: 0, skipped };
  }

  // Insert
  const records = newCards.map((card) => ({
    body: card.body,
    theme: card.theme,
    source_path: "ai-generated",
    source_line: 0,
    content_hash: card.content_hash,
    status: "ready",
    times_used: 0,
    created_from_vault_at: new Date().toISOString(),
  }));

  const { error } = await client.from("line_cards").insert(records);
  if (error) {
    throw new Error(`Supabase insert error: ${error.message}`);
  }

  return { inserted: newCards.length, skipped };
}

/**
 * Main
 */
async function main() {
  const args = Deno.args;

  // Parse arguments
  const themesArg = args.find((a) => a.startsWith("--themes="));
  const countArg = args.find((a) => a.startsWith("--count="));
  const dryRun = args.includes("--dry-run");

  const themes = themesArg
    ? (themesArg.split("=")[1].split(",") as CardTheme[])
    : ["tax", "career", "general"] as CardTheme[];
  const countPerTheme = countArg ? parseInt(countArg.split("=")[1]) : 20;

  // Environment
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!openaiKey) {
    console.error("OPENAI_API_KEY is required");
    Deno.exit(1);
  }

  console.log("=== AI Card Generator ===");
  console.log(`Themes: ${themes.join(", ")}`);
  console.log(`Count per theme: ${countPerTheme}`);
  console.log(`Dry run: ${dryRun}`);
  console.log("");

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const theme of themes) {
    console.log(`Generating ${countPerTheme} cards for theme: ${theme}...`);

    try {
      // Generate
      const tips = await generateCardsWithOpenAI(theme, countPerTheme, openaiKey);
      console.log(`  Generated ${tips.length} tips`);

      // Create cards with hash
      const cards: GeneratedCard[] = await Promise.all(
        tips.map(async (body) => ({
          body,
          theme,
          content_hash: await sha256(`ai-generated:${theme}:${body}`),
        }))
      );

      if (dryRun) {
        console.log(`  [DRY RUN] Would insert ${cards.length} cards`);
        cards.slice(0, 3).forEach((c) => console.log(`    - ${c.body.slice(0, 50)}...`));
      } else {
        if (!supabaseUrl || !supabaseKey) {
          console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
          Deno.exit(1);
        }

        const result = await insertCards(supabaseUrl, supabaseKey, cards);
        console.log(`  Inserted: ${result.inserted}, Skipped: ${result.skipped}`);
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
      }
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
    }

    console.log("");
  }

  console.log("=== Summary ===");
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total skipped: ${totalSkipped}`);
}

main();
