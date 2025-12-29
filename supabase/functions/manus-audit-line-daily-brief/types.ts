/**
 * Manus Audit 型定義
 */

export type CardTheme =
  | "ai_gov"
  | "tax"
  | "law"
  | "biz"
  | "career"
  | "asset"
  | "general";
export type AuditMode = "daily" | "weekly" | "monthly";
export type AuditTrigger = AuditMode | "report";

export interface CardInventory {
  theme: CardTheme;
  ready_cards: number;
  used_cards: number;
  total_cards: number;
}

export interface BroadcastStats {
  date: string;
  total: number;
  successful: number;
  failed: number;
  success_rate: number;
}

export interface CheckResult<T = unknown> {
  passed: boolean;
  warnings: string[];
  details?: T;
}

export interface CardInventoryCheckResult extends CheckResult<CardInventory[]> {
  details: CardInventory[];
}

export interface BroadcastCheckResult extends CheckResult<BroadcastStats[]> {
  details: BroadcastStats[];
}

export interface DatabaseHealthCheckResult extends CheckResult {
  duplicates?: number;
  anomalies?: string[];
}

// ===== LINE Registration Health Check Types =====

/** 基本のヘルスチェック結果 */
export interface BaseHealthResult {
  passed: boolean;
  error?: string;
}

/** レスポンス時間付きヘルスチェック結果 */
export interface ResponseTimeHealthResult extends BaseHealthResult {
  responseTime?: number;
}

/** Google Sheets同期チェック結果 */
export interface SheetsSyncResult extends BaseHealthResult {
  lastUpdate?: string;
}

/** LINE Bot APIヘルスチェック結果 */
export interface LineBotHealthResult extends BaseHealthResult {
  botName?: string;
}

/** 最近のインタラクションチェック結果 */
export interface RecentInteractionsResult extends BaseHealthResult {
  lastInteraction?: string;
  count?: number;
}

/** LINE登録システムチェック詳細 */
export interface LineRegistrationDetails {
  webhookHealth: ResponseTimeHealthResult;
  apiHealth: ResponseTimeHealthResult;
  googleSheetsSync: SheetsSyncResult;
  landingPageAccess: ResponseTimeHealthResult;
  lineBotHealth: LineBotHealthResult;
  recentInteractions: RecentInteractionsResult;
}

export interface LineRegistrationCheckResult
  extends CheckResult<LineRegistrationDetails> {
  details: LineRegistrationDetails;
}

// ===== Maintenance & Remediation Types =====

export interface MaintenanceResult {
  archivedBroadcasts: number;
  archivedCards: number;
}

export interface RemediationResult {
  triggered: boolean;
  taskId?: string | undefined;
  taskUrl?: string | undefined;
  error?: string | undefined;
}

export interface AuditResult {
  timestamp: string;
  mode: AuditTrigger;
  checks: {
    cardInventory: CardInventoryCheckResult;
    broadcastSuccess: BroadcastCheckResult;
    databaseHealth?: DatabaseHealthCheckResult;
    lineRegistrationSystem?: LineRegistrationCheckResult;
  };
  maintenance?: MaintenanceResult;
  summary: {
    allPassed: boolean;
    warningCount: number;
    errorCount: number;
  };
  remediation?: RemediationResult;
}
