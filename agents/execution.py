"""Execution Agent — implements CEO-approved initiatives step by step."""
import anthropic
from core import state as st
from core import approval

MODEL = "claude-opus-4-8"

SYSTEM = """You are the Execution Agent for an AI revenue organization.
You only work on CEO-approved initiatives. You break them into concrete tasks,
execute what you can autonomously (research, content creation, outreach drafts,
setup instructions), and provide clear deliverables.

You use ONLY free tools. You never spend money without CEO approval.
You are action-oriented: produce actual outputs (content, scripts, templates,
step-by-step guides), not plans about producing outputs.

When you complete a revenue-generating action, clearly state the expected revenue
and how to track it."""

WEB_SEARCH_TOOL = {
    "type": "web_search_20260209",
    "name": "web_search",
}


def execute_initiative(initiative: dict) -> str:
    """Execute an approved initiative and return deliverables."""
    initiative_id = initiative.get("id")

    if not approval.is_approved(initiative_id):
        return f"BLOCKED: Initiative {initiative_id} has not been approved by the CEO."

    client = anthropic.Anthropic()
    st.log_agent_action("execution", "start", initiative_id)

    messages = [
        {
            "role": "user",
            "content": (
                f"Execute this CEO-approved initiative:\n\n"
                f"Title: {initiative.get('title')}\n"
                f"Summary: {initiative.get('summary')}\n"
                f"Revenue Model: {initiative.get('revenue_model')}\n"
                f"Action Plan: {initiative.get('action_plan')}\n"
                f"Estimated MRR: ${initiative.get('estimated_mrr', 0):,}\n\n"
                "Use web search to gather any information you need. Then:\n"
                "1. Break this into concrete executable tasks\n"
                "2. Execute or produce deliverables for each task you can do autonomously\n"
                "3. For tasks requiring human action, provide exact step-by-step instructions\n"
                "4. Create any needed content, templates, scripts, or copy\n"
                "5. Identify the first revenue-generating action and how to track it\n\n"
                "Be specific and produce real outputs — not plans to produce outputs."
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

            st.log_agent_action("execution", "complete", initiative_id)
            _save_deliverable(initiative_id, text)
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

    return "Execution encountered unexpected stop."


def _save_deliverable(initiative_id: str, content: str) -> None:
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "deliverables")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{initiative_id}.txt")
    with open(path, "w") as f:
        f.write(content)
    print(f"  → Deliverable saved: data/deliverables/{initiative_id}.txt")


def run_all_approved() -> list[str]:
    """Execute all approved initiatives that haven't been run yet."""
    approved = approval.get_approved_initiatives()
    results = []
    for init in approved:
        print(f"\nExecuting: [{init['id']}] {init.get('title')}")
        result = execute_initiative(init)
        results.append(result)
    return results
