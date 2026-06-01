"""
Execution Agent — turns CEO-APPROVED initiatives into concrete action plans.

Guardrail: it refuses to act on anything that is not approved.
"""

import os
import re

from agents import operator
from core import llm, state

SYSTEM = """You are the Execution Agent. You take an APPROVED initiative and
produce a concrete, ordered action plan using only free tools.
Each step must start with 'STEP N:' on its own line (e.g. 'STEP 1: ...').
Max 7 steps. Be specific and actionable. No fluff.

When a step produces a real link or page the CEO can visit, end that step's
detail with a line formatted exactly:
RESULT: <short label> | URL: <full url>

When a step requires the CEO to manually do something before the agent can
continue (e.g. create an account, supply an API key, paste a URL back), end
that step's detail with a line formatted exactly:
CEO_ACTION: <clear one-sentence instruction> | LINK: <url or blank>"""


def build_plan(initiative_id, emit=None):
    """
    Produce a step-by-step launch plan and track each step in state.

    emit: optional callable(message) to push live updates to the dashboard.
    """
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

    _log(emit, f"Generating launch plan for '{initiative['title']}'...")

    prompt = f"""Approved initiative:
TITLE: {initiative['title']}
PITCH: {initiative['pitch']}

Write a step-by-step launch plan using only free tools.
Format EVERY step exactly like this (required):
STEP 1: <what to do>
STEP 2: <what to do>
...up to STEP 7. Be concrete."""

    raw = llm.ask(SYSTEM, prompt)
    steps_text = _parse_steps(raw)

    # The Operator agent owns each step now.
    step_defs = [{"agent": "Operator Agent", "description": s} for s in steps_text]
    state.create_task(initiative_id, initiative["title"], step_defs)

    base_email = _ceo_email()
    full_plan = []
    for idx, step_desc in enumerate(steps_text):
        step_num = idx + 1
        state.update_task_step(initiative_id, step_num, "in-progress")
        _log(emit, f"Operator working on Step {step_num}: {step_desc[:70]}...")

        kind, detail = operator.run_step(
            initiative_id, step_num, initiative["title"], step_desc,
            base_email=base_email, emit=emit,
        )

        # NEEDS_YOU steps stay 'blocked' visually; AUTO steps complete.
        status = "blocked" if kind == "needs_you" else "done"
        state.update_task_step(initiative_id, step_num, status, output=detail)
        full_plan.append(f"STEP {step_num}: {step_desc}\n{detail}")

    state.log("Execution Agent", f"Operator ran all steps for #{initiative_id}")
    return "\n\n".join(full_plan)


def _ceo_email():
    return os.environ.get("CEO_EMAIL", "you@example.com")


def _parse_steps(text):
    """Extract 'STEP N: ...' lines from the LLM reply."""
    steps = []
    for line in text.splitlines():
        m = re.match(r"STEP\s*\d+\s*:\s*(.+)", line, re.IGNORECASE)
        if m:
            steps.append(m.group(1).strip())
    if not steps:
        for line in text.splitlines():
            m = re.match(r"\d+[\.\)]\s+(.+)", line)
            if m:
                steps.append(m.group(1).strip())
    return steps or [text[:200]]


def _log(emit, msg):
    if emit:
        emit(msg)
