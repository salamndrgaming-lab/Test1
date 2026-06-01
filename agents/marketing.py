"""
Marketing Agent — creates free content and outreach copy for approved work.
"""

import re

from core import llm, state

SYSTEM = """You are the Marketing Agent. You write punchy, honest marketing copy
and content ideas using only free channels (organic social, Reddit, communities,
SEO blog posts, cold outreach). No paid ads. Match the audience's language.

If a step produces a real URL the CEO can visit (e.g. a published post, a
created profile page), end that step's output with:
RESULT: <short label> | URL: <full url>

If a step requires the CEO to manually do something (e.g. post to their
account, create a profile), end the output with:
CEO_ACTION: <clear one-sentence instruction> | LINK: <url or blank>"""

_MARKETING_STEPS = [
    {"agent": "Marketing Agent", "description": "Write one-line hook"},
    {"agent": "Marketing Agent", "description": "Write ready-to-post promo copy"},
    {"agent": "Marketing Agent", "description": "Identify free distribution channels"},
]


def create_content(initiative_id, initiative_title, emit=None):
    """Generate ready-to-post marketing content and track each step."""

    data = state.load()
    task = next((t for t in data.get("tasks", []) if t["initiative_id"] == initiative_id), None)

    if task:
        offset = len(task["steps"])
        for idx, s in enumerate(_MARKETING_STEPS):
            task["steps"].append({
                "step": offset + idx + 1,
                "agent": s["agent"],
                "description": s["description"],
                "status": "pending",
                "output": None,
                "updated_at": None,
            })
        task["status"] = "in-progress"
        state.save(data)

    base = task["steps"][len(task["steps"]) - len(_MARKETING_STEPS)]["step"] if task else 1

    def run_step(step_num, description, prompt):
        if task:
            state.update_task_step(initiative_id, step_num, "in-progress")
        if emit:
            emit(f"Marketing: {description}...")
        raw = llm.ask(SYSTEM, prompt)
        clean = _extract_markers(raw, initiative_id)
        if task:
            state.update_task_step(initiative_id, step_num, "done", output=clean)
        return clean

    hook = run_step(base,     "Writing hook",
        f"Write a single punchy one-line hook for: {initiative_title}")
    post = run_step(base + 1, "Writing post",
        f"Write a short post (under 120 words) promoting: {initiative_title}. "
        f"Organic/free tone. If the CEO needs to post it manually, add CEO_ACTION.")
    dist = run_step(base + 2, "Finding channels",
        f"List 3 specific free places to distribute content about: {initiative_title}. "
        f"For each, add RESULT with the community URL.")

    state.log("Marketing Agent", f"Created content for: {initiative_title}")
    return f"HOOK:\n{hook}\n\nPOST:\n{post}\n\nDISTRIBUTION:\n{dist}"


def _extract_markers(text, initiative_id):
    clean_lines = []
    for line in text.splitlines():
        r = re.match(r"RESULT\s*:\s*(.+?)\s*\|\s*URL\s*:\s*(.+)", line, re.IGNORECASE)
        if r:
            state.add_task_result(initiative_id, r.group(1).strip(), r.group(2).strip())
            continue
        a = re.match(r"CEO_ACTION\s*:\s*(.+?)\s*\|\s*LINK\s*:\s*(.*)", line, re.IGNORECASE)
        if a:
            state.add_task_blocker(initiative_id, a.group(1).strip(), a.group(2).strip())
            continue
        clean_lines.append(line)
    return "\n".join(clean_lines).strip()
