"use client";

import { usePersistentState } from "@/lib/usePersistentState";
import { Card } from "@/components/ui";

/**
 * Gates gambling-adjacent content (odds, SGP research) behind a 21+ check.
 * Persists the acknowledgement on-device. This is informational/educational
 * content only — see the disclaimer for details.
 */
export function AgeGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = usePersistentState<boolean>("newsscope.age21", false);
  const [declined, setDeclined] = usePersistentState<boolean>(
    "newsscope.age21Declined",
    false,
  );

  if (ok) return <>{children}</>;

  return (
    <Card className="mx-auto max-w-md text-center">
      <p className="kicker mb-1">21+ Only</p>
      <h2 className="font-serif text-xl font-medium text-[var(--text)]">
        Confirm your age
      </h2>
      <p className="mb-4 mt-2 text-sm text-[var(--muted)]">
        This section shows betting-market odds and a research tool for
        informational and educational purposes only — not betting advice. You
        must be 21+ (or legal age in your jurisdiction) to view it.
      </p>
      {declined ? (
        <p className="text-sm text-[var(--bad)]">
          You must be 21 or older to view this section.
        </p>
      ) : (
        <div className="flex justify-center gap-2">
          <button onClick={() => setOk(true)} className="btn-primary">
            I&apos;m 21 or older
          </button>
          <button onClick={() => setDeclined(true)} className="chip">
            I&apos;m under 21
          </button>
        </div>
      )}
      <p className="mt-4 text-[0.7rem] text-[var(--muted-2)]">
        Gambling problem? Call 1-800-GAMBLER.
      </p>
    </Card>
  );
}
