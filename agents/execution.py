"""
Execution Agent — turns CEO-APPROVED initiatives into concrete action plans.

Guardrail: it refuses to act on anything that is not approved.
"""

from core import llm, state

SYSTEM = """You are the Execution Agent. You take an APPROVED initiative and
produce a concrete, ordered action plan the human CEO can start today using
only free tools. Each step should be small and doable. No fluff."""


def build_plan(initiative_id):
    """Produce an action plan, but only for an approved initiative."""
    data = state.load()
    initiative = next(
        (i for i in data["initiatives"] if i["id"] == initiative_id), None
    )
    if initiative is None:
        return "[!] No such initiative."
    if initiative["status"] != "approved":
        return (
            f"[!] Initiative #{initiative_id} is '{initiative['status']}', "
            "not approved. The CEO must approve it before execution."
        )

    prompt = f"""Approved initiative:
TITLE: {initiative['title']}
PITCH: {initiative['pitch']}

Write a step-by-step launch plan (max 8 steps) using only free tools.
Mark the very first step the CEO should do today."""
    plan = llm.ask(SYSTEM, prompt)
    state.log("Execution Agent", f"Built plan for #{initiative_id}")
    return plan
