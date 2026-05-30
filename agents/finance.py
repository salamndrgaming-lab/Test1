"""
Finance Agent — tracks MRR and progress toward $10k/month.
"""

from core import llm, state

SYSTEM = """You are the Finance Agent. You give the CEO a brief, honest read on
revenue progress toward the $10,000/month goal and one actionable suggestion.
Keep it to a few sentences. Never invent numbers — use only what you're given."""


def report():
    """Return a finance snapshot plus a short LLM commentary."""
    data = state.load()
    mrr = data["mrr"]
    goal = data["goal_mrr"]
    pct = round((mrr / goal) * 100, 1) if goal else 0
    snapshot = (
        f"MRR: ${mrr} / ${goal} ({pct}% of goal)\n"
        f"Expenses: ${data['expenses']}\n"
        f"Revenue events: {len(data['revenue_events'])}\n"
        f"Approved initiatives: {len(data['approved_initiatives'])}"
    )
    commentary = llm.ask(
        SYSTEM,
        f"Here is the current financial state:\n{snapshot}\n"
        "Give a 2-3 sentence read and one next action.",
    )
    state.log("Finance Agent", "Generated finance report")
    return snapshot + "\n\n" + commentary
