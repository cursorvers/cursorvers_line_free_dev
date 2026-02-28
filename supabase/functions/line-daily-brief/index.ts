/**
 * LINE Daily Brief Edge Function
 *
 * Selects one card from line_cards and broadcasts via LINE Messaging API.
 * Updated: 2026-01-22
 *
 * Selection Priority:
 * 1. status = 'ready' or 'used'
 * 2. Themes with the lowest total delivery count (avoid last theme)
 * 3. Cooldown: exclude cards used within last 7 days
 * 4. Source diversity: prefer different source type (belief vs note) from last delivery
 * 5. Random selection from eligible candidates
 *
 * POST /line-daily-brief
 * Headers:
 *   - X-API-Key: API key for scheduler authentication (LINE_DAILY_BRIEF_API_KEY)
 *   - OR Authorization: Bearer <service_role_key>
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("line-daily-brief");

type CardTheme =
  | "ai_gov"
  | "tax"
  | "law"
  | "biz"
  | "career"
  | "asset"
  | "general";
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
const LINE_DAILY_BRIEF_SMOKE_MODE =
  Deno.env.get("LINE_DAILY_BRIEF_SMOKE_MODE") === "true";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Verify request authentication
 */
function verifyAuth(req: Request): boolean {
  // Method 1: X-API-Key header (same pattern as generate-sec-brief)
  const apiKeyHeader = req.headers.get("X-API-Key");
  if (LINE_DAILY_BRIEF_API_KEY && apiKeyHeader === LINE_DAILY_BRIEF_API_KEY) {
    log.info("Authentication successful via X-API-Key");
    return true;
  }

  // Method 2: Authorization Bearer (service role key) - fallback
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      log.info("Authentication successful via Bearer token");
      return true;
    }
  }

  log.warn("Authentication failed", {
    hasApiKey: !!LINE_DAILY_BRIEF_API_KEY,
    hasApiKeyHeader: !!apiKeyHeader,
    apiKeyMatches: LINE_DAILY_BRIEF_API_KEY &&
      apiKeyHeader === LINE_DAILY_BRIEF_API_KEY,
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
async function getLastDeliveredTheme(
  client: SupabaseClient,
): Promise<CardTheme | null> {
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
 * Source type for card diversity
 */
type SourceType = "belief" | "note" | "other";

/**
 * Determine source type from source_path
 */
function getSourceType(sourcePath: string | null | undefined): SourceType {
  if (!sourcePath) return "other";
  if (sourcePath.startsWith("05_Beliefs/")) return "belief";
  if (sourcePath.startsWith("note.com/")) return "note";
  return "other";
}

/**
 * Get the source type of the last delivered card
 */
async function getLastDeliveredSourceType(
  client: SupabaseClient,
): Promise<SourceType | null> {
  const { data, error } = await client
    .from("line_cards")
    .select("source_path")
    .not("last_used_at", "is", null)
    .order("last_used_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return getSourceType(data.source_path);
}

/**
 * Calculate cooldown date (N days ago)
 */
function getCooldownDate(days: number): Date {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Select one card with balanced theme and source distribution
 * RULES:
 * 1. Never select the same theme as the previous delivery
 * 2. Prefer different source type (belief vs note) from previous delivery
 * 3. Apply cooldown period to avoid recently used cards
 * 4. When forcedSourceType is set, only select cards from that source
 */
async function selectCard(
  client: SupabaseClient,
  forcedSourceType?: SourceType,
): Promise<LineCard | null> {
  // Configuration
  const COOLDOWN_DAYS = 7;
  const CARD_LIMIT = 20;

  // Source path prefix for forced source type filtering
  const SOURCE_PATH_PREFIX: Record<string, string> = {
    belief: "05_Beliefs/",
    note: "note.com/",
  };

  if (forcedSourceType) {
    log.info("Forced source type", { forcedSourceType });
  }

  // Fetch last delivery info for diversity
  const [lastTheme, lastSourceType] = await Promise.all([
    getLastDeliveredTheme(client),
    getLastDeliveredSourceType(client),
  ]);
  log.info("Fetched last delivery info", {
    lastTheme: lastTheme ?? "none",
    lastSourceType: lastSourceType ?? "none",
  });

  // Get theme statistics
  const themeStats = await getThemeStats(client);
  let availableThemes = themeStats.filter((t) =>
    t.ready_count > 0 || t.total_times_used > 0
  );

  // Exclude last theme to avoid repetition
  if (lastTheme && availableThemes.length > 1) {
    availableThemes = availableThemes.filter((t) => t.theme !== lastTheme);
    log.info("Excluded last theme to avoid repetition", { lastTheme });
  }

  if (availableThemes.length === 0) {
    log.warn("No available themes after filtering");
    return null;
  }

  // Sort by usage (lowest first)
  availableThemes.sort((a, b) => a.total_times_used - b.total_times_used);
  const firstTheme = availableThemes[0];
  if (!firstTheme) {
    log.warn("No themes available after sort");
    return null;
  }
  const selectedTheme = firstTheme.theme;
  log.info("Selected theme", {
    selectedTheme,
    totalTimesUsed: firstTheme.total_times_used,
  });

  // Calculate cooldown threshold
  const cooldownDate = getCooldownDate(COOLDOWN_DAYS);
  const cooldownIso = cooldownDate.toISOString();

  // Fetch cards with cooldown filter
  // Cards are eligible if: last_used_at is null OR last_used_at < cooldownDate
  const sourcePrefix = forcedSourceType
    ? SOURCE_PATH_PREFIX[forcedSourceType]
    : undefined;

  let cardQuery = client
    .from("line_cards")
    .select("id,body,theme,source_path,times_used,status")
    .eq("theme", selectedTheme)
    .in("status", ["ready", "used"])
    .or(`last_used_at.is.null,last_used_at.lt.${cooldownIso}`)
    .order("times_used", { ascending: true })
    .limit(CARD_LIMIT);

  if (sourcePrefix) {
    cardQuery = cardQuery.like("source_path", `${sourcePrefix}%`);
  }

  const { data: cards, error } = await cardQuery;

  if (error) {
    throw new Error(`Failed to fetch cards: ${error.message}`);
  }

  // Guard: No cards available
  if (!cards || cards.length === 0) {
    log.warn(
      "No available cards after cooldown filter, trying without cooldown",
    );
    // Fallback: fetch without cooldown filter
    let fallbackQuery = client
      .from("line_cards")
      .select("id,body,theme,source_path,times_used,status")
      .eq("theme", selectedTheme)
      .in("status", ["ready", "used"])
      .order("times_used", { ascending: true })
      .limit(CARD_LIMIT);

    if (sourcePrefix) {
      fallbackQuery = fallbackQuery.like("source_path", `${sourcePrefix}%`);
    }

    const { data: fallbackCards, error: fallbackError } = await fallbackQuery;

    if (fallbackError || !fallbackCards || fallbackCards.length === 0) {
      log.warn("No available cards for selected theme", { selectedTheme });
      return null;
    }

    // Use fallback cards
    const randomIndex = Math.floor(Math.random() * fallbackCards.length);
    const selectedCard = fallbackCards[randomIndex] as LineCard;
    log.info("Selected card (fallback, no cooldown)", {
      cardId: selectedCard.id,
      timesUsed: selectedCard.times_used,
      sourceType: getSourceType(selectedCard.source_path),
    });
    return selectedCard;
  }

  // Prefer different source type for diversity (skip if forced)
  let selectedCard: LineCard;
  if (forcedSourceType) {
    // Source type already filtered in query — pick randomly
    const randomIndex = Math.floor(Math.random() * cards.length);
    selectedCard = cards[randomIndex] as LineCard;
    log.info("Selected card with forced source type", {
      cardId: selectedCard.id,
      sourceType: getSourceType(selectedCard.source_path),
      forcedSourceType,
    });
  } else if (lastSourceType) {
    const preferredCards = cards.filter(
      (c) => getSourceType(c.source_path) !== lastSourceType,
    );

    if (preferredCards.length > 0) {
      // Select randomly from preferred cards
      const randomIndex = Math.floor(Math.random() * preferredCards.length);
      selectedCard = preferredCards[randomIndex] as LineCard;
      log.info("Selected card with different source type", {
        cardId: selectedCard.id,
        sourceType: getSourceType(selectedCard.source_path),
        lastSourceType,
      });
    } else {
      // Fallback: no preferred cards, select from all
      const randomIndex = Math.floor(Math.random() * cards.length);
      selectedCard = cards[randomIndex] as LineCard;
      log.info("Selected card (same source type, no alternatives)", {
        cardId: selectedCard.id,
        sourceType: getSourceType(selectedCard.source_path),
      });
    }
  } else {
    // No last source type, select randomly
    const randomIndex = Math.floor(Math.random() * cards.length);
    selectedCard = cards[randomIndex] as LineCard;
    log.info("Selected card (no last source type)", {
      cardId: selectedCard.id,
      sourceType: getSourceType(selectedCard.source_path),
    });
  }

  log.info("Final selected card", {
    cardId: selectedCard.id,
    timesUsed: selectedCard.times_used,
    theme: selectedCard.theme,
    sourceType: getSourceType(selectedCard.source_path),
  });

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
  const footer =
    "\n\n──────────\nCursorvers.edu\nhttps://cursorvers.github.io/cursorvers-edu/";

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
    const response = await fetch(
      "https://api.line.me/v2/bot/message/broadcast",
      {
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
      },
    );

    if (response.ok) {
      const requestId = response.headers.get("X-Line-Request-Id");
      log.info("Broadcast succeeded", { attempt, requestId });
      return { success: true, requestId };
    }

    const errorBody = await response.text();
    lastError = `LINE API error ${response.status}: ${errorBody}`;
    const retryAfter = response.headers.get("Retry-After");
    const shouldRetry = response.status === 429 || response.status >= 500;

    const logContext = {
      attempt,
      status: response.status,
      errorBody,
      retryAfter,
    };
    if (shouldRetry) {
      log.warn("Broadcast failed, will retry", logContext);
    } else {
      log.error("Broadcast failed", logContext);
    }

    if (!shouldRetry || attempt >= maxAttempts) {
      break;
    }

    const retryMs = retryAfter
      ? Number(retryAfter) * 1000
      : 500 * Math.pow(2, attempt - 1);
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
  },
): Promise<void> {
  // Insert with both new and legacy columns for backward compatibility
  const insertData: Record<string, unknown> = {
    card_id: data.cardId,
    sent_at: new Date().toISOString(),
    success: data.broadcastStatus === "success",
    error_message: data.errorMessage || null,
  };

  // Add new columns if they exist
  if (data.theme) insertData["theme"] = data.theme;
  if (data.broadcastStatus) {
    insertData["broadcast_status"] = data.broadcastStatus;
  }
  if (data.lineRequestId) insertData["line_request_id"] = data.lineRequestId;
  if (data.lineResponseStatus !== null) {
    insertData["line_response_status"] = data.lineResponseStatus;
  }

  const { error } = await client.from("line_card_broadcasts").insert(
    insertData,
  );

  if (error) {
    log.warn("Failed to record broadcast history", {
      cardId: data.cardId,
      error: error.message,
    });
    // Don't throw - this is non-critical
  } else {
    log.info("Broadcast history recorded", {
      cardId: data.cardId,
      status: data.broadcastStatus,
    });
  }
}

/**
 * Update card after successful delivery (SQL injection safe)
 */
async function updateCardAfterDelivery(
  client: SupabaseClient,
  cardId: string,
): Promise<void> {
  const { error } = await client.rpc("increment_times_used", {
    card_id: cardId,
  });

  if (!error) {
    log.info("Card updated via RPC", { cardId });
    return;
  }

  log.warn("RPC increment_times_used failed, applying safe fallback", {
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

  log.info("Card updated via fallback", { cardId });
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
    log.error("Authentication failed");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isSmokeRequest = LINE_DAILY_BRIEF_SMOKE_MODE &&
    req.headers.get("x-smoke-test") === "true";
  if (isSmokeRequest) {
    log.info("Line daily brief smoke mode");
    return new Response(
      JSON.stringify({ success: true, smoke: true, cardSent: false }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    // Parse optional source_type from request body
    let forcedSourceType: SourceType | undefined;
    try {
      const body = await req.json();
      if (body.source_type && ["belief", "note"].includes(body.source_type)) {
        forcedSourceType = body.source_type as SourceType;
        log.info("Request specifies source_type", { forcedSourceType });
      }
    } catch {
      // No body or invalid JSON — use default behavior
    }

    log.info("Step 1: Selecting card", {
      forcedSourceType: forcedSourceType ?? "auto",
    });
    const card = await selectCard(supabaseClient, forcedSourceType);

    if (!card) {
      log.warn("No card available to send");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No card to send",
          cardSent: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    log.info("Step 2: Formatting message", {
      cardId: card.id,
      messageLength: card.body.length,
    });
    const message = formatMessage(card);

    log.info("Step 3: Broadcasting via LINE", { cardId: card.id });
    const broadcastResult = await broadcastMessage(message);

    if (!broadcastResult.success) {
      log.error("Broadcast failed", { error: broadcastResult.error });

      // Record failed broadcast history
      await recordBroadcastHistory(supabaseClient, {
        cardId: card.id,
        theme: card.theme,
        broadcastStatus: "failed",
        errorMessage: broadcastResult.error || "Unknown error",
        lineRequestId: broadcastResult.requestId || null,
        lineResponseStatus: null,
      }).catch((err) => {
        log.warn("Failed to record broadcast history", { error: err.message });
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: broadcastResult.error,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    log.info("Step 4: Updating card record", { cardId: card.id });
    await updateCardAfterDelivery(supabaseClient, card.id);

    // Step 5: Record broadcast history
    log.info("Step 5: Recording broadcast history", { cardId: card.id });
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
      },
    );
  } catch (error) {
    log.error("Error in line-daily-brief", {
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
      },
    );
  }
});
