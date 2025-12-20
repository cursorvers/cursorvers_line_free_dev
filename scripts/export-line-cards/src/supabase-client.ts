/**
 * Supabase Client for LINE Cards
 * Includes retry logic for transient failures
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  ExtractedCard,
  LineCardInsert,
  ExtractionStats,
} from "./types.ts";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute with retry logic
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`⚠️  ${operationName} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`);
        console.log(`   Error: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`${operationName} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

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
  return withRetry(async () => {
    const { data, error } = await client
      .from("line_cards")
      .select("content_hash");

    if (error) {
      throw new Error(`Failed to fetch existing hashes: ${error.message}`);
    }

    return new Set((data || []).map((row) => row.content_hash));
  }, "Fetch existing hashes");
}

/**
 * Insert a batch of cards with retry
 */
async function insertBatch(
  client: SupabaseClient,
  batch: LineCardInsert[],
  batchNumber: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await withRetry(async () => {
      const { error } = await client.from("line_cards").insert(batch);
      if (error) {
        throw new Error(error.message);
      }
    }, `Batch ${batchNumber} insert`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  const totalBatches = Math.ceil(records.length / safeBatchSize);

  for (let i = 0; i < records.length; i += safeBatchSize) {
    const batch = records.slice(i, i + safeBatchSize);
    const batchNumber = Math.floor(i / safeBatchSize) + 1;

    const result = await insertBatch(client, batch, batchNumber);

    if (result.success) {
      stats.newCardsInserted += batch.length;
      console.log(`✅ Batch ${batchNumber}/${totalBatches}: Inserted ${batch.length} cards`);
    } else {
      stats.errors.push(`Batch ${batchNumber} error: ${result.error}`);
      console.error(`❌ Batch ${batchNumber}/${totalBatches} failed: ${result.error}`);
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
  return withRetry(async () => {
    const { data: themeData, error: themeError } = await client
      .from("line_cards")
      .select("theme");

    if (themeError) {
      throw new Error(`Failed to fetch theme stats: ${themeError.message}`);
    }

    const { data: statusData, error: statusError } = await client
      .from("line_cards")
      .select("status");

    if (statusError) {
      throw new Error(`Failed to fetch status stats: ${statusError.message}`);
    }

    const byTheme: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    (themeData || []).forEach((row) => {
      byTheme[row.theme] = (byTheme[row.theme] || 0) + 1;
    });

    (statusData || []).forEach((row) => {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    });

    return {
      total: themeData?.length || 0,
      byTheme,
      byStatus,
    };
  }, "Fetch card stats");
}
