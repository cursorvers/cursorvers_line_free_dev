#!/usr/bin/env node
/**
 * Supabase Line Event Upsert Script
 * Upserts LINE webhook events to Supabase database
 *
 * Usage:
 *   node scripts/supabase/upsert-line-event.js <event_path> <plan_path> <run_ref>
 *
 * Environment:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for auth
 */

const fs = require("fs");
const https = require("https");

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TABLE_NAME = "line_events";

/**
 * Make HTTP request to Supabase
 */
function makeSupabaseRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : null });
        } else {
          reject(new Error(`Supabase error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Generate idempotency key from event
 */
function generateIdempotencyKey(event, stepId) {
  const crypto = require("crypto");
  const eventId = event.webhookEventId || event.timestamp || Date.now().toString();
  const data = `${eventId}:${stepId}`;
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
}

/**
 * Extract user ID from LINE event
 */
function extractUserId(event) {
  if (event.source && event.source.userId) {
    return event.source.userId;
  }
  return null;
}

/**
 * Map LINE event to database record
 */
function mapEventToRecord(event, runRef) {
  const userId = extractUserId(event);
  const idempotencyKey = generateIdempotencyKey(event, "upsert");

  return {
    event_id: event.webhookEventId || idempotencyKey,
    event_type: event.type || "unknown",
    line_user_id: userId,
    timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
    reply_token: event.replyToken || null,
    message: event.message ? JSON.stringify(event.message) : null,
    postback: event.postback ? JSON.stringify(event.postback) : null,
    source: event.source ? JSON.stringify(event.source) : null,
    raw_event: JSON.stringify(event),
    run_ref: runRef || null,
    idempotency_key: idempotencyKey,
    status: "received",
    created_at: new Date().toISOString(),
  };
}

/**
 * Main function
 */
async function main() {
  const [eventPath, planPath, runRef] = process.argv.slice(2);

  // Validate inputs
  if (!eventPath || !planPath) {
    console.log(JSON.stringify({ status: "error", message: "eventPath and planPath required" }));
    process.exit(1);
  }

  if (!fs.existsSync(eventPath)) {
    console.log(JSON.stringify({ status: "error", message: `Event file not found: ${eventPath}` }));
    process.exit(1);
  }

  if (!fs.existsSync(planPath)) {
    console.log(JSON.stringify({ status: "error", message: `Plan file not found: ${planPath}` }));
    process.exit(1);
  }

  // Check environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      JSON.stringify({
        status: "ok",
        note: "Supabase credentials not configured, skipping upsert",
        run_ref: runRef || "",
      })
    );
    process.exit(0);
  }

  try {
    // Read event payload
    const eventPayload = JSON.parse(fs.readFileSync(eventPath, "utf-8"));
    const events = eventPayload.events || [eventPayload];

    // Read plan for validation
    const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each event
    for (const event of events) {
      try {
        const record = mapEventToRecord(event, runRef);

        // Upsert to Supabase
        await makeSupabaseRequest(`/rest/v1/${TABLE_NAME}`, "POST", record);

        results.push({
          event_id: record.event_id,
          status: "ok",
        });
        successCount++;
      } catch (error) {
        results.push({
          event_id: event.webhookEventId || "unknown",
          status: "error",
          message: error.message,
        });
        errorCount++;
      }
    }

    const output = {
      status: errorCount === 0 ? "ok" : successCount > 0 ? "partial" : "error",
      run_ref: runRef || "",
      plan_title: plan.title || "unnamed",
      events_processed: events.length,
      success_count: successCount,
      error_count: errorCount,
      results: results,
    };

    console.log(JSON.stringify(output));
    process.exit(errorCount === events.length ? 1 : 0);
  } catch (error) {
    console.log(
      JSON.stringify({
        status: "error",
        message: error.message,
        run_ref: runRef || "",
      })
    );
    process.exit(1);
  }
}

main();
