"""
Free web search for the Research agent.

Uses DuckDuckGo via the `ddgs` package. No API key, no cost.
"""

from ddgs import DDGS


def web_search(query, max_results=5):
    """Return a list of {title, body, href} results, or [] on failure."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as exc:  # network hiccups shouldn't crash the org
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
