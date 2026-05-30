"""
Orchestrator — coordinates the agents around the CEO approval gate.

The core loop the CEO drives:
  1. Strategy proposes an initiative.
  2. (Optional) Research validates it.
  3. CEO approves or rejects   <-- the mandatory gate.
  4. Only if approved: Execution plans it, Marketing promotes it.
"""

from agents import execution, marketing, research, strategy
from core import approval, state


def new_initiative_flow(context="", do_research=True):
    """Run the full propose -> approve -> execute pipeline once."""
    print("\n[Strategy Agent] Thinking of an opportunity...")
    initiative_id = strategy.propose(context)
    data = state.load()
    initiative = next(i for i in data["initiatives"] if i["id"] == initiative_id)
    print(f"\nProposed: {initiative['title']}")

    if do_research:
        print("\n[Research Agent] Validating with live web search...")
        print(research.research(initiative["title"]))

    # THE GATE: nothing below runs unless the CEO says yes.
    approved = approval.request_approval(initiative_id)
    if not approved:
        print("Initiative shelved. No action taken.")
        return

    print("\n[Execution Agent] Building the launch plan...")
    print(execution.build_plan(initiative_id))

    print("\n[Marketing Agent] Drafting free promotion...")
    print(marketing.create_content(initiative["title"]))
