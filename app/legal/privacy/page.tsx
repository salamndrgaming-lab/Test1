import { PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy Policy — NewsScope" };

export default function PrivacyPage() {
  return (
    <div>
      <PageHeader kicker="Legal" title="Privacy Policy" />
      <div className="space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <p className="text-[var(--muted-2)]">
          Last updated: June 2026. Template — review with legal counsel.
        </p>
        <p>
          We aim to collect as little as possible. Your preferences (theme,
          saved location, watchlist, favorites) are stored locally on your
          device. If you create an account, we store your email and subscription
          status to provide the Service.
        </p>
        <h2 className="font-semibold text-[var(--text)]">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account: email and authentication identifiers.</li>
          <li>Billing: handled by Stripe; we never store card numbers.</li>
          <li>
            Usage analytics: privacy-friendly, aggregated metrics (no selling of
            personal data).
          </li>
          <li>Location: only when you enable it, to show local news/weather.</li>
        </ul>
        <h2 className="font-semibold text-[var(--text)]">Your rights</h2>
        <p>
          Depending on your region (e.g., CCPA, GDPR) you may request access to,
          correction of, or deletion of your data. Email
          privacy@newsscope.example and we will respond within the required
          timeframe. We do not sell personal information.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Third parties</h2>
        <p>
          We use processors including Stripe (payments), our hosting/analytics
          providers, and email delivery. Third-party links open external sites
          governed by their own policies.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Contact</h2>
        <p>privacy@newsscope.example.</p>
      </div>
    </div>
  );
}
