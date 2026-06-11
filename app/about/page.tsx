import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { accentVars } from "@/lib/sections";

export const metadata: Metadata = {
  title: "See Every Side of the News",
  description:
    "NewsScope is a bias-aware news briefing: compare how Left, Center, and Right cover the same story, track your own media diet, and get local news, markets, weather, and sports in one place.",
  alternates: { canonical: "/about" },
};

const FEATURES: [string, string, string][] = [
  ["⇄", "Blindspot comparison", "See how Left, Center & Right cover the same story — and who's ignoring it."],
  ["◫", "Your media-diet mirror", "Track your own reading bias over time and get nudged to the other side."],
  ["◎", "Personalized briefing", "A daily digest tuned to your topics, location, teams, and tickers."],
  ["☀", "Good News tab", "A positive-sentiment feed for when the cycle gets heavy."],
  ["▲", "Markets & weather", "Indices, stocks, ETFs, crypto, IPOs, severe-weather alerts & radar."],
  ["★", "Sports & research", "Scores, standings, odds, and a transparent SGP research tool."],
];

const FAQ: [string, string][] = [
  [
    "How do you rate bias?",
    "Outlet-level lean estimates to encourage balanced reading — shown transparently, never as a verdict on any single article.",
  ],
  [
    "Where does the news come from?",
    "We aggregate headlines from publishers' own feeds and link straight to the source — we don't republish full articles.",
  ],
  [
    "Is it free?",
    "Yes — the core app is free. Pro unlocks unlimited Blindspot, your media-diet report, alerts, a personalized briefing, and an ad-free experience.",
  ],
];

export default function AboutPage() {
  return (
    <div style={accentVars("home")}>
      {/* Hero */}
      <section className="py-8 text-center sm:py-14">
        <div className="mb-3 flex justify-center">
          <span className="kicker">News, without the echo chamber</span>
        </div>
        <h1 className="headline mx-auto max-w-3xl text-[2.4rem] leading-[1.05] sm:text-[3.4rem]">
          See every side of the news.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--muted)]">
          NewsScope compares how Left, Center, and Right cover the same story —
          then rounds out your day with local news, markets, weather, and sports
          in one fast, mobile-first briefing.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className="btn-primary">
            Open the app
          </Link>
          <Link href="/upgrade" className="chip">
            See Pro
          </Link>
        </div>
        <div className="mx-auto mt-8 h-2 max-w-md rounded-full bg-gradient-to-r from-lean-left via-lean-center to-lean-right" />
      </section>

      {/* Features */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([icon, title, desc]) => (
          <Card key={title}>
            <div className="mb-1 text-2xl">{icon}</div>
            <h3 className="font-serif text-lg font-medium text-[var(--text)]">
              {title}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{desc}</p>
          </Card>
        ))}
      </section>

      {/* Pricing CTA */}
      <section className="mt-10">
        <Card className="bg-gradient-to-br from-[var(--accent)]/10 to-transparent text-center">
          <h2 className="font-serif text-2xl font-medium text-[var(--text)]">
            Free to start. Pro when you want the edge.
          </h2>
          <p className="mx-auto mb-4 mt-1 max-w-md text-sm text-[var(--muted)]">
            Unlimited Blindspot, your media-diet report, smart alerts, a
            personalized briefing, and no ads.
          </p>
          <Link href="/upgrade" className="btn-primary inline-block">
            See plans
          </Link>
        </Card>
      </section>

      {/* FAQ */}
      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-medium text-[var(--text)]">
          FAQ
        </h2>
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <Card key={q}>
              <h3 className="font-semibold">{q}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{a}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
