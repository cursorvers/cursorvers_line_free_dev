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

export interface LineRegistrationCheckResult extends CheckResult {
  details: {
    webhookHealth: { passed: boolean; responseTime?: number; error?: string };
    apiHealth: { passed: boolean; responseTime?: number; error?: string };
    googleSheetsSync: { passed: boolean; lastUpdate?: string; error?: string };
    landingPageAccess: {
      passed: boolean;
      responseTime?: number;
      error?: string;
    };
  };
}

export interface MaintenanceResult {
  archivedBroadcasts: number;
  archivedCards: number;
}

export interface RemediationResult {
  triggered: boolean;
  taskId?: string;
  taskUrl?: string;
  error?: string;
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
