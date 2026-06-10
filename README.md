# NewsScope

A mobile-first **news aggregation & visualization** app — your news from local to national, with bias sorting, a Good News tab, a sports odds + SGP research tool, weather, and entertainment.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS**. Uses **free / keyless** live data sources only — there is **no sample/seed data**. When a live source is unreachable, the UI shows an "Unavailable / Retry" state rather than fabricated content.

## Features

- **News feed** — sortable by category, **political lean (left → right)**, recency, source, and tone.
- **Good News** — positive-sentiment stories surfaced via a lexicon scorer.
- **Bias & Coverage Lab** — bias spectrum, coverage spread, sentiment timeline, topic clusters, and a story-geography map.
- **Sports** — scores, market odds + implied win-probability chart, and an interactive **SGP research tool** (6+ legs) with cited reasoning, supporting stats, references, and an **estimated-payout calculator**. _Research/education only — not betting advice._
- **Weather** — device-location forecast + city lookup (keyless Open-Meteo).
- **Entertainment** — trending movies/TV/music/gaming.
- **PWA** — installable to your iPhone home screen.

## Data sources (all free)

| Domain | Source |
| --- | --- |
| News | Google News RSS |
| Weather | Open-Meteo (+ geocoding) |
| Sports (scores + odds) | ESPN unofficial JSON (keyless) |
| SGP research slip | Built live from current ESPN games + odds |
| Entertainment | Entertainment RSS |
| Bias | Curated outlet → lean reference dataset (`data/bias-outlets.json`) |

Every section reads through a provider in `lib/providers/` wrapped by `getLive`, which calls the live source with a timeout and returns a `live` or `error` envelope. The UI shows a **Live** / **Unavailable** badge accordingly. The only bundled data file is the bias reference mapping (outlet → political lean), which is applied to real, live articles — not sample content.

The **SGP research tool** builds a 6+ leg cross-game slip from real, current games and their market odds. Each leg's "model probability" is a transparent heuristic that blends the odds-implied probability with the teams' season win% and home advantage (disclosed, not a black box), and links to the actual ESPN game page. Game-level markets (moneyline) are used because free/keyless sources don't expose player-prop lines.

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
