"use client";

import { useState, useRef, useEffect } from "react";
import type { SgpRecommendation } from "@/types";
import {
  answerSgpQuestion,
  buildChatContext,
  SGP_CHAT_SUGGESTIONS,
  type ChatAnswer,
} from "@/lib/sgpChat";
import { classNames } from "@/lib/format";

interface Turn {
  question: string;
  answer: ChatAnswer;
  /** Where the words came from, so the user is never misled about it. */
  source: "llm" | "local" | "pending";
  /** Why we fell back, when we did. */
  note?: string;
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
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length > 0) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  /*
   * Ask the language model, and fall back to the deterministic engine if it
   * is unavailable. The fallback is not a degraded mode to hide — it is the
   * same grounded answers, and the UI says which one replied so a canned
   * response is never mistaken for a considered one.
   */
  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const local = answerSgpQuestion(question, rec);
    const idx = turns.length;
    setTurns((t) => [...t, { question, answer: local, source: "pending" }]);

    try {
      const history = turns.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer.text.join("\n\n") },
      ]);
      const res = await fetch("/api/sgp/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          history,
          context: buildChatContext(rec),
        }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setTurns((t) =>
          t.map((turn, i) =>
            i === idx
              ? {
                  ...turn,
                  source: "llm",
                  answer: {
                    // Keep the grounded extras: the model writes the prose,
                    // the engine supplies the cards and the follow-ups.
                    text: String(json.text).split(/\n{2,}/).filter(Boolean),
                    legs: local.legs,
                    read: undefined,
                    followUps: local.followUps,
                  },
                }
              : turn,
          ),
        );
      } else {
        const note =
          json?.error === "no-key"
            ? "No GROQ_API_KEY set, so this is the built-in answer."
            : json?.error === "model-unavailable"
              ? json.detail
              : json?.error === "timeout"
                ? "The model timed out; this is the built-in answer."
                : "The model was unavailable; this is the built-in answer.";
        setTurns((t) =>
          t.map((turn, i) =>
            i === idx ? { ...turn, source: "local", note } : turn,
          ),
        );
      }
    } catch {
      setTurns((t) =>
        t.map((turn, i) =>
          i === idx
            ? { ...turn, source: "local", note: "Could not reach the model; this is the built-in answer." }
            : turn,
        ),
      );
    } finally {
      setBusy(false);
    }
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
                {t.source === "pending" ? (
                  <p className="text-[0.78rem] italic text-[var(--muted-2)]">
                    Thinking…
                  </p>
                ) : null}
                {t.source !== "pending" && t.answer.text.map((p, j) => (
                  <p key={j} className="text-[0.78rem] leading-relaxed text-[var(--text)]">
                    {p}
                  </p>
                ))}

                {t.source === "local" && t.note && (
                  <p className="text-[0.62rem] italic text-[var(--muted-2)]">
                    {t.note}
                  </p>
                )}

                {t.source !== "pending" && t.answer.legs && t.answer.legs.length > 0 && (
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

                {t.source !== "pending" && t.answer.read && t.answer.read.length > 0 && (
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

                {t.source !== "pending" && t.answer.followUps && t.answer.followUps.length > 0 && (
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
          disabled={busy}
          placeholder={busy ? "Thinking…" : "Ask about a pick, a team, or the odds…"}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
