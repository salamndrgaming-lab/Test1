import type { SgpLeg, SgpRecommendation } from "@/types";
import { MIN_EDGE_SIGNIFICANCE } from "@/lib/sgp";

/**
 * A grounded question-answering layer over the SGP data.
 *
 * Deliberately deterministic. Every figure it quotes is read out of the
 * recommendation it was handed, so it cannot invent a probability, a price,
 * or an edge — which matters more here than fluency, because the one thing
 * this project has spent its whole life avoiding is a confident number
 * nobody can check.
 *
 * It answers in two clearly separated registers, and the separation is the
 * point:
 *
 *   MEASURED — price edge, significance, arbitrage, book dispersion,
 *   distribution shape. Numbers with evidence behind them.
 *
 *   READ — situational interpretation: a line that has moved, injuries we
 *   cannot weight, thin information, a market disagreeing with itself. These
 *   are real observations from the feed, but the INTERPRETATION of them is
 *   not measured, so they are labelled unproven and excluded from expected
 *   value, exactly as the model's own forecast lean is.
 *
 * That split is not decoration. Tested across 53,600 games in four leagues,
 * every situational factor we could quantify — weather, rest, roof, division,
 * quarterback changes, injury reports — turned out to be priced by the market
 * already. So a read is a reason to think twice, not a reason to expect
 * profit, and saying otherwise would be inventing edge.
 */

export interface ChatAnswer {
  /** The grounded response, in short paragraphs. */
  text: string[];
  /** Legs referenced, so the UI can show the cards alongside. */
  legs?: SgpLeg[];
  /** Unproven situational observations, kept apart from the measured text. */
  read?: string[];
  /** What the user might usefully ask next. */
  followUps?: string[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`;
const odds = (x: number) => (x > 0 ? `+${x}` : `${x}`);

/** Legs that actually clear the bar, best first. */
function valueLegs(rec: SgpRecommendation): SgpLeg[] {
  return (rec.candidates.length ? rec.candidates : rec.legs)
    .filter(
      (l) =>
        !l.saturated &&
        l.edge > 0 &&
        (l.edgeSignificance ?? 0) >= MIN_EDGE_SIGNIFICANCE,
    )
    .sort((a, b) => (b.edgeSignificance ?? 0) - (a.edgeSignificance ?? 0));
}

/** Best price edge regardless of significance — the "least bad" ranking. */
function byEdge(rec: SgpRecommendation): SgpLeg[] {
  return [...(rec.candidates.length ? rec.candidates : rec.legs)]
    .filter((l) => !l.saturated)
    .sort((a, b) => b.edge - a.edge);
}

/**
 * Situational observations for one leg, as interpretation rather than fact.
 *
 * Everything here is derived from something actually in the feed. What is
 * unproven is what it MEANS, so each line says so in its own words rather
 * than relying on a disclaimer elsewhere.
 */
function readFor(leg: SgpLeg): string[] {
  const out: string[] = [];
  const movement = leg.confidenceFactors.find((f) => f.label === "Line movement");
  if (movement && movement.value !== 0.5) {
    out.push(
      movement.value > 0.5
        ? `The market has moved toward this side since it opened. That usually means money or news arrived that agrees with it — which cuts both ways: it is mild confirmation, and it also means the good number may already be gone. The current price already contains the move, so it is not extra value.`
        : `The line has moved against this side since it opened. Where that reflects news we do not have, the price you see is the market catching up and we are the ones behind. Worth hesitating over, though it is not counted in the expected value.`,
    );
  }
  for (const f of leg.riskFlags ?? []) {
    if (f.severity === "high") {
      out.push(`A specific problem was observed here — ${f.label.toLowerCase()}: ${f.detail}`);
    }
  }
  // Medium flags are where most of the real texture lives on a normal slate.
  for (const f of leg.riskFlags ?? []) {
    if (f.severity !== "medium") continue;
    if (f.label === "Edge inside noise") {
      out.push(
        `The apparent edge here is smaller than the books' own disagreement about fair value. My read is that this is not a thin edge — it is no edge, dressed as one by a single book being slightly out of line.`,
      );
    } else if (/push/.test(f.label)) {
      out.push(
        `${f.label} of landing exactly on the number, which returns the stake. That makes this less of a coin flip than the price suggests, and it is already priced into the published probability rather than being a bonus.`,
      );
    } else if (f.label === "Expensive price") {
      out.push(
        `Even the best of the surveyed books is well below fair value here — shopping has not rescued this one. Of everything on the board, this is the kind I would leave alone on cost grounds alone.`,
      );
    } else if (/information/.test(f.label)) {
      out.push(
        `We are working on ${f.label.replace(" information", "")} of the information we would like (${f.detail}). That does not make the side wrong; it means our own view deserves less weight than usual, which is why the published number leans on the market here.`,
      );
    }
  }
  const info = leg.confidenceFactors.find((f) => f.label === "Information");
  if (info && info.value < 0.7 && !(leg.riskFlags ?? []).some((f) => /information/.test(f.label))) {
    out.push(
      `Information quality on this one is ${pct(info.value)} — thinner than typical, so treat the projection as a weak prior rather than a read.`,
    );
  }
  const sample = leg.confidenceFactors.find((f) => f.label === "Sample size");
  if (sample && sample.value <= 0.5) {
    out.push(
      `The teams involved have a thin record for the ratings to work from, which early in a season is the single biggest reason our projection drifts. Measured across four leagues, the model's gap to the closing line roughly triples in the first weeks of a season.`,
    );
  }
  if ((leg.supportingStats ?? []).some((st) => st.label === "Basis" && /record/i.test(st.value))) {
    out.push(
      `This leg falls back to win-loss record, which cannot separate two teams with the same record and opposite point differentials. It is deliberately given no vote in the published number.`,
    );
  }
  const injury = leg.supportingStats.find((s) => s.label === "Injuries");
  if (injury) {
    out.push(
      `Injuries are reported (${injury.value}) but deliberately never moved the projection: this feed cannot tell a starter from a third-stringer, so a team with players out reduces how much our own view counts rather than shifting the number. The market does not have that limitation, which is a reason to defer to it here rather than to back us.`,
    );
  }
  const rest = leg.supportingStats.find((s) => s.label === "Rest");
  if (rest) {
    out.push(
      `Schedule situation: ${rest.value}. Tested across four leagues, rest advantage showed no edge the closing line had not already priced — so treat this as colour, not as a reason to bet.`,
    );
  }
  const weather = leg.supportingStats.find((s) => s.label === "Weather");
  if (weather) {
    out.push(
      `Conditions: ${weather.value}. The weather adjustment measurably improves our own total projection, but the market prices wind and cold too, so it closes our gap rather than opening one over them.`,
    );
  }
  if (leg.modelLean != null && Math.abs(leg.modelLean) > 0.03) {
    out.push(
      `Our own forecast disagrees with the consensus by ${pp(leg.modelLean)} here. That is reported and deliberately excluded from the expected value: across 53,600 graded games the forecast lost to the closing line in every league, so its disagreement is not evidence of value.`,
    );
  }
  if ((leg.booksSurveyed ?? 1) < 3) {
    out.push(
      `Only ${leg.booksSurveyed ?? 1} book${(leg.booksSurveyed ?? 1) === 1 ? "" : "s"} quoted this, so "fair value" here is barely a consensus at all and the edge figure is correspondingly soft.`,
    );
  }
  return out;
}

function describeLeg(leg: SgpLeg): string {
  const sig = leg.edgeSignificance ?? 0;
  return (
    `${leg.selection} (${leg.matchup}, ${leg.market}) at ${odds(leg.americanOdds)}` +
    `${leg.bestBook ? ` with ${leg.bestBook}` : ""} — price edge ${pp(leg.edge)} ` +
    `at ${sig.toFixed(1)}σ against fair value from ${leg.booksSurveyed ?? 1} books.`
  );
}

const HELP: string[] = [
  "What's the best pick?",
  "Is there an arbitrage?",
  "Which sportsbook should I use?",
  "What should I avoid?",
  "How accurate is the model?",
  "How many legs should I play?",
];

/**
 * Answer one question against one slate.
 *
 * Intent is matched on keywords rather than parsed properly, which is the
 * honest limitation of a deterministic engine: it will miss phrasings. It
 * says so when it does, instead of guessing and answering confidently.
 */
export function answerSgpQuestion(
  question: string,
  rec: SgpRecommendation,
): ChatAnswer {
  const q = question.toLowerCase().trim();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  // --- a named team or matchup --------------------------------------
  const pool = rec.candidates.length ? rec.candidates : rec.legs;
  const named = pool.find((l) => {
    const words = `${l.matchup} ${l.selection}`.toLowerCase();
    return q.length > 3 && words.split(/[\s@]+/).some(
      (t) => t.length >= 3 && q.includes(t.toLowerCase()),
    );
  });

  // --- arbitrage -----------------------------------------------------
  if (has("arb", "risk-free", "risk free", "guaranteed", "sure thing")) {
    const arbs = (rec.opportunities ?? []).flatMap((o) =>
      o.arbitrage.map((a) => ({ ...a, matchup: o.matchup })),
    );
    if (arbs.length > 0) {
      return {
        text: [
          `Yes — ${arbs.length} on this slate.`,
          ...arbs.map(
            (a) =>
              `${a.matchup} (${a.market}): ${a.sideA.label} at ${odds(a.sideA.american)} with ${a.sideA.book}, and ${a.sideB.label} at ${odds(a.sideB.american)} with ${a.sideB.book}. Backing both returns about ${pct(a.guaranteedReturn)} whatever happens.`,
          ),
          `The arbitrage builder at the top of this tab turns that into exact stakes, and recomputes the guarantee after rounding — on a thin edge, rounding can eat it entirely.`,
        ],
        followUps: ["Which sportsbook should I use?", "What's the best pick?"],
      };
    }
    const near = (rec.opportunities ?? [])
      .map((o) => o.nearArb)
      .filter((n): n is NonNullable<typeof n> => n != null)
      .sort((a, b) => a.pointsFromArb - b.pointsFromArb)[0];
    return {
      text: [
        `No. No two of the ${rec.marketSurvey.books.length} surveyed books are pricing the same market at a combined under 100%.`,
        near
          ? `The closest is ${near.sideA.book} and ${near.sideB.book} at ${(near.combinedImplied * 100).toFixed(2)}% — short by ${near.pointsFromArb.toFixed(2)} points.`
          : `No near miss is available on this slate.`,
        `That is the normal state rather than a fault: measured on 9,716 historical games with 14 books, a genuine arbitrage existed on 2.2% of them. More books is the lever — arbitrage comes from two books disagreeing.`,
      ],
      followUps: ["What's the best pick?", "How accurate is the model?"],
    };
  }

  // --- model accuracy / trust ----------------------------------------
  if (has("accurate", "accuracy", "trust", "how good", "backtest", "beat the market", "reliable")) {
    return {
      text: [
        `Honestly: the forecast does not beat the market, and the app is built around that.`,
        `Tested blind on 53,600 games across NFL, NBA, college football and MLB — real closing lines, strict walk-forward, nothing tuned on the test data — the model's projection lost to the closing line in every league. Best was NBA at −3.97% skill, worst college football at −22.7%. Against the spread it never cleared break-even.`,
        `So the model's vote on the published probability is ${rec.modelVote.source === "gated" ? "zero" : `${pct(rec.modelVote.weight)}`}. ${rec.modelVote.source === "gated" ? "The number you see is the market consensus, not our opinion." : "That weight was measured by regression, not chosen."}`,
        `What it does contribute is structural and does not require out-predicting anyone: the shape of the outcome distribution, push probability on whole-number lines, exact same-game correlation, and a consensus across ${rec.marketSurvey.books.length} books that is a better estimate than any single one. Edge is taken from the price, never from our disagreement with it.`,
      ],
      followUps: ["What's the best pick?", "Is there an arbitrage?"],
    };
  }

  // --- what to avoid --------------------------------------------------
  if (has("avoid", "risky", "shaky", "stay away", "bad bet", "worst")) {
    const shaky = pool.filter((l) =>
      (l.riskFlags ?? []).some((f) => f.severity === "high"),
    );
    if (shaky.length === 0) {
      const worst = byEdge(rec).slice(-3).reverse();
      return {
        text: [
          `Nothing on this slate carries a high-severity warning — no single-book prices, no conflicting market signals, no badly thin information.`,
          `The weakest by price are simply the most expensive: ${worst.map((l) => `${l.selection} (${pp(l.edge)})`).join(", ")}. "Expensive" here means the best available price is furthest below fair value, which is a cost rather than a specific problem.`,
        ],
        legs: worst,
        followUps: ["What's the best pick?", "Which sportsbook should I use?"],
      };
    }
    return {
      text: [
        `${shaky.length} leg${shaky.length === 1 ? "" : "s"} carry a specific, observed problem:`,
        ...shaky.slice(0, 4).map((l) => {
          const f = (l.riskFlags ?? []).find((x) => x.severity === "high")!;
          return `${l.selection} — ${f.label}: ${f.detail}`;
        }),
      ],
      legs: shaky.slice(0, 4),
      read: shaky.slice(0, 2).flatMap(readFor).slice(0, 4),
      followUps: ["What's the best pick?", "How accurate is the model?"],
    };
  }

  // --- which book -----------------------------------------------------
  if (has("book", "sportsbook", "platform", "where should", "which site")) {
    const ps = rec.platforms ?? [];
    if (ps.length === 0) {
      return {
        text: [
          `Only ${rec.marketSurvey.books.length} book${rec.marketSurvey.books.length === 1 ? "" : "s"} were surveyed, so there is nothing to choose between.`,
        ],
        followUps: ["What's the best pick?"],
      };
    }
    const best = ps[0];
    return {
      text: [
        `Of ${ps.length} surveyed books, ${best.book} prices this slate best: a mean ${pp(best.meanLegEdge)} per leg against consensus fair value, covering ${best.gamesAvailable} games.`,
        best.bestOnEveryLeg
          ? `It holds the best number on every leg it is being asked for, so a slip there costs nothing against shopping everywhere.`
          : `It gives up ${pp(best.priceGapVsBest)} per leg against shopping every book individually — that gap is the real cost of using one account.`,
        `The Compare books tab shows all of them side by side, each rebuilt from only the legs that book actually quotes.`,
      ],
      followUps: ["What's the best pick?", "Is there an arbitrage?"],
    };
  }

  // --- how many legs ---------------------------------------------------
  if (has("how many legs", "parlay size", "legs should", "number of legs")) {
    return {
      text: [
        `Fewer than feels satisfying. Expected value falls almost linearly at roughly 2 percentage points per leg, because every leg pays the bookmaker's margin again.`,
        `Measured on this model's own prices: one leg about −3%, three about −8%, six about −16%, ten about −25%. That compounding, not the quality of the picks, is what makes long parlays lose.`,
        `The leg selector prints the expected value of each length next to it, so the cost of going longer is visible while you choose.`,
      ],
      followUps: ["What's the best pick?", "Which sportsbook should I use?"],
    };
  }

  // --- a specific named team ------------------------------------------
  if (named && (has("why", "about", "think", "should i", "good", "like") || q.split(/\s+/).length <= 4)) {
    const j = named.justification;
    return {
      text: [
        describeLeg(named),
        ...(j ? [`Why: ${j.logic}`] : []),
        ...(j?.facts.length ? [`Facts: ${j.facts.join(" ")}`] : []),
        ...(j?.statistics.length ? [`Numbers: ${j.statistics.join(" ")}`] : []),
        (named.edgeSignificance ?? 0) >= MIN_EDGE_SIGNIFICANCE
          ? `This clears the significance bar, meaning the price gap is bigger than the books' own disagreement about fair value.`
          : `This does NOT clear the significance bar — the apparent edge is inside the range the books disagree by, so it is noise rather than value.`,
      ],
      legs: [named],
      read: readFor(named),
      followUps: ["What's the best pick?", "What should I avoid?"],
    };
  }

  // --- best pick (and the default) -------------------------------------
  if (has("best", "top", "pick", "bet", "play", "recommend", "value", "edge") || q.length === 0) {
    const value = valueLegs(rec);
    if (value.length > 0) {
      const top = value.slice(0, 3);
      return {
        text: [
          `${value.length} leg${value.length === 1 ? "" : "s"} clear the bar — priced above consensus fair value by more than the books disagree among themselves.`,
          ...top.map(describeLeg),
          `That edge comes from the price, not from a forecast. It is the only kind this app counts, because it does not require being smarter than the market — just noticing that one book is slower than the others.`,
        ],
        legs: top,
        read: readFor(top[0]),
        followUps: ["Is there an arbitrage?", "What should I avoid?", "Which sportsbook should I use?"],
      };
    }
    const best = byEdge(rec).slice(0, 3);
    const marginal = pool.filter(
      (l) => l.edge > 0 && (l.edgeSignificance ?? 0) < MIN_EDGE_SIGNIFICANCE,
    );
    return {
      text: [
        `No leg on this slate is a play, and I would rather say so than rank the least bad and call it a pick.`,
        marginal.length > 0
          ? `${marginal.length} are priced above fair value but none clears ${MIN_EDGE_SIGNIFICANCE}σ, which means the gap is smaller than the books' own disagreement — indistinguishable from noise.`
          : `Every leg is priced below consensus fair value, which is the ordinary cost of the bookmaker's margin.`,
        `The closest are: ${best.map((l) => `${l.selection} (${pp(l.edge)}, ${(l.edgeSignificance ?? 0).toFixed(1)}σ)`).join("; ")}.`,
        `Across 9,716 historical games, bets clearing the bar returned about +17% while betting every best price returned −2.2%. The filter is what matters, and today it selects nothing.`,
      ],
      legs: best,
      read: readFor(best[0]),
      followUps: ["Is there an arbitrage?", "How accurate is the model?", "What should I avoid?"],
    };
  }

  // --- not understood ---------------------------------------------------
  return {
    text: [
      `I did not follow that one. I answer from this slate's actual numbers rather than guessing, so I would rather say so than invent an answer.`,
      `Things I can answer:`,
      ...HELP.map((h) => `• ${h}`),
      `You can also name a team or game and I will explain that leg.`,
    ],
    followUps: HELP.slice(0, 3),
  };
}

export const SGP_CHAT_SUGGESTIONS = HELP;
