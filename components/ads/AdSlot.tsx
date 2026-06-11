"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePro } from "@/lib/usePro";
import { useConsent, ADSENSE_CLIENT } from "@/lib/useConsent";

interface AdSlotProps {
  /** AdSense ad unit slot id (data-ad-slot). */
  slot?: string;
  className?: string;
}

/**
 * Renders a Google AdSense unit for FREE users only, after consent.
 * - Pro users: nothing (ad-free is a paid benefit).
 * - AdSense not configured (or consent denied): a "Go Pro" house promo, so the
 *   space still earns via subscription upsell instead of going blank.
 */
export function AdSlot({ slot, className }: AdSlotProps) {
  const { isPro } = usePro();
  const { granted } = useConsent();
  const pushed = useRef(false);

  const showRealAd = !isPro && granted && ADSENSE_CLIENT && slot;

  useEffect(() => {
    if (!showRealAd || pushed.current) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      /* adsbygoogle not ready */
    }
  }, [showRealAd]);

  if (isPro) return null;

  if (showRealAd) {
    return (
      <ins
        className={`adsbygoogle block ${className ?? ""}`}
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    );
  }

  // House promo fallback (also shown to free users before consent / pre-AdSense)
  return (
    <Link
      href="/upgrade"
      className={`card card-hover flex items-center justify-between gap-3 ${className ?? ""}`}
    >
      <div>
        <p className="kicker mb-0.5">Ad</p>
        <p className="text-sm font-medium text-[var(--text)]">
          Enjoying NewsScope? Go Pro to remove ads.
        </p>
      </div>
      <span className="btn-primary shrink-0">Go Pro</span>
    </Link>
  );
}
