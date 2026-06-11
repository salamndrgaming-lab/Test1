import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Membership } from "@/lib/useProfile";

/**
 * Server-only Supabase client using the service-role key. NEVER import this in
 * a client component. Returns null until configured. Used by the Stripe webhook
 * to set membership, and by server reads of the source-of-truth status.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Server-verified membership for a user (source of truth once billing is live).
 * Returns null when Supabase isn't configured — callers fall back to the
 * local profile.
 */
export async function getMembership(userId: string): Promise<Membership | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("profiles")
    .select("membership")
    .eq("id", userId)
    .single();
  return (data?.membership as Membership) ?? "free";
}
