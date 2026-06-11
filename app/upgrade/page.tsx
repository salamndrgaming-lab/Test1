"use client";

import { useState } from "react";
import { usePro } from "@/lib/usePro";
import { PageHeader, Card } from "@/components/ui";
import { accentVars } from "@/lib/sections";
import { classNames } from "@/lib/format";

const FREE = [
  "Top headlines + categories",
  "Bias badges on every story",
  "3 Blindspot comparisons / day",
  "1 saved location",
  "Markets, scores & weather",
];

const PRO = [
  "Unlimited Blindspot & bias tools",
  "Ad-free, faster briefing",
  "Custom alerts & saved searches",
  "Unlimited locations & stock watchlists",
  "Advanced filters, sorting & history",
];

export default function UpgradePage() {
  const { isPro, setIsPro } = usePro();
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const checkout = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: annual ? "annual" : "monthly" }),
      });
      const j = await r.json();
      if (j.url) {
        window.location.href = j.url; // Stripe Checkout
      } else {
        setMsg(j.error ?? "Checkout is not available yet.");
      }
    } catch {
      setMsg("Checkout is not available yet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={accentVars("home")}>
      <PageHeader
        kicker="Membership"
        title="Go Pro"
        subtitle="Support independent, bias-aware news — unlock the full briefing."
      />

      <div className="mb-4 flex items-center justify-center gap-2">
        <button
          onClick={() => setAnnual(false)}
          className={classNames("chip", !annual && "chip-active")}
        >
          Monthly
        </button>
        <button
          onClick={() => setAnnual(true)}
          className={classNames("chip", annual && "chip-active")}
        >
          Annual · save 33%
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl font-medium text-[var(--text)]">
            Free
          </h2>
          <p className="mb-4 mt-1 text-3xl font-bold">
            $0
            <span className="text-sm font-normal text-[var(--muted)]">
              {" "}
              forever
            </span>
          </p>
          <ul className="space-y-2 text-sm">
            {FREE.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-[var(--muted-2)]">○</span>
                {f}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="border-[var(--accent)]/50">
          <h2 className="font-serif text-xl font-medium text-[var(--text)]">
            Pro
          </h2>
          <p className="mb-4 mt-1 text-3xl font-bold">
            {annual ? "$39.99" : "$4.99"}
            <span className="text-sm font-normal text-[var(--muted)]">
              {annual ? " / year" : " / month"}
            </span>
          </p>
          <ul className="mb-4 space-y-2 text-sm">
            {PRO.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-[var(--accent)]">✓</span>
                {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <p className="rounded-lg bg-green-500/15 px-3 py-2 text-center text-sm text-green-300">
              You&apos;re on Pro — thank you!
            </p>
          ) : (
            <button
              onClick={checkout}
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? "…" : "Upgrade to Pro"}
            </button>
          )}
          {msg && (
            <p className="mt-2 text-center text-xs text-[var(--muted)]">{msg}</p>
          )}
        </Card>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--muted-2)]">
        7-day free trial · cancel anytime · secure checkout via Stripe.
      </p>

      {/* Dev-only entitlement toggle (until billing is live — see LAUNCH.md) */}
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setIsPro(!isPro)}
            className="chip text-xs"
            title="Developer toggle — not shown in production"
          >
            {isPro ? "Dev: deactivate Pro" : "Dev: activate Pro"}
          </button>
        </div>
      )}
    </div>
  );
}
