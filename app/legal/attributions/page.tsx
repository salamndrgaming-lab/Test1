import { PageHeader } from "@/components/ui";

export const metadata = { title: "Data & Attributions — NewsScope" };

const SOURCES = [
  ["News", "Google News & publisher RSS — headlines link to original sources."],
  ["Weather", "Open-Meteo (forecast & air quality); NWS (US alerts)."],
  ["Radar", "Precipitation radar by RainViewer."],
  ["Sports", "Scores, odds & standings via ESPN."],
  ["Markets", "Quotes via Yahoo Finance; crypto via CoinGecko; IPOs via Nasdaq."],
  ["Maps", "© OpenStreetMap contributors, CARTO."],
];

export default function AttributionsPage() {
  return (
    <div>
      <PageHeader
        kicker="Legal"
        title="Data & Attributions"
        subtitle="NewsScope links to original sources and credits the data providers below."
      />
      <div className="space-y-3 text-sm">
        {SOURCES.map(([label, desc]) => (
          <div
            key={label}
            className="flex flex-col gap-0.5 border-b border-[var(--border-soft)] pb-3"
          >
            <span className="font-medium text-[var(--text)]">{label}</span>
            <span className="text-[var(--muted)]">{desc}</span>
          </div>
        ))}
        <p className="pt-2 text-xs text-[var(--muted-2)]">
          All trademarks and content belong to their respective owners. We
          display headlines and link out; we do not republish full articles.
        </p>
      </div>
    </div>
  );
}
