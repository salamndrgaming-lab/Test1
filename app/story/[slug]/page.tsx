import Link from "next/link";
import type { Metadata } from "next";
import { getLive } from "@/lib/providers/withFallback";
import { newsProvider } from "@/lib/providers/news.provider";
import {
  groupByLean,
  blindspotFlags,
  COLUMN_LABEL,
  deslug,
  type LeanColumn,
} from "@/lib/blindspot";
import { ArticleCard } from "@/components/news/ArticleCard";
import { CoverageSpread } from "@/components/charts/CoverageSpread";
import { Card } from "@/components/ui";
import { accentVars } from "@/lib/sections";

export const revalidate = 1800; // ISR — cache the page for SEO

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const topic = titleCase(deslug(slug));
  const title = `How Left, Center & Right cover ${topic}`;
  const description = `See every side: compare how left-, center-, and right-leaning outlets are covering ${topic}, and spot which side is ignoring it.`;
  return {
    title,
    description,
    alternates: { canonical: `/story/${slug}` },
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const COLUMN_ACCENT: Record<LeanColumn, string> = {
  left: "text-blue-400",
  center: "text-neutral-300",
  right: "text-red-400",
};

export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = deslug(slug);
  const result = await getLive(newsProvider, { query: topic });
  const articles = result.data ?? [];
  const groups = groupByLean(articles);
  const flags = blindspotFlags(groups);
  const columns: LeanColumn[] = ["left", "center", "right"];

  return (
    <div style={accentVars("bias")}>
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="accent-rule" />
          <span className="kicker">Blindspot</span>
        </div>
        <h1 className="headline text-[2rem] leading-tight sm:text-[2.6rem]">
          How every side covers {titleCase(topic)}
        </h1>
        <p className="mt-2 max-w-prose text-[var(--muted)]">
          A live comparison of how left-, center-, and right-leaning outlets are
          covering this story — and which side is ignoring it.
        </p>
      </header>

      {articles.length === 0 ? (
        <Card className="text-center text-sm text-[var(--muted)]">
          Coverage for this story isn&apos;t available right now.{" "}
          <Link href="/bias" className="text-[var(--accent)]">
            Explore the Blindspot tool →
          </Link>
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <h2 className="mb-3 font-semibold">Coverage by political lean</h2>
            <CoverageSpread articles={articles} />
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            {columns.map((col) => (
              <div key={col} className="rounded-2xl bg-[var(--surface-2)] p-2">
                <p className="mb-2 px-1 font-semibold">
                  <span className={COLUMN_ACCENT[col]}>{COLUMN_LABEL[col]}</span>{" "}
                  <span className="text-[var(--muted)]">
                    ({groups[col].length})
                  </span>
                </p>
                {flags[col] ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-3 text-center text-xs text-amber-200">
                    ⚠ Blindspot — this side isn&apos;t covering the story.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groups[col].slice(0, 5).map((a) => (
                      <ArticleCard key={a.id} article={a} compact />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Card className="mt-8 bg-gradient-to-br from-[var(--accent)]/10 to-transparent text-center">
        <h2 className="font-serif text-xl font-medium text-[var(--text)]">
          Get the full picture, every day.
        </h2>
        <p className="mx-auto mb-4 mt-1 max-w-md text-sm text-[var(--muted)]">
          NewsScope shows you every side of the news — plus your local headlines,
          markets, weather, and sports in one briefing.
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/about" className="chip">
            Learn more
          </Link>
          <Link href="/upgrade" className="btn-primary">
            Try NewsScope
          </Link>
        </div>
      </Card>
    </div>
  );
}
