"use client";

import { useMembership } from "@/lib/useProfile";

/**
 * Pro entitlement — derived from the profile's membership status (single source
 * of truth). `setIsPro` is a dev convenience that flips membership; when Stripe
 * billing is wired (see LAUNCH.md) the webhook sets membership server-side.
 */
export function usePro() {
  const { isPro, setMembership } = useMembership();
  return {
    isPro,
    setIsPro: (v: boolean) => setMembership(v ? "pro" : "free"),
  };
}

// Limits applied to the free tier (Pro removes them).
export const FREE_LIMITS = {
  savedLocations: 1,
  watchlistTickers: 0, // free users see curated lists but can't add custom
  blindspotPerDay: 3,
  bookmarks: 10,
};
