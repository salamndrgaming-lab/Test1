"""
Strategy Agent — finds revenue opportunities and pitches them to the CEO.

It NEVER starts anything itself. It only proposes. The CEO approves.
"""

from core import llm, state

SYSTEM = """You are the Strategy Agent for a lean startup whose single goal is
to reach $10,000/month in recurring revenue (MRR) using only FREE tools until
revenue justifies spending.

You report to a human CEO who must approve every initiative before anything
happens. Propose realistic, legal, low-cost business ideas that a tiny team of
AI agents plus one human could actually execute (e.g. digital products, niche
SaaS, content, freelancing productized services, affiliate, automation gigs).

Be concrete and honest about effort and odds. No hype."""


def propose(context=""):
    """Generate ONE concrete initiative and queue it for CEO approval."""
    data = state.load()
    prompt = f"""Current MRR: ${data['mrr']} / goal ${data['goal_mrr']}.
Already approved: {data['approved_initiatives']}
Already rejected: {data['rejected_initiatives']}
Extra context from CEO: {context or '(none)'}

Propose exactly ONE new revenue initiative. Respond in this format:

TITLE: <short name>
COST: <free, or estimated $/mo if any>
PITCH: <3-5 sentences: what it is, who pays, why it can work, first concrete step>
"""
    reply = llm.ask(SYSTEM, prompt)
    title, cost, pitch = _parse(reply)
    initiative_id = state.add_initiative(
        {"agent": "Strategy Agent", "title": title, "cost": cost, "pitch": pitch}
    )
    state.log("Strategy Agent", f"Proposed initiative #{initiative_id}: {title}")
    return initiative_id


def _parse(reply):
    title, cost, pitch = "(untitled)", "free", reply
    for line in reply.splitlines():
        upper = line.upper()
        if upper.startswith("TITLE:"):
            title = line.split(":", 1)[1].strip()
        elif upper.startswith("COST:"):
            cost = line.split(":", 1)[1].strip()
        elif upper.startswith("PITCH:"):
            pitch = line.split(":", 1)[1].strip()
    return title, cost, pitch
