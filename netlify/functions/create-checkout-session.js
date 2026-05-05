const { json, badRequest, unauthorized, serverError, requireEnv } = require("./_utils");

const STRIPE_API = "https://api.stripe.com/v1";

async function getUserFromAccessToken(accessToken) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchProviderForOwner(ownerId) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/providers?select=id,name,owner_id&owner_id=eq.${ownerId}&limit=1`,
    {
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
      },
    }
  );
  if (!response.ok) return null;
  const rows = await response.json();
  return rows?.[0] || null;
}

async function upsertBillingProfile(providerId, patch) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/provider_billing_profiles?on_conflict=provider_id`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
    },
    body: JSON.stringify([{ provider_id: providerId, ...patch }]),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Billing upsert failed: ${text}`);
  }
}

async function createStripeCustomer(email, providerName) {
  const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
  const body = new URLSearchParams();
  if (email) body.set("email", email);
  if (providerName) body.set("name", providerName);
  body.set("metadata[source]", "plugfeed_beta");
  const response = await fetch(`${STRIPE_API}/customers`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe customer create failed: ${text}`);
  }
  return response.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return badRequest("Use POST");
  try {
    const priceId = requireEnv("STRIPE_PRICE_PRO");
    const successUrl = requireEnv("STRIPE_CHECKOUT_SUCCESS_URL");
    const cancelUrl = requireEnv("STRIPE_CHECKOUT_CANCEL_URL");
    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return unauthorized("Missing bearer token");

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return unauthorized("Invalid session");

    const provider = await fetchProviderForOwner(user.id);
    if (!provider?.id) return badRequest("Provider account not found");

    let billingCustomerId = null;
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const billingRes = await fetch(
      `${supabaseUrl}/rest/v1/provider_billing_profiles?select=stripe_customer_id&provider_id=eq.${provider.id}&limit=1`,
      {
        headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` },
      }
    );
    if (billingRes.ok) {
      const rows = await billingRes.json();
      billingCustomerId = rows?.[0]?.stripe_customer_id || null;
    }
    if (!billingCustomerId) {
      const customer = await createStripeCustomer(user.email, provider.name);
      billingCustomerId = customer.id;
      await upsertBillingProfile(provider.id, { stripe_customer_id: billingCustomerId });
    }

    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("customer", billingCustomerId);
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    body.set("success_url", successUrl);
    body.set("cancel_url", cancelUrl);
    body.set("client_reference_id", provider.id);
    body.set("metadata[provider_id]", provider.id);
    body.set("metadata[owner_user_id]", user.id);

    const checkoutRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${stripeSecret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!checkoutRes.ok) {
      const text = await checkoutRes.text();
      throw new Error(`Stripe checkout create failed: ${text}`);
    }
    const session = await checkoutRes.json();
    return json(200, { url: session.url, session_id: session.id });
  } catch (error) {
    return serverError(error.message || "Could not create checkout session");
  }
};
