/**
 * 月次メンテナンス処理
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../_shared/logger.ts";
import { MaintenanceResult } from "./types.ts";

const log = createLogger("audit-maintenance");

const ARCHIVE_BROADCAST_DAYS = 90;
const ARCHIVE_CARD_DAYS = 365;
const ARCHIVE_BATCH_SIZE = 100;

export async function performMaintenance(
  client: SupabaseClient
): Promise<MaintenanceResult> {
  log.info("Performing monthly maintenance");

  const archivedBroadcasts = await countOldBroadcasts(client);
  const archivedCards = await archiveUnusedCards(client);

  return { archivedBroadcasts, archivedCards };
}

async function countOldBroadcasts(client: SupabaseClient): Promise<number> {
  const cutoffDate = new Date(Date.now() - ARCHIVE_BROADCAST_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Note: We don't actually delete, just count for reference
  // In a real implementation, you might move to an archive table
  const { count } = await client
    .from("line_card_broadcasts")
    .select("*", { count: "exact", head: true })
    .lt("sent_at", cutoffDate);

  const archivedBroadcasts = count || 0;

  if (archivedBroadcasts > 0) {
    log.info("Found old broadcast records", { count: archivedBroadcasts });
  }

  return archivedBroadcasts;
}

async function archiveUnusedCards(client: SupabaseClient): Promise<number> {
  const cutoffDate = new Date(Date.now() - ARCHIVE_CARD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: unusedCards, error: unusedError } = await client
    .from("line_cards")
    .select("id")
    .eq("status", "ready")
    .or(`last_used_at.is.null,last_used_at.lt.${cutoffDate}`)
    .limit(ARCHIVE_BATCH_SIZE);

  if (unusedError || !unusedCards || unusedCards.length === 0) {
    return 0;
  }

  const updateResult = await client
    .from("line_cards")
    .update({ status: "archived" })
    .in("id", unusedCards.map((c) => c.id))
    .select();

  const count = updateResult.data?.length ?? 0;

  const archivedCards = count || 0;
  log.info("Archived unused cards", { count: archivedCards });

  return archivedCards;
}
