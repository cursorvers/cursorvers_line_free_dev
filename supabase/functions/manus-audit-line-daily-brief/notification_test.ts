/**
 * notification.ts ユニットテスト
 */
import { assertEquals } from "std-assert";
import { buildNotificationMessage } from "./notification.ts";
import type { AuditResult } from "./types.ts";

// テスト用のベースとなるAuditResult
function createBaseResult(overrides?: Partial<AuditResult>): AuditResult {
  return {
    timestamp: "2025-12-21T10:00:00.000Z",
    mode: "daily",
    checks: {
      cardInventory: {
        passed: true,
        warnings: [],
        details: [],
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
    ...overrides,
  };
}

Deno.test("notification - buildNotificationMessage", async (t) => {
  await t.step("includes mode in header", () => {
    const result = createBaseResult({ mode: "daily" });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("(daily)"), true);
  });

  await t.step("includes mode weekly", () => {
    const result = createBaseResult({ mode: "weekly" });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("(weekly)"), true);
  });

  await t.step("shows checkmark for passed audit", () => {
    const result = createBaseResult();
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("✅"), true);
    assertEquals(message.includes("正常"), true);
  });

  await t.step("shows warning emoji for warnings", () => {
    const result = createBaseResult({
      summary: {
        allPassed: false,
        warningCount: 2,
        errorCount: 0,
      },
      checks: {
        cardInventory: {
          passed: false,
          warnings: ["警告1", "警告2"],
          details: [],
        },
        broadcastSuccess: {
          passed: true,
          warnings: [],
          details: [],
        },
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("⚠️"), true);
    assertEquals(message.includes("警告あり"), true);
  });

  await t.step("shows error emoji for errors", () => {
    const result = createBaseResult({
      summary: {
        allPassed: false,
        warningCount: 0,
        errorCount: 1,
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("🚨"), true);
    assertEquals(message.includes("エラー検出"), true);
  });

  await t.step("includes warning messages", () => {
    const result = createBaseResult({
      summary: {
        allPassed: false,
        warningCount: 1,
        errorCount: 0,
      },
      checks: {
        cardInventory: {
          passed: false,
          warnings: ["テスト警告メッセージ"],
          details: [],
        },
        broadcastSuccess: {
          passed: true,
          warnings: [],
          details: [],
        },
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("テスト警告メッセージ"), true);
  });

  await t.step("includes summary for non-admin audience", () => {
    const result = createBaseResult();
    const message = buildNotificationMessage(result, "manus");
    assertEquals(message.includes("サマリー"), true);
  });

  await t.step("includes remediation info when triggered", () => {
    const result = createBaseResult({
      remediation: {
        triggered: true,
        taskUrl: "https://manus.example.com/task/123",
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("自動修繕"), true);
    assertEquals(
      message.includes("https://manus.example.com/task/123"),
      true,
    );
  });

  await t.step("includes remediation error when failed", () => {
    const result = createBaseResult({
      remediation: {
        triggered: true,
        error: "API connection failed",
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("自動修繕失敗"), true);
    assertEquals(message.includes("API connection failed"), true);
  });

  await t.step(
    "includes manual intervention notice when bounded repair skips",
    () => {
      const result = createBaseResult({
        remediation: {
          triggered: true,
          error:
            "generate_cards: manual intervention required (MANUS_GITHUB_TOKEN/GITHUB_TOKEN not configured)",
        },
      });
      const message = buildNotificationMessage(result, "admin");
      assertEquals(message.includes("手動対応待ち"), true);
      assertEquals(message.includes("manual intervention required"), true);
    },
  );

  await t.step("includes remediation summary when repair succeeds", () => {
    const result = createBaseResult({
      remediation: {
        triggered: true,
        summary: {
          totalSteps: 3,
          successCount: 3,
          failedCount: 0,
          skippedCount: 0,
          overallStatus: "success",
        },
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("自動修繕完了"), true);
    assertEquals(message.includes("成功 3件 / 全 3件"), true);
  });

  await t.step("includes remediation summary when repair is partial", () => {
    const result = createBaseResult({
      remediation: {
        triggered: true,
        error:
          "generate_cards: manual intervention required (MANUS_GITHUB_TOKEN/GITHUB_TOKEN not configured)",
        summary: {
          totalSteps: 3,
          successCount: 1,
          failedCount: 0,
          skippedCount: 2,
          overallStatus: "partial",
        },
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("一部自動修繕完了"), true);
    assertEquals(message.includes("成功 1件 / 失敗 0件 / スキップ 2件"), true);
    assertEquals(message.includes("manual intervention required"), true);
  });

  await t.step(
    "includes manual-required summary when all steps are skipped",
    () => {
      const result = createBaseResult({
        remediation: {
          triggered: true,
          error:
            "generate_cards: manual intervention required (MANUS_GITHUB_TOKEN/GITHUB_TOKEN not configured)",
          actions: [
            {
              action: "generate_cards",
              target: "line_cards",
              params: { themes: ["asset"], count: 50 },
            },
            {
              action: "redeploy_function",
              target: "line-daily-brief",
              params: { noVerifyJwt: false },
            },
            {
              action: "reset_secret",
              target: "LINE_CHANNEL_ACCESS_TOKEN",
            },
          ],
          summary: {
            totalSteps: 3,
            successCount: 0,
            failedCount: 0,
            skippedCount: 3,
            overallStatus: "partial",
          },
        },
      });
      const message = buildNotificationMessage(result, "admin");
      assertEquals(message.includes("GitHub修繕フォールバック対象"), true);
      assertEquals(message.includes("LINE_CHANNEL_ACCESS_TOKEN"), true);
    },
  );

  await t.step("includes maintenance info when present", () => {
    const result = createBaseResult({
      maintenance: {
        archivedBroadcasts: 10,
        archivedCards: 5,
      },
    });
    const message = buildNotificationMessage(result, "admin");
    assertEquals(message.includes("メンテナンス結果"), true);
    assertEquals(message.includes("10"), true);
    assertEquals(message.includes("5"), true);
  });

  await t.step("includes database health when present", () => {
    const result = createBaseResult({
      checks: {
        cardInventory: {
          passed: true,
          warnings: [],
          details: [],
        },
        broadcastSuccess: {
          passed: true,
          warnings: [],
          details: [],
        },
        databaseHealth: {
          passed: true,
          warnings: [],
          duplicates: 0,
        },
      },
    });
    const message = buildNotificationMessage(result, "manus");
    assertEquals(message.includes("データベース健全性"), true);
  });

  await t.step("includes LINE registration system when present", () => {
    const result = createBaseResult({
      checks: {
        cardInventory: {
          passed: true,
          warnings: [],
          details: [],
        },
        broadcastSuccess: {
          passed: true,
          warnings: [],
          details: [],
        },
        lineRegistrationSystem: {
          passed: true,
          warnings: [],
          details: {
            webhookHealth: { passed: true },
            apiHealth: { passed: true },
            googleSheetsSync: { passed: true },
            landingPageAccess: { passed: true },
            lineBotHealth: { passed: true },
            recentInteractions: { passed: true },
          },
        },
      },
    });
    const message = buildNotificationMessage(result, "manus");
    assertEquals(message.includes("LINE登録システム"), true);
  });
});
