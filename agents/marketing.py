"""Marketing Agent — content creation, outreach, and audience building."""
import anthropic
from core import state as st
from core import approval

MODEL = "claude-opus-4-8"

SYSTEM = """You are the Marketing Agent for an AI revenue organization.
You create high-quality content, outreach messages, landing page copy, social posts,
email sequences, and marketing strategies — all using free platforms.

You only market CEO-approved initiatives. You produce actual content ready to use,
not plans to create content. Be persuasive, specific, and conversion-focused."""

WEB_SEARCH_TOOL = {
    "type": "web_search_20260209",
    "name": "web_search",
}


def create_marketing_package(initiative: dict) -> str:
    """Create a full marketing package for an approved initiative."""
    initiative_id = initiative.get("id")

    if not approval.is_approved(initiative_id):
        return f"BLOCKED: Initiative {initiative_id} not approved by CEO."

    client = anthropic.Anthropic()
    st.log_agent_action("marketing", "start", initiative_id)

    messages = [
        {
            "role": "user",
            "content": (
                f"Create a complete marketing package for this approved initiative:\n\n"
                f"Title: {initiative.get('title')}\n"
                f"Summary: {initiative.get('summary')}\n"
                f"Revenue Model: {initiative.get('revenue_model')}\n"
                f"Target Audience: derive from the initiative\n\n"
                "Use web search to research the target audience and competitors. Then create:\n\n"
                "1. **Value Proposition** (one sentence, crystal clear)\n"
                "2. **Target Audience Profile** (demographics, pain points, where they hang out online)\n"
                "3. **Twitter/X Thread** (10 tweets, hook-driven, educational, CTA at end)\n"
                "4. **Reddit Post** (for the most relevant subreddit — genuine value, not spam)\n"
                "5. **Cold Outreach DM Template** (LinkedIn or Twitter, under 150 words)\n"
                "6. **Email Subject Lines** (5 high-open-rate options)\n"
                "7. **Landing Page Copy** (headline, subheadline, 3 benefits, social proof placeholder, CTA)\n"
                "8. **Content Calendar** (2-week plan, free platforms only: Twitter, Reddit, LinkedIn, YouTube)\n\n"
                "Make everything ready-to-use — no placeholders except [YOUR_NAME] and [LINK]."
            ),
        }
    ]

    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            thinking={"type": "adaptive"},
            tools=[WEB_SEARCH_TOOL],
            system=SYSTEM,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    text += block.text

            st.log_agent_action("marketing", "complete", initiative_id)
            _save_marketing(initiative_id, text)
            return text

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": block.input.get("query", ""),
                    })
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return "Marketing generation encountered unexpected stop."


def _save_marketing(initiative_id: str, content: str) -> None:
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "marketing")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{initiative_id}.txt")
    with open(path, "w") as f:
        f.write(content)
    print(f"  → Marketing package saved: data/marketing/{initiative_id}.txt")


def research_audience(niche: str) -> str:
    """Research a target audience for a given niche."""
    client = anthropic.Anthropic()

    messages = [
        {
            "role": "user",
            "content": (
                f"Research the target audience for this niche: {niche}\n\n"
                "Find: demographics, pain points, where they spend time online, "
                "what content performs well, what they're willing to pay for, "
                "and top 5 communities/subreddits/forums to reach them."
            ),
        }
    ]

    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            thinking={"type": "adaptive"},
            tools=[WEB_SEARCH_TOOL],
            system=SYSTEM,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    text += block.text
            return text

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": block.input.get("query", ""),
                    })
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return "Audience research encountered unexpected stop."
