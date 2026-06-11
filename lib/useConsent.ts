"use client";

import { usePersistentState } from "@/lib/usePersistentState";

export type ConsentValue = "" | "granted" | "denied";

/** Ad/analytics consent, persisted on-device. "" = not yet decided. */
export function useConsent() {
  const [consent, setConsent] = usePersistentState<ConsentValue>(
    "newsscope.consent",
    "",
  );
  return {
    consent,
    decided: consent !== "",
    granted: consent === "granted",
    grant: () => setConsent("granted"),
    deny: () => setConsent("denied"),
  };
}

/** Whether AdSense is configured (publisher id present). */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
