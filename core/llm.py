"""
LLM wrapper around Groq's free API.

Set GROQ_API_KEY to use real agents (free key at https://console.groq.com).
Run with DEMO=1 (or no key set) to see a scripted walkthrough with no API calls.
"""

import os
import sys
import textwrap

from openai import OpenAI

DEFAULT_MODEL = "llama-3.3-70b-versatile"

_client = None

# ---------------------------------------------------------------------------
# Demo mode — scripted canned replies so you can see the whole dashboard
# without any API key.  Each key is a substring matched against the user
# message; first match wins.
# ---------------------------------------------------------------------------
_DEMO_REPLIES = {
    "Propose exactly ONE": textwrap.dedent("""\
        TITLE: Niche AI Prompt Pack — Etsy Digital Download
        COST: free
        PITCH: Sell a curated pack of 100 high-quality AI prompts (ChatGPT/Midjourney) \
targeted at Etsy sellers who want product photography and listing copy. \
Digital downloads have zero fulfilment cost, and Etsy already has buyers \
searching for AI tools. First step: create a free Etsy seller account and \
list one $9 prompt pack this week."""),

    "market demand competitors": textwrap.dedent("""\
        1. DEMAND: Strong — searches for "AI prompts Etsy" are up 3x YoY; \
several sellers showing 500+ sales on similar packs.
        2. COMPETITION: Moderate. Top sellers have hundreds of reviews but most \
listings are low-effort. Quality gap is real.
        3. $0-budget angle: Write the prompts yourself (or with free Groq), \
list on Etsy free plan, promote in r/Etsy and AI Facebook groups.
        4. Verdict: PURSUE — proven demand, zero upfront cost, can ship this week."""),

    "step-by-step launch plan": textwrap.dedent("""\
        STEP 1 (TODAY): Create a free Etsy seller account at etsy.com/sell.
        STEP 2: Write 100 prompts covering product photography, listing titles, \
and social captions for Etsy sellers. Use Groq for speed.
        STEP 3: Bundle them into a single PDF (free: Canva or Google Docs).
        STEP 4: List on Etsy for $9. Use keywords: "AI prompts", "Etsy seller tools", \
"ChatGPT prompts for Etsy".
        STEP 5: Post in r/EtsySellers and 3 Facebook Etsy groups with a genuine tip, \
linking your shop.
        STEP 6: Collect first reviews by offering a second free pack to early buyers \
who leave honest feedback.
        STEP 7: Once 10 sales are in, raise price to $14 and add a second pack."""),

    "Produce:": textwrap.dedent("""\
        1. HOOK: "Stop guessing what to write — let AI do it for your Etsy shop."

        2. POST:
        Spent 3 hours writing Etsy listings this week? Same.
        I put together 100 AI prompts that handle product descriptions, titles, \
and social posts for Etsy sellers — tested on real shops.
        Grab the pack for $9 → [your Etsy link]
        (Early buyers get a bonus 20-prompt pack free 👀)

        3. FREE DISTRIBUTION:
        - Post in r/EtsySellers (no spam, lead with value)
        - Pin in 3 Etsy seller Facebook groups
        - Add a free "taster" of 5 prompts to a Pinterest pin linking your shop"""),

    "financial state": textwrap.dedent("""\
        You're at Day 1 with $0 MRR — that's fine, every business starts here. \
The Etsy prompt pack initiative is approved and ready to launch, which means \
your first revenue is one listing away.
        Next action: open etsy.com/sell right now and get your shop name registered \
before you do anything else today."""),
}

_DEMO_FALLBACK = "(Demo mode) Agent is processing... response would appear here with a real Groq key."


def _is_demo():
    return os.environ.get("DEMO", "").strip() == "1" or not os.environ.get("GROQ_API_KEY", "").strip()


def _demo_reply(user_message):
    for key, reply in _DEMO_REPLIES.items():
        if key.lower() in user_message.lower():
            return reply
    return _DEMO_FALLBACK


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            print(
                "\n[!] No GROQ_API_KEY found.\n"
                "    Get a FREE key at https://console.groq.com (no credit card),\n"
                "    then set it:\n"
                "      Mac/Linux:  export GROQ_API_KEY=your_key_here\n"
                "      Windows:    set GROQ_API_KEY=your_key_here\n"
            )
            sys.exit(1)
        _client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


def ask(system_prompt, user_message, model=DEFAULT_MODEL, temperature=0.7):
    """Send one message to the model and return its text reply."""
    if _is_demo():
        return _demo_reply(user_message)
    client = _get_client()
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    return response.choices[0].message.content.strip()
