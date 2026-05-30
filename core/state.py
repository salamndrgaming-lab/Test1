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
