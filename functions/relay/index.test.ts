import {
  assert,
  assertEquals,
  assertFalse,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHmac } from "https://deno.land/std@0.224.0/node/crypto.ts";
import { FakeTime } from "https://deno.land/std@0.224.0/testing/time.ts";
import {
  __testOnly,
  createDedupKey,
  hashUserId,
  markEventAsSeen,
  sanitizePayload,
  verifySignature,
} from "./index.ts";
import type { KvClient } from "./kv.ts";

const BASE_ENV = {
  GH_OWNER: "owner",
  GH_REPO: "repo",
  GH_PAT: "pat",
} as const;

Deno.test("verifySignature validates LINE signatures (base64 HMAC)", () => {
  const body = JSON.stringify({ hello: "world" });
  const secret = "test-line-secret";
  const signature = createHmac("sha256", secret).update(body).digest("base64");

  const env = {
    ...BASE_ENV,
    LINE_CHANNEL_SECRET: secret,
  };

  assert(
    verifySignature(body, signature, env),
    "Expected LINE signature to be valid"
  );
});

Deno.test("verifySignature rejects invalid LINE signatures", () => {
  const body = JSON.stringify({ hello: "world" });
  const secret = "test-line-secret";
  const env = {
    ...BASE_ENV,
    LINE_CHANNEL_SECRET: secret,
  };

  assertFalse(
    verifySignature(body, "invalid-signature", env),
    "Expected invalid signature to be rejected"
  );
});

Deno.test("verifySignature checks Manus bearer token", () => {
  const env = {
    ...BASE_ENV,
    MANUS_API_KEY: "manus-token",
  };

  assert(
    verifySignature("{}", "Bearer manus-token", env),
    "Expected valid Manus token to pass verification"
  );
  assertFalse(
    verifySignature("{}", "Bearer other-token", env),
    "Expected mismatched Manus token to fail"
  );
});

Deno.test("hashUserId generates deterministic truncated hash", () => {
  const first = hashUserId("user-123");
  const second = hashUserId("user-123");
  assertEquals(first, second);
  assertEquals(first.length, 16);
});

Deno.test("hashUserId supports salting", () => {
  const salted = hashUserId("user-123", "salt");
  const unsalted = hashUserId("user-123");
  assertFalse(
    salted === unsalted,
    "Salted hash should differ from unsalted hash"
  );
});

Deno.test("sanitizePayload redacts LINE message text when configured", () => {
  const payload = {
    destination: "bot",
    events: [
      {
        type: "message",
        timestamp: 1700000000000,
        source: { type: "user", userId: "U123" },
        replyToken: "reply-token",
        message: { type: "text", id: "mid", text: "hello world" },
      },
    ],
  };

  const env = {
    ...BASE_ENV,
    HASH_SALT: "pepper",
    REDACT_LINE_MESSAGE: "true",
  };

  const sanitized = sanitizePayload(payload, "line_event", env);
  assertEquals(
    sanitized.events[0].message?.text,
    "[redacted]",
  );
  assertEquals(
    sanitized.events[0].source.userId.length,
    16,
  );
});

Deno.test("createDedupKey is stable for identical events and differentiates changes", () => {
  const payload = {
    destination: "bot",
    events: [
      {
        type: "message",
        timestamp: 1700000000000,
        source: { type: "user", userId: "U123" },
        replyToken: "reply-token",
        message: { type: "text", id: "mid", text: "hello world" },
      },
    ],
  };

  const env = {
    ...BASE_ENV,
    HASH_SALT: "pepper",
  };

  const body = JSON.stringify(payload);
  const firstKey = createDedupKey(
    "line_event",
    payload,
    env,
    "signature",
    body,
  );
  const secondKey = createDedupKey(
    "line_event",
    payload,
    env,
    "signature",
    body,
  );
  assertEquals(firstKey, secondKey);

  const modifiedPayload = structuredClone(payload);
  modifiedPayload.events[0].message.id = "mid-2";
  const thirdKey = createDedupKey(
    "line_event",
    modifiedPayload,
    env,
    "signature",
    JSON.stringify(modifiedPayload),
  );
  assertNotEquals(firstKey, thirdKey);
});

Deno.test("createDedupKey incorporates Manus progress identifiers", () => {
  const payload = {
    progress_id: "task-123",
    decision: "retry",
    plan_variant: "production",
    step_id: "s1",
  };

  const first = createDedupKey(
    "manus_progress",
    payload,
    BASE_ENV,
    null,
    JSON.stringify(payload),
  );

  const same = createDedupKey(
    "manus_progress",
    { ...payload },
    BASE_ENV,
    null,
    JSON.stringify(payload),
  );

  const different = createDedupKey(
    "manus_progress",
    { ...payload, step_id: "s2" },
    BASE_ENV,
    null,
    JSON.stringify({ ...payload, step_id: "s2" }),
  );

  assertEquals(first, same);
  assertNotEquals(first, different);
});

Deno.test("markEventAsSeen prevents duplicates and respects TTL expiry", async () => {
  __testOnly.clearMemoryDedupeCache();
  const kvFactory = () => Promise.resolve(null);

  assert(await markEventAsSeen("demo-key", 60, kvFactory));
  assertFalse(await markEventAsSeen("demo-key", 60, kvFactory));

  __testOnly.clearMemoryDedupeCache();
  const fakeTime = new FakeTime();
  try {
    assert(await markEventAsSeen("ttl-key", 1, kvFactory));
    assertFalse(await markEventAsSeen("ttl-key", 1, kvFactory));
    fakeTime.tick(1000);
    assert(await markEventAsSeen("ttl-key", 1, kvFactory));
  } finally {
    fakeTime.restore();
    __testOnly.clearMemoryDedupeCache();
  }
});

Deno.test("markEventAsSeen respects external KV store state", async () => {
  type KvKey = Parameters<KvClient["get"]>[0];
  type KvEntry = Awaited<ReturnType<KvClient["get"]>>;
  type KvSetOptions = Parameters<KvClient["set"]>[2];
  type KvCommitResult = Awaited<
    ReturnType<ReturnType<KvClient["atomic"]>["commit"]>
  >;

  const fakeTime = new FakeTime(1_700_000_000_000);
  try {
    const store = new Map<string, { value: unknown; expiration?: number }>();

    const kvStub = {
      async get(key: KvKey): Promise<KvEntry> {
        const serialized = JSON.stringify(key as unknown);
        const entry = store.get(serialized);
        return {
          key,
          value: entry?.value ?? null,
          versionstamp: null,
          expiration: entry?.expiration,
        };
      },
      async set(
        key: KvKey,
        value: unknown,
        options?: KvSetOptions,
      ): Promise<void> {
        const serialized = JSON.stringify(key as unknown);
        const expiration = options?.expireIn
          ? Date.now() + options.expireIn
          : undefined;
        store.set(serialized, { value, expiration });
      },
      // Unused Kv APIs stubbed to satisfy the interface contract at runtime.
      async delete() {},
      async enqueue() {},
      list() {
        return {
          async *[Symbol.asyncIterator]() {
            for (const [serialized, entry] of store.entries()) {
              yield {
                key: JSON.parse(serialized) as KvKey,
                value: entry.value,
                versionstamp: null,
                expiration: entry.expiration,
              };
            }
          },
        };
      },
      atomic() {
        return {
          check() {
            return this;
          },
          set() {
            return this;
          },
          sum() {
            return this;
          },
          min() {
            return this;
          },
          max() {
            return this;
          },
          delete() {
            return this;
          },
          mutate() {
            return this;
          },
          commit: async () =>
            ({ ok: true, versionstamp: "0000000000000000" } as KvCommitResult),
        };
      },
      close() {},
    } as unknown as KvClient;

    const kvFactory = () => Promise.resolve(kvStub);

    __testOnly.clearMemoryDedupeCache();
    assert(await markEventAsSeen("kv-key", 60, kvFactory));
    assertFalse(await markEventAsSeen("kv-key", 60, kvFactory));

    fakeTime.tick(61_000);
    assert(await markEventAsSeen("kv-key", 60, kvFactory));
  } finally {
    fakeTime.restore();
    __testOnly.clearMemoryDedupeCache();
  }
});

Deno.test("sanitizePayload trims Manus progress payloads to expected shape", () => {
  const payload = {
    progress_id: "task-123",
    decision: "retry",
    plan_delta: {
      retry_after_seconds: 45,
      decision: "retry",
    },
    context: {
      plan_variant: "degraded",
    },
    step_id: "s1",
    extra: "ignore-me",
    error: { code: "X" },
  };

  const sanitized = sanitizePayload(payload, "manus_progress", BASE_ENV);
  assertEquals(sanitized.progress_id, "task-123");
  assertEquals(sanitized.plan_variant, "degraded");
  assertEquals(sanitized.retry_after_seconds, 45);
  assertEquals(sanitized.decision, "retry");
  assertEquals(sanitized.metadata.step_id, "s1");
  assertEquals(sanitized.metadata.error, { code: "X" });
  assertEquals(sanitized.metadata.event_type, null);
  assertFalse("extra" in sanitized);
});
