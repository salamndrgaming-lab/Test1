import { NextRequest, NextResponse } from "next/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Creates a Stripe Checkout Session for Pro. Returns { url } on success, or
// { error } when billing isn't configured yet (the /upgrade page handles both).
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  let plan: "monthly" | "annual" = "annual";
  let email: string | undefined;
  let userId: string | undefined;
  try {
    const body = await req.json();
    plan = body.plan === "monthly" ? "monthly" : "annual";
    email = body.email;
    userId = body.userId; // pass the Supabase user id once auth is wired
  } catch {
    /* defaults */
  }

  const price = STRIPE_PRICES[plan];
  if (!stripe || !price) {
    return NextResponse.json({
      error: "Billing isn't enabled yet — coming soon.",
    });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    subscription_data: { trial_period_days: 7 },
    customer_email: email,
    client_reference_id: userId, // links the customer to the profile in the webhook
    allow_promotion_codes: true,
    success_url: `${origin}/profile?upgraded=1`,
    cancel_url: `${origin}/upgrade`,
  });

  return NextResponse.json({ url: session.url });
}
