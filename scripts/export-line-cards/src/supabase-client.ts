/**
 * Supabase Client for LINE Cards
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  ExtractedCard,
  LineCardInsert,
  LineCardRecord,
  ExtractionStats,
} from "./types.ts";

/**
 * Initialize Supabase client
 */
export function createSupabaseClient(
  url: string,
  serviceKey: string
): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get existing card hashes from database
 */
export async function getExistingHashes(
  client: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await client
    .from("line_cards")
    .select("content_hash");

  if (error) {
    throw new Error(`Failed to fetch existing hashes: ${error.message}`);
  }

  return new Set((data || []).map((row) => row.content_hash));
}

/**
 * Insert new cards into database
 */
export async function insertCards(
  client: SupabaseClient,
  cards: ExtractedCard[],
  existingHashes: Set<string>,
  batchSize: number
): Promise<ExtractionStats> {
  const stats: ExtractionStats = {
    filesScanned: 0,
    filesWithCards: 0,
    totalCardsFound: cards.length,
    newCardsInserted: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  // Filter out duplicates
  const newCards = cards.filter((card) => {
    if (existingHashes.has(card.contentHash)) {
      stats.duplicatesSkipped++;
      return false;
    }
    return true;
  });

  if (newCards.length === 0) {
    console.log("ℹ️  No new cards to insert");
    return stats;
  }

  // Prepare records for insertion
  const records: LineCardInsert[] = newCards.map((card) => ({
    body: card.body,
    theme: card.theme,
    source_path: card.sourcePath,
    source_line: card.sourceLine,
    content_hash: card.contentHash,
    status: "ready",
    times_used: 0,
    created_from_vault_at: new Date().toISOString(),
  }));

  // Insert in batches to avoid timeout
  const safeBatchSize = Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 50;
  for (let i = 0; i < records.length; i += safeBatchSize) {
    const batch = records.slice(i, i + safeBatchSize);

    const { error } = await client.from("line_cards").insert(batch);

    if (error) {
      stats.errors.push(`Batch insert error: ${error.message}`);
      console.error(`❌ Batch ${Math.floor(i / safeBatchSize) + 1} failed:`, error.message);
    } else {
      stats.newCardsInserted += batch.length;
      console.log(
        `✅ Batch ${Math.floor(i / safeBatchSize) + 1}: Inserted ${batch.length} cards`
      );
    }
  }

  return stats;
}

/**
 * Get statistics about cards in database
 */
export async function getCardStats(client: SupabaseClient): Promise<{
  total: number;
  byTheme: Record<string, number>;
  byStatus: Record<string, number>;
}> {
  const { data: themeStats, error: themeError } = await client
    .from("line_cards")
    .select("theme")
    .then((res) => ({
      data: res.data,
      error: res.error,
    }));

  if (themeError) {
    throw new Error(`Failed to fetch theme stats: ${themeError.message}`);
  }

  const { data: statusStats, error: statusError } = await client
    .from("line_cards")
    .select("status")
    .then((res) => ({
      data: res.data,
      error: res.error,
    }));

  if (statusError) {
    throw new Error(`Failed to fetch status stats: ${statusError.message}`);
  }

  const byTheme: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  (themeStats || []).forEach((row) => {
    byTheme[row.theme] = (byTheme[row.theme] || 0) + 1;
  });

  (statusStats || []).forEach((row) => {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  });

  return {
    total: themeStats?.length || 0,
    byTheme,
    byStatus,
  };
}
