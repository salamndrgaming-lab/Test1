"""Research Agent — market research using Claude's built-in web_search tool."""
import anthropic
from core import state as st

MODEL = "claude-opus-4-8"

SYSTEM = """You are the Research Agent for an AI revenue organization targeting $10k/month MRR.
Your job is to research market opportunities, validate ideas, find potential customers,
and gather competitive intelligence — using only free tools (web search).
Be thorough, cite sources, and focus on actionable insights for revenue generation.
Always return structured JSON with your findings."""

WEB_SEARCH_TOOL = {
    "type": "web_search_20260209",
    "name": "web_search",
}


def research_opportunity(topic: str) -> dict:
    """Research a revenue opportunity and return findings."""
    client = anthropic.Anthropic()
    st.log_agent_action("research", "start", topic)

    messages = [
        {
            "role": "user",
            "content": (
                f"Research this revenue opportunity: {topic}\n\n"
                "Use web search to find:\n"
                "1. Market size and demand signals\n"
                "2. How others are monetizing this\n"
                "3. Free tools/platforms that can be used\n"
                "4. Realistic revenue potential (MRR estimate)\n"
                "5. Fastest path to first dollar\n"
                "6. Key risks\n\n"
                "Return a JSON object with keys: topic, market_size, monetization_methods, "
                "free_tools, estimated_mrr_low, estimated_mrr_high, time_to_first_dollar, "
                "risks, recommendation, sources."
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
            st.log_agent_action("research", "complete", topic)
            return {"raw": text, "topic": topic}

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

    return {"raw": "", "topic": topic, "error": "unexpected stop reason"}


def validate_initiative(initiative: dict) -> dict:
    """Research and validate a proposed initiative before CEO review."""
    client = anthropic.Anthropic()
    topic = initiative.get("title", "unknown initiative")
    st.log_agent_action("research", "validate", topic)

    messages = [
        {
            "role": "user",
            "content": (
                f"Validate this business initiative using web search:\n"
                f"Title: {initiative.get('title')}\n"
                f"Summary: {initiative.get('summary')}\n"
                f"Revenue Model: {initiative.get('revenue_model')}\n\n"
                "Search for evidence that this model works, competitors, and realistic MRR ranges. "
                "Return JSON with: validated (bool), evidence, competitor_examples, "
                "realistic_mrr_range, recommended_adjustments."
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
            return {"validation": text, "initiative_id": initiative.get("id")}

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

    return {"validation": "", "error": "unexpected stop reason"}
