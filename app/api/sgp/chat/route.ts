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
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

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

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  // Keep the last few turns only: the context object is large and the slate
  // is what matters, not a long conversation.
  const history = (body.history ?? []).slice(-6);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
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
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      /*
       * A retired model id is the most likely failure and the least
       * self-evident, so it is named rather than folded into a generic
       * error. Groq reports it as 400 with "decommissioned" or "does not
       * exist" in the body.
       */
      const modelGone =
        res.status === 400 &&
        /decommission|does not exist|not found|invalid_model/i.test(text);
      return NextResponse.json(
        {
          error: modelGone ? "model-unavailable" : "upstream",
          status: res.status,
          detail: modelGone
            ? `Groq no longer serves "${model}". Set GROQ_MODEL to a current model id.`
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
