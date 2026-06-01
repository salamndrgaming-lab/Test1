"""
Shared, persistent memory for the whole organization.

Everything is stored in data/state.json so the system remembers revenue,
approved initiatives, and agent activity across runs. Free, no database.
"""

import json
import os
from datetime import datetime

_STATE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "state.json")


def load():
    """Read the current state from disk."""
    with open(_STATE_PATH, "r") as f:
        return json.load(f)


def save(state):
    """Write the state back to disk."""
    with open(_STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def log(actor, message):
    """Record something an agent or the CEO did, with a timestamp."""
    state = load()
    state["agent_logs"].append(
        {
            "time": datetime.now().isoformat(timespec="seconds"),
            "actor": actor,
            "message": message,
        }
    )
    save(state)


def add_initiative(initiative):
    """Queue a new initiative proposed by an agent (awaiting CEO approval)."""
    state = load()
    initiative["id"] = len(state["initiatives"]) + 1
    initiative["status"] = "pending"
    initiative["proposed_at"] = datetime.now().isoformat(timespec="seconds")
    state["initiatives"].append(initiative)
    save(state)
    return initiative["id"]


def record_revenue(amount, source):
    """Log a revenue event and bump MRR. Updates milestone flags."""
    state = load()
    state["revenue_events"].append(
        {
            "time": datetime.now().isoformat(timespec="seconds"),
            "amount": amount,
            "source": source,
        }
    )
    state["mrr"] = round(state["mrr"] + amount, 2)
    _update_milestones(state)
    save(state)


def create_task(initiative_id, title, steps):
    """
    Register a new task for an approved initiative.

    steps: list of {"agent": str, "description": str}
    Returns the task dict (with status fields filled in).
    """
    s = load()
    if "tasks" not in s:
        s["tasks"] = []
    task = {
        "initiative_id": initiative_id,
        "title": title,
        "started_at": datetime.now().isoformat(timespec="seconds"),
        "status": "in-progress",
        "steps": [
            {
                "step": idx + 1,
                "agent": step["agent"],
                "description": step["description"],
                "status": "pending",
                "output": None,
                "updated_at": None,
            }
            for idx, step in enumerate(steps)
        ],
    }
    s["tasks"].append(task)
    save(s)
    return task


def update_task_step(initiative_id, step_num, status, output=None):
    """Mark a single step as 'in-progress', 'done', or 'error'."""
    s = load()
    for task in s.get("tasks", []):
        if task["initiative_id"] == initiative_id:
            for step in task["steps"]:
                if step["step"] == step_num:
                    step["status"] = status
                    step["output"] = output
                    step["updated_at"] = datetime.now().isoformat(timespec="seconds")
                    break
            all_terminal = all(st["status"] in ("done", "error", "blocked") for st in task["steps"])
            if all_terminal:
                # If anything still needs the CEO, the task is "waiting", else "done"
                any_blocked = any(st["status"] == "blocked" for st in task["steps"])
                task["status"] = "waiting" if any_blocked else "done"
            break
    save(s)


def add_task_result(initiative_id, label, url, description=""):
    """Record a link/product the agents produced for this initiative."""
    s = load()
    for task in s.get("tasks", []):
        if task["initiative_id"] == initiative_id:
            task.setdefault("results", []).append({
                "label": label,
                "url": url,
                "description": description,
                "created_at": datetime.now().isoformat(timespec="seconds"),
            })
            break
    save(s)


def add_task_blocker(initiative_id, message, link=""):
    """Flag something the agent cannot do — needs CEO action."""
    s = load()
    for task in s.get("tasks", []):
        if task["initiative_id"] == initiative_id:
            blockers = task.setdefault("blockers", [])
            bid = len(blockers) + 1
            blockers.append({
                "id": bid,
                "message": message,
                "link": link,
                "resolved": False,
                "created_at": datetime.now().isoformat(timespec="seconds"),
            })
            break
    save(s)
    return bid


def resolve_blocker(initiative_id, blocker_id):
    """Mark a CEO-action blocker as resolved."""
    s = load()
    for task in s.get("tasks", []):
        if task["initiative_id"] == initiative_id:
            for b in task.get("blockers", []):
                if b["id"] == blocker_id:
                    b["resolved"] = True
                    b["resolved_at"] = datetime.now().isoformat(timespec="seconds")
                    break
            break
    save(s)


def _update_milestones(state):
    mrr = state["mrr"]
    m = state["milestones"]
    if mrr > 0:
        m["first_dollar"] = True
    if mrr >= 100:
        m["100_mrr"] = True
    if mrr >= 1000:
        m["1000_mrr"] = True
    if mrr >= 5000:
        m["5000_mrr"] = True
    if mrr >= 10000:
        m["10000_mrr"] = True
