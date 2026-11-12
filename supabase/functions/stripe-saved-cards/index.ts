import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const isCustomerModeMismatch = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("No such customer") && message.includes("similar object exists in test mode");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleRow } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = roleRow?.role;

    const body = await req.json();
    const { stripe_customer_id, update_client_id } = body;

    if (!stripe_customer_id) {
      return new Response(JSON.stringify({ cards: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: clientRow } = await serviceClient
      .from("clients")
      .select("id, auth_user_id")
      .eq("stripe_customer_id", stripe_customer_id)
      .maybeSingle();

    if (!clientRow) {
      return new Response(JSON.stringify({ cards: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role === "client" && clientRow.auth_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (role !== "owner" && role !== "barber" && role !== "client") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let paymentMethods;
    try {
      paymentMethods = await stripe.paymentMethods.list({
        customer: stripe_customer_id,
        type: "card",
        limit: 5,
      });
    } catch (error) {
      if (isCustomerModeMismatch(error)) {
        await serviceClient
          .from("clients")
          .update({
            stripe_customer_id: null,
            card_brand: null,
            card_last4: null,
          })
          .eq("id", clientRow.id);

        return new Response(JSON.stringify({ cards: [], reset_customer: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw error;
    }

    // Filter out wallet tokens (Apple/Google Pay) — those are single-use and not chargeable off-session.
    const physicalCards = paymentMethods.data.filter((pm) => !pm.card?.wallet);

    // Dedupe by card.fingerprint. Stripe returns the SAME fingerprint for the same physical card,
    // even when it's been attached multiple times via different checkouts. Newest first wins.
    const sortedNewestFirst = [...physicalCards].sort((a, b) => (b.created || 0) - (a.created || 0));
    const seen = new Set<string>();
    const uniques: typeof sortedNewestFirst = [];
    const duplicates: typeof sortedNewestFirst = [];
    for (const pm of sortedNewestFirst) {
      const fp = pm.card?.fingerprint;
      if (fp && seen.has(fp)) {
        duplicates.push(pm);
      } else {
        if (fp) seen.add(fp);
        uniques.push(pm);
      }
    }

    // Best-effort: detach older duplicates so they stop showing up everywhere. Don't block the response on errors.
    if (duplicates.length > 0) {
      await Promise.allSettled(
        duplicates.map((pm) => stripe.paymentMethods.detach(pm.id))
      );
    }

    const cards = uniques.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || "unknown",
      last4: pm.card?.last4 || "****",
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
    }));

    // Only the client that owns this Stripe customer can be updated.
    if (update_client_id && update_client_id === clientRow.id && cards.length > 0) {
      await serviceClient
        .from("clients")
        .update({
          card_brand: cards[0].brand,
          card_last4: cards[0].last4,
        })
        .eq("id", update_client_id);
    }

    return new Response(JSON.stringify({ cards }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("stripe-saved-cards error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
