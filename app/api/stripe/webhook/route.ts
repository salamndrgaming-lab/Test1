import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, membershipFromStatus } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { Membership } from "@/lib/useProfile";

export const dynamic = "force-dynamic";

// Stripe → membership source of truth. Configure STRIPE_WEBHOOK_SECRET and point
// a Stripe webhook at /api/stripe/webhook. Updates profiles.membership in
// Supabase (when configured) keyed by stripe_customer_id.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new NextResponse("billing not configured", { status: 200 });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const setMembership = async (customerId: string, membership: Membership) => {
    if (!admin || !customerId) return;
    await admin
      .from("profiles")
      .update({ membership })
      .eq("stripe_customer_id", customerId);
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const customerId = String(s.customer ?? "");
      // link customer → profile if a user id was passed at checkout
      if (admin && s.client_reference_id && customerId) {
        await admin
          .from("profiles")
          .update({ stripe_customer_id: customerId, membership: "trialing" })
          .eq("id", s.client_reference_id);
      } else {
        await setMembership(customerId, "trialing");
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await setMembership(
        String(sub.customer ?? ""),
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : membershipFromStatus(sub.status),
      );
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
