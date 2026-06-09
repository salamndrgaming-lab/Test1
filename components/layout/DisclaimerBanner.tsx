export function DisclaimerBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <span className="mr-1 font-semibold">⚠ Research only:</span>
      {children ??
        "Informational and educational use only — not betting or financial advice. No outcome is guaranteed. 21+. Gambling problem? Call 1-800-GAMBLER."}
    </div>
  );
}
