import Link from "next/link";
import type { Metadata } from "next";
import { fetchOutletArticles } from "@/lib/providers/news.provider";
import { PUBLISHER_FEEDS } from "@/lib/feeds";
import { lookupBias, LEAN_LABEL, normalizeDomain } from "@/lib/bias";
import { keywordsFromArticles } from "@/lib/trending";
import { ArticleCard } from "@/components/news/ArticleCard";
import { Card, BiasBadge } from "@/components/ui";
import { accentVars } from "@/lib/sections";

export const revalidate = 1800;

/** Outlets we actually syndicate get a full, indexable profile. */
export function generateStaticParams() {
  return [...new Set(PUBLISHER_FEEDS.map((f) => f.domain))].map((domain) => ({
    domain,
  }));
}

function outletName(domain: string): string {
  return (
    PUBLISHER_FEEDS.find((f) => f.domain === domain)?.source ??
    domain.replace(/\.(com|org|co\.uk|net)$/, "").replace(/^\w/, (c) => c.toUpperCase())
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const d = normalizeDomain(decodeURIComponent(domain));
  const name = outletName(d);
  const { lean } = lookupBias(d);
  const title = `${name} — bias rating, tone & latest coverage`;
  const description = `${name} is rated ${LEAN_LABEL[lean]} on our spectrum. See its latest headlines, overall tone, and the topics it covers most.`;
  return {
    title,
    description,
    alternates: { canonical: `/outlet/${d}` },
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-3">
      <p className="text-[0.65rem] uppercase tracking-wide text-[var(--muted-2)]">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[0.65rem] text-[var(--muted-2)]">{sub}</p>}
    </div>
  );
}

export default async function OutletPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const d = normalizeDomain(decodeURIComponent(domain));
  const name = outletName(d);
  const { lean, confidence } = lookupBias(d);
  const syndicated = PUBLISHER_FEEDS.some((f) => f.domain === d);

  let articles: Awaited<ReturnType<typeof fetchOutletArticles>> = [];
  if (syndicated) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      articles = await fetchOutletArticles(d, controller.signal);
    } catch {
      articles = [];
    } finally {
      clearTimeout(timer);
    }
  }

  const tone =
    articles.length > 0
      ? articles.reduce((s, a) => s + a.sentiment, 0) / articles.length
      : null;
  const topics = keywordsFromArticles(articles, 10);

  return (
    <div style={accentVars("bias")}>
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="accent-rule" />
          <span className="kicker">Outlet profile</span>
        </div>
        <h1 className="headline text-[2rem] leading-tight sm:text-[2.6rem]">
          {name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BiasBadge lean={lean} />
          <span className="text-xs text-[var(--muted)]">
            {confidence} confidence rating
          </span>
          <a
            href={`https://${d}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] underline underline-offset-2"
          >
            {d} ↗
          </a>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Spectrum" value={LEAN_LABEL[lean]} sub="outlet-level estimate" />
        <Stat
          label="Recent tone"
          value={tone === null ? "—" : `${tone >= 0 ? "+" : ""}${tone.toFixed(2)}`}
          sub={tone === null ? "no feed data" : "mean sentiment, -1 to +1"}
        />
        <Stat
          label="Headlines"
          value={articles.length ? String(articles.length) : "—"}
          sub={syndicated ? "tracked right now" : "not syndicated here"}
        />
      </div>

      {topics.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-1 font-serif text-lg font-medium text-[var(--text)]">
            What they&apos;re covering
          </h2>
          <p className="mb-3 text-xs text-[var(--muted)]">
            The most frequent terms across their current headlines.
          </p>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <Link key={t} href={`/news?q=${encodeURIComponent(t)}`} className="chip text-xs">
                {t}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {articles.length > 0 ? (
        <>
          <h2 className="mb-3 font-serif text-lg font-medium text-[var(--text)]">
            Latest from {name}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {articles.slice(0, 12).map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </>
      ) : (
        <Card className="text-sm text-[var(--muted)]">
          {syndicated
            ? "This outlet's feed isn't reachable right now."
            : `We don't syndicate ${name}'s feed, so there's no live coverage here — the spectrum rating above still applies wherever you see them cited.`}
        </Card>
      )}

      <Card className="mt-8 bg-gradient-to-br from-[var(--accent)]/10 to-transparent text-center">
        <h2 className="font-serif text-xl font-medium text-[var(--text)]">
          Don&apos;t read one outlet.
        </h2>
        <p className="mx-auto mb-4 mt-1 max-w-md text-sm text-[var(--muted)]">
          NewsScope shows you how every side covers the same story — and mirrors
          your own reading bias back to you.
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/bias" className="chip">
            Compare coverage
          </Link>
          <Link href="/about" className="btn-primary">
            Try NewsScope
          </Link>
        </div>
      </Card>
    </div>
  );
}
