import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Stripe Billing customer portal (manage/cancel). Needs the customer id, which
// is available once Supabase auth links profiles → stripe_customer_id.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  let customerId: string | undefined;
  try {
    ({ customerId } = await req.json());
  } catch {
    /* ignore */
  }
  if (!stripe || !customerId) {
    return NextResponse.json({ error: "Billing portal not available yet." });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/profile`,
  });
  return NextResponse.json({ url: session.url });
}
