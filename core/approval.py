"""
The CEO approval gate.

This is the heart of the rule: NO new product idea or business initiative
gets created or acted on without the CEO's explicit approval. Every agent
that wants to start something new must pass through this gate first.
"""

from datetime import datetime

from core import state


def request_approval(initiative_id):
    """
    Show the CEO a pending initiative and block until they decide.

    Returns True if approved, False if rejected. Nothing happens
    downstream unless this returns True.
    """
    data = state.load()
    initiative = next(
        (i for i in data["initiatives"] if i["id"] == initiative_id), None
    )
    if initiative is None:
        print(f"[!] No initiative with id {initiative_id}")
        return False

    print("\n" + "=" * 60)
    print("  CEO APPROVAL REQUIRED")
    print("=" * 60)
    print(f"  Proposed by : {initiative.get('agent', 'unknown')}")
    print(f"  Title       : {initiative.get('title', '(no title)')}")
    print(f"  Cost        : {initiative.get('cost', 'free')}")
    print("\n  Pitch:")
    print("  " + initiative.get("pitch", "(no pitch)").replace("\n", "\n  "))
    print("=" * 60)

    while True:
        choice = input("  Approve this initiative? [y]es / [n]o: ").strip().lower()
        if choice in ("y", "yes"):
            return _decide(initiative_id, approved=True)
        if choice in ("n", "no"):
            return _decide(initiative_id, approved=False)
        print("  Please type y or n.")


def _decide(initiative_id, approved):
    data = state.load()
    for i in data["initiatives"]:
        if i["id"] == initiative_id:
            i["status"] = "approved" if approved else "rejected"
            i["decided_at"] = datetime.now().isoformat(timespec="seconds")
            if approved:
                data["approved_initiatives"].append(i["id"])
            else:
                data["rejected_initiatives"].append(i["id"])
            break
    state.save(data)
    state.log(
        "CEO",
        f"{'APPROVED' if approved else 'REJECTED'} initiative #{initiative_id}",
    )
    print(f"  -> {'Approved.' if approved else 'Rejected.'}\n")
    return approved
