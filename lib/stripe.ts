import Stripe from "stripe";

let cached: Stripe | null = null;

/** Stripe server client, or null when not configured (keeps the app runnable). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) cached = new Stripe(key);
  return cached;
}

export const STRIPE_PRICES: Record<"monthly" | "annual", string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

import type { Membership } from "@/lib/useProfile";

/** Map a Stripe subscription status to our membership status. */
export function membershipFromStatus(status: string): Membership {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "pro";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}
