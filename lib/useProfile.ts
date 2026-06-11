"use client";

import { useEffect } from "react";
import { usePersistentState } from "@/lib/usePersistentState";

export type Membership =
  | "free"
  | "trialing"
  | "pro"
  | "past_due"
  | "canceled";

export interface Profile {
  displayName: string;
  email?: string;
  createdAt: string; // ISO
  membership: Membership;
  followedTopics: string[];
  followedSources: string[];
}

const DEFAULT_PROFILE: Profile = {
  displayName: "",
  createdAt: "",
  membership: "free",
  followedTopics: [],
  followedSources: [],
};

export const MEMBERSHIP_LABEL: Record<Membership, string> = {
  free: "Free",
  trialing: "Pro Trial",
  pro: "Pro",
  past_due: "Past Due",
  canceled: "Canceled",
};

export function isProMembership(m: Membership): boolean {
  return m === "pro" || m === "trialing";
}

/**
 * The user's profile + membership. Local-first (on-device) today; when Supabase
 * is configured (see LAUNCH.md) the membership becomes server-verified and the
 * Stripe webhook is the source of truth — this hook's shape stays the same.
 */
export function useProfile() {
  const [profile, setProfile] = usePersistentState<Profile>(
    "newsscope.profile",
    DEFAULT_PROFILE,
  );

  // Stamp the join date once.
  useEffect(() => {
    if (!profile.createdAt) {
      setProfile((p) => ({ ...p, createdAt: new Date().toISOString() }));
    }
  }, [profile.createdAt, setProfile]);

  const update = (patch: Partial<Profile>) =>
    setProfile((p) => ({ ...p, ...patch }));

  return { profile, update };
}

/** Convenience hook for just the membership status. */
export function useMembership() {
  const { profile, update } = useProfile();
  return {
    membership: profile.membership,
    setMembership: (membership: Membership) => update({ membership }),
    isPro: isProMembership(profile.membership),
  };
}
