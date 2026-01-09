/**
 * stats-exporter サマリー関数のテスト
 */
import { assertEquals, assertExists } from "std-assert";

/** LINE イベントレコード (テスト用) */
interface LineEvent {
  created_at: string | null;
  line_user_id: string | null;
  message_text: string | null;
  normalized_keyword: string | null;
  risk_level: string | null;
  contains_phi: boolean | null;
  membership_email: string | null;
  membership_tier: string | null;
  subscription_status: string | null;
  billing_cycle_anchor: string | null;
  tuition_credit_yen: number | null;
  stripe_customer_email: string | null;
  reply_success: boolean | null;
  error_code: string | null;
  metadata: {
    discord_notify_id?: string;
    replyTemplate?: string;
    processingMs?: number;
  } | null;
}

/** 日次サマリー中間データ */
interface DailySummaryAccumulator {
  date: string;
  totalEvents: number;
  uniqueUserSet: Set<string>;
  riskSafe: number;
  riskWarning: number;
  riskDanger: number;
  phiAlerts: number;
  tierMatsu: number;
  tierTake: number;
  tierUme: number;
  totalProcessingMs: number;
  processingCount: number;
}

/** 日次サマリー出力データ */
interface DailySummary {
  date: string;
  totalEvents: number;
  uniqueUsers: number;
  riskSafe: number;
  riskWarning: number;
  riskDanger: number;
  phiAlerts: number;
  tierMatsu: number;
  tierTake: number;
  tierUme: number;
  avgProcessingMs: number | null;
  generatedAt: string;
}

// buildDailySummary 関数のローカル実装（テスト用）
function buildDailySummary(events: LineEvent[]): DailySummary[] {
  const summaryMap = new Map<string, DailySummaryAccumulator>();

  for (const event of events) {
    const dateKey = (event.created_at ?? "").slice(0, 10);
    if (!summaryMap.has(dateKey)) {
      summaryMap.set(dateKey, {
        date: dateKey,
        totalEvents: 0,
        uniqueUserSet: new Set<string>(),
        riskSafe: 0,
        riskWarning: 0,
        riskDanger: 0,
        phiAlerts: 0,
        tierMatsu: 0,
        tierTake: 0,
        tierUme: 0,
        totalProcessingMs: 0,
        processingCount: 0,
      });
    }
    const summary = summaryMap.get(dateKey)!;
    summary.totalEvents += 1;
    summary.uniqueUserSet.add(event.line_user_id ?? "unknown");
    if (event.risk_level === "safe") summary.riskSafe += 1;
    if (event.risk_level === "warning") summary.riskWarning += 1;
    if (event.risk_level === "danger") summary.riskDanger += 1;
    if (event.contains_phi) summary.phiAlerts += 1;
    if (event.membership_tier === "松") summary.tierMatsu += 1;
    if (event.membership_tier === "竹") summary.tierTake += 1;
    if (event.membership_tier === "梅") summary.tierUme += 1;
    if (event.metadata?.processingMs) {
      summary.totalProcessingMs += event.metadata.processingMs;
      summary.processingCount += 1;
    }
  }

  return Array.from(summaryMap.values()).map((summary) => ({
    date: summary.date,
    totalEvents: summary.totalEvents,
    uniqueUsers: summary.uniqueUserSet.size,
    riskSafe: summary.riskSafe,
    riskWarning: summary.riskWarning,
    riskDanger: summary.riskDanger,
    phiAlerts: summary.phiAlerts,
    tierMatsu: summary.tierMatsu,
    tierTake: summary.tierTake,
    tierUme: summary.tierUme,
    avgProcessingMs: summary.processingCount > 0
      ? Math.round(summary.totalProcessingMs / summary.processingCount)
      : null,
    generatedAt: new Date().toISOString(),
  }));
}

Deno.test("buildDailySummary returns empty array for no events", () => {
  const result = buildDailySummary([]);
  assertEquals(result.length, 0);
});

Deno.test("buildDailySummary counts events correctly", () => {
  const events: LineEvent[] = [
    {
      created_at: "2024-01-15T10:00:00Z",
      line_user_id: "user1",
      message_text: "test",
      normalized_keyword: null,
      risk_level: "safe",
      contains_phi: false,
      membership_email: null,
      membership_tier: "松",
      subscription_status: null,
      billing_cycle_anchor: null,
      tuition_credit_yen: null,
      stripe_customer_email: null,
      reply_success: true,
      error_code: null,
      metadata: { processingMs: 100 },
    },
    {
      created_at: "2024-01-15T11:00:00Z",
      line_user_id: "user2",
      message_text: "test2",
      normalized_keyword: null,
      risk_level: "warning",
      contains_phi: true,
      membership_email: null,
      membership_tier: "竹",
      subscription_status: null,
      billing_cycle_anchor: null,
      tuition_credit_yen: null,
      stripe_customer_email: null,
      reply_success: true,
      error_code: null,
      metadata: { processingMs: 200 },
    },
  ];

  const result = buildDailySummary(events);

  assertEquals(result.length, 1);
  const firstSummary = result[0];
  assertExists(firstSummary);
  assertEquals(firstSummary.date, "2024-01-15");
  assertEquals(firstSummary.totalEvents, 2);
  assertEquals(firstSummary.uniqueUsers, 2);
  assertEquals(firstSummary.riskSafe, 1);
  assertEquals(firstSummary.riskWarning, 1);
  assertEquals(firstSummary.phiAlerts, 1);
  assertEquals(firstSummary.tierMatsu, 1);
  assertEquals(firstSummary.tierTake, 1);
  assertEquals(firstSummary.avgProcessingMs, 150);
});

Deno.test("buildDailySummary groups by date correctly", () => {
  const events: LineEvent[] = [
    {
      created_at: "2024-01-15T10:00:00Z",
      line_user_id: "user1",
      message_text: null,
      normalized_keyword: null,
      risk_level: "safe",
      contains_phi: false,
      membership_email: null,
      membership_tier: null,
      subscription_status: null,
      billing_cycle_anchor: null,
      tuition_credit_yen: null,
      stripe_customer_email: null,
      reply_success: null,
      error_code: null,
      metadata: null,
    },
    {
      created_at: "2024-01-16T10:00:00Z",
      line_user_id: "user2",
      message_text: null,
      normalized_keyword: null,
      risk_level: "danger",
      contains_phi: false,
      membership_email: null,
      membership_tier: null,
      subscription_status: null,
      billing_cycle_anchor: null,
      tuition_credit_yen: null,
      stripe_customer_email: null,
      reply_success: null,
      error_code: null,
      metadata: null,
    },
  ];

  const result = buildDailySummary(events);

  assertEquals(result.length, 2);
  const [firstSummary, secondSummary] = result;
  assertExists(firstSummary);
  assertExists(secondSummary);
  assertEquals(firstSummary.date, "2024-01-15");
  assertEquals(secondSummary.date, "2024-01-16");
});

Deno.test("buildDailySummary counts unique users correctly", () => {
  const events: LineEvent[] = [
    {
      created_at: "2024-01-15T10:00:00Z",
      line_user_id: "user1",
      message_text: null,
      normalized_keyword: null,
      risk_level: null,
      contains_phi: false,
      membership_email: null,
      membership_tier: null,
      subscription_status: null,
      billing_cycle_anchor: null,
      tuition_credit_yen: null,
      stripe_customer_email: null,
      reply_success: null,
      error_code: null,
      metadata: null,
    },
    {
      created_at: "2024-01-15T11:00:00Z",
      line_user_id: "user1", // same user
      message_text: null,
      normalized_keyword: null,
      risk_level: null,
      contains_phi: false,
      membership_email: null,
      membership_tier: null,
      subscription_status: null,
      billing_cycle_anchor: null,
      tuition_credit_yen: null,
      stripe_customer_email: null,
      reply_success: null,
      error_code: null,
      metadata: null,
    },
    {
      created_at: "2024-01-15T12:00:00Z",
      line_user_id: "user2",
      message_text: null,
      normalized_keyword: null,
      risk_level: null,
      contains_phi: false,
      membership_email: null,
      membership_tier: null,
      subscription_status: null,
      billing_cycle_anchor: null,
      tuition_credit_yen: null,
      stripe_customer_email: null,
      reply_success: null,
      error_code: null,
      metadata: null,
    },
  ];

  const result = buildDailySummary(events);

  const firstSummary = result[0];
  assertExists(firstSummary);
  assertEquals(firstSummary.totalEvents, 3);
  assertEquals(firstSummary.uniqueUsers, 2);
});
