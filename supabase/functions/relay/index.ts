// Front Door relay: verifies LINE signatures, enforces idempotency, sanitizes payload, and dispatches to GitHub repository_dispatch.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GH_OWNER = requireEnv("GH_OWNER");
const GH_REPO = requireEnv("GH_REPO");
const GH_PAT = requireEnv("GH_PAT");
const LINE_CHANNEL_SECRET = requireEnv("LINE_CHANNEL_SECRET");
const ID_HASH_SALT = requireEnv("ID_HASH_SALT");
const FEATURE_BOT_ENABLED = Deno.env.get("FEATURE_BOT_ENABLED") !== "false";

type LineEvent = {
  type: string;
  timestamp?: number;
  source?: { type?: string; userId?: string };
  replyToken?: string;
  [key: string]: unknown;
};

type LineWebhookBody = {
  destination?: string;
  events?: LineEvent[];
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashText(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

async function hashUserId(userId: string): Promise<string> {
  return hashText(`${ID_HASH_SALT}:${userId}`);
}

async function verifyLineSignature(req: Request, raw: string): Promise<boolean> {
  const signature = req.headers.get("x-line-signature");
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const hmac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hmac)));
  return hashBase64 === signature;
}

async function sanitize(body: LineWebhookBody): Promise<LineWebhookBody> {
  const events = body.events ?? [];
  const sanitized = await Promise.all(
    events.map(async (e) => {
      const userId = e.source?.userId;
      const hashedId = userId ? await hashUserId(userId) : undefined;
      return {
        ...e,
        source: {
          ...e.source,
          userId: hashedId ? `hash:${hashedId}` : undefined,
        },
        replyToken: e.replyToken, // keep for downstream reply
      };
    })
  );

  return {
    destination: body.destination,
    events: sanitized,
  };
}

const idempotencyCache = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

function recordSeen(id: string): void {
  const now = Date.now();
  idempotencyCache.set(id, now);
  for (const [key, ts] of idempotencyCache.entries()) {
    if (now - ts > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}

serve(async (req) => {
  if (!FEATURE_BOT_ENABLED) {
    return new Response(JSON.stringify({ error: "Bot is disabled" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const signatureValid = await verifyLineSignature(req, rawBody);
  if (!signatureValid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let parsed: LineWebhookBody;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventId = await hashText(rawBody);
  if (idempotencyCache.has(eventId)) {
    return new Response(JSON.stringify({ status: "duplicate", event_id: eventId }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sanitized = await sanitize(parsed);

  const payload = {
    event_type: "line_event",
    client_payload: {
      source: "line",
      event_id: eventId,
      received_at: new Date().toISOString(),
      events: sanitized.events ?? [],
      destination: sanitized.destination,
      signature_valid: true,
      idempotency_key: eventId,
    },
  };

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GH_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!dispatchRes.ok) {
    const body = await dispatchRes.text();
    console.error("Failed to dispatch to GitHub:", dispatchRes.status, body);
    return new Response(
      JSON.stringify({
        error: "Failed to dispatch",
        status: dispatchRes.status,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  recordSeen(eventId);

  return new Response(
    JSON.stringify({
      status: "ok",
      event_id: eventId,
      dispatched: true,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
