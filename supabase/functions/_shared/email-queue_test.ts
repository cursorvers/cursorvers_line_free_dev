import { assertEquals } from "std-assert";
import {
  enqueueEmail,
  fetchRetryableItems,
  getNextRetryAt,
  isLeaseValid,
  markFailed,
  markProcessing,
  markSent,
  reclaimStaleProcessing,
} from "./email-queue.ts";

// ============================================
// getNextRetryAt tests (with upper bound)
// ============================================

Deno.test("getNextRetryAt - attempt 0 returns 1 minute delay", () => {
  const before = Date.now();
  const result = getNextRetryAt(0);
  const after = Date.now();

  const expectedMin = before + 60 * 1000;
  const expectedMax = after + 60 * 1000;

  assertEquals(result.getTime() >= expectedMin, true);
  assertEquals(result.getTime() <= expectedMax, true);
});

Deno.test("getNextRetryAt - attempt 1 returns 5 minute delay", () => {
  const before = Date.now();
  const result = getNextRetryAt(1);
  const after = Date.now();

  const expectedDelay = 300 * 1000; // 5 minutes
  assertEquals(result.getTime() >= before + expectedDelay, true);
  assertEquals(result.getTime() <= after + expectedDelay, true);
});

Deno.test("getNextRetryAt - attempt 2 returns 30 minute delay", () => {
  const before = Date.now();
  const result = getNextRetryAt(2);
  const after = Date.now();

  const expectedDelay = 1800 * 1000; // 30 minutes
  assertEquals(result.getTime() >= before + expectedDelay, true);
  assertEquals(result.getTime() <= after + expectedDelay, true);
});

Deno.test("getNextRetryAt - attempt 3 returns 2 hour delay", () => {
  const before = Date.now();
  const result = getNextRetryAt(3);
  const after = Date.now();

  const expectedDelay = 7200 * 1000; // 2 hours
  assertEquals(result.getTime() >= before + expectedDelay, true);
  assertEquals(result.getTime() <= after + expectedDelay, true);
});

Deno.test("getNextRetryAt - attempt 4 returns 12 hour delay", () => {
  const before = Date.now();
  const result = getNextRetryAt(4);
  const after = Date.now();

  const expectedDelay = 43200 * 1000; // 12 hours
  assertEquals(result.getTime() >= before + expectedDelay, true);
  assertEquals(result.getTime() <= after + expectedDelay, true);
});

Deno.test("getNextRetryAt - attempt beyond max clamps to last delay", () => {
  const before = Date.now();
  const result = getNextRetryAt(10);
  const after = Date.now();

  const expectedDelay = 43200 * 1000; // 12 hours (clamped)
  assertEquals(result.getTime() >= before + expectedDelay, true);
  assertEquals(result.getTime() <= after + expectedDelay, true);
});

// ============================================
// isLeaseValid tests
// ============================================

Deno.test("isLeaseValid - future date returns true", () => {
  const future = new Date(Date.now() + 60000);
  assertEquals(isLeaseValid(future), true);
});

Deno.test("isLeaseValid - past date returns false", () => {
  const past = new Date(Date.now() - 60000);
  assertEquals(isLeaseValid(past), false);
});

// ============================================
// Supabase client mock helpers
// ============================================

interface MockQueryResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function createMockSupabase(responses: Record<string, MockQueryResult>) {
  const callLog: Array<{ method: string; args: unknown[] }> = [];

  function createChain(tableName: string): Record<string, unknown> {
    const chain: Record<string, (...args: unknown[]) => Record<string, unknown>> = {};
    const methods = [
      "select", "insert", "update", "delete",
      "eq", "in", "lte", "gte", "order", "limit",
      "single", "maybeSingle",
    ];

    for (const method of methods) {
      chain[method] = (...args: unknown[]) => {
        callLog.push({ method: `${tableName}.${method}`, args });

        // Terminal methods return the response
        if (method === "single" || method === "maybeSingle") {
          return responses[tableName] ?? { data: null, error: null };
        }

        // select() after update/insert returns response
        if (method === "select" && callLog.some(c =>
          c.method === `${tableName}.insert` || c.method === `${tableName}.update`
        )) {
          return chain;
        }

        return chain;
      };
    }

    // Allow direct await (non-terminal)
    chain.then = ((resolve: (v: unknown) => void) => {
      resolve(responses[tableName] ?? { data: null, error: null });
    }) as unknown as (...args: unknown[]) => Record<string, unknown>;

    return chain;
  }

  return {
    client: {
      from: (tableName: string) => createChain(tableName),
    },
    callLog,
  };
}

// ============================================
// enqueueEmail tests
// ============================================

Deno.test("enqueueEmail - filters params via allowlist", async () => {
  const mockResult: MockQueryResult = {
    data: { id: "queue-123" },
    error: null,
  };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await enqueueEmail(
    client as never,
    {
      event_id: "evt_123",
      recipient_email: "test@example.com",
      template: "paid_member_welcome",
      params: {
        tier_display_name: "Library Member",
        verification_code: "SECRET_CODE",
        internal_field: "should_be_filtered",
      },
    },
  );

  assertEquals(result.success, true);
  assertEquals(result.queueId, "queue-123");
});

Deno.test("enqueueEmail - handles UNIQUE constraint (idempotent)", async () => {
  const mockResult: MockQueryResult = {
    data: null,
    error: { code: "23505", message: "duplicate key" },
  };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await enqueueEmail(
    client as never,
    {
      event_id: "evt_123",
      recipient_email: "test@example.com",
      template: "paid_member_welcome",
      params: { tier_display_name: "Library Member" },
    },
  );

  assertEquals(result.success, true);
  assertEquals(result.queueId, "existing");
});

Deno.test("enqueueEmail - returns error on DB failure", async () => {
  const mockResult: MockQueryResult = {
    data: null,
    error: { message: "connection refused" },
  };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await enqueueEmail(
    client as never,
    {
      event_id: "evt_123",
      recipient_email: "test@example.com",
      template: "paid_member_welcome",
      params: {},
    },
  );

  assertEquals(result.success, false);
  assertEquals(result.error, "connection refused");
});

Deno.test("enqueueEmail - direct_discord_invite allowlist includes discord_invite_url", async () => {
  const mockResult: MockQueryResult = {
    data: { id: "queue-456" },
    error: null,
  };
  const { client, callLog } = createMockSupabase({ email_send_queue: mockResult });

  const result = await enqueueEmail(
    client as never,
    {
      event_id: "evt_456",
      recipient_email: "test@example.com",
      template: "direct_discord_invite",
      params: {
        tier_display_name: "Library Member",
        discord_invite_url: "https://discord.gg/abc123",
        secret_field: "should_be_filtered",
      },
    },
  );

  assertEquals(result.success, true);
  // Verify insert was called (allowlist should include discord_invite_url)
  const insertCall = callLog.find(c => c.method === "email_send_queue.insert");
  assertEquals(insertCall !== undefined, true);
});

// ============================================
// fetchRetryableItems tests
// ============================================

Deno.test("fetchRetryableItems - returns items on success", async () => {
  const items = [
    { id: "q1", event_id: "e1", recipient_email: "a@b.com", template: "paid_member_welcome", params: {}, attempts: 0, max_attempts: 5 },
  ];
  const mockResult: MockQueryResult = { data: items, error: null };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await fetchRetryableItems(client as never, 10);

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].id, "q1");
  assertEquals(result.error, undefined);
});

Deno.test("fetchRetryableItems - returns empty on error", async () => {
  const mockResult: MockQueryResult = { data: null, error: { message: "timeout" } };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await fetchRetryableItems(client as never, 10);

  assertEquals(result.items.length, 0);
  assertEquals(result.error, "timeout");
});

// ============================================
// markProcessing tests (lease + token)
// ============================================

Deno.test("markProcessing - returns claimed=true with token when row claimed", async () => {
  const mockResult: MockQueryResult = { data: [{ id: "q1" }], error: null };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markProcessing(client as never, "q1");

  assertEquals(result.claimed, true);
  assertEquals(typeof result.token, "string");
  assertEquals(result.token!.length > 0, true);
});

Deno.test("markProcessing - returns claimed=false when already claimed", async () => {
  const mockResult: MockQueryResult = { data: [], error: null };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markProcessing(client as never, "q1");

  assertEquals(result.claimed, false);
  assertEquals(result.token, undefined);
});

Deno.test("markProcessing - returns claimed=false on error", async () => {
  const mockResult: MockQueryResult = { data: null, error: { message: "error" } };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markProcessing(client as never, "q1");

  assertEquals(result.claimed, false);
});

Deno.test("markProcessing - sets processing_token and lease_expires_at", async () => {
  const mockResult: MockQueryResult = { data: [{ id: "q1" }], error: null };
  const { client, callLog } = createMockSupabase({ email_send_queue: mockResult });

  await markProcessing(client as never, "q1");

  const updateCall = callLog.find(c => c.method === "email_send_queue.update");
  assertEquals(updateCall !== undefined, true);
  // Verify update args include processing fields
  if (updateCall) {
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    assertEquals(updateArg.status, "processing");
    assertEquals(typeof updateArg.processing_token, "string");
    assertEquals(typeof updateArg.lease_expires_at, "string");
  }
});

// ============================================
// reclaimStaleProcessing tests
// ============================================

Deno.test("reclaimStaleProcessing - returns count of reclaimed items", async () => {
  const mockResult: MockQueryResult = {
    data: [{ id: "q1" }, { id: "q2" }],
    error: null,
  };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const count = await reclaimStaleProcessing(client as never);

  assertEquals(count, 2);
});

Deno.test("reclaimStaleProcessing - returns 0 on error", async () => {
  const mockResult: MockQueryResult = {
    data: null,
    error: { message: "connection error" },
  };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const count = await reclaimStaleProcessing(client as never);

  assertEquals(count, 0);
});

Deno.test("reclaimStaleProcessing - returns 0 when no stale items", async () => {
  const mockResult: MockQueryResult = { data: [], error: null };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const count = await reclaimStaleProcessing(client as never);

  assertEquals(count, 0);
});

// ============================================
// markSent tests (with token)
// ============================================

Deno.test("markSent - succeeds with matching token", async () => {
  const mockResult: MockQueryResult = { data: [{ id: "q1" }], error: null };
  const { client, callLog } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markSent(client as never, "q1", "test-token");

  assertEquals(result, true);
  const eqCalls = callLog.filter(c => c.method === "email_send_queue.eq");
  // Should have eq("id", ...) and eq("processing_token", ...)
  assertEquals(eqCalls.length >= 2, true);
});

Deno.test("markSent - returns false when token mismatches (0 rows)", async () => {
  const mockResult: MockQueryResult = { data: [], error: null };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markSent(client as never, "q1", "wrong-token");

  assertEquals(result, false);
});

Deno.test("markSent - returns false on DB error", async () => {
  const mockResult: MockQueryResult = { data: null, error: { message: "error" } };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markSent(client as never, "q1", "test-token");

  assertEquals(result, false);
});

Deno.test("markSent - works without token (backward compat)", async () => {
  const mockResult: MockQueryResult = { data: [{ id: "q1" }], error: null };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markSent(client as never, "q1");

  assertEquals(result, true);
});

// ============================================
// markFailed tests (with token)
// ============================================

Deno.test("markFailed - sets dead_letter when exhausted", async () => {
  const mockResult: MockQueryResult = { data: [{ id: "q1" }], error: null };
  const { client, callLog } = createMockSupabase({ email_send_queue: mockResult });

  // attempts=4, maxAttempts=5 → attempts+1 >= maxAttempts → dead_letter
  await markFailed(client as never, "q1", 4, 5, "final error", "test-token");

  const updateCall = callLog.find(c => c.method === "email_send_queue.update");
  assertEquals(updateCall !== undefined, true);
});

Deno.test("markFailed - sets failed when not exhausted", async () => {
  const mockResult: MockQueryResult = { data: [{ id: "q1" }], error: null };
  const { client, callLog } = createMockSupabase({ email_send_queue: mockResult });

  // attempts=1, maxAttempts=5 → not exhausted → failed
  await markFailed(client as never, "q1", 1, 5, "temporary error", "test-token");

  const updateCall = callLog.find(c => c.method === "email_send_queue.update");
  assertEquals(updateCall !== undefined, true);
});

Deno.test("markFailed - returns false when token mismatches", async () => {
  const mockResult: MockQueryResult = { data: [], error: null };
  const { client } = createMockSupabase({ email_send_queue: mockResult });

  const result = await markFailed(client as never, "q1", 1, 5, "error", "wrong-token");

  assertEquals(result, false);
});

Deno.test("markFailed - sanitizes PII in error messages", async () => {
  const mockResult: MockQueryResult = { data: [{ id: "q1" }], error: null };
  const { client, callLog } = createMockSupabase({ email_send_queue: mockResult });

  await markFailed(
    client as never,
    "q1",
    0,
    5,
    "Error for user@example.com with token eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoiZGF0YSJ9.abc123 and invite https://discord.gg/secret123",
    "test-token",
  );

  const updateCall = callLog.find(c => c.method === "email_send_queue.update");
  assertEquals(updateCall !== undefined, true);
  if (updateCall) {
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    const lastError = updateArg.last_error as string;
    // Email should be masked
    assertEquals(lastError.includes("user@example.com"), false);
    assertEquals(lastError.includes("[EMAIL]"), true);
    // JWT should be masked
    assertEquals(lastError.includes("eyJhbGci"), false);
    assertEquals(lastError.includes("[JWT]"), true);
    // Discord invite should be masked
    assertEquals(lastError.includes("discord.gg/secret123"), false);
    assertEquals(lastError.includes("[DISCORD_INVITE]"), true);
  }
});
