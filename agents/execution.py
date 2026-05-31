"""
Execution Agent — turns CEO-APPROVED initiatives into concrete action plans.

Guardrail: it refuses to act on anything that is not approved.
"""

import re

from core import llm, state

SYSTEM = """You are the Execution Agent. You take an APPROVED initiative and
produce a concrete, ordered action plan using only free tools.
Each step must start with 'STEP N:' on its own line (e.g. 'STEP 1: ...).
Max 7 steps. Be specific and actionable. No fluff."""


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
...up to STEP 7. Be concrete. Mark the first step the CEO can do TODAY."""

    raw = llm.ask(SYSTEM, prompt)
    steps_text = _parse_steps(raw)

    # Register all steps in state as pending
    step_defs = [{"agent": "Execution Agent", "description": s} for s in steps_text]
    state.create_task(initiative_id, initiative["title"], step_defs)

    # "Execute" each step: mark in-progress, generate detail, mark done
    full_plan = []
    for idx, step_desc in enumerate(steps_text):
        step_num = idx + 1
        state.update_task_step(initiative_id, step_num, "in-progress")
        _log(emit, f"Working on Step {step_num}: {step_desc[:80]}...")

        detail_prompt = f"""Initiative: {initiative['title']}
Step {step_num}: {step_desc}

Give one short paragraph of specific how-to for this step using only free tools."""
        detail = llm.ask(SYSTEM, detail_prompt)

        state.update_task_step(initiative_id, step_num, "done", output=detail)
        full_plan.append(f"STEP {step_num}: {step_desc}\n{detail}")

    state.log("Execution Agent", f"Completed launch plan for #{initiative_id}")
    return "\n\n".join(full_plan)


def _parse_steps(text):
    """Extract 'STEP N: ...' lines from the LLM reply."""
    steps = []
    for line in text.splitlines():
        m = re.match(r"STEP\s*\d+\s*:\s*(.+)", line, re.IGNORECASE)
        if m:
            steps.append(m.group(1).strip())
    # Fallback: split on numbered lines if format wasn't followed
    if not steps:
        for line in text.splitlines():
            m = re.match(r"\d+[\.\)]\s+(.+)", line)
            if m:
                steps.append(m.group(1).strip())
    return steps or [text[:200]]


def _log(emit, msg):
    if emit:
        emit(msg)
