import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The SGP assistant's language model, via Groq's OpenAI-compatible API.
 *
 * Groq is used because it has a free tier and is fast enough that a reply
 * feels immediate. The endpoint is OpenAI-shaped, so swapping provider is a
 * base-URL change rather than a rewrite.
 *
 * Model IDs on Groq are retired periodically, so the default is overridable
 * and a model error is reported as exactly that rather than as a generic
 * failure — otherwise a decommissioned name looks like a broken feature.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";

/**
 * Preferred models, best first.
 *
 * Groq retires ids on a schedule — llama-3.3-70b-versatile, which this route
 * originally defaulted to, was shut down for free and developer tiers on
 * 16 August 2026 — so a hardcoded default is a time bomb rather than a
 * setting. These are the current production replacements, and if all of them
 * are gone the route discovers a live one instead of failing. See pickModel.
 */
const PREFERRED_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

/** Not chat models; excluded from discovery. */
const NON_CHAT = /whisper|tts|embed|guard|moderation|vision-only|distil/i;

/**
 * A model id that Groq is actually serving right now.
 *
 * Resolution order: an explicit GROQ_MODEL always wins, because an operator
 * pinning a model should not be second-guessed. Otherwise the preferred list
 * is used, and only if the live catalogue disagrees with all of it do we fall
 * back to whatever Groq reports as active. The result is cached for the
 * lifetime of the lambda so this costs one extra request at most, not one per
 * message.
 */
let discovered: string | null = null;
async function pickModel(key: string, signal: AbortSignal): Promise<string> {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  if (discovered) return discovered;
  try {
    const res = await fetch(GROQ_MODELS_URL, {
      signal,
      headers: { authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { id?: string; active?: boolean; context_window?: number }[];
      };
      const live = (json.data ?? [])
        .filter((m) => m.id && m.active !== false && !NON_CHAT.test(m.id))
        .map((m) => ({ id: m.id as string, ctx: m.context_window ?? 0 }));
      const ids = new Set(live.map((m) => m.id));
      const preferred = PREFERRED_MODELS.find((m) => ids.has(m));
      if (preferred) return (discovered = preferred);
      // Nothing preferred survives: take the largest context window going.
      const biggest = live.sort((a, b) => b.ctx - a.ctx)[0];
      if (biggest) return (discovered = biggest.id);
    }
  } catch {
    // Discovery is a convenience; fall through to the preferred list.
  }
  return PREFERRED_MODELS[0];
}

/**
 * The rules the model answers under.
 *
 * This is the whole safety story. The assistant is handed a context object
 * built from the live slate and is forbidden from going outside it, because
 * the one thing this project cannot afford is a confident number nobody can
 * check. The separation between measured and read is restated here because
 * it is the distinction most likely to collapse under a request for a
 * confident pick.
 */
const SYSTEM = `You are the research assistant for a sports betting analysis tool. You answer questions about ONE slate of games, using ONLY the JSON context provided in the user message.

ABSOLUTE RULES — these are not style preferences:
1. Never state a number that is not in the context. No invented probabilities, prices, records, injuries, or statistics. If you do not have a figure, say you do not have it.
2. Never predict a game outcome. You have no information that beats the market and the context says so explicitly.
3. If no leg clears the significance bar, say plainly that there is no play. Do NOT rank the least-bad options and present them as picks. Refusing is the correct answer and the user is better served by it.
4. Keep MEASURED facts (price edge, sigma, arbitrage, book prices) separate from READ (situational judgement). Never let a read imply expected profit.
5. Situational factors — weather, rest, injuries, quarterback changes, line movement — are already priced by the market. Treat them ONLY as reasons to distrust a bet, never as edge. The context's measuredTruth explains why.
6. No hype. No "lock", "can't lose", "free money", "smash". You are talking about losing propositions most of the time and should sound like it.
7. Gambling is risky. Never imply a guarantee except for genuine arbitrage, and even then note that it requires both bets being placed at the quoted prices.

STYLE: Conversational and direct, like a sharp friend who knows the numbers — not a disclaimer generator and not a hype man. Short paragraphs. Lead with the answer. Use specific figures from the context. It is fine to be funny or blunt. It is not fine to be encouraging about a bad bet.

If asked something the context cannot answer, say so and offer what you can answer instead.`;

interface Body {
  question?: string;
  context?: unknown;
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "no-key", detail: "GROQ_API_KEY is not configured." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "empty-question" }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "question-too-long" }, { status: 400 });
  }

  // Keep the last few turns only: the context object is large and the slate
  // is what matters, not a long conversation.
  const history = (body.history ?? []).slice(-6);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const model = await pickModel(key, controller.signal);
    // Hoisted so a retry on a different model can reuse it verbatim.
    const payload = {
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        ...history,
        {
          role: "user",
          content:
            `Slate context (the ONLY facts you may use):\n` +
            `${JSON.stringify(body.context ?? {})}\n\n` +
            `Question: ${question}`,
        },
      ],
    };
    const ask = (m: string) =>
      fetch(GROQ_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ ...payload, model: m }),
      });

    const res = await ask(model);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      /*
       * A retired model id is the most likely failure and the least
       * self-evident, so it is named rather than folded into a generic
       * error. Groq reports it as 400 with "decommissioned" or "does not
       * exist" in the body.
       */
      const modelGone =
        (res.status === 400 || res.status === 404) &&
        /decommission|does not exist|not found|invalid_model|model_not_found/i.test(text);
      /*
       * A retired id is the expected failure, so it is recovered from rather
       * than merely reported: forget the cached choice, ask Groq what it is
       * serving, and try once more. Only a second failure is surfaced.
       */
      if (modelGone && !process.env.GROQ_MODEL) {
        discovered = null;
        const retryModel = await pickModel(key, controller.signal);
        if (retryModel !== model) {
          const retry = await ask(retryModel);
          if (retry.ok) {
            const rj = (await retry.json()) as {
              choices?: { message?: { content?: string } }[];
            };
            const rt = rj.choices?.[0]?.message?.content?.trim();
            if (rt) return NextResponse.json({ text: rt, model: retryModel });
          }
        }
      }
      return NextResponse.json(
        {
          error: modelGone ? "model-unavailable" : "upstream",
          status: res.status,
          detail: modelGone
            ? `Groq is not serving "${model}" and no live alternative answered. Set GROQ_MODEL to a current id from console.groq.com/docs/models.`
            : text.slice(0, 300),
        },
        { status: 502 },
      );
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: "empty-reply" }, { status: 502 });
    }
    return NextResponse.json({ text, model });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "timeout" : "network" },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
