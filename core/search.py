"""
Free web search for the Research agent.

Uses DuckDuckGo via the `ddgs` package. No API key, no cost.
In demo mode (no GROQ_API_KEY set) returns canned results so nothing hits the network.
"""

import os

from ddgs import DDGS

_DEMO_RESULTS = (
    "- AI Prompt Packs on Etsy: 500+ sellers, top listings earn $2k-$8k/mo "
    "(etsy.com/search?q=ai+prompts)\n"
    "- Digital downloads zero fulfilment cost: growing 40% YoY per Etsy trends report\n"
    "- r/EtsySellers 1.2M members actively discussing AI tools (reddit.com/r/EtsySellers)"
)


def _is_demo():
    return not os.environ.get("GROQ_API_KEY", "").strip()


def web_search(query, max_results=5):
    """Return a list of {title, body, href} results, or [] on failure."""
    if _is_demo():
        return [{"title": "Demo result", "body": _DEMO_RESULTS, "href": ""}]
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as exc:
        print(f"[!] Search failed: {exc}")
        return []


def search_summary(query, max_results=5):
    """Web search results flattened into a single text block for the LLM."""
    results = web_search(query, max_results=max_results)
    if not results:
        return "(no search results found)"
    lines = []
    for r in results:
        lines.append(f"- {r.get('title', '')}: {r.get('body', '')} ({r.get('href', '')})")
    return "\n".join(lines)
