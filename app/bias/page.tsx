"use client";

import dynamic from "next/dynamic";
import type { Article } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { Card, PageHeader, SourceBadge, Spinner } from "@/components/ui";
import { BiasSpectrum } from "@/components/charts/BiasSpectrum";
import { CoverageSpread } from "@/components/charts/CoverageSpread";
import { SentimentTimeline } from "@/components/charts/SentimentTimeline";
import { TopicCluster } from "@/components/charts/TopicCluster";

// Leaflet must render client-side only.
const GeoHeatmap = dynamic(
  () => import("@/components/charts/GeoHeatmap").then((m) => m.GeoHeatmap),
  { ssr: false, loading: () => <Spinner label="Loading map…" /> },
);

function VizCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-[var(--muted)]">{desc}</p>
      {children}
    </Card>
  );
}

export default function BiasPage() {
  const { result, data, loading } = useProvider<Article[]>(
    "/api/news?category=top",
  );
  const articles = data ?? [];

  return (
    <div>
      <PageHeader
        title="Bias & Coverage Lab"
        subtitle="See the news cycle's slant, mood, topics, and geography at a glance."
        right={
          result && <SourceBadge source={result.source} note={result.note} />
        }
      />

      {loading ? (
        <Spinner label="Analyzing coverage…" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <VizCard
            title="Bias Spectrum"
            desc="Each dot is a headline placed by its outlet's lean. Color = tone."
          >
            <BiasSpectrum articles={articles} />
          </VizCard>
          <VizCard
            title="Coverage Spread"
            desc="How many outlets at each lean are covering the cycle — spot the gaps."
          >
            <CoverageSpread articles={articles} />
          </VizCard>
          <VizCard
            title="Sentiment Timeline"
            desc="Average tone of headlines over the last news hours."
          >
            <SentimentTimeline articles={articles} />
          </VizCard>
          <VizCard
            title="Topic Clusters"
            desc="The dominant keywords in the cycle, sized by frequency."
          >
            <TopicCluster articles={articles} />
          </VizCard>
          <div className="md:col-span-2">
            <VizCard
              title="Story Geography (local → national)"
              desc="Where the stories are happening. Circle size = story count, color = tone."
            >
              <GeoHeatmap articles={articles} />
            </VizCard>
          </div>
        </div>
      )}
    </div>
  );
}
