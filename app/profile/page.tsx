"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfile, MEMBERSHIP_LABEL, isProMembership } from "@/lib/useProfile";
import { PageHeader, Card } from "@/components/ui";
import { SignIn } from "@/components/auth/SignIn";
import { accentVars } from "@/lib/sections";
import { classNames } from "@/lib/format";

function MembershipBadge({ status }: { status: string }) {
  const pro = status === "pro" || status === "trialing";
  const bad = status === "past_due" || status === "canceled";
  return (
    <span
      className={classNames(
        "rounded-full px-3 py-1 text-xs font-semibold",
        pro
          ? "bg-[var(--accent)]/15 text-[var(--accent)]"
          : bad
            ? "bg-red-500/15 text-red-300"
            : "bg-[var(--surface-2)] text-[var(--muted)]",
      )}
    >
      {MEMBERSHIP_LABEL[status as keyof typeof MEMBERSHIP_LABEL] ?? status}
    </span>
  );
}

export default function ProfilePage() {
  const { profile, update } = useProfile();
  const [name, setName] = useState(profile.displayName);
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  const isPro = isProMembership(profile.membership);
  const joined = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      })
    : "—";

  return (
    <div style={accentVars("home")}>
      <PageHeader kicker="Account" title="Profile" />

      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-2xl font-bold text-slate-950">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-serif text-xl font-medium text-[var(--text)]">
                {profile.displayName || "Your name"}
              </h2>
              <MembershipBadge status={profile.membership} />
            </div>
            <p className="text-sm text-[var(--muted)]">
              {profile.email ?? "Not signed in"} · Member since {joined}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--muted)]">
              Display name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => update({ displayName: name.trim() })}
              placeholder="Your name"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
          </div>
          <Link
            href="/upgrade"
            className={classNames(isPro ? "chip" : "btn-primary")}
          >
            {isPro ? "Manage membership" : "Upgrade to Pro"}
          </Link>
        </div>
      </Card>

      <div className="mt-4">
        <SignIn />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-semibold">Following</h3>
          {profile.followedTopics.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              You&apos;re not following any stories yet.{" "}
              <Link href="/following" className="text-[var(--accent)]">
                Follow stories
              </Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.followedTopics.map((t) => (
                <span key={t} className="chip text-xs">
                  {t}
                </span>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">Your library</h3>
          <p className="text-sm text-[var(--muted)]">
            Saved articles, read-later, and reading history live in{" "}
            <Link href="/saved" className="text-[var(--accent)]">
              Saved
            </Link>
            .
          </p>
        </Card>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--muted-2)]">
        Your profile is stored on this device. Sign in (when enabled) to sync
        across devices.
      </p>
    </div>
  );
}
