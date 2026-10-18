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

Model `signal-v9` (`lib/sgp.ts`, `lib/distributions.ts`, `lib/ratings.ts`, `lib/venues.ts`) is a disclosed heuristic, not a black box:

- **Opponent-adjusted ratings.** An offense/defense pair is solved from recent results so strength of schedule is divided out — two teams with identical point differentials against opposite schedules no longer rate the same. Each game is weighted by how recently it was played. Because the margin is `net(home) − net(away) + homeEdge` by construction, it is the same arithmetic the total projection uses, so the two markets can't contradict each other. Games without a results window fall back to unadjusted scoring rates, then a log5 record prior, then the market alone — each with its own lower weight cap.
- **One joint distribution per game.** The primitive is a grid over (home score, away score); every market is a marginal of that single object, so they are consistent by construction rather than by convention. This makes a same-game slip exact instead of approximate: a margin leg and a total leg are scored against outcomes that can actually co-occur, including the parity constraint the independent model violated — a total of 6 with a margin of 1 cannot happen. The score correlation isn't a free parameter either; it is implied by the calibrated margin and total SDs, landing near 0.31 for basketball (the pace effect) and 0.02 for football.
- **Overtime is modelled physically.** Leagues that can't end level have their tie mass moved to a one-score margin, which also raises the total by one — because somebody scores. Every other outcome keeps its exact probability, since a game level after regulation finishes by exactly one. The winner is skill-weighted but heavily shrunk toward a coin flip.
- **Schedule and travel.** Days of rest, three games in four nights, four in six, flight distance and time zones crossed since the last game, and long road trips — all derived from the same results window the ratings use, so it costs no extra requests. Only the asymmetry between the two sides counts (both teams tired cancels), travel is charged to the visitor alone, and the whole adjustment is capped.
- **Park factors for baseball.** Our scoring inputs are season aggregates across every park a team visited, so our projected total is park-neutral while the posted total is park-specific. Coors and Petco differ by nearly 20% in run environment; without this the projection was systematically low in one and high in the other. Not an edge claim — it makes the two numbers comparable before comparing them.
- **Weather, for outdoor games only.** Wind, cold and rain suppress football scoring; heat raises baseball scoring. Domes and retractable roofs are skipped rather than guessed. Baseball wind is deliberately **not** applied — its sign depends on stadium orientation we don't have — so it is recorded as a known unknown instead. One Open-Meteo request covers a whole slate.
- **Each sport gets its own distribution**, not one normal curve. Hockey and baseball margins are a difference of two Poissons (so variance follows the scoring environment instead of a constant, and margin and total are derived from the same pair of projected scores rather than assumed independent); football margins are reweighted toward the key numbers 3 and 7; basketball uses a discretized normal. Leagues that cannot end level have their tie mass redistributed, so P(home) + P(away) is exactly 1.
- **Push mass is priced.** Every distribution is discrete, so a line that can be landed on exactly carries real probability and the published number is conditional on not pushing. This was the largest single numerical fix: an integer NHL total of 6 has a ~16% push chance, which moved its over probability from 41.0% to 48.8%.
- **Injuries are detected, never quantified.** We can't tell a starter from a third-stringer from this feed, so players listed out reduce how much the model's own view counts rather than moving the line — the model defers to the market precisely where it is least informed. The same brake applies to an MLB game with no probable pitchers.
- **MLB probable pitchers** feed the projection directly: the listed starter is blended against his own team's runs-allowed baseline at roughly the share of a game he covers, because the starter is most of the information in a baseball line.
- **Edge comes from the price, not the forecast.** This is the most important design decision in the model. Measuring edge as `our probability − break-even` counts the model's disagreement with the market as profit; on three books quoting identical prices — a market where there is objectively nothing to win — that produced a claimed **+16.6pp edge and +0.32 expected value per dollar**, all of it from the model differing by 19 points. There is no measured evidence that disagreement is skill (zero graded picks; measuring it is exactly what the closing-line log is for), so counting it would be inventing a number. Edge, EV and Kelly are therefore computed from the gap between the **consensus fair value across the surveyed books** and the **break-even at the best price any of them offers**. The model's lean is shown separately and labelled unproven. When the log shows measured skill against the closing line, the projection can be blended back at a weight the data supports — not before.
- **Confidence is measured, not asserted.** Every confidence input used to be a hand-picked weight on a heuristic. The dispersion of independently de-vigged books gives a real standard error on fair value, so confidence now answers a measurable question: how precisely do we know what this bet is worth? Five books agreeing within half a point means we know it; five books scattered over four means we don't, whatever their average is. Precision is never claimed beyond the typical book disagreement reduced by root-n, so two books quoting identical numbers cannot report zero error. A single book caps out at "medium" — with nothing to verify fair value against, "edge against it" is circular.
- **Edge significance screens noise.** Books disagree with each other on every market; an apparent edge smaller than that disagreement is one book's rounding inside the spread of opinion. A leg must clear two standard errors to count as value, and the card says "inside noise" when it doesn't.
- **Confidence and value are kept orthogonal.** Significance is a screening gate, deliberately not a confidence term. The first version included it and markets whose books *scattered* scored higher confidence than markets whose books *agreed*, because wide dispersion feeds the edge faster than it drains precision — which is how a model talks itself into its own worst picks.
- **Multiple bookmakers, surveyed.** ESPN returns an array of books per game and the model previously read only the first. Each book is de-vigged on its own terms, then averaged with more weight on the tighter ones; an outlier sets the *best price* but never the *benchmark*, because a book quoting a two-way market below 100% is arbitraging itself and is the least reliable estimate of truth even when it is the best thing to bet into. Only books quoting the same line are compared, since a −3 and a −6.5 are different bets.
- **The tool can say there is no play.** Three verdicts: `value` when a best price beats consensus fair, `no-edge` when the market looks efficient on the slate, and `single-book` when only one price source was available and expected value is negative by construction. On an efficient market, no edge is the expected result rather than a fault, and the slip says so instead of ranking negative-expectation legs least-bad-first as though they were picks.
- **No vote from win% alone.** A record-only prior was on 20% because it was better than nothing. It isn't: it can't separate two 10-6 teams with opposite point differentials, it yields no totals opinion, it has no measured support of any kind, and it fires precisely when we know least — so it only added motion. The record is still parsed and shown as context.
- **Two market signals, cross-checked.** Only a true point spread is read as the market's projected margin; a hockey puck line or baseball run line is fixed at ±1.5 and priced through its odds, so those games take their margin from the moneyline, inverted through the same Poisson-difference distribution that prices them. The spread and the moneyline are then compared in probability space, and when they disagree by more than 10 points about who wins, the spread — whose sign depends on matching a team abbreviation in a free-text field — is the signal more likely to be wrong, so the moneyline wins and the game is flagged.
- **Near-certainties are not shown as picks.** Above 97% the published figure is a clamp rather than an estimate, the EV and Kelly numbers derived from it are meaningless, and the market prices the same near-certainty — so those legs are excluded from the slip with the reason stated.
- **De-vigged benchmarks, Shin's method.** Every probability is compared against the market price with the book's hold removed. Books load more margin onto longshots, so splitting it proportionally overstates a longshot's fair price and understates a heavy favourite's — which reads as free edge on exactly the short moneylines a parlay is built from. Shin's method corrects that (the gap grows with how lopsided the market is: ~0.7pp at −600 vs ~0.2pp at −130).
- **Variance follows the scoring environment.** Margin spread scales with the posted total rather than being a league constant, since more scoring means more variance. The count-model sports get this automatically, because a Poisson difference takes its variance from the projected scores.
- **Shrinkage with hard caps.** Our view can move the market line by at most 35% (margin) / 30% (total); games with no scoring data fall back to a log5 record prior capped at 20%, and games with neither are priced purely at the market.
- **Back-to-backs** are read from the previous two days of results and applied inside our projection (~1.8 pts NBA, ~1.5 NCAAB, ~0.2 goals NHL; zero where the concept doesn't apply).
- **Line movement** (ESPN ships opening prices alongside current ones) feeds *confidence only* — the current price already contains it, so moving the probability too would double-count the same information.
- **Exact same-game correlation.** Nested margin legs are intersected on one normal margin instead of multiplied, and a slip whose combined price isn't obtainable says so.
- **Graded twice over.** Every leg shown is logged with the probability claimed and the number taken. **Closing line value** is the fast signal — did the market move toward our number? — and converges in tens of picks rather than hundreds, because it asks a continuous question instead of a binary one. Outcome grading follows: Brier, skill vs the de-vigged market, flat-stake ROI and a calibration curve (`lib/predictions.ts`, Model tab).

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
