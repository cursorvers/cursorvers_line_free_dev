import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
        }
      );
    }

    if (!agree_terms) {
      return new Response(
        JSON.stringify({ error: "Terms agreement is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Creating checkout session for email: ${email}`);

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

    console.log(`Checkout session created: ${session.id}`);

    // Return checkout URL
    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);

    // Send alert notification (optional)
    const manusWebhookUrl = Deno.env.get("MANUS_WEBHOOK_URL");
    const discordAdminWebhookUrl = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");

    if (manusWebhookUrl || discordAdminWebhookUrl) {
      const alertMessage = {
        content: `🚨 **MANUS ALERT: checkout session failed**\n\n` +
          `**Error**: ${error.message}\n` +
          `**Time**: ${new Date().toISOString()}\n` +
          `**Stack**: ${error.stack || "N/A"}`,
      };

      if (manusWebhookUrl) {
        await fetch(manusWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alertMessage),
        }).catch(console.error);
      }

      if (discordAdminWebhookUrl) {
        await fetch(discordAdminWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alertMessage),
        }).catch(console.error);
      }
    }

    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
