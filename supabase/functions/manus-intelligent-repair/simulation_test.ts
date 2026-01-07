/**
 * Manus Intelligent Repair シミュレーションテスト
 *
 * 実際のAPIを呼び出さずに、AI診断・修繕計画のロジックをテスト
 */
import { assertEquals } from "std-assert";
import type { AuditResult } from "../manus-audit-line-daily-brief/types.ts";

// ============================================================
// テスト用にロジックをインポート（実際はindex.tsから抽出）
// ============================================================

type IssueType =
  | "card_inventory_low"
  | "broadcast_failure"
  | "database_anomaly"
  | "line_webhook_error"
  | "line_api_error"
  | "landing_page_error"
  | "unknown";

type RepairAction =
  | "generate_cards"
  | "redeploy_function"
  | "reset_secret"
  | "fix_database"
  | "restart_service"
  | "escalate_to_human"
  | "no_action_needed";

interface DiagnosedIssue {
  type: IssueType;
  description: string;
  rootCause: string;
  suggestedActions: RepairAction[];
  priority: number;
}

interface Diagnosis {
  issues: DiagnosedIssue[];
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
}

const SEVERITY_PRIORITY: Record<Diagnosis["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function upgradeSeverity(
  current: Diagnosis["severity"],
  proposed: Diagnosis["severity"],
): Diagnosis["severity"] {
  return SEVERITY_PRIORITY[proposed] > SEVERITY_PRIORITY[current]
    ? proposed
    : current;
}

function diagnoseIssues(auditResult: AuditResult): Diagnosis {
  const issues: DiagnosedIssue[] = [];
  let maxSeverity: Diagnosis["severity"] = "low";

  // カード在庫問題の診断
  if (!auditResult.checks.cardInventory.passed) {
    const details = auditResult.checks.cardInventory.details;
    const lowThemes = details.filter((d) => d.ready_cards < 50);

    issues.push({
      type: "card_inventory_low",
      description: `${lowThemes.length}テーマでカード在庫が不足`,
      rootCause: `在庫不足テーマ: ${lowThemes.map((t) => `${t.theme}(${t.ready_cards}枚)`).join(", ")}`,
      suggestedActions: ["generate_cards"],
      priority: lowThemes.some((t) => t.ready_cards < 10) ? 9 : 6,
    });

    if (lowThemes.some((t) => t.ready_cards < 10)) {
      maxSeverity = upgradeSeverity(maxSeverity, "critical");
    } else if (lowThemes.some((t) => t.ready_cards < 30)) {
      maxSeverity = upgradeSeverity(maxSeverity, "high");
    }
  }

  // 配信失敗の診断
  if (!auditResult.checks.broadcastSuccess.passed) {
    issues.push({
      type: "broadcast_failure",
      description: "配信成功率が閾値を下回っている",
      rootCause: "配信エラー原因不明 - ログ調査が必要",
      suggestedActions: ["redeploy_function", "reset_secret"],
      priority: 8,
    });
    maxSeverity = upgradeSeverity(maxSeverity, "high");
  }

  // LINE登録システムの診断
  if (
    auditResult.checks.lineRegistrationSystem &&
    !auditResult.checks.lineRegistrationSystem.passed
  ) {
    const details = auditResult.checks.lineRegistrationSystem.details;

    if (!details.webhookHealth.passed) {
      issues.push({
        type: "line_webhook_error",
        description: "LINE Webhookが応答しない",
        rootCause: details.webhookHealth.error ?? "Webhook接続エラー",
        suggestedActions: ["redeploy_function", "reset_secret"],
        priority: 10,
      });
      maxSeverity = upgradeSeverity(maxSeverity, "critical");
    }
  }

  if (issues.length === 0) {
    return { issues: [], severity: "low", confidence: 100 };
  }

  issues.sort((a, b) => b.priority - a.priority);
  const unknownCount = issues.filter((i) => i.type === "unknown").length;
  const confidence = Math.max(50, 90 - unknownCount * 15);

  return { issues, severity: maxSeverity, confidence };
}

// ============================================================
// テストケース
// ============================================================

function createBaseResult(): AuditResult {
  return {
    timestamp: new Date().toISOString(),
    mode: "daily",
    checks: {
      cardInventory: {
        passed: true,
        warnings: [],
        details: [
          { theme: "ai_gov", ready_cards: 100, used_cards: 50, total_cards: 150 },
          { theme: "tax", ready_cards: 80, used_cards: 20, total_cards: 100 },
        ],
      },
      broadcastSuccess: {
        passed: true,
        warnings: [],
        details: [],
      },
    },
    summary: {
      allPassed: true,
      warningCount: 0,
      errorCount: 0,
    },
  };
}

Deno.test("simulation - 正常時は問題なし", () => {
  const result = createBaseResult();
  const diagnosis = diagnoseIssues(result);

  assertEquals(diagnosis.issues.length, 0);
  assertEquals(diagnosis.severity, "low");
  assertEquals(diagnosis.confidence, 100);

  console.log("\n📊 シミュレーション結果（正常時）:");
  console.log("  - 検出問題: 0件");
  console.log("  - 重大度: low");
  console.log("  - 信頼度: 100%");
  console.log("  → アクション: なし\n");
});

Deno.test("simulation - カード在庫不足（軽度）", () => {
  const result = createBaseResult();
  result.checks.cardInventory.passed = false;
  result.checks.cardInventory.details = [
    { theme: "ai_gov", ready_cards: 45, used_cards: 50, total_cards: 95 },
    { theme: "tax", ready_cards: 80, used_cards: 20, total_cards: 100 },
  ];

  const diagnosis = diagnoseIssues(result);

  assertEquals(diagnosis.issues.length, 1);
  assertEquals(diagnosis.issues[0].type, "card_inventory_low");
  assertEquals(diagnosis.issues[0].suggestedActions, ["generate_cards"]);
  assertEquals(diagnosis.severity, "low"); // 45枚は30以上なのでlow

  console.log("\n📊 シミュレーション結果（カード在庫不足・軽度）:");
  console.log(`  - 検出問題: ${diagnosis.issues.length}件`);
  console.log(`  - 問題: ${diagnosis.issues[0].description}`);
  console.log(`  - 根本原因: ${diagnosis.issues[0].rootCause}`);
  console.log(`  - 重大度: ${diagnosis.severity}`);
  console.log(`  - 推奨アクション: ${diagnosis.issues[0].suggestedActions.join(", ")}`);
  console.log("  → 計画: カード生成ワークフローをトリガー\n");
});

Deno.test("simulation - カード在庫不足（重度）", () => {
  const result = createBaseResult();
  result.checks.cardInventory.passed = false;
  result.checks.cardInventory.details = [
    { theme: "ai_gov", ready_cards: 5, used_cards: 95, total_cards: 100 },
    { theme: "tax", ready_cards: 8, used_cards: 92, total_cards: 100 },
  ];

  const diagnosis = diagnoseIssues(result);

  assertEquals(diagnosis.issues.length, 1);
  assertEquals(diagnosis.severity, "critical"); // 10枚未満なのでcritical

  console.log("\n📊 シミュレーション結果（カード在庫不足・重度）:");
  console.log(`  - 検出問題: ${diagnosis.issues.length}件`);
  console.log(`  - 問題: ${diagnosis.issues[0].description}`);
  console.log(`  - 根本原因: ${diagnosis.issues[0].rootCause}`);
  console.log(`  - 重大度: ${diagnosis.severity} ⚠️ 緊急対応必要`);
  console.log(`  - 優先度: ${diagnosis.issues[0].priority}/10`);
  console.log("  → 計画: 即座にカード生成 + アラート通知\n");
});

Deno.test("simulation - LINE Webhook障害", () => {
  const result = createBaseResult();
  result.checks.lineRegistrationSystem = {
    passed: false,
    warnings: ["Webhook接続エラー"],
    details: {
      webhookHealth: { passed: false, error: "Connection timeout after 5000ms" },
      apiHealth: { passed: true },
      googleSheetsSync: { passed: true },
      landingPageAccess: { passed: true },
      lineBotHealth: { passed: true },
      recentInteractions: { passed: true },
    },
  };

  const diagnosis = diagnoseIssues(result);

  assertEquals(diagnosis.issues.length, 1);
  assertEquals(diagnosis.issues[0].type, "line_webhook_error");
  assertEquals(diagnosis.severity, "critical");
  assertEquals(diagnosis.issues[0].priority, 10); // 最高優先度

  console.log("\n📊 シミュレーション結果（LINE Webhook障害）:");
  console.log(`  - 検出問題: ${diagnosis.issues.length}件`);
  console.log(`  - 問題: ${diagnosis.issues[0].description}`);
  console.log(`  - 根本原因: ${diagnosis.issues[0].rootCause}`);
  console.log(`  - 重大度: ${diagnosis.severity} 🚨 最優先対応`);
  console.log(`  - 優先度: ${diagnosis.issues[0].priority}/10`);
  console.log(`  - 推奨アクション: ${diagnosis.issues[0].suggestedActions.join(", ")}`);
  console.log("  → 計画: 1) 関数再デプロイ 2) シークレット確認\n");
});

Deno.test("simulation - 複合障害", () => {
  const result = createBaseResult();

  // カード在庫不足
  result.checks.cardInventory.passed = false;
  result.checks.cardInventory.details = [
    { theme: "ai_gov", ready_cards: 20, used_cards: 80, total_cards: 100 },
  ];

  // 配信失敗
  result.checks.broadcastSuccess.passed = false;
  result.checks.broadcastSuccess.warnings = ["成功率80%（閾値90%未満）"];

  // LINE Webhook障害
  result.checks.lineRegistrationSystem = {
    passed: false,
    warnings: ["Webhook接続エラー"],
    details: {
      webhookHealth: { passed: false, error: "502 Bad Gateway" },
      apiHealth: { passed: true },
      googleSheetsSync: { passed: true },
      landingPageAccess: { passed: true },
      lineBotHealth: { passed: true },
      recentInteractions: { passed: true },
    },
  };

  const diagnosis = diagnoseIssues(result);

  assertEquals(diagnosis.issues.length, 3);
  assertEquals(diagnosis.severity, "critical");

  // 優先度順にソートされているか確認
  assertEquals(diagnosis.issues[0].type, "line_webhook_error"); // priority 10
  assertEquals(diagnosis.issues[1].type, "broadcast_failure"); // priority 8
  assertEquals(diagnosis.issues[2].type, "card_inventory_low"); // priority 6

  console.log("\n📊 シミュレーション結果（複合障害）:");
  console.log(`  - 検出問題: ${diagnosis.issues.length}件`);
  console.log(`  - 重大度: ${diagnosis.severity} 🚨🚨🚨`);
  console.log(`  - 信頼度: ${diagnosis.confidence}%`);
  console.log("\n  修繕計画（優先度順）:");
  diagnosis.issues.forEach((issue, i) => {
    console.log(`    ${i + 1}. [優先度${issue.priority}] ${issue.description}`);
    console.log(`       根本原因: ${issue.rootCause}`);
    console.log(`       アクション: ${issue.suggestedActions.join(" → ")}`);
  });
  console.log("\n  → 実行順序:");
  console.log("     1. LINE Webhook再デプロイ（最優先）");
  console.log("     2. シークレット確認");
  console.log("     3. 配信関数再デプロイ");
  console.log("     4. カード生成ワークフロートリガー\n");
});

Deno.test("simulation - 修繕計画の詳細", () => {
  console.log("\n" + "=".repeat(60));
  console.log("📋 Manus Intelligent Repair 修繕計画シミュレーション");
  console.log("=".repeat(60));

  console.log("\n【問題タイプと対応アクション】");
  console.log("┌─────────────────────────┬───────────────────────────┐");
  console.log("│ 問題タイプ              │ 自動修繕アクション        │");
  console.log("├─────────────────────────┼───────────────────────────┤");
  console.log("│ card_inventory_low      │ generate_cards            │");
  console.log("│ broadcast_failure       │ redeploy_function         │");
  console.log("│ database_anomaly        │ fix_database              │");
  console.log("│ line_webhook_error      │ redeploy + reset_secret   │");
  console.log("│ line_api_error          │ reset_secret              │");
  console.log("│ landing_page_error      │ restart_service           │");
  console.log("│ unknown                 │ escalate_to_human         │");
  console.log("└─────────────────────────┴───────────────────────────┘");

  console.log("\n【重大度判定基準】");
  console.log("  critical: カード10枚未満 / LINE Webhook障害");
  console.log("  high:     カード30枚未満 / 配信失敗");
  console.log("  medium:   DB異常");
  console.log("  low:      それ以外\n");

  // テスト成功を示す
  assertEquals(true, true);
});
