import Link from "next/link";

export function UpgradeCard({
  feature,
  compact = false,
}: {
  feature: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--accent)]/40 bg-gradient-to-br from-[var(--surface-2)] to-transparent text-center ${
        compact ? "p-4" : "p-6"
      }`}
    >
      <p className="kicker mb-1">Pro</p>
      <p className="mb-3 text-sm text-[var(--muted)]">
        <span className="font-medium text-[var(--text)]">{feature}</span> is a
        Pro feature.
      </p>
      <Link href="/upgrade" className="btn-primary inline-block">
        See Pro plans
      </Link>
    </div>
  );
}

/** Renders children for Pro users, otherwise an upgrade prompt. */
export function ProGate({
  isPro,
  feature,
  children,
  compact,
}: {
  isPro: boolean;
  feature: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  if (isPro) return <>{children}</>;
  return <UpgradeCard feature={feature} compact={compact} />;
}
