/**
 * Idempotency Store - State Machine Tests
 *
 * Verifies:
 * - New events are claimed successfully
 * - Succeeded events are skipped
 * - Processing events within lease are skipped
 * - Failed/stale events can be re-claimed
 * - Max attempts safety valve works
 *
 * @see Plans.md Phase 5-3
 */

import { assertEquals } from "std-assert";
import { claimEvent, markFailed, markSucceeded } from "./idempotency.ts";

// ============================================
// Mock Supabase Client
// ============================================

interface MockRow {
  event_id: string;
  event_type: string;
  customer_email: string | null;
  status: string;
  processing_started_at: string | null;
  attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  processed_at: string | null;
}

function createMockSupabase(initialRows: MockRow[] = []) {
  const rows = [...initialRows];

  const findRow = (eventId: string) => rows.find((r) => r.event_id === eventId);

  return {
    rows,
    from(_table: string) {
      let chain: Record<string, unknown> = {};
      let selectedRow: MockRow | null = null;
      let filterEventId: string | null = null;

      chain = {
        select(_cols: string) {
          return chain;
        },
        insert(data: Partial<MockRow>) {
          const existing = findRow(data.event_id ?? "");
          if (existing) {
            return { error: { code: "23505", message: "duplicate" }, count: 0 };
          }
          rows.push({
            event_id: data.event_id ?? "",
            event_type: data.event_type ?? "",
            customer_email: data.customer_email ?? null,
            status: data.status ?? "received",
            processing_started_at: null,
            attempts: data.attempts ?? 0,
            last_error: null,
            next_retry_at: null,
            processed_at: null,
          });
          return { error: null, count: 1 };
        },
        update(data: Partial<MockRow>) {
          return {
            eq(col: string, val: string) {
              filterEventId = col === "event_id" ? val : filterEventId;
              // Apply update immediately for simple .update().eq() calls
              const targetRow = findRow(val);
              if (targetRow) {
                Object.assign(targetRow, data);
              }
              return {
                error: null,
                count: targetRow ? 1 : 0,
                in(_col2: string, _vals: string[]) {
                  return {
                    select(_cols: string) {
                      return { error: null, count: targetRow ? 1 : 0 };
                    },
                  };
                },
                select(_cols: string) {
                  return { error: null, count: targetRow ? 1 : 0 };
                },
                maybeSingle() {
                  return { data: targetRow ?? null, error: null };
                },
              };
            },
          };
        },
        eq(col: string, val: string) {
          filterEventId = col === "event_id" ? val : null;
          selectedRow = findRow(val) ?? null;
          return {
            maybeSingle() {
              return { data: selectedRow, error: null };
            },
            select(_cols: string) {
              return {
                maybeSingle() {
                  return { data: selectedRow, error: null };
                },
              };
            },
          };
        },
      };

      return chain;
    },
  };
}

// ============================================
// claimEvent Tests
// ============================================

Deno.test("claimEvent - new event is claimed successfully", async () => {
  const supabase = createMockSupabase();
  const result = await claimEvent(
    supabase,
    "evt_new_123",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(result.claimed, true);
  assertEquals(result.reason, "CLAIMED");
  assertEquals(supabase.rows.length, 1);
  assertEquals(supabase.rows[0].status, "processing");
  assertEquals(supabase.rows[0].attempts, 1);
});

Deno.test("claimEvent - succeeded event is skipped", async () => {
  const supabase = createMockSupabase([{
    event_id: "evt_done_123",
    event_type: "checkout.session.completed",
    customer_email: "test@example.com",
    status: "succeeded",
    processing_started_at: null,
    attempts: 1,
    last_error: null,
    next_retry_at: null,
    processed_at: new Date().toISOString(),
  }]);

  const result = await claimEvent(
    supabase,
    "evt_done_123",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(result.claimed, false);
  assertEquals(result.reason, "ALREADY_SUCCEEDED");
});

Deno.test("claimEvent - processing event within lease is skipped", async () => {
  const supabase = createMockSupabase([{
    event_id: "evt_proc_123",
    event_type: "checkout.session.completed",
    customer_email: "test@example.com",
    status: "processing",
    processing_started_at: new Date().toISOString(), // Just started
    attempts: 1,
    last_error: null,
    next_retry_at: null,
    processed_at: null,
  }]);

  const result = await claimEvent(
    supabase,
    "evt_proc_123",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(result.claimed, false);
  assertEquals(result.reason, "ALREADY_PROCESSING");
});

Deno.test("claimEvent - stale processing event is re-claimed", async () => {
  const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
  const supabase = createMockSupabase([{
    event_id: "evt_stale_123",
    event_type: "checkout.session.completed",
    customer_email: "test@example.com",
    status: "processing",
    processing_started_at: staleTime,
    attempts: 1,
    last_error: null,
    next_retry_at: null,
    processed_at: null,
  }]);

  const result = await claimEvent(
    supabase,
    "evt_stale_123",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(result.claimed, true);
  assertEquals(result.reason, "CLAIMED");
  assertEquals(supabase.rows[0].attempts, 2);
});

Deno.test("claimEvent - failed event is re-claimed", async () => {
  const supabase = createMockSupabase([{
    event_id: "evt_fail_123",
    event_type: "checkout.session.completed",
    customer_email: "test@example.com",
    status: "failed",
    processing_started_at: null,
    attempts: 2,
    last_error: "DB connection error",
    next_retry_at: new Date().toISOString(),
    processed_at: null,
  }]);

  const result = await claimEvent(
    supabase,
    "evt_fail_123",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(result.claimed, true);
  assertEquals(result.reason, "CLAIMED");
  assertEquals(supabase.rows[0].attempts, 3);
});

Deno.test("claimEvent - max attempts exceeded is rejected", async () => {
  const supabase = createMockSupabase([{
    event_id: "evt_maxed_123",
    event_type: "checkout.session.completed",
    customer_email: "test@example.com",
    status: "failed",
    processing_started_at: null,
    attempts: 10,
    last_error: "Persistent error",
    next_retry_at: null,
    processed_at: null,
  }]);

  const result = await claimEvent(
    supabase,
    "evt_maxed_123",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(result.claimed, false);
  assertEquals(result.reason, "MAX_ATTEMPTS_EXCEEDED");
});

// ============================================
// markSucceeded Tests
// ============================================

Deno.test("markSucceeded - updates status to succeeded", async () => {
  const supabase = createMockSupabase([{
    event_id: "evt_proc_ok",
    event_type: "checkout.session.completed",
    customer_email: "test@example.com",
    status: "processing",
    processing_started_at: new Date().toISOString(),
    attempts: 1,
    last_error: null,
    next_retry_at: null,
    processed_at: null,
  }]);

  await markSucceeded(supabase, "evt_proc_ok");
  assertEquals(supabase.rows[0].status, "succeeded");
  assertEquals(supabase.rows[0].last_error, null);
});

// ============================================
// markFailed Tests
// ============================================

Deno.test("markFailed - updates status to failed with error", async () => {
  const supabase = createMockSupabase([{
    event_id: "evt_proc_fail",
    event_type: "checkout.session.completed",
    customer_email: "test@example.com",
    status: "processing",
    processing_started_at: new Date().toISOString(),
    attempts: 1,
    last_error: null,
    next_retry_at: null,
    processed_at: null,
  }]);

  await markFailed(supabase, "evt_proc_fail", "DB connection timeout");
  assertEquals(supabase.rows[0].status, "failed");
  assertEquals(supabase.rows[0].last_error, "DB connection timeout");
  assertEquals(typeof supabase.rows[0].next_retry_at, "string");
});

// ============================================
// State Transition Invariants
// ============================================

Deno.test("state transitions - received → processing → succeeded", async () => {
  const supabase = createMockSupabase();

  // Step 1: Claim (received → processing)
  const claim = await claimEvent(
    supabase,
    "evt_flow_ok",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(claim.claimed, true);
  assertEquals(supabase.rows[0].status, "processing");

  // Step 2: Succeed (processing → succeeded)
  await markSucceeded(supabase, "evt_flow_ok");
  assertEquals(supabase.rows[0].status, "succeeded");

  // Step 3: Re-claim should be skipped
  const reClaim = await claimEvent(
    supabase,
    "evt_flow_ok",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(reClaim.claimed, false);
  assertEquals(reClaim.reason, "ALREADY_SUCCEEDED");
});

Deno.test("state transitions - received → processing → failed → re-claim → succeeded", async () => {
  const supabase = createMockSupabase();

  // Step 1: Claim
  await claimEvent(
    supabase,
    "evt_flow_retry",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(supabase.rows[0].status, "processing");

  // Step 2: Fail
  await markFailed(supabase, "evt_flow_retry", "Temporary error");
  assertEquals(supabase.rows[0].status, "failed");

  // Step 3: Re-claim
  const reClaim = await claimEvent(
    supabase,
    "evt_flow_retry",
    "checkout.session.completed",
    "test@example.com",
  );
  assertEquals(reClaim.claimed, true);
  assertEquals(supabase.rows[0].status, "processing");
  assertEquals(supabase.rows[0].attempts, 2);

  // Step 4: Succeed
  await markSucceeded(supabase, "evt_flow_retry");
  assertEquals(supabase.rows[0].status, "succeeded");
});
