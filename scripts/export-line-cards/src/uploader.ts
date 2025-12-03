// scripts/export-line-cards/src/uploader.ts
// Supabase への同期処理

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ExtractedCard, SyncResult } from "./types.js";

/**
 * Supabaseクライアントを初期化
 */
export function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "環境変数 SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です"
    );
  }

  return createClient(url, key);
}

/**
 * 既存のカードのハッシュ一覧を取得
 */
async function getExistingHashes(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("line_cards")
    .select("content_hash");

  if (error) {
    console.error("既存ハッシュの取得に失敗:", error);
    throw error;
  }

  return new Set(data?.map((row) => row.content_hash) || []);
}

/**
 * 新規カードをバッチ挿入
 */
async function insertCards(
  supabase: SupabaseClient,
  cards: ExtractedCard[]
): Promise<number> {
  if (cards.length === 0) {
    return 0;
  }

  // DBカラム名に変換
  const dbRecords = cards.map((card) => ({
    body: card.body,
    theme: card.theme,
    source_path: card.sourcePath,
    source_line: card.sourceLine,
    content_hash: card.contentHash,
    status: "ready",
    times_used: 0,
    created_from_vault_at: new Date().toISOString(),
  }));

  // バッチサイズで分割（Supabaseの制限対策）
  const batchSize = 100;
  let insertedCount = 0;

  for (let i = 0; i < dbRecords.length; i += batchSize) {
    const batch = dbRecords.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("line_cards")
      .insert(batch)
      .select("id");

    if (error) {
      console.error(`バッチ挿入エラー (${i}〜${i + batch.length}):`, error);
      // 重複エラーの場合は続行
      if (error.code !== "23505") {
        throw error;
      }
    } else {
      insertedCount += data?.length || 0;
    }
  }

  return insertedCount;
}

/**
 * カードを Supabase に同期
 */
export async function syncCardsToSupabase(
  cards: ExtractedCard[]
): Promise<SyncResult> {
  const result: SyncResult = {
    totalFilesScanned: 0,
    totalCardsFound: cards.length,
    newCardsInserted: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  if (cards.length === 0) {
    console.log("📭 同期するカードがありません");
    return result;
  }

  console.log(`\n☁️  Supabase に同期中...`);

  try {
    const supabase = createSupabaseClient();

    // 既存のハッシュを取得
    const existingHashes = await getExistingHashes(supabase);
    console.log(`  既存カード数: ${existingHashes.size}`);

    // 新規カードをフィルタリング
    const newCards = cards.filter(
      (card) => !existingHashes.has(card.contentHash)
    );
    result.duplicatesSkipped = cards.length - newCards.length;

    console.log(`  新規カード: ${newCards.length}`);
    console.log(`  スキップ（重複）: ${result.duplicatesSkipped}`);

    if (newCards.length === 0) {
      console.log("✅ 全てのカードは既に同期済みです");
      return result;
    }

    // 新規カードを挿入
    result.newCardsInserted = await insertCards(supabase, newCards);
    console.log(`✅ ${result.newCardsInserted} 件のカードを追加しました`);

    // 追加されたカードのプレビュー（最大3件）
    if (result.newCardsInserted > 0) {
      console.log("\n📋 追加されたカードのプレビュー:");
      for (let i = 0; i < Math.min(3, newCards.length); i++) {
        const card = newCards[i];
        const preview =
          card.body.length > 50
            ? card.body.substring(0, 50) + "..."
            : card.body;
        console.log(`  [${card.theme}] ${preview}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error("❌ 同期エラー:", errorMessage);
  }

  return result;
}

/**
 * カードの統計情報を取得
 */
export async function getCardStats(): Promise<void> {
  try {
    const supabase = createSupabaseClient();

    // テーマ別カード数
    const { data: themeStats } = await supabase
      .from("line_cards")
      .select("theme")
      .eq("status", "ready");

    if (themeStats) {
      const themeCounts: Record<string, number> = {};
      for (const row of themeStats) {
        themeCounts[row.theme] = (themeCounts[row.theme] || 0) + 1;
      }

      console.log("\n📊 テーマ別カード数（ready）:");
      for (const [theme, count] of Object.entries(themeCounts).sort(
        (a, b) => b[1] - a[1]
      )) {
        console.log(`  ${theme}: ${count}`);
      }
    }

    // 全体統計
    const { count: totalCount } = await supabase
      .from("line_cards")
      .select("*", { count: "exact", head: true });

    const { count: readyCount } = await supabase
      .from("line_cards")
      .select("*", { count: "exact", head: true })
      .eq("status", "ready");

    console.log(`\n📈 全体統計:`);
    console.log(`  総カード数: ${totalCount || 0}`);
    console.log(`  配信可能: ${readyCount || 0}`);
  } catch (error) {
    console.error("統計取得エラー:", error);
  }
}

