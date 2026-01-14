/**
 * カード在庫チェック
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../../_shared/logger.ts";
import {
  CardInventory,
  CardInventoryCheckResult,
  CardTheme,
} from "../types.ts";

const log = createLogger("audit-card-inventory");

const THEMES: CardTheme[] = [
  "ai_gov",
  "tax",
  "law",
  "biz",
  "career",
  "asset",
  "general",
];
const MIN_READY_CARDS = 50;

/** RPC応答の行の型定義 */
interface RpcInventoryRow {
  theme: string;
  ready_count: number | bigint | null;
  used_count: number | bigint | null;
  archived_count: number | bigint | null;
  total_count: number | bigint | null;
}

/**
 * RPC応答の形式を検証する型ガード
 */
function isValidRpcRow(row: unknown): row is RpcInventoryRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.theme === "string" &&
    (r.ready_count === null || typeof r.ready_count === "number" ||
      typeof r.ready_count === "bigint") &&
    (r.used_count === null || typeof r.used_count === "number" ||
      typeof r.used_count === "bigint") &&
    (r.archived_count === null || typeof r.archived_count === "number" ||
      typeof r.archived_count === "bigint") &&
    (r.total_count === null || typeof r.total_count === "number" ||
      typeof r.total_count === "bigint")
  );
}

/**
 * テーマが有効かどうかを検証
 */
function isValidTheme(theme: string): theme is CardTheme {
  return THEMES.includes(theme as CardTheme);
}

export async function checkCardInventory(
  client: SupabaseClient,
): Promise<CardInventoryCheckResult> {
  log.info("Checking card inventory");

  // RPC関数を使用してサーバーサイドで集計（1000件制限を回避）
  const { data, error } = await client.rpc("get_card_inventory_stats");

  if (error) {
    log.error("Failed to fetch card inventory", { error: error.message });
    return {
      passed: false,
      warnings: [`Failed to fetch inventory: ${error.message}`],
      details: [],
    };
  }

  // RPC結果をinventory形式に変換
  const inventory: Record<
    CardTheme,
    { ready: number; used: number; archived: number; total: number }
  > = {
    ai_gov: { ready: 0, used: 0, archived: 0, total: 0 },
    tax: { ready: 0, used: 0, archived: 0, total: 0 },
    law: { ready: 0, used: 0, archived: 0, total: 0 },
    biz: { ready: 0, used: 0, archived: 0, total: 0 },
    career: { ready: 0, used: 0, archived: 0, total: 0 },
    asset: { ready: 0, used: 0, archived: 0, total: 0 },
    general: { ready: 0, used: 0, archived: 0, total: 0 },
  };

  // RPC応答のバリデーションと処理
  for (const row of data || []) {
    // 型ガードでRPC応答の形式を検証
    if (!isValidRpcRow(row)) {
      log.warn("Invalid RPC row format, skipping", { row });
      continue;
    }

    // テーマが有効か検証
    if (!isValidTheme(row.theme)) {
      log.warn("Unknown theme in RPC response, skipping", { theme: row.theme });
      continue;
    }

    // 安全に数値変換（nullish coalescingで0をフォールバック）
    inventory[row.theme].ready = Number(row.ready_count ?? 0);
    inventory[row.theme].used = Number(row.used_count ?? 0);
    inventory[row.theme].archived = Number(row.archived_count ?? 0);
    inventory[row.theme].total = Number(row.total_count ?? 0);
  }

  const details: CardInventory[] = THEMES.map((theme) => ({
    theme,
    ready_cards: inventory[theme].ready,
    used_cards: inventory[theme].used,
    total_cards: inventory[theme].total,
  }));

  const warnings: string[] = [];
  let allPassed = true;

  for (const item of details) {
    if (item.ready_cards === 0) {
      warnings.push(`🚨 緊急: ${item.theme}テーマのreadyカードが0枚です！`);
      allPassed = false;
    } else if (item.ready_cards < MIN_READY_CARDS) {
      warnings.push(
        `⚠️ 警告: ${item.theme}テーマのreadyカードが${item.ready_cards}枚（${MIN_READY_CARDS}枚未満）`,
      );
      allPassed = false;
    }
  }

  log.info("Card inventory check completed", {
    passed: allPassed,
    warningCount: warnings.length,
  });

  return { passed: allPassed, warnings, details };
}
