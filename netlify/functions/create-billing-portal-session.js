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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return badRequest("Use POST");
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return unauthorized("Missing bearer token");

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return unauthorized("Invalid session");

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const providerRes = await fetch(
      `${supabaseUrl}/rest/v1/providers?select=id&owner_id=eq.${user.id}&limit=1`,
      { headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` } }
    );
    const providers = providerRes.ok ? await providerRes.json() : [];
    const providerId = providers?.[0]?.id;
    if (!providerId) return badRequest("Provider account not found");

    const billingRes = await fetch(
      `${supabaseUrl}/rest/v1/provider_billing_profiles?select=stripe_customer_id&provider_id=eq.${providerId}&limit=1`,
      { headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` } }
    );
    const billingRows = billingRes.ok ? await billingRes.json() : [];
    const customerId = billingRows?.[0]?.stripe_customer_id;
    if (!customerId) return badRequest("No Stripe customer found yet");

    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const returnUrl = requireEnv("STRIPE_BILLING_PORTAL_RETURN_URL");
    const body = new URLSearchParams();
    body.set("customer", customerId);
    body.set("return_url", returnUrl);

    const portalRes = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${stripeSecret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!portalRes.ok) {
      const text = await portalRes.text();
      throw new Error(`Stripe portal create failed: ${text}`);
    }
    const portal = await portalRes.json();
    return json(200, { url: portal.url });
  } catch (error) {
    return serverError(error.message || "Could not create billing portal session");
  }
};
