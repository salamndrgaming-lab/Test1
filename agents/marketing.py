"""
Marketing Agent — creates free content and outreach copy for approved work.
"""

from core import llm, state

SYSTEM = """You are the Marketing Agent. You write punchy, honest marketing copy
and content ideas using only free channels (organic social, Reddit, communities,
SEO blog posts, cold outreach). No paid ads. Match the audience's language."""

_MARKETING_STEPS = [
    {"agent": "Marketing Agent", "description": "Write one-line hook"},
    {"agent": "Marketing Agent", "description": "Write ready-to-post promo copy"},
    {"agent": "Marketing Agent", "description": "Identify free distribution channels"},
]


def create_content(initiative_id, initiative_title, emit=None):
    """Generate ready-to-post marketing content and track each step."""

    # Register marketing steps on the existing task (append to it)
    data = state.load()
    task = next((t for t in data.get("tasks", []) if t["initiative_id"] == initiative_id), None)

    if task:
        # Append marketing steps after execution steps
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

    def run_step(step_num, description, prompt):
        if task:
            state.update_task_step(initiative_id, step_num, "in-progress")
        if emit:
            emit(f"Marketing: {description}...")
        result = llm.ask(SYSTEM, prompt)
        if task:
            state.update_task_step(initiative_id, step_num, "done", output=result)
        return result

    base = task["steps"][len(task["steps"]) - len(_MARKETING_STEPS)]["step"] if task else 1

    hook = run_step(base, "Writing hook", f"Write a single punchy one-line hook for: {initiative_title}")
    post = run_step(base + 1, "Writing post", f"Write a short post (under 120 words) promoting: {initiative_title}. Use organic/free tone.")
    dist = run_step(base + 2, "Finding channels", f"List 3 specific free places to distribute content about: {initiative_title} (no ad spend).")

    state.log("Marketing Agent", f"Created content for: {initiative_title}")
    return f"HOOK:\n{hook}\n\nPOST:\n{post}\n\nDISTRIBUTION:\n{dist}"
