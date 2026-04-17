/**
 * Stripe Event Handlers
 * Individual handler functions for each webhook event type
 *
 * @see Plans.md Phase 5 - CRITICAL Patch
 */
import Stripe from "stripe";
import { type SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscord } from "../_shared/alert.ts";
import {
  addDiscordRole,
  createClientRoom,
  findExistingClientRoom,
  getDiscordFreeRoleId,
  getDiscordPaidRoleId,
  removeDiscordRole,
  swapDiscordRole,
} from "../_shared/discord.ts";
import { sendPaidMemberWelcomeEmail } from "../_shared/email.ts";
import { createLogger } from "../_shared/logger.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import {
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
import { pushLineMessage } from "../_shared/line-messaging.ts";
import { mergeOrphanLineRecord } from "./orphan-merge.ts";
import { appendMemberRow, sendDiscordInviteViaLine } from "./webhook-utils.ts";

const log = createLogger("stripe-webhook");

/**
 * Handle checkout.session.completed event
 * Payment completion -> member creation/update -> Discord invite
 */
export async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const customerEmail = session.customer_details?.email;
  const paymentStatus = session.payment_status;
  const mode = session.mode;

  log.info("Checkout session completed", {
    sessionId: session.id,
    email: customerEmail,
    paymentStatus,
    mode,
  });

  if (!(customerEmail && paymentStatus === "paid")) {
    log.info("Payment not completed", { email: customerEmail, paymentStatus });
    return;
  }

  // 冪等性チェック: 既にこのセッションで処理済みかどうか確認
  const { data: existingMember } = await supabase
    .from("members")
    .select(
      "id, line_user_id, discord_invite_sent, verification_code, verification_expires_at, stripe_customer_id",
    )
    .eq("email", customerEmail)
    .maybeSingle();

  if (
    existingMember?.stripe_customer_id === session.customer &&
    existingMember?.discord_invite_sent === true
  ) {
    log.info("Idempotency check: Already processed this session", {
      email: maskEmail(customerEmail),
      sessionId: session.id,
    });
    return;
  }

  // サブスクリプション情報を取得
  const subscriptionId = session.subscription as string | null;
  let subscriptionStatus = "active";
  let nextBillingAt: string | null = null;
  let stripeSubscriptionId: string | null = null;
  const optInEmail =
    (session.metadata?.opt_in_email ?? "").toString().toLowerCase() === "true";

  const metadataLineUserId = session.metadata?.line_user_id?.trim() || null;
  const customerName = session.customer_details?.name || null;

  if (subscriptionId && typeof subscriptionId === "string") {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
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

  // tier判定
  const paymentLinkId = typeof session.payment_link === "string"
    ? session.payment_link
    : null;
  const membershipTier = determineMembershipTier(
    session.amount_total,
    paymentLinkId,
  );

  // 認証コード生成ロジック
  let verificationCode: string | null = null;
  let verificationExpiresAt: string | null = null;
  const alreadyLinked = existingMember?.line_user_id != null;
  const alreadyInvited = existingMember?.discord_invite_sent === true;

  if (!alreadyLinked && !alreadyInvited) {
    if (
      existingMember?.verification_code &&
      existingMember?.verification_expires_at
    ) {
      const expiresAt = new Date(existingMember.verification_expires_at);
      if (expiresAt > new Date()) {
        verificationCode = existingMember.verification_code;
        verificationExpiresAt = existingMember.verification_expires_at;
        log.info("Reusing existing verification code", {
          email: maskEmail(customerEmail),
          expiresAt: verificationExpiresAt,
        });
      }
    }

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

  const resolvedLineUserId = existingMember?.line_user_id || metadataLineUserId;

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
    const updatePayload: Record<string, unknown> = { ...basePayload };
    if (verificationCode) {
      updatePayload["verification_code"] = verificationCode;
      updatePayload["verification_expires_at"] = verificationExpiresAt;
    }

    const { error: updateError } = await supabase
      .from("members")
      .update(updatePayload)
      .eq("email", customerEmail);
    error = updateError;
  } else {
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
    throw new Error(`Members upsert failed: ${error.message}`);
  }

  log.info("Member joined", { email: customerEmail, tier: membershipTier });

  // n8n経由でDiscord通知（非同期・失敗しても続行）
  notifyStripeEvent(
    "checkout.session.completed",
    customerEmail,
    customerName,
    session.amount_total,
    session.currency ?? "jpy",
    mode ?? "payment",
    session.id,
  ).catch((err) => {
    log.warn("n8n notification failed", { error: extractErrorMessage(err) });
  });

  // 支払い履歴を保存
  await savePaymentFromCheckout(supabase, session, membershipTier);

  // upsert後のレコードを取得
  const { data: memberData } = await supabase
    .from("members")
    .select("id, line_user_id, discord_user_id")
    .eq("email", customerEmail)
    .maybeSingle();

  let lineUserId: string | null = memberData?.line_user_id ?? null;

  // 孤児レコードマージ
  if (memberData?.id) {
    const mergeResult = await mergeOrphanLineRecord(
      supabase,
      customerEmail,
      memberData.id,
      metadataLineUserId,
    );
    if (mergeResult.merged && mergeResult.orphanLineUserId) {
      lineUserId = mergeResult.orphanLineUserId;
      log.info("Orphan LINE record merged", {
        email: maskEmail(customerEmail),
        lineUserId: maskLineUserId(lineUserId),
      });
    }
  }

  // Google Sheets へ追記
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

  // Discord自動ロール昇格 + client-room造成 (fire-and-forget)
  if (memberData?.discord_user_id) {
    void grantDiscordMembershipAccess(
      memberData.discord_user_id,
      customerEmail,
      customerName,
    ).catch((err) => {
      log.warn("Discord membership access grant failed (non-fatal)", {
        email: maskEmail(customerEmail),
        error: extractErrorMessage(err),
      });
    });
  }

  // discord_invite_sent 状況を確認
  const { data: currentMember } = await supabase
    .from("members")
    .select("discord_invite_sent")
    .eq("email", customerEmail)
    .maybeSingle();

  const alreadySentDiscordInvite = currentMember?.discord_invite_sent === true;

  // LINE紐付け状況に応じて処理を分岐
  if (lineUserId && !alreadySentDiscordInvite) {
    log.info("LINE already linked, sending Discord invite immediately", {
      email: maskEmail(customerEmail),
      lineUserId: maskLineUserId(lineUserId),
    });
    const discordInviteSent = await sendDiscordInviteViaLine(
      customerEmail,
      customerName,
      membershipTier,
      lineUserId,
    );

    if (discordInviteSent) {
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
    log.info("Discord invite already sent, skipping", {
      email: maskEmail(customerEmail),
    });
  } else if (verificationCode) {
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

/**
 * Discord ロール付与 + client-room 造成 (fire-and-forget用ヘルパー)
 * Discord API 失敗で課金処理が巻き戻らないよう分離
 */
async function grantDiscordMembershipAccess(
  discordUserId: string,
  email: string,
  name: string | null,
): Promise<void> {
  // ロール昇格: Free → Paid
  const freeRoleId = getDiscordFreeRoleId();
  const paidRoleId = getDiscordPaidRoleId();

  if (freeRoleId && paidRoleId) {
    const swapResult = await swapDiscordRole(
      discordUserId,
      freeRoleId,
      paidRoleId,
    );
    if (swapResult.success) {
      log.info("Discord role upgraded (Free -> Paid)", {
        email: maskEmail(email),
      });
    } else {
      log.warn("Discord role upgrade failed", {
        email: maskEmail(email),
        error: swapResult.error,
      });
      // フォールバック: swapが失敗しても paid ロール付与を試行
      await addDiscordRole(discordUserId, paidRoleId);
    }
  }

  // client-room 造成（既存チェック → なければ作成）
  try {
    const existingRoom = await findExistingClientRoom(discordUserId);
    if (existingRoom) {
      log.info("Client room already exists", {
        email: maskEmail(email),
        channelId: existingRoom,
      });
      return;
    }

    const roomName = name ?? email.split("@")[0] ?? email;
    const roomResult = await createClientRoom(discordUserId, roomName);
    if (roomResult.success) {
      log.info("Client room created", {
        email: maskEmail(email),
        channelId: roomResult.channelId,
      });
    } else {
      log.warn("Client room creation failed", {
        email: maskEmail(email),
        error: roomResult.error,
      });
    }
  } catch (err) {
    log.warn("Client room check/creation failed (non-fatal)", {
      email: maskEmail(email),
      error: extractErrorMessage(err),
    });
  }
}

/**
 * Handle customer.subscription.created event
 * Payment Link → subscription 作成時の二重保険
 * checkout.session.completed で処理済みの場合はスキップ
 */
export async function handleSubscriptionCreated(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  let customerEmail: string | null = null;

  if (typeof subscription.customer === "string") {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      if (customer && !customer.deleted) {
        customerEmail = customer.email || null;
      }
    } catch (err) {
      log.error("Failed to retrieve customer for subscription.created", {
        customerId: subscription.customer,
        errorMessage: extractErrorMessage(err),
      });
    }
  }

  if (!customerEmail) {
    log.warn("subscription.created: no customer email, skipping");
    return;
  }

  // tier判定: subscription items から product ID を取得
  const firstItem = subscription.items?.data?.[0];
  const productId = typeof firstItem?.price?.product === "string"
    ? firstItem.price.product
    : null;
  const tier = determineTierByProduct(productId, firstItem?.price?.unit_amount);

  log.info("Subscription created", {
    subscriptionId: subscription.id,
    email: maskEmail(customerEmail),
    tier,
    productId,
  });

  // members テーブル更新（既にcheckout.session.completedで処理済みの可能性あり）
  const { data: existingMember } = await supabase
    .from("members")
    .select("id, tier, stripe_subscription_id, discord_user_id, name")
    .eq("email", customerEmail)
    .maybeSingle();

  if (
    existingMember?.stripe_subscription_id === subscription.id &&
    existingMember?.tier === tier
  ) {
    log.info("subscription.created: already synced by checkout handler", {
      email: maskEmail(customerEmail),
    });
    return;
  }

  const { error } = await supabase
    .from("members")
    .update({
      tier,
      stripe_subscription_status: subscription.status,
      status: determineStatus(subscription.status),
      stripe_subscription_id: subscription.id,
      stripe_customer_id: typeof subscription.customer === "string"
        ? subscription.customer
        : null,
      period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("email", customerEmail);

  if (error) {
    log.error("subscription.created DB update failed", {
      errorMessage: error.message,
    });
    throw new Error(`subscription.created update failed: ${error.message}`);
  }

  // Discord ロール + client-room (fire-and-forget)
  if (existingMember?.discord_user_id) {
    void grantDiscordMembershipAccess(
      existingMember.discord_user_id,
      customerEmail,
      existingMember.name ?? null,
    ).catch((err) => {
      log.warn("Discord access grant failed in subscription.created", {
        error: extractErrorMessage(err),
      });
    });
  }
}

/**
 * Handle customer.subscription.updated event
 */
export async function handleSubscriptionUpdated(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  let customerEmail: string | null = null;

  if (typeof subscription.customer === "string") {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
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

  if (!customerEmail) return;

  const { error } = await supabase
    .from("members")
    .update({
      stripe_subscription_status: subscription.status,
      status: determineStatus(subscription.status),
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
    log.info("Subscription updated", { subscriptionId: subscription.id });
  }
}

/**
 * Handle customer.subscription.deleted event
 * Cancellation -> status update -> Discord role removal -> LINE notification
 */
export async function handleSubscriptionDeleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  let customerEmail: string | null = null;

  if (typeof subscription.customer === "string") {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
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

  if (!customerEmail) return;

  const { data: memberData } = await supabase
    .from("members")
    .select("id, line_user_id, discord_user_id, tier")
    .eq("email", customerEmail)
    .maybeSingle();

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
    return;
  }

  log.info("Subscription canceled", {
    subscriptionId: subscription.id,
    email: maskEmail(customerEmail),
  });

  // Discord Role降格: Paidロール削除 + Freeロール再付与
  if (memberData?.discord_user_id) {
    const freeRoleId = getDiscordFreeRoleId();
    const paidRoleId = getDiscordPaidRoleId();

    if (freeRoleId && paidRoleId) {
      const swapResult = await swapDiscordRole(
        memberData.discord_user_id,
        paidRoleId,
        freeRoleId,
      );
      if (swapResult.success) {
        log.info("Discord role downgraded (Paid -> Free) on cancellation", {
          email: maskEmail(customerEmail),
        });
      } else {
        log.warn("Discord role downgrade failed", {
          email: maskEmail(customerEmail),
          error: swapResult.error,
        });
      }
    } else {
      // fallback: Freeロール未設定の場合はPaidロール削除のみ
      const roleResult = await removeDiscordRole(memberData.discord_user_id);
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
    }\n**Discord**: ${memberData?.discord_user_id ? "Role削除済" : "未登録"}`,
    severity: "warning",
  });
}

/**
 * Handle charge.succeeded / charge.failed / charge.refunded events
 */
export async function handleChargeEvent(
  supabase: SupabaseClient,
  charge: Stripe.Charge,
  eventType: string,
): Promise<void> {
  log.info("Charge event received", {
    chargeId: charge.id,
    type: eventType,
    amount: charge.amount,
    status: charge.status,
  });

  const result = await savePaymentFromCharge(supabase, charge);
  if (!result.success) {
    log.warn("Failed to save charge to payment history", {
      chargeId: charge.id,
      error: result.error,
    });
  }
}
