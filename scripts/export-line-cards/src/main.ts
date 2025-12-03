/**
 * LINE Cards Export Script - Main Entry Point
 * 
 * Extracts #cv_line tagged lines from Obsidian vault and syncs to Supabase
 * 
 * Usage:
 *   deno task export              # Run sync
 *   deno task export --dry-run    # Preview only
 */

import { parseArgs } from "https://deno.land/std@0.210.0/cli/parse_args.ts";
import { extractCardsFromVault } from "./extractor.ts";
import {
  createSupabaseClient,
  getExistingHashes,
  insertCards,
  getCardStats,
} from "./supabase-client.ts";
import { ExportConfig, ExtractionStats } from "./types.ts";

/**
 * Load configuration from environment variables
 */
function loadConfig(): ExportConfig {
  const args = parseArgs(Deno.args, {
    boolean: ["dry-run", "help"],
    alias: { d: "dry-run", h: "help" },
  });

  if (args.help) {
    console.log(`
LINE Cards Export Script

Usage:
  deno task export [options]

Options:
  --dry-run, -d    Preview extraction without writing to database
  --help, -h       Show this help message

Environment Variables:
  VAULT_PATH                Path to Obsidian vault (default: /Users/masayuki/Obsidian Professional Kit)
  SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Supabase service role key
  BATCH_SIZE                Insert batch size (default: 50)
`);
    Deno.exit(0);
  }

  const vaultPath =
    Deno.env.get("VAULT_PATH") || "/Users/masayuki/Obsidian Professional Kit";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!args["dry-run"]) {
    if (!supabaseUrl) {
      console.error("❌ SUPABASE_URL environment variable is required");
      Deno.exit(1);
    }
    if (!supabaseServiceKey) {
      console.error("❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required");
      Deno.exit(1);
    }
  }

  return {
    vaultPath,
    supabaseUrl: supabaseUrl || "",
    supabaseServiceKey: supabaseServiceKey || "",
    dryRun: args["dry-run"] || false,
    batchSize: (() => {
      const envBatchSize = Deno.env.get("BATCH_SIZE");
      const parsed = envBatchSize ? Number(envBatchSize) : 50;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
    })(),
  };
}

/**
 * Print extraction summary
 */
function printSummary(stats: ExtractionStats): void {
  console.log("\n" + "=".repeat(50));
  console.log("📊 Export Summary");
  console.log("=".repeat(50));
  console.log(`  Total cards found:    ${stats.totalCardsFound}`);
  console.log(`  New cards inserted:   ${stats.newCardsInserted}`);
  console.log(`  Duplicates skipped:   ${stats.duplicatesSkipped}`);

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors (${stats.errors.length}):`);
    stats.errors.slice(0, 10).forEach((err) => console.log(`    - ${err}`));
    if (stats.errors.length > 10) {
      console.log(`    ... and ${stats.errors.length - 10} more`);
    }
  }
  console.log("=".repeat(50) + "\n");
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log("\n🚀 LINE Cards Export Script\n");

  const config = loadConfig();

  console.log(`📁 Vault path: ${config.vaultPath}`);
  console.log(`🔧 Mode: ${config.dryRun ? "DRY RUN (no database writes)" : "LIVE"}\n`);
  if (!config.dryRun) {
    console.log(`📦 Batch size: ${config.batchSize}`);
  }

  // Step 1: Extract cards from vault
  console.log("📖 Step 1: Extracting cards from vault...\n");
  const { cards, results } = await extractCardsFromVault(config.vaultPath);

  // Show extraction preview
  if (cards.length > 0) {
    console.log("\n📝 Sample cards found:");
    cards.slice(0, 3).forEach((card, i) => {
      console.log(`\n  [${i + 1}] ${card.sourcePath}:${card.sourceLine}`);
      console.log(`      Theme: ${card.theme}`);
      console.log(`      Body: ${card.body.substring(0, 80)}...`);
    });
    if (cards.length > 3) {
      console.log(`\n  ... and ${cards.length - 3} more cards`);
    }
  }

  // Exit early if dry run
  if (config.dryRun) {
    console.log("\n🔍 DRY RUN - No database operations performed");
    console.log(`\n✅ Would sync ${cards.length} cards to database`);
    
    // Show theme distribution
    const themeCount: Record<string, number> = {};
    cards.forEach((card) => {
      themeCount[card.theme] = (themeCount[card.theme] || 0) + 1;
    });
    console.log("\n📊 Theme distribution:");
    Object.entries(themeCount).forEach(([theme, count]) => {
      console.log(`    ${theme}: ${count}`);
    });
    
    return;
  }

  // Step 2: Connect to Supabase
  console.log("\n🔌 Step 2: Connecting to Supabase...");
  const client = createSupabaseClient(config.supabaseUrl, config.supabaseServiceKey);

  // Step 3: Get existing hashes for deduplication
  console.log("🔍 Step 3: Checking for existing cards...");
  const existingHashes = await getExistingHashes(client);
  console.log(`   Found ${existingHashes.size} existing cards in database`);

  // Step 4: Insert new cards
  console.log("\n💾 Step 4: Inserting new cards...");
  const stats = await insertCards(client, cards, existingHashes, config.batchSize);

  // Print summary
  printSummary(stats);

  // Show current database stats
  console.log("📈 Current database stats:");
  const dbStats = await getCardStats(client);
  console.log(`   Total cards: ${dbStats.total}`);
  console.log("   By theme:");
  Object.entries(dbStats.byTheme).forEach(([theme, count]) => {
    console.log(`     ${theme}: ${count}`);
  });
  console.log("   By status:");
  Object.entries(dbStats.byStatus).forEach(([status, count]) => {
    console.log(`     ${status}: ${count}`);
  });

  console.log("\n✅ Export complete!\n");
}

// Run
main().catch((err) => {
  console.error("❌ Fatal error:", err);
  Deno.exit(1);
});
