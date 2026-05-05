# Payment Security Sprint (Phase 12.1)

## Goal
- Move PlugFeed billing from placeholder UI to secure Stripe-backed flows.
- Keep sensitive operations server-side only.

## Implemented Today
- Netlify serverless endpoints:
  - `/api/create-checkout-session`
  - `/api/create-billing-portal-session`
  - `/api/stripe-webhook`
- Billing page buttons now call protected server endpoints.
- Added payment security SQL foundation:
  - `payment_webhook_events`
  - `payment_idempotency_keys`
  - `provider_billing_audit`

## Required Supabase SQL
Run in this order:
1. `supabase/phase12_billing_scaffold.sql` (already existing)
2. `supabase/phase12_payment_security_foundation.sql` (new)

## Required Netlify Environment Variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`
- `STRIPE_BILLING_PORTAL_RETURN_URL`

## Stripe Dashboard Setup
1. Create product/price for Plug plan, copy price ID into `STRIPE_PRICE_PRO`.
2. Create webhook endpoint:
   - URL: `https://<your-domain>/api/stripe-webhook`
   - Events:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
3. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`.

## Security Notes
- Checkout + billing portal creation are server-side only.
- User identity is validated by Supabase access token.
- Webhook signature is validated with HMAC SHA-256.
- Webhook events are stored with unique `stripe_event_id` to prevent duplicate processing.

## Next Sprint Tasks
1. Add idempotency key usage in server endpoints (`payment_idempotency_keys`).
2. Add explicit proposal/direct-request quota enforcement gates tied to `plan_tier`.
3. Add admin billing audit screen using `provider_billing_audit`.
4. Add failure-safe retries for webhook processing states.
5. Add legal policy text updates for payments/refunds/cancellations/disputes.
