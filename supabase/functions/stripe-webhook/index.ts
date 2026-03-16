/**
 * Stripe Webhook Edge Function
 * Stripe決済イベントを処理し、会員情報を更新
 *
 * 認証コード方式:
 * 1. 決済完了時に認証コードを生成・保存
 * 2. メールで認証コードとLINE登録案内を送信
 * 3. LINE登録後にコード入力でDiscord招待を送信
 * 4. 既にLINE紐付け済みの場合は即座にDiscord招待
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { notifyDiscord } from "../_shared/alert.ts";
import {
  addDiscordRole,
  createClientRoom,
  createDiscordInvite,
  findExistingClientRoom,
  removeDiscordRole,
} from "../_shared/discord.ts";
import { sendPaidMemberWelcomeEmail } from "../_shared/email.ts";
import { createSheetsClientFromEnv } from "../_shared/google-sheets.ts";
import { pushLineMessage } from "../_shared/line-messaging.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  maskDiscordUserId,
  maskEmail,
  maskLineUserId,
  maskVerificationCode,
} from "../_shared/masking-utils.ts";
import {
  generateVerificationCode,
  getCodeExpiryDate,
} from "../_shared/verification-code.ts";
import {
  determineMembershipTier,
  determineStatus,
  determineTierByProduct,
} from "./tier-utils.ts";
import {
  savePaymentFromCharge,
  savePaymentFromCheckout,
} from "./payment-history.ts";
import { notifyStripeEvent } from "../_shared/n8n-notify.ts";

const log = createLogger("stripe-webhook");
const RATE_LIMIT = {
  MAX_REQUESTS: 100,
  WINDOW_SECONDS: 60,
  ACTION: "stripe_webhook",
} as const;
const pendingClientRoomEnsures = new Map<string, Promise<void>>();

// Google Sheets 連携（任意）
const MEMBERS_SHEET_ID = Deno.env.get("MEMBERS_SHEET_ID") ?? "";
const MEMBERS_SHEET_TAB = Deno.env.get("MEMBERS_SHEET_TAB") ?? "members";
const GOOGLE_SA_JSON = Deno.env.get("GOOGLE_SA_JSON") ?? "";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

// 孤児レコードの型定義
interface OrphanRecord {
  id: string;
  email?: string | null;
  line_user_id?: string | null;
  tier?: string | null;
}

/**
 * 孤児レコード（LINE IDのみで登録された無料会員）を有料会員にマージ
 * - 同一line_user_idで別のレコードが存在する場合、line_user_idを新レコードに移行し旧レコードを削除
 */
async function mergeOrphanLineRecord(
  // deno-lint-ignore no-explicit-any
  supabase: ReturnType<typeof createClient<any>>,
  paidEmail: string,
  paidMemberId: string,
): Promise<{ merged: boolean; orphanLineUserId?: string }> {
  // まず新しい有料レコードにline_user_idがあるか確認
  const { data: paidMember } = await supabase
    .from("members")
    .select("line_user_id")
    .eq("id", paidMemberId)
    .maybeSingle();

  const paidMemberData = paidMember as { line_user_id?: string | null } | null;

  if (paidMemberData?.line_user_id) {
    // すでにline_user_idがあれば、そのline_user_idで別の孤児レコードを探す
    const { data: orphans } = await supabase
      .from("members")
      .select("id, email, line_user_id")
      .eq("line_user_id", paidMemberData.line_user_id)
      .neq("id", paidMemberId);

    const orphanList = orphans as OrphanRecord[] | null;

    if (orphanList && orphanList.length > 0) {
      // 孤児レコードを削除
      for (const orphan of orphanList) {
        await supabase.from("members").delete().eq("id", orphan.id);
        log.info("Deleted orphan record (same line_user_id)", {
          orphanId: orphan.id,
          orphanEmail: maskEmail(orphan.email),
          lineUserId: maskLineUserId(orphan.line_user_id),
        });
      }
      return { merged: true, orphanLineUserId: paidMemberData.line_user_id };
    }
  }

  // 有料レコードにline_user_idがない場合、emailがnullの孤児レコードを探す
  // (LINE IDのみで登録された無料会員)
  // 順序保証: 最も古いレコード（created_at ASC）を採用
  const { data: emailNullOrphans } = await supabase
    .from("members")
    .select("id, line_user_id, tier")
    .is("email", null)
    .not("line_user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  const emailNullOrphanList = emailNullOrphans as OrphanRecord[] | null;

  if (emailNullOrphanList && emailNullOrphanList.length > 0) {
    // 最も古い孤児レコードのline_user_idを有料レコードに移行
    const orphan = emailNullOrphanList[0];
    if (orphan && orphan.line_user_id) {
      // 有料レコードにline_user_idを設定
      await supabase
        .from("members")
        .update({ line_user_id: orphan.line_user_id })
        .eq("id", paidMemberId);

      // 孤児レコードを削除
      await supabase.from("members").delete().eq("id", orphan.id);

      log.info("Merged orphan LINE record into paid member", {
        paidEmail: maskEmail(paidEmail),
        orphanId: orphan.id,
        lineUserId: maskLineUserId(orphan.line_user_id),
      });

      return { merged: true, orphanLineUserId: orphan.line_user_id };
    }
  }

  return { merged: false };
}

// Google Sheets連携関数
async function appendMemberRow(row: unknown[]) {
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

// Discord招待リンクを生成し、LINE経由で送信
async function sendDiscordInviteViaLine(
  email: string,
  name: string | null,
  tier: string,
  lineUserId: string | null,
): Promise<boolean> {
  try {
    // Discord招待リンクを生成（有効期限2週間、使用回数1回）
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
    log.info("Discord invite created", { email, inviteUrl });

    // LINE経由で招待リンクを送信
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
          context: { email, tier, inviteUrl },
        });
      }
    } else {
      log.info(
        "No LINE user ID, invite will be sent when user registers LINE",
        { email },
      );
    }

    // Discordに通知（管理者用）
    await notifyDiscord({
      title: "🎉 New Member Joined!",
      message: `**Email**: ${email}\n**Name**: ${
        name || "N/A"
      }\n**Tier**: ${tier}\n**LINE**: ${
        lineSendSuccess ? "送信済" : lineUserId ? "送信失敗" : "未登録"
      }\n**Invite**: ${inviteUrl}`,
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

function resolveDiscordRoomUsername(
  name: string | null | undefined,
  email: string | null | undefined,
  discordUserId: string,
): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const emailLocalPart = email?.split("@")[0]?.trim();
  if (emailLocalPart) {
    return emailLocalPart;
  }

  return `client-${discordUserId.slice(-4)}`;
}

async function ensureDiscordClientRoom(
  discordUserId: string,
  username: string,
): Promise<void> {
  const existingChannelId = await findExistingClientRoom(discordUserId);
  if (existingChannelId) {
    log.info("Discord client room already exists", {
      discordUserId: maskDiscordUserId(discordUserId),
      channelId: existingChannelId,
    });
    return;
  }

  const roomResult = await createClientRoom(discordUserId, username);
  if (roomResult.success) {
    log.info("Discord client room ensured", {
      discordUserId: maskDiscordUserId(discordUserId),
      channelId: roomResult.channelId,
    });
  } else {
    log.warn("Failed to ensure Discord client room", {
      discordUserId: maskDiscordUserId(discordUserId),
      error: roomResult.error,
    });
  }
}

function queueDiscordClientRoomEnsure(
  discordUserId: string,
  username: string,
): void {
  if (pendingClientRoomEnsures.has(discordUserId)) {
    log.debug("Discord client room ensure already pending", {
      discordUserId: maskDiscordUserId(discordUserId),
    });
    return;
  }

  const pendingJob = ensureDiscordClientRoom(discordUserId, username)
    .catch((err) => {
      log.warn("Discord client room creation failed unexpectedly", {
        discordUserId: maskDiscordUserId(discordUserId),
        error: extractErrorMessage(err),
      });
    })
    .finally(() => {
      pendingClientRoomEnsures.delete(discordUserId);
    });

  pendingClientRoomEnsures.set(discordUserId, pendingJob);
}

function grantDiscordMembershipAccess(
  discordUserId: string | null | undefined,
  name: string | null | undefined,
  email: string | null | undefined,
): void {
  if (!discordUserId) {
    return;
  }

  void addDiscordRole(discordUserId).then((result) => {
    if (result.success) {
      log.info("Discord role added for member access", {
        discordUserId: maskDiscordUserId(discordUserId),
      });
    } else {
      log.warn("Failed to add Discord role for member access", {
        discordUserId: maskDiscordUserId(discordUserId),
        error: result.error,
      });
    }
  }).catch((err) => {
    log.warn("Discord role grant failed unexpectedly", {
      discordUserId: maskDiscordUserId(discordUserId),
      error: extractErrorMessage(err),
    });
  });

  const username = resolveDiscordRoomUsername(name, email, discordUserId);
  queueDiscordClientRoomEnsure(discordUserId, username);
}

function determineTierFromSubscription(
  subscription: Stripe.Subscription,
): string {
  const primaryItem = subscription.items.data[0];
  const price = primaryItem?.price;
  const product = price?.product;
  const productId = typeof product === "string"
    ? product
    : (product as { id?: string } | null)?.id ?? null;
  const amount = price?.unit_amount ?? primaryItem?.plan?.amount ?? null;

  return determineTierByProduct(productId, amount);
}

async function getCustomerEmailFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  if (typeof subscription.customer !== "string") {
    return null;
  }

  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    if (customer && !customer.deleted) {
      return customer.email || null;
    }
  } catch (err) {
    log.error("Failed to retrieve customer", {
      customerId: subscription.customer,
      errorMessage: extractErrorMessage(err),
    });
  }

  return null;
}

function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown"
  );
}

async function checkRateLimit(
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

async function recordRequest(
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

Deno.serve(async (req) => {
  try {
    const signature = req.headers.get("Stripe-Signature");
    const smokeTest = req.headers.get("x-smoke-test") === "true";
    const smokeMode = Deno.env.get("STRIPE_WEBHOOK_SMOKE_MODE") === "true";
    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const requestId = crypto.randomUUID();
    const clientIP = getClientIP(req);

    log.info("Request received", {
      requestId,
      clientIP,
      method: req.method,
    });

    // 環境変数の検証（サーバー設定エラー）
    if (!webhookSecret) {
      log.error("STRIPE_WEBHOOK_SECRET not configured");
      await notifyDiscord({
        title: "MANUS ALERT: Stripe webhook secret missing",
        message: "STRIPE_WEBHOOK_SECRET not configured",
        severity: "critical",
      });
      return new Response("Server configuration error", { status: 500 });
    }

    // 署名ヘッダーの検証（必須）
    if (!signature) {
      log.warn("Missing Stripe-Signature header", { requestId, clientIP });
      await notifyDiscord({
        title: "MANUS ALERT: Stripe webhook missing signature",
        message: "Missing Stripe-Signature header",
        severity: "warning",
      });
      return new Response("Missing signature", { status: 400 });
    }

    let event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider,
      );
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      log.error("Webhook signature verification failed", { errorMessage });
      await notifyDiscord({
        title: "MANUS ALERT: Stripe webhook signature failed",
        message: errorMessage,
        severity: "error",
      });
      return new Response(errorMessage, { status: 400 });
    }

    if (smokeMode && smokeTest) {
      log.info("Stripe webhook smoke test ok", {
        requestId,
        eventType: event.type,
      });
      return new Response(JSON.stringify({ received: true, smoke: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      log.error("Supabase configuration missing");
      await notifyDiscord({
        title: "MANUS ALERT: Supabase config missing",
        message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured",
        severity: "critical",
      });
      return new Response("Server configuration error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const isAllowed = await checkRateLimit(supabase, clientIP);
    if (!isAllowed) {
      log.warn("Rate limit exceeded", { requestId, clientIP });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    await recordRequest(supabase, clientIP, true, {
      eventType: event.type,
      requestId,
    });

    // グローバル冪等性チェック: イベントIDで重複処理を防止
    const { data: existingEvent } = await supabase
      .from("stripe_events_processed")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      log.info("Event already processed, skipping", {
        eventId: event.id,
        eventType: event.type,
      });
      return new Response(
        JSON.stringify({ received: true, skipped: "event_already_processed" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // イベントを処理済みとして記録（楽観的ロック）
    const { error: insertError } = await supabase
      .from("stripe_events_processed")
      .insert({
        event_id: event.id,
        event_type: event.type,
        customer_email: null, // 後で更新
      });

    if (insertError) {
      // 既に挿入済み（並行処理による競合）の場合はスキップ
      if (insertError.code === "23505") {
        // unique_violation
        log.info("Event insertion conflict, skipping (concurrent processing)", {
          eventId: event.id,
        });
        return new Response(
          JSON.stringify({ received: true, skipped: "concurrent_conflict" }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      // その他のエラーはログして続行（テーブル未作成時など）
      log.warn("Failed to record event, continuing anyway", {
        eventId: event.id,
        error: insertError.message,
      });
      await notifyDiscord({
        title: "MANUS ALERT: Stripe event record failed",
        message: insertError.message,
        severity: "warning",
        context: { eventId: event.id, eventType: event.type },
      });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerEmail = session.customer_details?.email;
        const paymentStatus = session.payment_status;
        const mode = session.mode;

        log.info("Checkout session completed", {
          sessionId: session.id,
          email: customerEmail,
          paymentStatus,
          mode,
        });

        // Payment Linkからの決済完了のみ処理（payment_statusがpaidの場合）
        if (customerEmail && paymentStatus === "paid") {
          // 冪等性チェック: 既にこのセッションで処理済みかどうか確認
          const { data: existingMember } = await supabase
            .from("members")
            .select(
              "id, line_user_id, discord_invite_sent, verification_code, verification_expires_at, stripe_customer_id",
            )
            .eq("email", customerEmail)
            .maybeSingle();

          // 既に同じstripe_customer_idで処理済みの場合はスキップ
          if (
            existingMember?.stripe_customer_id === session.customer &&
            existingMember?.discord_invite_sent === true
          ) {
            log.info("Idempotency check: Already processed this session", {
              email: maskEmail(customerEmail),
              sessionId: session.id,
            });
            return new Response(
              JSON.stringify({ received: true, skipped: "already_processed" }),
              {
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          // サブスクリプション情報を取得
          const subscriptionId = session.subscription as string | null;
          let subscriptionStatus = "active";
          let nextBillingAt: string | null = null;
          let stripeSubscriptionId: string | null = null;
          const optInEmail =
            (session.metadata?.opt_in_email ?? "").toString().toLowerCase() ===
              "true";

          // metadata から line_user_id を取得（Checkout時に紐付け済みの場合）
          const metadataLineUserId = session.metadata?.line_user_id?.trim() ||
            null;

          // 顧客名を取得
          const customerName = session.customer_details?.name || null;

          // サブスクリプション型の場合、詳細情報を取得
          if (subscriptionId && typeof subscriptionId === "string") {
            try {
              const subscription = await stripe.subscriptions.retrieve(
                subscriptionId,
              );
              subscriptionStatus = subscription.status;
              stripeSubscriptionId = subscription.id;
              nextBillingAt = subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null;
              log.info("Subscription details retrieved", {
                subscriptionId,
                subscriptionStatus,
              });
            } catch (err) {
              log.error("Failed to retrieve subscription", {
                subscriptionId,
                errorMessage: extractErrorMessage(err),
              });
            }
          }

          // tier判定（金額とPayment Link IDから判定）
          const paymentLinkId = typeof session.payment_link === "string"
            ? session.payment_link
            : null;
          const membershipTier = determineMembershipTier(
            session.amount_total,
            paymentLinkId,
          );

          // 認証コード生成ロジック
          // LINE紐付け済み or Discord招待済みの場合はコード不要
          let verificationCode: string | null = null;
          let verificationExpiresAt: string | null = null;
          const alreadyLinked = existingMember?.line_user_id != null;
          const alreadyInvited = existingMember?.discord_invite_sent === true;

          if (!alreadyLinked && !alreadyInvited) {
            // LINE未紐付け かつ Discord未招待 → コードが必要
            if (
              existingMember?.verification_code &&
              existingMember?.verification_expires_at
            ) {
              // 既存コードの有効期限を確認
              const expiresAt = new Date(
                existingMember.verification_expires_at,
              );
              if (expiresAt > new Date()) {
                // 有効なコードが存在 → 再利用
                verificationCode = existingMember.verification_code;
                verificationExpiresAt = existingMember.verification_expires_at;
                log.info("Reusing existing verification code", {
                  email: maskEmail(customerEmail),
                  expiresAt: verificationExpiresAt,
                });
              }
            }

            // 既存の有効なコードがない場合のみ新規生成
            if (!verificationCode) {
              verificationCode = generateVerificationCode();
              verificationExpiresAt = getCodeExpiryDate().toISOString();
              log.info("Generated new verification code", {
                email: maskEmail(customerEmail),
              });
            }
          } else {
            log.info("Skipping verification code (already linked or invited)", {
              email: maskEmail(customerEmail),
              alreadyLinked,
              alreadyInvited,
            });
          }

          // 既存メンバーの場合は discord_invite_sent をリセットしない
          // line_user_id: 既存があればそれを維持、なければmetadataから取得
          const resolvedLineUserId = existingMember?.line_user_id ||
            metadataLineUserId;

          const basePayload: Record<string, unknown> = {
            email: customerEmail,
            name: customerName,
            stripe_customer_id: session.customer as string | null,
            stripe_subscription_id: stripeSubscriptionId,
            status: "active",
            stripe_subscription_status: subscriptionStatus,
            tier: membershipTier,
            period_end: nextBillingAt,
            opt_in_email: optInEmail,
            updated_at: new Date().toISOString(),
          };

          // line_user_id が確定している場合のみ追加（誤紐付け防止）
          if (resolvedLineUserId) {
            basePayload["line_user_id"] = resolvedLineUserId;
            log.info("LINE user ID resolved for payment", {
              email: maskEmail(customerEmail),
              lineUserId: maskLineUserId(resolvedLineUserId),
              source: existingMember?.line_user_id ? "existing" : "metadata",
            });
          }

          let error;
          if (existingMember) {
            // 既存メンバー → 必要なフィールドのみ更新
            const updatePayload: Record<string, unknown> = { ...basePayload };
            if (verificationCode) {
              updatePayload["verification_code"] = verificationCode;
              updatePayload["verification_expires_at"] = verificationExpiresAt;
            }
            // discord_invite_sent は更新しない（既存の値を維持）

            const { error: updateError } = await supabase
              .from("members")
              .update(updatePayload)
              .eq("email", customerEmail);
            error = updateError;
          } else {
            // 新規メンバー → 全フィールドを設定
            const { error: insertError } = await supabase
              .from("members")
              .insert({
                ...basePayload,
                verification_code: verificationCode,
                verification_expires_at: verificationExpiresAt,
                discord_invite_sent: false,
              });
            error = insertError;
          }

          if (error) {
            log.error("DB Insert Error", { errorMessage: error.message });
            await notifyDiscord({
              title: "MANUS ALERT: members upsert failed",
              message: error.message ?? "unknown DB error",
              severity: "error",
              context: { email: customerEmail, membershipTier, subscriptionId },
            });
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          } else {
            log.info("Member joined", {
              email: customerEmail,
              tier: membershipTier,
            });

            // n8n経由でDiscord通知（非同期・失敗しても続行）
            notifyStripeEvent(
              event.type,
              customerEmail,
              customerName,
              session.amount_total,
              session.currency ?? "jpy",
              mode ?? "payment",
              session.id,
            ).catch((err) => {
              log.warn("n8n notification failed", {
                error: extractErrorMessage(err),
              });
            });

            // 支払い履歴を保存
            await savePaymentFromCheckout(supabase, session, membershipTier);

            // upsert後のレコードを取得
            const { data: memberData } = await supabase
              .from("members")
              .select("id, line_user_id, discord_user_id, name")
              .eq("email", customerEmail)
              .maybeSingle();

            let lineUserId: string | null = memberData?.line_user_id ?? null;

            // 孤児レコード（LINE IDのみで登録）をマージ
            if (memberData?.id) {
              const mergeResult = await mergeOrphanLineRecord(
                supabase,
                customerEmail,
                memberData.id,
              );
              if (mergeResult.merged && mergeResult.orphanLineUserId) {
                lineUserId = mergeResult.orphanLineUserId;
                log.info("Orphan LINE record merged", {
                  email: maskEmail(customerEmail),
                  lineUserId: maskLineUserId(lineUserId),
                });
              }
            }

            // Google Sheets へ追記（設定されている場合のみ）
            await appendMemberRow([
              customerEmail ?? "",
              customerName ?? "",
              membershipTier ?? "",
              "active",
              nextBillingAt ?? "",
              optInEmail,
              lineUserId ?? "",
              new Date().toISOString(),
            ]);

            grantDiscordMembershipAccess(
              memberData?.discord_user_id,
              memberData?.name ?? customerName,
              customerEmail,
            );

            // discord_invite_sent 状況を確認
            const { data: currentMember } = await supabase
              .from("members")
              .select("discord_invite_sent")
              .eq("email", customerEmail)
              .maybeSingle();

            const alreadySentDiscordInvite =
              currentMember?.discord_invite_sent === true;

            // LINE紐付け状況に応じて処理を分岐
            if (lineUserId && !alreadySentDiscordInvite) {
              // 既にLINE紐付け済み かつ Discord招待未送信 → 即座にDiscord招待を送信
              log.info(
                "LINE already linked, sending Discord invite immediately",
                {
                  email: maskEmail(customerEmail),
                  lineUserId: maskLineUserId(lineUserId),
                },
              );
              const discordInviteSent = await sendDiscordInviteViaLine(
                customerEmail,
                customerName,
                membershipTier,
                lineUserId,
              );

              // LINE送信成功時のみフラグを更新
              if (discordInviteSent) {
                // 認証コードをクリア（不要になったため）
                await supabase
                  .from("members")
                  .update({
                    verification_code: null,
                    verification_expires_at: null,
                    discord_invite_sent: true,
                  })
                  .eq("email", customerEmail);
              } else {
                log.warn(
                  "Discord invite not sent, keeping verification code for retry",
                  { email: maskEmail(customerEmail) },
                );
              }
            } else if (lineUserId && alreadySentDiscordInvite) {
              // LINE紐付け済み かつ Discord招待送信済み → スキップ
              log.info("Discord invite already sent, skipping", {
                email: maskEmail(customerEmail),
              });
            } else if (verificationCode) {
              // LINE未登録 → 認証コード付きウェルカムメールを送信
              const tierDisplayName = membershipTier === "master"
                ? "Master Class"
                : "Library Member";

              log.info("LINE not linked, sending welcome email with code", {
                email: maskEmail(customerEmail),
                code: maskVerificationCode(verificationCode),
              });

              const emailResult = await sendPaidMemberWelcomeEmail(
                customerEmail,
                verificationCode,
                tierDisplayName,
              );

              if (!emailResult.success) {
                log.error("Failed to send welcome email", {
                  email: maskEmail(customerEmail),
                  error: emailResult.error,
                });
                await notifyDiscord({
                  title: "MANUS ALERT: Welcome email failed",
                  message: `Failed to send welcome email to ${
                    customerEmail.slice(0, 5)
                  }***`,
                  context: { tier: membershipTier, error: emailResult.error },
                });
              }
            }
          }
        } else {
          log.info("Payment not completed", {
            email: customerEmail,
            paymentStatus,
          });
        }
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerEmail = await getCustomerEmailFromSubscription(
          subscription,
        );

        if (customerEmail) {
          const membershipTier = determineTierFromSubscription(subscription);
          const memberStatus = determineStatus(subscription.status);
          const { data: memberData } = await supabase
            .from("members")
            .select("discord_user_id, name")
            .eq("email", customerEmail)
            .maybeSingle();

          if (!memberData) {
            log.warn("Member not found for subscription creation", {
              email: maskEmail(customerEmail),
              subscriptionId: subscription.id,
            });
            break;
          }

          const { error } = await supabase
            .from("members")
            .update({
              tier: membershipTier,
              stripe_subscription_status: subscription.status,
              status: memberStatus,
              period_end: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null,
              stripe_subscription_id: subscription.id,
              updated_at: new Date().toISOString(),
            })
            .eq("email", customerEmail);

          if (error) {
            log.error("DB Update Error", { errorMessage: error.message });
            await notifyDiscord({
              title: "MANUS ALERT: Stripe subscription create failed",
              message: error.message,
              severity: "error",
              context: {
                email: maskEmail(customerEmail),
                subscriptionId: subscription.id,
                membershipTier,
              },
            });
          } else {
            log.info("Subscription created", {
              subscriptionId: subscription.id,
              email: maskEmail(customerEmail),
              membershipTier,
            });

            grantDiscordMembershipAccess(
              memberData.discord_user_id,
              memberData.name,
              customerEmail,
            );
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerEmail = await getCustomerEmailFromSubscription(
          subscription,
        );

        if (customerEmail) {
          const membershipTier = determineTierFromSubscription(subscription);
          const memberStatus = determineStatus(subscription.status);
          const { data: memberData } = await supabase
            .from("members")
            .select("discord_user_id, name")
            .eq("email", customerEmail)
            .maybeSingle();

          const { error } = await supabase
            .from("members")
            .update({
              tier: membershipTier,
              stripe_subscription_status: subscription.status,
              status: memberStatus,
              period_end: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null,
              stripe_subscription_id: subscription.id,
              updated_at: new Date().toISOString(),
            })
            .eq("email", customerEmail);

          if (error) {
            log.error("DB Update Error", { errorMessage: error.message });
            await notifyDiscord({
              title: "MANUS ALERT: Stripe subscription update failed",
              message: error.message,
              severity: "error",
              context: {
                email: maskEmail(customerEmail),
                subscriptionId: subscription.id,
              },
            });
          } else {
            log.info("Subscription updated", {
              subscriptionId: subscription.id,
              email: maskEmail(customerEmail),
              membershipTier,
              memberStatus,
            });

            if (memberStatus === "active") {
              grantDiscordMembershipAccess(
                memberData?.discord_user_id,
                memberData?.name,
                customerEmail,
              );
            } else if (memberData?.discord_user_id) {
              const roleResult = await removeDiscordRole(
                memberData.discord_user_id,
              );
              if (roleResult.success) {
                log.info("Discord role removed on subscription update", {
                  discordUserId: maskDiscordUserId(memberData.discord_user_id),
                  subscriptionId: subscription.id,
                });
              } else {
                log.warn(
                  "Failed to remove Discord role on subscription update",
                  {
                    discordUserId: maskDiscordUserId(
                      memberData.discord_user_id,
                    ),
                    error: roleResult.error,
                  },
                );
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        let customerEmail: string | null = null;

        // Customerオブジェクトからemailを取得
        if (typeof subscription.customer === "string") {
          try {
            const customer = await stripe.customers.retrieve(
              subscription.customer,
            );
            if (customer && !customer.deleted) {
              customerEmail = customer.email || null;
            }
          } catch (err) {
            log.error("Failed to retrieve customer", {
              customerId: subscription.customer,
              errorMessage: extractErrorMessage(err),
            });
          }
        }

        if (customerEmail) {
          // 会員情報を取得（LINE ID, Discord ID）
          const { data: memberData } = await supabase
            .from("members")
            .select("id, line_user_id, discord_user_id, tier")
            .eq("email", customerEmail)
            .maybeSingle();

          // DB更新
          const { error } = await supabase
            .from("members")
            .update({
              stripe_subscription_status: "canceled",
              status: "inactive",
              updated_at: new Date().toISOString(),
            })
            .eq("email", customerEmail);

          if (error) {
            log.error("DB Update Error", { errorMessage: error.message });
            await notifyDiscord({
              title: "MANUS ALERT: Stripe subscription cancel update failed",
              message: error.message,
              severity: "error",
              context: {
                email: maskEmail(customerEmail),
                subscriptionId: subscription.id,
              },
            });
          } else {
            log.info("Subscription canceled", {
              subscriptionId: subscription.id,
              email: maskEmail(customerEmail),
            });

            // Discord Role削除
            if (memberData?.discord_user_id) {
              const roleResult = await removeDiscordRole(
                memberData.discord_user_id,
              );
              if (roleResult.success) {
                log.info("Discord role removed on cancellation", {
                  email: maskEmail(customerEmail),
                });
              } else {
                log.warn("Failed to remove Discord role", {
                  error: roleResult.error,
                });
              }
            }

            // LINE通知（離脱完了）
            if (memberData?.line_user_id) {
              const tierName = memberData.tier === "master"
                ? "Master Class"
                : "Library Member";

              const cancelMessage = [
                "📢 メンバーシップ終了のお知らせ",
                "",
                `${tierName}のメンバーシップが終了しました。`,
                "",
                "━━━━━━━━━━━━━━━",
                "ご利用ありがとうございました。",
                "",
                "再度ご入会いただく場合は、",
                "改めて決済手続きをお願いいたします。",
                "━━━━━━━━━━━━━━━",
              ].join("\n");

              const sent = await pushLineMessage(
                memberData.line_user_id,
                cancelMessage,
              );
              if (sent) {
                log.info("Cancellation notification sent via LINE", {
                  email: maskEmail(customerEmail),
                });
              } else {
                log.warn("Failed to send cancellation notification via LINE");
              }
            }

            // 管理者通知
            await notifyDiscord({
              title: "Member Subscription Canceled",
              message: `**Email**: ${customerEmail}\n**Tier**: ${
                memberData?.tier ?? "unknown"
              }\n**LINE**: ${
                memberData?.line_user_id ? "通知済" : "未登録"
              }\n**Discord**: ${
                memberData?.discord_user_id ? "Role削除済" : "未登録"
              }`,
              severity: "warning",
            });
          }
        }
        break;
      }

      // 課金イベント: 支払い履歴を記録
      case "charge.succeeded":
      case "charge.failed":
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        log.info("Charge event received", {
          chargeId: charge.id,
          type: event.type,
          amount: charge.amount,
          status: charge.status,
        });

        // 支払い履歴を保存
        const result = await savePaymentFromCharge(supabase, charge);
        if (!result.success) {
          log.warn("Failed to save charge to payment history", {
            chargeId: charge.id,
            error: result.error,
          });
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Unhandled Stripe webhook error", { errorMessage });
    await notifyDiscord({
      title: "MANUS ALERT: Stripe webhook error",
      message: errorMessage,
      severity: "critical",
    });
    return new Response("Internal server error", { status: 500 });
  }
});
