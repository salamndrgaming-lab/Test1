import Link from "next/link";
import { NewsletterSignup } from "@/components/NewsletterSignup";

const LINKS = [
  ["/about", "About"],
  ["/upgrade", "Go Pro"],
  ["/legal/terms", "Terms"],
  ["/legal/privacy", "Privacy"],
  ["/legal/disclaimer", "Disclaimers"],
  ["/legal/attributions", "Data & Sources"],
];

export function Footer() {
  return (
    <footer className="mx-auto mt-10 max-w-5xl border-t border-[var(--border-soft)] px-4 pb-8 pt-6 text-xs text-[var(--muted)]">
      <div className="mb-5">
        <p className="mb-2 font-serif text-base text-[var(--text)]">
          The daily briefing, with every side.
        </p>
        <NewsletterSignup />
      </div>

      <nav className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="hover:text-[var(--text)]"
          >
            {label}
          </Link>
        ))}
      </nav>

      <p className="mb-2">
        <strong className="text-[var(--text)]">NewsScope</strong> aggregates
        public news, weather, sports, and market data from third-party sources
        and links to the originals. Bias ratings are illustrative outlet-level
        estimates, not article-level fact-checks.
      </p>
      <p>
        Sports betting content is informational/educational only — not betting
        or financial advice, and not a guarantee of any outcome. 21+ (or legal
        age in your jurisdiction). Gambling problem? Call 1-800-GAMBLER.
      </p>
    </footer>
  );
}
