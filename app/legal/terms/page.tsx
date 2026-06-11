import { PageHeader } from "@/components/ui";

export const metadata = { title: "Terms of Service — NewsScope" };

export default function TermsPage() {
  return (
    <div>
      <PageHeader kicker="Legal" title="Terms of Service" />
      <div className="prose-sm space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <p className="text-[var(--muted-2)]">
          Last updated: June 2026. Template — review with legal counsel before
          relying on it commercially.
        </p>
        <p>
          By using NewsScope (the &quot;Service&quot;) you agree to these Terms.
          The Service aggregates publicly available news, weather, sports, and
          market information and presents links to original sources. We do not
          own or claim ownership of third-party content; all trademarks and
          articles belong to their respective owners.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Use of the Service</h2>
        <p>
          NewsScope is provided for personal, informational use. You agree not
          to scrape, resell, or redistribute the Service&apos;s output, or use
          it to violate any law. Features may change or be discontinued.
        </p>
        <h2 className="font-semibold text-[var(--text)]">
          No financial or betting advice
        </h2>
        <p>
          Market data and sports content (including the SGP research tool) are
          informational and educational only — not financial, investment, or
          betting advice, and not a guarantee of any outcome. Data may be
          delayed or inaccurate. You are solely responsible for your decisions.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Subscriptions</h2>
        <p>
          Pro subscriptions are billed through Stripe. You may cancel anytime;
          access continues through the paid period. Prices may change with
          notice.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Disclaimer & liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties. To the
          maximum extent permitted by law, NewsScope is not liable for any
          damages arising from use of the Service or reliance on its content.
        </p>
        <h2 className="font-semibold text-[var(--text)]">Contact</h2>
        <p>Questions: support@newsscope.example.</p>
      </div>
    </div>
  );
}
