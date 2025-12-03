#!/usr/bin/env node
// scripts/export-line-cards/src/index.ts
// Obsidian Vault から #cv_line タグ付き行を Supabase に同期するスクリプト

import { DEFAULT_CONFIG, extractAllCards } from "./parser.js";
import { syncCardsToSupabase, getCardStats } from "./uploader.js";
import { ParserConfig } from "./types.js";

/**
 * メイン処理
 */
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("  Obsidian → Supabase LINE Cards Sync");
  console.log("═══════════════════════════════════════════\n");

  // コマンドライン引数からVaultパスを取得（オプション）
  const vaultPath = process.argv[2] || DEFAULT_CONFIG.vaultPath;

  const config: ParserConfig = {
    ...DEFAULT_CONFIG,
    vaultPath,
  };

  console.log(`📁 Vault: ${config.vaultPath}`);
  console.log(`🏷️  対象タグ: ${config.cardTag}`);
  console.log(`📖 コンテキスト行: ${config.includeContext ? config.contextLines : "なし"}\n`);

  // 環境変数チェック
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ 環境変数が設定されていません:");
    console.error("   - SUPABASE_URL");
    console.error("   - SUPABASE_SERVICE_ROLE_KEY");
    console.error("\n使用例:");
    console.error("  export SUPABASE_URL=https://xxx.supabase.co");
    console.error("  export SUPABASE_SERVICE_ROLE_KEY=xxx");
    console.error("  npm run export");
    process.exit(1);
  }

  try {
    // Phase 1: カードを抽出
    console.log("═══ Phase 1: カード抽出 ═══\n");
    const cards = extractAllCards(config);

    if (cards.length === 0) {
      console.log("\n⚠️  カードが見つかりませんでした。");
      console.log(`   「${config.cardTag}」タグが付いた行があるか確認してください。`);
      return;
    }

    // Phase 2: Supabaseに同期
    console.log("\n═══ Phase 2: Supabase同期 ═══");
    const result = await syncCardsToSupabase(cards);

    // Phase 3: 統計表示
    console.log("\n═══ Phase 3: 統計情報 ═══");
    await getCardStats();

    // サマリー
    console.log("\n═══════════════════════════════════════════");
    console.log("  同期完了！");
    console.log("═══════════════════════════════════════════");
    console.log(`  抽出カード数: ${result.totalCardsFound}`);
    console.log(`  新規追加: ${result.newCardsInserted}`);
    console.log(`  スキップ: ${result.duplicatesSkipped}`);
    if (result.errors.length > 0) {
      console.log(`  エラー: ${result.errors.length}`);
    }
  } catch (error) {
    console.error("\n❌ 致命的エラー:", error);
    process.exit(1);
  }
}

// 実行
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

