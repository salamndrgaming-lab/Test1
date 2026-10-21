"use client";

import { useState, useRef, useEffect } from "react";
import type { SgpRecommendation } from "@/types";
import { answerSgpQuestion, SGP_CHAT_SUGGESTIONS, type ChatAnswer } from "@/lib/sgpChat";
import { classNames } from "@/lib/format";

interface Turn {
  question: string;
  answer: ChatAnswer;
}

/**
 * Ask the model about the slate.
 *
 * Answers are composed from the recommendation currently on screen, so every
 * number here appears somewhere else on the page too. That is the design: an
 * assistant that could invent a probability would undo the one thing this
 * tool is actually for.
 *
 * Replies come in two registers, visually separated. The measured part is
 * price, significance and distribution. The read is situational
 * interpretation — a line that moved, injuries we cannot weight, thin
 * information — which is real observation but unproven as edge, and so is
 * boxed off and labelled rather than mixed into the recommendation.
 */
export function SgpChat({ rec }: { rec: SgpRecommendation }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length > 0) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    setTurns((t) => [...t, { question, answer: answerSgpQuestion(question, rec) }]);
    setInput("");
  };

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-medium text-[var(--text)]">
          Ask the model
        </h3>
        <span className="text-[0.7rem] text-[var(--muted-2)]">
          {rec.marketSurvey.books.length} books · {rec.candidates.length} legs
        </span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
        Answers are read out of this slate&apos;s actual numbers, so nothing
        here is invented — and when there is no play, it says so instead of
        ranking the least bad one.
      </p>

      {turns.length > 0 && (
        <div className="mb-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-sky-400/15 px-3 py-1.5 text-[0.78rem] text-sky-100">
                {t.question}
              </p>
              <div className="max-w-[92%] space-y-1.5 rounded-2xl rounded-bl-sm bg-[var(--surface-2)] px-3 py-2">
                {t.answer.text.map((p, j) => (
                  <p key={j} className="text-[0.78rem] leading-relaxed text-[var(--text)]">
                    {p}
                  </p>
                ))}

                {t.answer.legs && t.answer.legs.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {t.answer.legs.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-baseline justify-between gap-2 rounded-lg bg-[var(--surface)] px-2 py-1 text-[0.7rem]"
                      >
                        <span className="truncate">
                          {l.selection}
                          <span className="ml-1 text-[var(--muted-2)]">
                            {l.matchup}
                          </span>
                        </span>
                        <span
                          className={classNames(
                            "shrink-0 tabular-nums",
                            l.edge > 0 ? "text-good" : "text-[var(--muted-2)]",
                          )}
                        >
                          {l.edge > 0 ? "+" : ""}
                          {(l.edge * 100).toFixed(1)}pp ·{" "}
                          {(l.edgeSignificance ?? 0).toFixed(1)}σ
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {t.answer.read && t.answer.read.length > 0 && (
                  <div className="mt-1.5 rounded-lg border-l-4 border-l-amber-400/70 bg-amber-500/5 px-2.5 py-1.5">
                    <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-300">
                      Read — judgement, not measured edge
                    </p>
                    {t.answer.read.map((r, j) => (
                      <p
                        key={j}
                        className="mb-1 text-[0.72rem] leading-relaxed text-amber-100/90 last:mb-0"
                      >
                        {r}
                      </p>
                    ))}
                    <p className="mt-1 text-[0.62rem] leading-relaxed text-amber-200/60">
                      None of this is counted in the expected value. Every
                      situational factor we could quantify — weather, rest,
                      injuries, quarterback changes — turned out to be priced
                      by the market across 53,600 tested games, so read these
                      as reasons to think twice, not reasons to expect profit.
                    </p>
                  </div>
                )}

                {t.answer.followUps && t.answer.followUps.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {t.answer.followUps.map((f) => (
                      <button
                        key={f}
                        onClick={() => ask(f)}
                        className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.65rem] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {turns.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SGP_CHAT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[0.7rem] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a pick, a team, or the odds…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
