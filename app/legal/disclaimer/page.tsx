import { PageHeader } from "@/components/ui";

export const metadata = { title: "Disclaimers — NewsScope" };

export default function DisclaimerPage() {
  return (
    <div>
      <PageHeader kicker="Legal" title="Disclaimers" />
      <div className="space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="font-semibold text-[var(--text)]">Bias ratings</h2>
        <p>
          Political-lean labels are outlet-level estimates intended to encourage
          balanced reading — not definitive judgments of any individual article.
          They are our own editorial estimates and may differ from other rating
          systems.
        </p>
        <h2 className="font-semibold text-[var(--text)]">
          Sports & betting content
        </h2>
        <p>
          Odds and the Same-Game-Parlay research tool are for informational and
          educational purposes only. They are not betting advice and do not
          guarantee any outcome. Must be 21+ (or legal age in your
          jurisdiction). NewsScope does not accept wagers or handle money for
          betting. If you or someone you know has a gambling problem, call
          1-800-GAMBLER or visit ncpgambling.org.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Market data</h2>
        <p>
          Quotes may be delayed and are provided for information only — not
          investment advice. Verify with your broker before trading.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Weather</h2>
        <p>
          For official watches and warnings, always consult your national
          weather service and local authorities.
        </p>
      </div>
    </div>
  );
}
