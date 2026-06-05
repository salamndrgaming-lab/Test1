"""
Strategy Agent — finds revenue opportunities and pitches them to the CEO.

It NEVER starts anything itself. It only proposes. The CEO approves.
It ONLY proposes ideas that work within the CEO's existing accounts.
"""

from core import llm, state


def _platform_context(data):
    """Build the platform constraint block for the prompt."""
    cfg = data.get("ceo_platforms", {})
    available = cfg.get("available", [])
    selling = cfg.get("selling", [])
    no_new = cfg.get("no_new_signups", True)

    lines = []
    if available:
        lines.append("PLATFORMS THE CEO ALREADY HAS (use ONLY these):")
        for p in available:
            lines.append(f"  - {p}")
    if selling:
        lines.append("SELLING/PAYMENT PLATFORMS AVAILABLE:")
        for p in selling:
            lines.append(f"  - {p}")
    else:
        lines.append("SELLING PLATFORM: None yet — propose ideas that build toward")
        lines.append("  revenue via GitHub Pages (free site) + PayPal.me link, or")
        lines.append("  organic content that drives inbound leads/clients via DMs.")
    if no_new:
        lines.append("")
        lines.append("HARD RULE: The CEO will NOT create any new accounts. EVER.")
        lines.append("Every step of the idea must be executable with the platforms")
        lines.append("listed above and nothing else. Any idea requiring a new signup")
        lines.append("is automatically disqualified — do not propose it.")
    return "\n".join(lines)


SYSTEM = """You are the Strategy Agent for a lean startup whose single goal is
to reach $10,000/month in recurring revenue using ONLY the platforms the CEO
already has accounts on. No new signups will ever be made.

You report to a human CEO who must approve every initiative before anything
happens. Propose realistic, legal, zero-new-account ideas:
  - Organic content monetisation on existing social accounts
  - GitHub Pages micro-sites with PayPal links
  - Reddit/community-driven lead generation for productized services
  - Google Docs / Drive delivered digital products sold via PayPal.me
  - Affiliate content on existing platforms
  - Freelance/consulting offers posted on existing channels

Be concrete and honest about effort and odds. No hype."""


def propose(context=""):
    """Generate ONE concrete initiative and queue it for CEO approval."""
    data = state.load()

    seen = {i["id"]: i for i in data["initiatives"]}
    approved_titles = [seen[i]["title"] for i in data["approved_initiatives"] if i in seen]
    rejected_titles = [seen[i]["title"] for i in data["rejected_initiatives"] if i in seen]
    pending_titles  = [i["title"] for i in data["initiatives"] if i["status"] == "pending"]

    history = ""
    if approved_titles:
        history += "APPROVED (already running — do not repeat):\n" + "\n".join(f"  - {t}" for t in approved_titles) + "\n"
    if rejected_titles:
        history += "REJECTED (CEO said no — do not propose these or anything similar):\n" + "\n".join(f"  - {t}" for t in rejected_titles) + "\n"
    if pending_titles:
        history += "PENDING (already waiting — do not duplicate):\n" + "\n".join(f"  - {t}" for t in pending_titles) + "\n"

    platform_block = _platform_context(data)

    prompt = f"""{platform_block}

Current MRR: ${data['mrr']} / goal ${data['goal_mrr']}.

{history if history else "No prior initiatives yet."}
Extra context from CEO: {context or '(none)'}

Propose exactly ONE brand-new revenue initiative that:
1. Uses ONLY the listed platforms (no new account required anywhere)
2. Is clearly different from everything in the history above
3. Can be meaningfully started by AI agents today using free tools

Respond in this exact format:
TITLE: <short name>
COST: free
PITCH: <3-5 sentences: what it is, who pays, why it works, first concrete step>
PLATFORMS_USED: <comma-separated list of only the allowed platforms this uses>
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
