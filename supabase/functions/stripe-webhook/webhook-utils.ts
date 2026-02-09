/**
 * Stripe Webhook Utility Functions
 * Rate limiting, Google Sheets append, Discord invite via LINE
 */
import { type SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscord } from "../_shared/alert.ts";
import { createDiscordInvite } from "../_shared/discord.ts";
import { createLogger } from "../_shared/logger.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { pushLineMessage } from "../_shared/line-messaging.ts";
import { createSheetsClientFromEnv } from "../_shared/google-sheets.ts";

const log = createLogger("stripe-webhook");

export const RATE_LIMIT = {
  MAX_REQUESTS: 100,
  WINDOW_SECONDS: 60,
  ACTION: "stripe_webhook",
} as const;

// Google Sheets 連携（任意）
const MEMBERS_SHEET_ID = Deno.env.get("MEMBERS_SHEET_ID") ?? "";
const MEMBERS_SHEET_TAB = Deno.env.get("MEMBERS_SHEET_TAB") ?? "members";
const GOOGLE_SA_JSON = Deno.env.get("GOOGLE_SA_JSON") ?? "";

export function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown"
  );
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
): Promise<boolean> {
  try {
    const windowStart = new Date(
      Date.now() - RATE_LIMIT.WINDOW_SECONDS * 1000,
    ).toISOString();

    const { count, error } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("identifier", identifier)
      .eq("action", RATE_LIMIT.ACTION)
      .gte("attempted_at", windowStart);

    if (error) {
      log.warn("Rate limit check failed, allowing request", {
        errorMessage: error.message,
      });
      return true;
    }

    const attempts = count ?? 0;
    if (attempts >= RATE_LIMIT.MAX_REQUESTS) {
      log.warn("Rate limit exceeded", {
        identifier,
        attempts,
        limit: RATE_LIMIT.MAX_REQUESTS,
      });
      return false;
    }

    return true;
  } catch (err) {
    log.warn("Rate limit check exception, allowing request", {
      errorMessage: extractErrorMessage(err),
    });
    return true;
  }
}

export async function recordRequest(
  supabase: SupabaseClient,
  identifier: string,
  success: boolean,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("rate_limits").insert({
      identifier,
      action: RATE_LIMIT.ACTION,
      success,
      metadata,
    });
  } catch (err) {
    log.warn("Failed to record rate limit", {
      errorMessage: extractErrorMessage(err),
    });
  }
}

export async function appendMemberRow(row: unknown[]) {
  if (!MEMBERS_SHEET_ID || !GOOGLE_SA_JSON) {
    log.debug("Google Sheets not configured, skipping append");
    return;
  }
  try {
    const client = await createSheetsClientFromEnv(
      GOOGLE_SA_JSON,
      MEMBERS_SHEET_ID,
    );
    await client.append(MEMBERS_SHEET_TAB, [row]);
    log.info("Appended member to sheet", { tab: MEMBERS_SHEET_TAB });
  } catch (err) {
    log.warn("Failed to append to sheet", {
      errorMessage: extractErrorMessage(err),
    });
  }
}

/**
 * Discord招待リンクを生成し、LINE経由で送信
 */
export async function sendDiscordInviteViaLine(
  email: string,
  name: string | null,
  tier: string,
  lineUserId: string | null,
): Promise<boolean> {
  try {
    const inviteResult = await createDiscordInvite();

    if (!inviteResult.success || !inviteResult.inviteUrl) {
      log.error("Failed to create Discord invite", {
        error: inviteResult.error,
      });
      await notifyDiscord({
        title: "MANUS ALERT: Discord invite creation failed",
        message: inviteResult.error || "Unknown error",
        context: { email, tier },
      });
      return false;
    }

    const inviteUrl = inviteResult.inviteUrl;
    log.info("Discord invite created", { email });

    let lineSendSuccess = false;
    if (lineUserId) {
      const message = [
        "🎉 ご購入ありがとうございます！",
        "",
        `【${tier === "master" ? "Master Class" : "Library Member"}】`,
        "の特典をご利用いただけます。",
        "",
        "━━━━━━━━━━━━━━━",
        "📚 Discord コミュニティ",
        "━━━━━━━━━━━━━━━",
        "",
        "▼ 以下のリンクから参加してください",
        inviteUrl,
        "",
        "※ このリンクは2週間有効・1回限りです",
      ].join("\n");

      const sent = await pushLineMessage(lineUserId, message);
      if (sent) {
        log.info("Discord invite sent via LINE", { email });
        lineSendSuccess = true;
      } else {
        log.warn("Failed to send Discord invite via LINE", { email });
        await notifyDiscord({
          title: "MANUS ALERT: LINE message send failed",
          message: `Discord invite created but LINE send failed`,
          context: { email, tier },
        });
      }
    } else {
      log.info(
        "No LINE user ID, invite will be sent when user registers LINE",
        { email },
      );
    }

    await notifyDiscord({
      title: "🎉 New Member Joined!",
      message: `**Email**: ${email}\n**Name**: ${
        name || "N/A"
      }\n**Tier**: ${tier}\n**LINE**: ${
        lineSendSuccess ? "送信済" : lineUserId ? "送信失敗" : "未登録"
      }`,
    });

    return lineSendSuccess;
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Failed to send Discord invite", { email, errorMessage });
    await notifyDiscord({
      title: "MANUS ALERT: Discord invite error",
      message: errorMessage,
      context: { email, tier },
    });
    return false;
  }
}
