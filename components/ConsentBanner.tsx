"use client";

import Link from "next/link";
import { useConsent, ADSENSE_CLIENT } from "@/lib/useConsent";

/**
 * Lightweight consent banner. Only shown when ads/analytics are configured and
 * the user hasn't decided. Ads (AdSlot) won't load until consent is granted.
 * NOTE: EEA/UK personalized ads require a Google-certified CMP — see LAUNCH.md.
 */
export function ConsentBanner() {
  const { decided, grant, deny } = useConsent();
  const needsConsent = !!ADSENSE_CLIENT;
  if (!needsConsent || decided) return null;

  return (
    <div className="fixed inset-x-0 bottom-[4.75rem] z-50 mx-auto max-w-3xl px-4 pb-[env(safe-area-inset-bottom)] md:bottom-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg sm:flex-row sm:items-center">
        <p className="flex-1 text-xs text-[var(--muted)]">
          We use cookies for ads and analytics to keep NewsScope free. See our{" "}
          <Link href="/legal/privacy" className="text-[var(--accent)] underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={deny} className="chip text-xs">
            Decline
          </button>
          <button onClick={grant} className="btn-primary text-xs">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
