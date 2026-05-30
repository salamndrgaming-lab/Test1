import json
import os
from datetime import datetime
from typing import Any

STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "state.json")


def load() -> dict:
    with open(STATE_FILE) as f:
        return json.load(f)


def save(state: dict) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def log_agent_action(agent: str, action: str, detail: str = "") -> None:
    state = load()
    state["agent_logs"].append({
        "ts": datetime.utcnow().isoformat(),
        "agent": agent,
        "action": action,
        "detail": detail,
    })
    save(state)


def add_initiative(initiative: dict) -> str:
    state = load()
    initiative["id"] = f"init_{len(state['initiatives']) + 1}"
    initiative["status"] = "pending_approval"
    initiative["created_at"] = datetime.utcnow().isoformat()
    state["initiatives"].append(initiative)
    save(state)
    return initiative["id"]


def update_initiative_status(initiative_id: str, status: str) -> None:
    state = load()
    for init in state["initiatives"]:
        if init["id"] == initiative_id:
            init["status"] = status
            if status == "approved":
                state["approved_initiatives"].append(initiative_id)
            elif status == "rejected":
                state["rejected_initiatives"].append(initiative_id)
    save(state)


def record_revenue(amount: float, source: str, note: str = "") -> None:
    state = load()
    state["revenue_events"].append({
        "ts": datetime.utcnow().isoformat(),
        "amount": amount,
        "source": source,
        "note": note,
    })
    state["mrr"] = sum(e["amount"] for e in state["revenue_events"])
    _check_milestones(state)
    save(state)


def _check_milestones(state: dict) -> None:
    mrr = state["mrr"]
    m = state["milestones"]
    if mrr > 0 and not m["first_dollar"]:
        m["first_dollar"] = True
        print("\n*** MILESTONE: First dollar earned! ***\n")
    if mrr >= 100 and not m["100_mrr"]:
        m["100_mrr"] = True
        print("\n*** MILESTONE: $100 MRR reached! ***\n")
    if mrr >= 1000 and not m["1000_mrr"]:
        m["1000_mrr"] = True
        print("\n*** MILESTONE: $1,000 MRR reached! ***\n")
    if mrr >= 5000 and not m["5000_mrr"]:
        m["5000_mrr"] = True
        print("\n*** MILESTONE: $5,000 MRR reached! ***\n")
    if mrr >= 10000 and not m["10000_mrr"]:
        m["10000_mrr"] = True
        print("\n*** MILESTONE: $10,000 MRR GOAL ACHIEVED! ***\n")


def get_dashboard() -> str:
    state = load()
    mrr = state["mrr"]
    goal = state["goal_mrr"]
    pct = (mrr / goal * 100) if goal else 0
    pending = [i for i in state["initiatives"] if i["status"] == "pending_approval"]
    approved = len(state["approved_initiatives"])
    rejected = len(state["rejected_initiatives"])
    bar_filled = int(pct / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)

    lines = [
        "=" * 60,
        "  AI REVENUE SYSTEM — CEO DASHBOARD",
        "=" * 60,
        f"  MRR:      ${mrr:,.2f} / ${goal:,}",
        f"  Progress: [{bar}] {pct:.1f}%",
        f"  Expenses: ${state['expenses']:,.2f}",
        f"  Net:      ${mrr - state['expenses']:,.2f}",
        "-" * 60,
        f"  Initiatives: {approved} approved | {rejected} rejected | {len(pending)} awaiting your approval",
        "=" * 60,
    ]
    if pending:
        lines.append(f"\n  ⚠  {len(pending)} initiative(s) awaiting CEO approval — run: python main.py approve")
    return "\n".join(lines)
