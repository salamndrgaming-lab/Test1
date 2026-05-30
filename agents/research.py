"""
Research Agent — validates ideas with free web search + analysis.
"""

from core import llm, search, state

SYSTEM = """You are the Research Agent. You validate business ideas using real
web search results. Assess demand, competition, and how a tiny AI-agent team
could realistically enter the market with $0 budget. Be skeptical and specific.
Cite what the search results actually show."""


def research(topic):
    """Search the web on a topic and return an analyst's assessment."""
    findings = search.search_summary(f"{topic} market demand competitors 2026")
    prompt = f"""Topic to evaluate: {topic}

Live web search results:
{findings}

Give a short assessment:
1. Is there real demand? (evidence from results)
2. How crowded is it?
3. A realistic $0-budget angle for us.
4. Verdict: PURSUE / MAYBE / SKIP, one line why."""
    analysis = llm.ask(SYSTEM, prompt)
    state.log("Research Agent", f"Researched: {topic}")
    return analysis
