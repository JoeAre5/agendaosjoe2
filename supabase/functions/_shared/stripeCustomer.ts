// Shared helper: resolve an existing Stripe customer for a local client, or
// create one and persist the stripe_customer_id back onto the clients row.
//
// Extracted from the legacy `prepare-stripe-intent` action in pay-then-book
// during the hosted-Checkout rebuild (Phase 1). Reusable from any future
// Stripe edge function (create-booking-checkout, future POS flows, etc.).
//
// Behavior:
//   - If clientId is provided AND the client has a stripe_customer_id → return it
//   - If clientId is provided AND no stripe_customer_id → create one, persist, return id
//   - If clientId is NOT provided → create a guest customer (no DB persistence)
//
// Always idempotent at the DB layer (clients.stripe_customer_id is single column,
// last write wins; concurrent races are rare and harmless — Stripe customers
// are cheap to leave orphaned).
//
// deno-lint-ignore-file no-explicit-any
import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface ResolveOrCreateStripeCustomerParams {
  stripe: Stripe;
  admin: SupabaseClient;
  /** Local public.clients.id — when provided, lookup-or-create + persist. */
  clientId?: string | null;
  /** Fallback contact info used when clientId is missing or the row has no contact data. */
  email?: string | null;
  name?: string | null;
  phone?: string | null;
}

export async function resolveOrCreateStripeCustomer({
  stripe,
  admin,
  clientId,
  email,
  name,
  phone,
}: ResolveOrCreateStripeCustomerParams): Promise<string | undefined> {
  if (clientId) {
    const { data: client } = await admin
      .from("clients")
      .select("id, stripe_customer_id, first_name, last_name, email, phone")
      .eq("id", clientId)
      .single();

    if (client?.stripe_customer_id) {
      return client.stripe_customer_id as string;
    }

    if (client) {
      const customer = await stripe.customers.create({
        name: [client.first_name, client.last_name].filter(Boolean).join(" ") || name || undefined,
        email: client.email || email || undefined,
        phone: client.phone || phone || undefined,
        metadata: { local_client_id: client.id },
      });
      await admin
        .from("clients")
        .update({ stripe_customer_id: customer.id })
        .eq("id", client.id);
      return customer.id;
    }
  }

  // No clientId — guest checkout. Stripe Checkout can also collect email itself,
  // so it's fine to return undefined; only create a customer if we have at least
  // an email so future receipts work.
  if (email) {
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      phone: phone || undefined,
    });
    return customer.id;
  }

  return undefined;
}
