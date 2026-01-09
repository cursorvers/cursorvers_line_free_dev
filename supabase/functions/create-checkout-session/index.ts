import Stripe from "stripe";
import { createLogger } from "../_shared/logger.ts";
import {
  createCorsHeaders,
  createCorsPreflightResponse,
} from "../_shared/http-utils.ts";
import { isValidEmail } from "../_shared/validation-utils.ts";

const log = createLogger("create-checkout-session");

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return createCorsPreflightResponse(req);
  }

  // リクエストごとにCORSヘッダーを生成
  const corsHeaders = createCorsHeaders(req);

  const smokeMode = Deno.env.get("STRIPE_CHECKOUT_SMOKE_MODE") === "true";
  const isSmokeRequest = smokeMode && req.headers.get("x-smoke-test") === "true";
  if (isSmokeRequest) {
    log.info("Stripe checkout smoke mode", { method: req.method });
    return new Response(
      JSON.stringify({
        url: "https://example.com/checkout-smoke",
        smoke: true,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    // Get environment variables
    const stripeApiKey = Deno.env.get("STRIPE_API_KEY");
    const priceIdLibrary = Deno.env.get("STRIPE_PRICE_ID_LIBRARY");
    const successUrl = Deno.env.get("STRIPE_SUCCESS_URL_LIBRARY");
    const cancelUrl = Deno.env.get("STRIPE_CANCEL_URL_LIBRARY");

    if (!stripeApiKey || !priceIdLibrary || !successUrl || !cancelUrl) {
      throw new Error("Missing required environment variables");
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeApiKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Parse request body
    const { email, opt_in_email, agree_terms } = await req.json();

    // Validate input
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!agree_terms) {
      return new Response(
        JSON.stringify({ error: "Terms agreement is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    log.info("Creating checkout session", { email });

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceIdLibrary,
          quantity: 1,
        },
      ],
      customer_email: email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        email: email,
        source: "cursorvers_library",
        opt_in_email: opt_in_email ? "true" : "false",
      },
    });

    log.info("Checkout session created", { sessionId: session.id });

    // Return checkout URL
    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    log.error("Error creating checkout session", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    // Send alert notification (optional)
    const manusWebhookUrl = Deno.env.get("MANUS_WEBHOOK_URL");
    const discordAdminWebhookUrl = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");

    if (manusWebhookUrl || discordAdminWebhookUrl) {
      const alertMessage = {
        content: `🚨 **MANUS ALERT: checkout session failed**\n\n` +
          `**Error**: ${
            error instanceof Error ? error.message : String(error)
          }\n` +
          `**Time**: ${new Date().toISOString()}\n` +
          `**Stack**: ${error instanceof Error ? error.stack || "N/A" : "N/A"}`,
      };

      if (manusWebhookUrl) {
        await fetch(manusWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alertMessage),
        }).catch((e) =>
          log.error("Manus webhook failed", {
            errorMessage: e instanceof Error ? e.message : String(e),
          })
        );
      }

      if (discordAdminWebhookUrl) {
        await fetch(discordAdminWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alertMessage),
        }).catch((e) =>
          log.error("Discord alert failed", {
            errorMessage: e instanceof Error ? e.message : String(e),
          })
        );
      }
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
