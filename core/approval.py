"""CEO approval gate — nothing launches without an explicit yes."""
from core import state as st


def present_for_approval(initiative: dict) -> str:
    """Store initiative and return its ID. CEO must approve via CLI."""
    initiative_id = st.add_initiative(initiative)
    st.log_agent_action("approval_gate", "initiative_submitted", initiative_id)
    return initiative_id


def run_approval_session() -> None:
    """Interactive CLI session for the CEO to approve/reject pending initiatives."""
    data = st.load()
    pending = [i for i in data["initiatives"] if i["status"] == "pending_approval"]

    if not pending:
        print("No initiatives pending approval.")
        return

    for init in pending:
        print("\n" + "=" * 60)
        print(f"INITIATIVE ID: {init['id']}")
        print(f"Title:         {init.get('title', 'Untitled')}")
        print(f"Agent:         {init.get('proposed_by', 'unknown')}")
        print(f"Summary:       {init.get('summary', '')}")
        print(f"Revenue Model: {init.get('revenue_model', '')}")
        print(f"Est. MRR:      ${init.get('estimated_mrr', 0):,}")
        print(f"Free Tools:    {init.get('free_tools_only', True)}")
        print(f"Time to Rev:   {init.get('time_to_revenue', 'unknown')}")
        print(f"Risks:         {init.get('risks', '')}")
        print("=" * 60)

        while True:
            choice = input("\nApprove this initiative? [y/n/skip]: ").strip().lower()
            if choice == "y":
                st.update_initiative_status(init["id"], "approved")
                st.log_agent_action("ceo", "approved", init["id"])
                print(f"✓ Initiative {init['id']} APPROVED.")
                break
            elif choice == "n":
                reason = input("Rejection reason (optional): ").strip()
                st.update_initiative_status(init["id"], "rejected")
                st.log_agent_action("ceo", "rejected", f"{init['id']} — {reason}")
                print(f"✗ Initiative {init['id']} REJECTED.")
                break
            elif choice == "skip":
                print("Skipped.")
                break
            else:
                print("Enter y, n, or skip.")


def get_approved_initiatives() -> list:
    data = st.load()
    approved_ids = set(data["approved_initiatives"])
    return [i for i in data["initiatives"] if i["id"] in approved_ids]


def is_approved(initiative_id: str) -> bool:
    data = st.load()
    return initiative_id in data["approved_initiatives"]
