const crypto = require("crypto");
const { json, badRequest, serverError, requireEnv } = require("./_utils");

const STRIPE_API = "https://api.stripe.com/v1";

function verifySignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",").map((p) => p.trim());
  const ts = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!ts || !v1) return false;
  const signedPayload = `${ts}.${rawBody}`;
  const expected = crypto.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch (_err) {
    return false;
  }
}

async function upsertBillingBySubscription(subscriptionId) {
  const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const subscriptionRes = await fetch(`${STRIPE_API}/subscriptions/${subscriptionId}`, {
    headers: { authorization: `Bearer ${stripeSecret}` },
  });
  if (!subscriptionRes.ok) throw new Error("Failed reading Stripe subscription");
  const subscription = await subscriptionRes.json();
  const providerId = subscription?.metadata?.provider_id;
  if (!providerId) return;

  const patch = {
    provider_id: providerId,
    subscription_status: subscription.status || "inactive",
    stripe_customer_id: subscription.customer || null,
    stripe_subscription_id: subscription.id || null,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id || null,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    plan_tier:
      subscription.status === "active" || subscription.status === "trialing" ? "pro" : "free",
  };

  const upsertRes = await fetch(`${supabaseUrl}/rest/v1/provider_billing_profiles?on_conflict=provider_id`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
    },
    body: JSON.stringify([patch]),
  });
  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    throw new Error(`Billing webhook upsert failed: ${text}`);
  }
}

async function storeWebhookEvent(evt) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${supabaseUrl}/rest/v1/payment_webhook_events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "resolution=ignore-duplicates,return=minimal",
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
    },
    body: JSON.stringify([{
      stripe_event_id: evt.id,
      event_type: evt.type,
      event_created_at: new Date((evt.created || 0) * 1000).toISOString(),
      payload: evt,
      processed_at: new Date().toISOString(),
    }]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook event store failed: ${text}`);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return badRequest("Use POST");
  try {
    const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
    const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    const rawBody = event.body || "";
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      return badRequest("Invalid webhook signature");
    }
    const payload = JSON.parse(rawBody);
    await storeWebhookEvent(payload);

    if (
      payload.type === "customer.subscription.created" ||
      payload.type === "customer.subscription.updated" ||
      payload.type === "customer.subscription.deleted"
    ) {
      const subscriptionId = payload.data?.object?.id;
      if (subscriptionId) await upsertBillingBySubscription(subscriptionId);
    }

    return json(200, { received: true });
  } catch (error) {
    return serverError(error.message || "Webhook processing failed");
  }
};
