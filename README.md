# NewsScope

A mobile-first **news aggregation & visualization** app — your news from local to national, with bias sorting, a Good News tab, a sports odds + SGP research tool, weather, and entertainment.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS**. Uses **free / keyless** data sources and falls back to bundled sample data when a source is unavailable, so it runs anywhere (including offline/sandboxed).

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
| Sports | ESPN unofficial JSON |
| Odds | Bundled odds; optional The Odds API key |
| Entertainment | Entertainment RSS; optional TMDB key |
| Bias | Bundled outlet → lean dataset (`data/bias-outlets.json`) |

Every section reads through a provider in `lib/providers/` wrapped by `withFallback`, which tries the live source (with a timeout) then falls back to seed data in `data/`. The UI shows a **Live** / **Sample data** badge accordingly.

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
