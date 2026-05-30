"""
Marketing Agent — creates free content and outreach copy for approved work.
"""

from core import llm, state

SYSTEM = """You are the Marketing Agent. You write punchy, honest marketing copy
and content ideas using only free channels (organic social, Reddit, communities,
SEO blog posts, cold outreach). No paid ads. Match the audience's language."""


def create_content(initiative_title, channel="general"):
    """Generate ready-to-post marketing content for an approved initiative."""
    prompt = f"""Initiative: {initiative_title}
Channel: {channel}

Produce:
1. A one-line hook.
2. A short post (under 120 words) ready to publish on a free channel.
3. Three free distribution ideas (where to post, no ad spend)."""
    content = llm.ask(SYSTEM, prompt)
    state.log("Marketing Agent", f"Created content for: {initiative_title}")
    return content
