"""Orchestrator — coordinates all agents toward $10k/month MRR."""
from core import state as st
from core import approval


def run_strategy_cycle(context: str = "") -> None:
    """Run a full strategy cycle: research → propose → await CEO approval."""
    from agents import strategy, research

    print("\n[ORCHESTRATOR] Starting strategy cycle...")
    print("[ORCHESTRATOR] Strategy Agent identifying opportunities...")
    proposals = strategy.generate_opportunities(context)

    print(f"\n[ORCHESTRATOR] {len(proposals)} proposal(s) submitted for CEO approval.")
    print("[ORCHESTRATOR] Run 'python main.py approve' to review and approve initiatives.\n")


def run_execution_cycle() -> None:
    """Execute all CEO-approved initiatives."""
    from agents import execution, marketing

    approved = approval.get_approved_initiatives()
    if not approved:
        print("[ORCHESTRATOR] No approved initiatives to execute.")
        return

    print(f"[ORCHESTRATOR] Executing {len(approved)} approved initiative(s)...")
    for init in approved:
        print(f"\n[ORCHESTRATOR] → Execution Agent: {init.get('title')}")
        result = execution.execute_initiative(init)
        print(result[:500] + "..." if len(result) > 500 else result)

        print(f"\n[ORCHESTRATOR] → Marketing Agent: {init.get('title')}")
        mkt = marketing.create_marketing_package(init)
        print(mkt[:300] + "..." if len(mkt) > 300 else mkt)


def run_finance_report() -> None:
    """Generate and print financial report."""
    from agents import finance
    print("\n[ORCHESTRATOR] Finance Agent generating report...")
    report = finance.get_financial_report()
    print(report)


def run_full_cycle(context: str = "") -> None:
    """Full autonomous cycle: strategy → (CEO approval) → execution → finance."""
    print(st.get_dashboard())
    run_strategy_cycle(context)
