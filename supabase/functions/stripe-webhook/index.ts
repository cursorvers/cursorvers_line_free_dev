/**
 * Stripe Webhook Edge Function
 * Stripe決済イベントを処理し、会員情報を更新
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { notifyDiscord } from "../_shared/alert.ts";
import { createSheetsClientFromEnv } from "../_shared/google-sheets.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("stripe-webhook");

// Google Sheets 連携（任意）
const MEMBERS_SHEET_ID = Deno.env.get("MEMBERS_SHEET_ID") ?? "";
const MEMBERS_SHEET_TAB = Deno.env.get("MEMBERS_SHEET_TAB") ?? "members";
const GOOGLE_SA_JSON = Deno.env.get("GOOGLE_SA_JSON") ?? "";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY") as string, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Google Sheets連携関数
async function appendMemberRow(row: unknown[]) {
  if (!MEMBERS_SHEET_ID || !GOOGLE_SA_JSON) {
    log.debug("Google Sheets not configured, skipping append");
    return;
  }
  try {
    const client = await createSheetsClientFromEnv(GOOGLE_SA_JSON, MEMBERS_SHEET_ID);
    await client.append(MEMBERS_SHEET_TAB, [row]);
    log.info("Appended member to sheet", { tab: MEMBERS_SHEET_TAB });
  } catch (err) {
    log.warn("Failed to append to sheet", {
      errorMessage: err instanceof Error ? err.message : String(err)
    });
  }
}

// Discord招待リンクを送信
async function sendDiscordInvite(email: string, name: string | null, tier: string) {
  const discordBotToken = Deno.env.get("DISCORD_BOT_TOKEN");
  const discordRoleId = Deno.env.get("DISCORD_ROLE_ID");
  const guildId = Deno.env.get("DISCORD_GUILD_ID") || "1316621823382728704"; // Cursorvers Discord Server ID

  if (!discordBotToken) {
    log.warn("DISCORD_BOT_TOKEN not set, skipping Discord invite");
    return;
  }

  try {
    // Discord招待リンクを生成（有効期限2週間、使用回数1回）
    const inviteResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/invites`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${discordBotToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_age: 1209600, // 2週間（14日）
          max_uses: 1, // 1回のみ使用可能
          unique: true,
        }),
      }
    );

    if (!inviteResponse.ok) {
      const errorText = await inviteResponse.text();
      log.error("Failed to create Discord invite", { status: inviteResponse.status, errorText });
      await notifyDiscord({
        title: "MANUS ALERT: Discord invite creation failed",
        message: `Status: ${inviteResponse.status}, Error: ${errorText}`,
        context: { email, tier },
      });
      return;
    }

    const invite = await inviteResponse.json();
    const inviteUrl = `https://discord.gg/${invite.code}`;

    log.info("Discord invite created", { email, inviteUrl });

    // 招待リンクをメールで送信（実装例）
    // TODO: メール送信機能を実装
    log.debug("TODO: Send email with invite link", { email });

    // Discordに通知（管理者用）
    await notifyDiscord({
      title: "🎉 New Member Joined!",
      message: `**Email**: ${email}\n**Name**: ${name || "N/A"}\n**Tier**: ${tier}\n**Invite**: ${inviteUrl}`,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("Failed to send Discord invite", { email, errorMessage });
    await notifyDiscord({
      title: "MANUS ALERT: Discord invite error",
      message: errorMessage,
      context: { email, tier },
    });
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      webhookSecret!,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("Webhook signature verification failed", { errorMessage });
    await notifyDiscord({
      title: "MANUS ALERT: Stripe webhook signature failed",
      message: errorMessage,
    });
    return new Response(errorMessage, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerEmail = session.customer_details?.email;
      const paymentStatus = session.payment_status;
      const mode = session.mode;

      log.info("Checkout session completed", { sessionId: session.id, email: customerEmail, paymentStatus, mode });

      // Payment Linkからの決済完了のみ処理（payment_statusがpaidの場合）
      if (customerEmail && paymentStatus === "paid") {
        // サブスクリプション情報を取得
        const subscriptionId = session.subscription as string | null;
        let subscriptionStatus = "active";
        let nextBillingAt: string | null = null;
        let membershipTier = "library"; // デフォルトはLibrary Member
        let stripeSubscriptionId: string | null = null;
        const optInEmail =
          (session.metadata?.opt_in_email ?? "").toString().toLowerCase() ===
          "true";

        // 顧客名を取得
        const customerName = session.customer_details?.name || null;

        // サブスクリプション型の場合、詳細情報を取得
        if (subscriptionId && typeof subscriptionId === "string") {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            subscriptionStatus = subscription.status;
            stripeSubscriptionId = subscription.id;
            nextBillingAt = subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null;
            log.info("Subscription details retrieved", { subscriptionId, subscriptionStatus });
          } catch (err) {
            log.error("Failed to retrieve subscription", { subscriptionId, errorMessage: err instanceof Error ? err.message : String(err) });
          }
        }

        // Payment Linkのメタデータからサービス種別を判定
        // Master Classは¥380,000（税抜）= 380000円（最小通貨単位）
        if (session.amount_total && session.amount_total >= 380000) {
          membershipTier = "master";
        }
        
        // Payment Link IDからも判定（URLの末尾部分）
        const paymentLinkId = session.payment_link;
        if (paymentLinkId && typeof paymentLinkId === "string") {
          if (paymentLinkId.includes("5kQaEXavbc9T63SfB34F201")) {
            membershipTier = "master";
          }
        }

        const { error } = await supabase
          .from("members")
          .upsert(
            {
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
            },
            { onConflict: "email" }
          );

        if (error) {
          log.error("DB Insert Error", { errorMessage: error.message });
          await notifyDiscord({
            title: "MANUS ALERT: members upsert failed",
            message: error.message ?? "unknown DB error",
            context: { email: customerEmail, membershipTier, subscriptionId },
          });
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          log.info("Member joined", { email: customerEmail, tier: membershipTier });
          
          // Google Sheets へ追記（設定されている場合のみ）
          await appendMemberRow([
            customerEmail ?? "",
            customerName ?? "",
            membershipTier ?? "",
            "active",
            nextBillingAt ?? "",
            optInEmail,
            "", // line_user_id（Stripe決済時は未設定）
            new Date().toISOString(),
          ]);

          // Discord招待リンクを送信
          await sendDiscordInvite(customerEmail, customerName, membershipTier);
        }
      } else {
        log.info("Payment not completed", { email: customerEmail, paymentStatus });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      let customerEmail: string | null = null;

      // Customerオブジェクトからemailを取得
      if (typeof subscription.customer === "string") {
        try {
          const customer = await stripe.customers.retrieve(subscription.customer);
          if (customer && !customer.deleted) {
            customerEmail = customer.email || null;
          }
        } catch (err) {
          log.error("Failed to retrieve customer", { customerId: subscription.customer, errorMessage: err instanceof Error ? err.message : String(err) });
        }
      }

      if (customerEmail) {
        const { error } = await supabase
          .from("members")
          .update({
            stripe_subscription_status: subscription.status,
            status: subscription.status === "canceled" ? "inactive" : "active",
            period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
            stripe_subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
          })
          .eq("email", customerEmail);

        if (error) log.error("DB Update Error", { errorMessage: error.message });
        else log.info("Subscription updated", { subscriptionId: subscription.id });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      let customerEmail: string | null = null;

      // Customerオブジェクトからemailを取得
      if (typeof subscription.customer === "string") {
        try {
          const customer = await stripe.customers.retrieve(subscription.customer);
          if (customer && !customer.deleted) {
            customerEmail = customer.email || null;
          }
        } catch (err) {
          log.error("Failed to retrieve customer", { customerId: subscription.customer, errorMessage: err instanceof Error ? err.message : String(err) });
        }
      }

      if (customerEmail) {
        const { error } = await supabase
          .from("members")
          .update({
            stripe_subscription_status: "canceled",
            status: "inactive",
            updated_at: new Date().toISOString(),
          })
          .eq("email", customerEmail);

        if (error) log.error("DB Update Error", { errorMessage: error.message });
        else log.info("Subscription canceled", { subscriptionId: subscription.id });
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
