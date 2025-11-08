// Front Door: Webhook relay for LINE and Manus Progress events.
// Handles signature verification, payload sanitization, dedupe caching, and
// dispatching to GitHub repository_dispatch.

import { createHmac } from "node:crypto";
import type { KvClient } from "./kv.ts";
import { getKv } from "./kv.ts";
import { deriveLineSpecEvent } from "../../scripts/orchestration/line-event-mapper.js";
// @ts-ignore
import {
  createDedupKey,
  detectEventType,
  hashUserId,
  sanitizePayload,
  resolveDedupeTtl,
} from "../../scripts/orchestration/relay-sanitizer.mjs";

interface RelayEnv {
  GH_OWNER: string;
  GH_REPO: string;
  GH_PAT: string;
  LINE_CHANNEL_SECRET?: string;
  MANUS_API_KEY?: string;
  HASH_SALT?: string;
  FEATURE_BOT_ENABLED?: string;
  DEDUPE_TTL_SECONDS?: string;
}

type EventType = "line_event" | "manus_progress" | "unknown";

const DEFAULT_DEDUPE_TTL = 120; // seconds
const memoryDedupeCache = new Map<string, number>();

function log(level: "info" | "warn" | "error", message: string, meta: Record<string, unknown> = {}) {
  const entry = { level, message, ...meta };
  console[level === "error" ? "error" : "log"](JSON.stringify(entry));
}

export function verifySignature(body: string, signature: string | null, env: RelayEnv): boolean {
  if (!signature) return false;

  // LINE sends a base64 encoded HMAC without prefix.
  const normalizedSig = signature.replace(/^sha256=/i, "");
  if (env.LINE_CHANNEL_SECRET) {
    try {
      const hash = createHmac("sha256", env.LINE_CHANNEL_SECRET).update(body).digest("base64");
      if (hash === normalizedSig) {
        return true;
      }
    } catch (error) {
      log("warn", "Failed to compute LINE signature", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (signature.startsWith("Bearer ") && env.MANUS_API_KEY) {
    return signature.substring("Bearer ".length) === env.MANUS_API_KEY;
  }

  return false;
}




export default {
  async fetch(req: Request, env: RelayEnv): Promise<Response> {
    if (env.FEATURE_BOT_ENABLED === "false") {
      log("warn", "Front Door disabled via FEATURE_BOT_ENABLED");
      return new Response(JSON.stringify({ error: "bot_disabled" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signature = req.headers.get("X-Line-Signature") ?? req.headers.get("Authorization");
    const rawBody = await req.text();

    if (!verifySignature(rawBody, signature, env)) {
      log("warn", "Signature verification failed", { hasSignature: Boolean(signature) });
      return new Response(JSON.stringify({ error: "signature_invalid" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (error) {
      log("error", "Failed to parse JSON payload", { error: error instanceof Error ? error.message : String(error) });
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const eventType = detectEventType(payload);
    if (eventType === "unknown") {
      log("warn", "Unknown event type received", { sample: rawBody.slice(0, 128) });
      return new Response(JSON.stringify({ error: "unsupported_event" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const dedupeKey = createDedupKey(eventType, payload, {
      hashSalt: env.HASH_SALT ?? "",
      signature,
      rawBody,
    });
    const ttl = resolveDedupeTtl(env.DEDUPE_TTL_SECONDS, DEFAULT_DEDUPE_TTL);
    const isFresh = await markEventAsSeen(dedupeKey, ttl);

    if (!isFresh) {
      log("info", "Duplicate event suppressed", { eventType, dedupeKey });
      return new Response(JSON.stringify({ status: "duplicate" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sanitized = sanitizePayload(payload, eventType, {
      hashSalt: env.HASH_SALT ?? "",
      redactLineMessage: (env as Record<string, string | undefined>).REDACT_LINE_MESSAGE === "true",
      deriveLineEvent: (rawEvent: Record<string, unknown>) => deriveLineSpecEvent(rawEvent),
    });
    const clientPayload =
      sanitized && typeof sanitized === "object"
        ? { ...(sanitized as Record<string, unknown>), dedupe_key: dedupeKey }
        : { value: sanitized, dedupe_key: dedupeKey };
    log("info", "Dispatching event to GitHub", { eventType, dedupeKey });

    const response = await fetch(
      `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GH_PAT}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: eventType,
          client_payload: clientPayload,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      log("error", "GitHub dispatch failed", { status: response.status, text: text.slice(0, 256) });
      return new Response(JSON.stringify({ error: "dispatch_failed", status: response.status }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "ok", event_type: eventType }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};

export const __testOnly = {
  clearMemoryDedupeCache() {
    memoryDedupeCache.clear();
  },
  memoryCacheSize() {
    return memoryDedupeCache.size;
  },
};
