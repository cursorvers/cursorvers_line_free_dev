import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY") as string, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
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
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(err.message, { status: 400 });
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

      console.log(`Checkout session completed: ${session.id}, email: ${customerEmail}, status: ${paymentStatus}, mode: ${mode}`);

      // Payment Linkからの決済完了のみ処理（payment_statusがpaidの場合）
      if (customerEmail && paymentStatus === "paid") {
        // サブスクリプション情報を取得
        const subscriptionId = session.subscription as string | null;
        let subscriptionStatus = "active";
        let nextBillingAt: string | null = null;
        let membershipTier = "library"; // デフォルトはLibrary Member

        // サブスクリプション型の場合、詳細情報を取得
        if (subscriptionId && typeof subscriptionId === "string") {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            subscriptionStatus = subscription.status;
            nextBillingAt = subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null;
            console.log(`Subscription details: ${subscriptionId}, status: ${subscriptionStatus}`);
          } catch (err) {
            console.error(`Failed to retrieve subscription: ${err.message}`);
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
          .from("library_members")
          .upsert(
            {
              stripe_customer_email: customerEmail,
              status: "active",
              subscription_status: subscriptionStatus,
              membership_tier: membershipTier,
              subscription_start_date: new Date().toISOString(),
              next_billing_at: nextBillingAt,
              last_payment_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "stripe_customer_email" }
          );

        if (error) {
          console.error("DB Insert Error:", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          console.log(`Member joined: ${customerEmail}, tier: ${membershipTier}`);
        }
      } else {
        console.log(`Payment not completed: email=${customerEmail}, status=${paymentStatus}`);
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
          console.error(`Failed to retrieve customer: ${err.message}`);
        }
      }

      if (customerEmail) {
        const { error } = await supabase
          .from("library_members")
          .update({
            subscription_status: subscription.status,
            next_billing_at: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_email", customerEmail);

        if (error) console.error("DB Update Error:", error);
        else console.log(`Subscription updated: ${subscription.id}`);
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
          console.error(`Failed to retrieve customer: ${err.message}`);
        }
      }

      if (customerEmail) {
        const { error } = await supabase
          .from("library_members")
          .update({
            subscription_status: "canceled",
            status: "inactive",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_email", customerEmail);

        if (error) console.error("DB Update Error:", error);
        else console.log(`Subscription canceled: ${subscription.id}`);
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
