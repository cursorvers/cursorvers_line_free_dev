import { assertEquals } from "std-assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkBroadcastSuccess } from "./broadcast-success.ts";

function createClient(records: unknown[]): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return this;
        },
        gte() {
          return this;
        },
        order() {
          return Promise.resolve({ data: records, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

Deno.test("broadcast-success treats small sample as advisory only", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

  Deno.env.delete("LINE_CHANNEL_ACCESS_TOKEN");
  globalThis.fetch =
    (() =>
      Promise.reject(new Error("fetch should not be called"))) as typeof fetch;

  try {
    const result = await checkBroadcastSuccess(createClient([
      {
        sent_at: "2026-03-07T00:00:00.000Z",
        success: true,
        error_message: null,
        line_response_status: 200,
      },
      {
        sent_at: "2026-03-06T00:00:00.000Z",
        success: true,
        error_message: null,
        line_response_status: 200,
      },
      {
        sent_at: "2026-03-05T00:00:00.000Z",
        success: false,
        error_message: "LINE API error 500",
        line_response_status: 500,
      },
    ]));

    assertEquals(result.passed, true);
    assertEquals(
      result.warnings.some((warning) => warning.includes("試行件数が3件")),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken) {
      Deno.env.set("LINE_CHANNEL_ACCESS_TOKEN", originalToken);
    } else {
      Deno.env.delete("LINE_CHANNEL_ACCESS_TOKEN");
    }
  }
});

Deno.test("broadcast-success demotes low success rate when quota is near limit", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

  Deno.env.set("LINE_CHANNEL_ACCESS_TOKEN", "test-token");

  let fetchCount = 0;
  globalThis.fetch = ((_input: string | URL | Request) => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ type: "limited", value: 200 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({ totalUsage: 190 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const result = await checkBroadcastSuccess(createClient([
      {
        sent_at: "2026-03-07T00:00:00.000Z",
        success: true,
        error_message: null,
        line_response_status: 200,
      },
      {
        sent_at: "2026-03-06T00:00:00.000Z",
        success: true,
        error_message: null,
        line_response_status: 200,
      },
      {
        sent_at: "2026-03-05T00:00:00.000Z",
        success: true,
        error_message: null,
        line_response_status: 200,
      },
      {
        sent_at: "2026-03-04T00:00:00.000Z",
        success: true,
        error_message: null,
        line_response_status: 200,
      },
      {
        sent_at: "2026-03-03T00:00:00.000Z",
        success: false,
        error_message: "You have reached your monthly limit.",
        line_response_status: 429,
      },
      {
        sent_at: "2026-03-02T00:00:00.000Z",
        success: false,
        error_message: "You have reached your monthly limit.",
        line_response_status: 429,
      },
    ]));

    assertEquals(result.passed, true);
    assertEquals(
      result.warnings.some((warning) => warning.includes("月間通数使用率")),
      true,
    );
    assertEquals(
      result.warnings.some((warning) =>
        warning.includes("システム障害とはみなしません")
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken) {
      Deno.env.set("LINE_CHANNEL_ACCESS_TOKEN", originalToken);
    } else {
      Deno.env.delete("LINE_CHANNEL_ACCESS_TOKEN");
    }
  }
});
