"use client";

import { useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

/**
 * Magic-link sign-in. Renders only when Supabase is configured; otherwise the
 * app stays in local-first mode and this returns null.
 */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!isSupabaseConfigured) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/profile` },
    });
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <Card>
      <h3 className="font-semibold">Sign in to sync across devices</h3>
      <p className="mb-3 text-xs text-[var(--muted)]">
        We&apos;ll email you a magic link — no password.
      </p>
      {sent ? (
        <p className="text-sm text-good">Check your email for the link.</p>
      ) : (
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <button type="submit" className="btn-primary">
            Send link
          </button>
        </form>
      )}
      {err && <p className="mt-2 text-xs text-[var(--bad)]">{err}</p>}
    </Card>
  );
}
