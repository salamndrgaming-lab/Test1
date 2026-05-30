"""Strategy Agent — identifies revenue opportunities and pitches to CEO."""
import json
import anthropic
from core import state as st
from core import approval

MODEL = "claude-opus-4-8"

SYSTEM = """You are the Strategy Agent for an AI revenue organization.
Goal: reach $10k/month MRR using only free tools.
You identify high-probability revenue opportunities and create structured proposals
for CEO approval. You think creatively but practically — every idea must have a
clear monetization path using free platforms and tools.

Focus areas: AI-powered services, content creation, freelancing, info products,
B2B automation, SaaS on free tiers, community building, affiliate revenue.

You NEVER execute anything. You ONLY propose. The CEO decides."""

WEB_SEARCH_TOOL = {
    "type": "web_search_20260209",
    "name": "web_search",
}


def generate_opportunities(context: str = "") -> list[dict]:
    """Generate a list of revenue opportunity proposals for CEO review."""
    client = anthropic.Anthropic()
    st.log_agent_action("strategy", "generating_opportunities", context)

    state_data = st.load()
    approved = state_data["approved_initiatives"]
    rejected = state_data["rejected_initiatives"]

    messages = [
        {
            "role": "user",
            "content": (
                f"Current MRR: ${state_data['mrr']:,.2f}\n"
                f"Goal: $10,000/month\n"
                f"Already approved initiatives: {len(approved)}\n"
                f"Already rejected initiatives: {len(rejected)}\n"
                f"Context: {context or 'Initial strategy session'}\n\n"
                "Use web search to find current high-demand opportunities. Then generate "
                "3-5 concrete revenue opportunity proposals. Each must use ONLY free tools "
                "(no paid APIs, no subscriptions until MRR justifies it).\n\n"
                "Return a JSON array. Each item must have:\n"
                "- title: string\n"
                "- summary: string (2-3 sentences)\n"
                "- revenue_model: string\n"
                "- estimated_mrr: number\n"
                "- free_tools_only: true\n"
                "- time_to_revenue: string (e.g. '2-4 weeks')\n"
                "- risks: string\n"
                "- proposed_by: 'strategy_agent'\n"
                "- action_plan: string (3-5 concrete first steps)\n"
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

            proposals = _parse_proposals(text)
            submitted = []
            for proposal in proposals:
                initiative_id = approval.present_for_approval(proposal)
                proposal["id"] = initiative_id
                submitted.append(proposal)
                print(f"  → Proposal submitted for CEO approval: [{initiative_id}] {proposal.get('title')}")

            st.log_agent_action("strategy", "proposals_submitted", str(len(submitted)))
            return submitted

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

    return []


def _parse_proposals(text: str) -> list[dict]:
    """Extract JSON array from agent response."""
    try:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception:
        pass
    return [{"title": "Strategy output (unparsed)", "summary": text[:500], "proposed_by": "strategy_agent",
             "estimated_mrr": 0, "free_tools_only": True, "time_to_revenue": "unknown",
             "risks": "parsing failed", "revenue_model": "unknown", "action_plan": "review raw output"}]


def prioritize_approved(approved_initiatives: list[dict]) -> list[dict]:
    """Return initiatives sorted by expected MRR desc."""
    return sorted(approved_initiatives, key=lambda x: x.get("estimated_mrr", 0), reverse=True)
