/**
 * 認証リマインダー Edge Function
 *
 * 有料会員でLINE未登録者にリマインドメールを送信
 * - 3日後: 1回目リマインド
 * - 7日後: 2回目リマインド
 * - 14日後: 最終手段としてDiscord招待を直接メール送信
 *
 * 実行: GitHub Actions cron job (毎日09:00 JST)
 */
import { createClient } from "@supabase/supabase-js";
import { notifyDiscord } from "../_shared/alert.ts";
import { createDiscordInvite } from "../_shared/discord.ts";
import {
  sendDirectDiscordInviteEmail,
  sendReminderEmail,
} from "../_shared/email.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { createLogger } from "../_shared/logger.ts";
import { maskEmail } from "../_shared/masking-utils.ts";

const log = createLogger("verification-reminder");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

// リマインドスケジュール（日数）
const REMINDER_DAYS = {
  FIRST: 3,
  SECOND: 7,
  FINAL: 14,
};

interface UnverifiedMember {
  id: string;
  email: string;
  tier: string;
  verification_code: string;
  created_at: string;
  reminder_sent_count: number | null;
}

/**
 * 購入からの経過日数を計算
 */
function getDaysSincePurchase(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  // 必須環境変数の検証
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  if (!CRON_SECRET) {
    log.error("CRON_SECRET not configured - refusing to run without auth");
    return new Response(
      JSON.stringify({
        error: "Server configuration error: CRON_SECRET required",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // 認証チェック（cron job または手動実行）
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    log.warn("Unauthorized access attempt");
    return new Response("Unauthorized", { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    log.error("Missing Supabase credentials");
    return new Response("Server configuration error", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    log.info("Starting verification reminder job");

    // LINE未登録 かつ 認証コードあり かつ 有料会員 を取得
    const { data: unverifiedMembers, error: fetchError } = await supabase
      .from("members")
      .select(
        "id, email, tier, verification_code, created_at, reminder_sent_count",
      )
      .is("line_user_id", null)
      .not("verification_code", "is", null)
      .in("tier", ["library", "master"])
      .eq("discord_invite_sent", false);

    if (fetchError) {
      log.error("Failed to fetch unverified members", {
        errorMessage: fetchError.message,
      });
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
      });
    }

    const members = (unverifiedMembers ?? []) as UnverifiedMember[];
    log.info("Found unverified members", { count: members.length });

    const stats = {
      firstReminder: 0,
      secondReminder: 0,
      finalInvite: 0,
      errors: 0,
    };

    for (const member of members) {
      const daysSincePurchase = getDaysSincePurchase(member.created_at);
      const reminderCount = member.reminder_sent_count ?? 0;

      try {
        // 14日以上経過 → Discord招待を直接送信
        if (daysSincePurchase >= REMINDER_DAYS.FINAL) {
          // 楽観的ロック: まずdiscord_invite_sent=trueに更新（競合防止）
          const { data: lockResult, error: lockError } = await supabase
            .from("members")
            .update({
              discord_invite_sent: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", member.id)
            .eq("discord_invite_sent", false) // 未送信の場合のみ
            .select("id");

          if (lockError || !lockResult || lockResult.length === 0) {
            // 既に他のプロセスが処理中、またはDBエラー
            log.info("Skipping member (already being processed or locked)", {
              email: maskEmail(member.email),
            });
            continue;
          }

          const inviteResult = await createDiscordInvite();
          if (!inviteResult.success || !inviteResult.inviteUrl) {
            log.error("Could not create Discord invite for final fallback", {
              email: maskEmail(member.email),
              error: inviteResult.error,
            });
            // 招待生成失敗 - discord_invite_sentはtrueのまま（再処理防止）
            // 管理者がマニュアル対応する必要あり
            stats.errors++;
            continue;
          }

          const tierName = member.tier === "master"
            ? "Master Class"
            : "Library Member";

          const result = await sendDirectDiscordInviteEmail(
            member.email,
            inviteResult.inviteUrl,
            tierName,
          );

          if (result.success) {
            // 認証コードをクリア
            await supabase
              .from("members")
              .update({
                verification_code: null,
                verification_expires_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", member.id);

            log.info("Sent final Discord invite via email", {
              email: maskEmail(member.email),
              daysSincePurchase,
            });
            stats.finalInvite++;
          } else {
            log.error("Failed to send final invite email", {
              email: maskEmail(member.email),
              error: result.error,
            });
            stats.errors++;
          }
          continue;
        }

        // 7日以上経過 かつ リマインド1回以下 → 2回目リマインド
        if (
          daysSincePurchase >= REMINDER_DAYS.SECOND && reminderCount < 2
        ) {
          const result = await sendReminderEmail(
            member.email,
            member.verification_code,
            daysSincePurchase,
          );

          if (result.success) {
            await supabase
              .from("members")
              .update({
                reminder_sent_count: 2,
                updated_at: new Date().toISOString(),
              })
              .eq("id", member.id);

            log.info("Sent second reminder", {
              email: maskEmail(member.email),
              daysSincePurchase,
            });
            stats.secondReminder++;
          } else {
            stats.errors++;
          }
          continue;
        }

        // 3日以上経過 かつ リマインド0回 → 1回目リマインド
        if (
          daysSincePurchase >= REMINDER_DAYS.FIRST && reminderCount < 1
        ) {
          const result = await sendReminderEmail(
            member.email,
            member.verification_code,
            daysSincePurchase,
          );

          if (result.success) {
            await supabase
              .from("members")
              .update({
                reminder_sent_count: 1,
                updated_at: new Date().toISOString(),
              })
              .eq("id", member.id);

            log.info("Sent first reminder", {
              email: maskEmail(member.email),
              daysSincePurchase,
            });
            stats.firstReminder++;
          } else {
            stats.errors++;
          }
        }
      } catch (err) {
        log.error("Error processing member", {
          email: maskEmail(member.email),
          errorMessage: extractErrorMessage(err),
        });
        stats.errors++;
      }
    }

    // 統計をログ
    log.info("Verification reminder job completed", {
      totalProcessed: members.length,
      ...stats,
    });

    // エラーがあった場合はDiscordに通知
    if (stats.errors > 0) {
      await notifyDiscord({
        title: "Verification Reminder Job - Errors Detected",
        message: `${stats.errors} errors occurred during reminder job`,
        context: stats,
        severity: "warning",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: members.length,
        stats,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Verification reminder job failed", { errorMessage });

    await notifyDiscord({
      title: "MANUS ALERT: Verification Reminder Job Failed",
      message: errorMessage,
      severity: "critical",
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
