# NewsScope

A mobile-first **news aggregation & visualization** app — your news from local to national, with bias sorting, a Good News tab, a sports odds + SGP research tool, weather, and entertainment.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS**. Uses **free / keyless** live data sources only — there is **no sample/seed data**. When a live source is unreachable, the UI shows an "Unavailable / Retry" state rather than fabricated content.

## Features

- **News feed** — sortable by category, **political lean (left → right)**, recency, source, and tone.
- **Local** — headlines from the newsrooms that actually cover where you live: direct RSS from city and statewide outlets matched to your saved location, with a local search as backstop. Every US state plus DC is covered.
- **Good News** — positive-sentiment stories surfaced via a lexicon scorer.
- **Bias & Coverage Lab** — bias spectrum, coverage spread, sentiment timeline, topic clusters, and a story-geography map.
- **Sports** — scores, market odds + implied win-probability chart, and an interactive **SGP research tool** (6+ legs) with cited reasoning, supporting stats, references, and an **estimated-payout calculator**. _Research/education only — not betting advice._
- **Weather** — device-location forecast + city lookup (keyless Open-Meteo).
- **Entertainment** — trending movies/TV/music/gaming.
- **PWA** — installable to your iPhone home screen.

## Data sources (all free)

| Domain | Source |
| --- | --- |
| News | ~34 direct publisher RSS feeds (`lib/feeds.ts`), Google News RSS for search and fallback |
| Local news | 89 city + statewide newsroom RSS feeds (`lib/local-feeds.ts`), matched to the saved location |
| Weather | Open-Meteo (+ geocoding) |
| Sports (scores + odds) | ESPN unofficial JSON (keyless) |
| SGP research slip | Built live from current ESPN games + odds |
| Entertainment | Entertainment RSS |
| Bias | Curated outlet → lean reference dataset (`data/bias-outlets.json`) |

Every section reads through a provider in `lib/providers/` wrapped by `getLive`, which calls the live source with a timeout and returns a `live` or `error` envelope. The UI shows a **Live** / **Unavailable** badge accordingly. The only bundled data file is the bias reference mapping (outlet → political lean), which is applied to real, live articles — not sample content.

**Local news** (`lib/local-feeds.ts`) matches a saved location to newsrooms that cover it, at two levels: `metro` (a city newsroom — Gothamist, LAist, Block Club Chicago, Mission Local, MinnPost…) and `state` (a statewide newsroom, which every US state and DC has). A city match wins, the statewide newsroom is always appended, and feeds are de-duplicated by domain. Publisher feeds are never dropped in favour of Google — a city newsroom's own story is better sourced and more reliably local than a search result — so Google News only tops up the remainder or takes over when nothing matches. The Local page names its newsrooms up front and dims the ones that published nothing readable, so a moved feed is visible rather than silent.

The **SGP research tool** builds a 6+ leg cross-game slip from real, current games and their market odds, and links each leg to the actual ESPN game page. Game-level markets are used because free/keyless sources don't expose player-prop lines.

Model `ratings-v3` (`lib/sgp.ts`) is a disclosed heuristic, not a black box:

- **One distribution per game.** Season points for/against give a projected margin and a projected total; moneyline, spread and over/under are all read off those, so the markets can never contradict each other.
- **De-vigged benchmarks.** Every probability is compared against the market price with the book's hold removed, so the hold is never mistaken for edge.
- **Shrinkage with hard caps.** Our view can move the market line by at most 35% (margin) / 30% (total); games with no scoring data fall back to a log5 record prior capped at 20%, and games with neither are priced purely at the market.
- **Back-to-backs** are read from the previous two days of results and applied inside our projection (~1.8 pts NBA, ~1.5 NCAAB, ~0.2 goals NHL; zero where the concept doesn't apply).
- **Line movement** (ESPN ships opening prices alongside current ones) feeds *confidence only* — the current price already contains it, so moving the probability too would double-count the same information.
- **Exact same-game correlation.** Nested margin legs are intersected on one normal margin instead of multiplied, and a slip whose combined price isn't obtainable says so.
- **Graded.** Every leg shown is logged with the probability claimed, then scored against final scores: Brier, skill vs the de-vigged market, flat-stake ROI and a calibration curve (`lib/predictions.ts`, Model tab).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run typecheck
npm run build
```

All API keys are optional — see `.env.example`.

## Disclaimer

Bias ratings are illustrative outlet-level estimates, not article-level fact-checks. Sports betting content is informational/educational only, not betting or financial advice, and guarantees no outcome. 21+. Gambling problem? Call 1-800-GAMBLER.
