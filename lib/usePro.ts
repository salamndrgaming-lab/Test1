"use client";

import { usePersistentState } from "@/lib/usePersistentState";

/**
 * Pro entitlement. Until Stripe + Supabase billing is wired (see LAUNCH.md),
 * this reads a local flag so the freemium experience is fully testable. When
 * billing lands, replace the source with the server-verified subscription
 * status — the `isPro` contract stays the same for all callers.
 */
export function usePro() {
  const [isPro, setIsPro] = usePersistentState<boolean>("newsscope.pro", false);
  return { isPro, setIsPro };
}

// Limits applied to the free tier (Pro removes them).
export const FREE_LIMITS = {
  savedLocations: 1,
  watchlistTickers: 0, // free users see curated lists but can't add custom
  blindspotPerDay: 3,
};
