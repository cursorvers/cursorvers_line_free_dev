/**
 * LINE Daily Brief Edge Function
 *
 * Selects one card from line_cards and broadcasts via LINE Messaging API.
 * Updated: 2025-12-04
 * Priority:
 * 1. status = 'ready'
 * 2. Themes with the lowest total delivery count
 * 3. Cards with the lowest times_used in the selected theme
 *
 * POST /line-daily-brief
 * Headers:
 *   - X-API-Key: API key for scheduler authentication (LINE_DAILY_BRIEF_API_KEY)
 *   - OR Authorization: Bearer <service_role_key>
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

type CardTheme = "ai_gov" | "tax" | "law" | "biz" | "career" | "asset" | "general";
type CardStatus = "ready" | "used" | "archived";

interface LineCard {
  id: string;
  body: string;
  theme: CardTheme;
  source_path: string;
  times_used: number;
  status: CardStatus;
}

interface ThemeStats {
  theme: CardTheme;
  total_times_used: number;
  ready_count: number;
}

interface BroadcastResult {
  success: boolean;
  requestId?: string | null;
  error?: string;
}

type LogLevel = "info" | "warn" | "error";

const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LINE_CHANNEL_ACCESS_TOKEN",
] as const;

const getEnv = (name: (typeof REQUIRED_ENV_VARS)[number]): string => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const LINE_CHANNEL_ACCESS_TOKEN = getEnv("LINE_CHANNEL_ACCESS_TOKEN");
// Use API key for authentication (same pattern as generate-sec-brief)
const LINE_DAILY_BRIEF_API_KEY = Deno.env.get("LINE_DAILY_BRIEF_API_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const log = (level: LogLevel, message: string, context: Record<string, unknown> = {}) => {
  const entry = {
    level,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  };
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Verify request authentication
 */
function verifyAuth(req: Request): boolean {
  // Method 1: X-API-Key header (same pattern as generate-sec-brief)
  const apiKeyHeader = req.headers.get("X-API-Key");
  if (LINE_DAILY_BRIEF_API_KEY && apiKeyHeader === LINE_DAILY_BRIEF_API_KEY) {
    log("info", "Authentication successful via X-API-Key");
    return true;
  }

  // Method 2: Authorization Bearer (service role key) - fallback
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      log("info", "Authentication successful via Bearer token");
      return true;
    }
  }

  log("warn", "Authentication failed", {
    hasApiKey: !!LINE_DAILY_BRIEF_API_KEY,
    hasApiKeyHeader: !!apiKeyHeader,
    apiKeyMatches: LINE_DAILY_BRIEF_API_KEY && apiKeyHeader === LINE_DAILY_BRIEF_API_KEY,
    hasAuthHeader: !!authHeader,
  });
  return false;
}

/**
 * Get theme statistics for balanced selection (DB-side aggregation)
 */
async function getThemeStats(client: SupabaseClient): Promise<ThemeStats[]> {
  const { data, error } = await client.rpc("get_theme_stats");

  if (error) {
    throw new Error(`Failed to fetch theme stats: ${error.message}`);
  }

  return (data || []) as ThemeStats[];
}

/**
 * Get the theme of the last delivered card
 */
async function getLastDeliveredTheme(client: SupabaseClient): Promise<CardTheme | null> {
  const { data, error } = await client
    .from("line_cards")
    .select("theme")
    .not("last_used_at", "is", null)
    .order("last_used_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data.theme as CardTheme;
}

/**
 * Select one card with balanced theme distribution
 * RULE: Never select the same theme as the previous delivery
 */
async function selectCard(client: SupabaseClient): Promise<LineCard | null> {
  const lastTheme = await getLastDeliveredTheme(client);
  log("info", "Fetched last delivered theme", { lastTheme: lastTheme ?? "none" });

  const themeStats = await getThemeStats(client);
  let availableThemes = themeStats.filter((t) => t.ready_count > 0 || t.total_times_used > 0);

  if (lastTheme && availableThemes.length > 1) {
    availableThemes = availableThemes.filter((t) => t.theme !== lastTheme);
    log("info", "Excluded last theme to avoid repetition", { lastTheme });
  }

  if (availableThemes.length === 0) {
    log("warn", "No available themes after filtering");
    return null;
  }

  availableThemes.sort((a, b) => a.total_times_used - b.total_times_used);
  const selectedTheme = availableThemes[0].theme;
  log("info", "Selected theme", {
    selectedTheme,
    totalTimesUsed: availableThemes[0].total_times_used,
  });

  const { data: cards, error } = await client
    .from("line_cards")
    .select("*")
    .eq("theme", selectedTheme)
    .in("status", ["ready", "used"])
    .order("times_used", { ascending: true })
    .limit(5);

  if (error) {
    throw new Error(`Failed to fetch cards: ${error.message}`);
  }

  if (!cards || cards.length === 0) {
    log("warn", "No available cards for selected theme", { selectedTheme });
    return null;
  }

  const randomIndex = Math.floor(Math.random() * Math.min(cards.length, 5));
  const selectedCard = cards[randomIndex] as LineCard;

  log("info", "Selected card", { cardId: selectedCard.id, timesUsed: selectedCard.times_used });

  return selectedCard;
}

/**
 * Format card body for LINE message
 */
function formatMessage(card: LineCard): string {
  const themeEmoji: Record<CardTheme, string> = {
    ai_gov: "🤖",
    tax: "💰",
    law: "⚖️",
    biz: "📈",
    career: "👨‍⚕️",
    asset: "🏦",
    general: "💡",
  };

  const emoji = themeEmoji[card.theme] || "💡";
  const footer = "\n\n──────────\nCursorvers.edu\nhttps://cursorvers.github.io/cursorvers-edu/";

  let message = `${emoji} 今日のひとこと\n\n${card.body}${footer}`;

  if (message.length > 4500) {
    message = `${message.substring(0, 4450)}...${footer}`;
  }

  return message;
}

/**
 * Send broadcast message via LINE Messaging API with retries
 */
async function broadcastMessage(text: string): Promise<BroadcastResult> {
  const maxAttempts = 3;
  let attempt = 0;
  let lastError = "";

  while (attempt < maxAttempts) {
    attempt += 1;
    const response = await fetch("https://api.line.me/v2/bot/message/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messages: [
          {
            type: "text",
            text,
          },
        ],
      }),
    });

    if (response.ok) {
      const requestId = response.headers.get("X-Line-Request-Id");
      log("info", "Broadcast succeeded", { attempt, requestId });
      return { success: true, requestId };
    }

    const errorBody = await response.text();
    lastError = `LINE API error ${response.status}: ${errorBody}`;
    const retryAfter = response.headers.get("Retry-After");
    const shouldRetry = response.status === 429 || response.status >= 500;

    log(shouldRetry ? "warn" : "error", "Broadcast failed", {
      attempt,
      status: response.status,
      errorBody,
      retryAfter,
    });

    if (!shouldRetry || attempt >= maxAttempts) {
      break;
    }

    const retryMs = retryAfter ? Number(retryAfter) * 1000 : 500 * Math.pow(2, attempt - 1);
    await delay(retryMs);
  }

  return { success: false, error: lastError || "Unknown LINE broadcast error" };
}

/**
 * Record broadcast history for monitoring and analytics
 */
async function recordBroadcastHistory(
  client: SupabaseClient,
  data: {
    cardId: string;
    theme: CardTheme;
    broadcastStatus: "success" | "failed";
    errorMessage?: string;
    lineRequestId: string | null;
    lineResponseStatus: number | null;
  }
): Promise<void> {
  const { error } = await client.from("line_card_broadcasts").insert({
    card_id: data.cardId,
    theme: data.theme,
    broadcast_status: data.broadcastStatus,
    error_message: data.errorMessage || null,
    line_request_id: data.lineRequestId,
    line_response_status: data.lineResponseStatus,
  });

  if (error) {
    log("warn", "Failed to record broadcast history", {
      cardId: data.cardId,
      error: error.message,
    });
    // Don't throw - this is non-critical
  } else {
    log("info", "Broadcast history recorded", {
      cardId: data.cardId,
      status: data.broadcastStatus,
    });
  }
}

/**
 * Update card after successful delivery (SQL injection safe)
 */
async function updateCardAfterDelivery(client: SupabaseClient, cardId: string): Promise<void> {
  const { error } = await client.rpc("increment_times_used", { card_id: cardId });

  if (!error) {
    log("info", "Card updated via RPC", { cardId });
    return;
  }

  log("warn", "RPC increment_times_used failed, applying safe fallback", {
    cardId,
    error: error.message,
  });

  const { data: currentCard, error: fetchError } = await client
    .from("line_cards")
    .select("times_used")
    .eq("id", cardId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch card for update: ${fetchError.message}`);
  }

  const { error: updateError } = await client
    .from("line_cards")
    .update({
      times_used: (currentCard?.times_used || 0) + 1,
      last_used_at: new Date().toISOString(),
      status: "used",
    })
    .eq("id", cardId);

  if (updateError) {
    throw new Error(`Failed to update card: ${updateError.message}`);
  }

  log("info", "Card updated via fallback", { cardId });
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!verifyAuth(req)) {
    log("error", "Authentication failed");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    log("info", "Step 1: Selecting card");
    const card = await selectCard(supabaseClient);

    if (!card) {
      log("warn", "No card available to send");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No card to send",
          cardSent: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    log("info", "Step 2: Formatting message", {
      cardId: card.id,
      messageLength: card.body.length,
    });
    const message = formatMessage(card);

    log("info", "Step 3: Broadcasting via LINE", { cardId: card.id });
    const broadcastResult = await broadcastMessage(message);

    if (!broadcastResult.success) {
      log("error", "Broadcast failed", { error: broadcastResult.error });
      
      // Record failed broadcast history
      await recordBroadcastHistory(supabaseClient, {
        cardId: card.id,
        theme: card.theme,
        broadcastStatus: "failed",
        errorMessage: broadcastResult.error || "Unknown error",
        lineRequestId: broadcastResult.requestId || null,
        lineResponseStatus: null,
      }).catch((err) => {
        log("warn", "Failed to record broadcast history", { error: err.message });
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: broadcastResult.error,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    log("info", "Step 4: Updating card record", { cardId: card.id });
    await updateCardAfterDelivery(supabaseClient, card.id);

    // Step 5: Record broadcast history
    log("info", "Step 5: Recording broadcast history", { cardId: card.id });
    await recordBroadcastHistory(supabaseClient, {
      cardId: card.id,
      theme: card.theme,
      broadcastStatus: "success",
      lineRequestId: broadcastResult.requestId || null,
      lineResponseStatus: 200,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Daily brief sent successfully",
        cardSent: true,
        cardId: card.id,
        theme: card.theme,
        bodyPreview: `${card.body.substring(0, 50)}...`,
        requestId: broadcastResult.requestId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    log("error", "Error in line-daily-brief", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
