#!/usr/bin/env python3
"""
CEO Dashboard — AI Revenue System
Target: $10,000/month MRR

Usage:
  python main.py                    — show dashboard
  python main.py strategy           — run strategy cycle (find opportunities)
  python main.py approve            — CEO approval session for pending initiatives
  python main.py execute            — execute all approved initiatives
  python main.py finance            — generate financial report
  python main.py research <topic>   — research a specific topic
  python main.py marketing <id>     — create marketing package for initiative
  python main.py revenue <amount> <source> — record revenue
  python main.py expense <amount> <category> — record expense
  python main.py logs               — show recent agent logs
  python main.py full               — run full autonomous cycle
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from core import state as st
from core import approval, orchestrator


def cmd_dashboard():
    print(st.get_dashboard())


def cmd_strategy():
    context = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
    orchestrator.run_strategy_cycle(context)


def cmd_approve():
    approval.run_approval_session()


def cmd_execute():
    orchestrator.run_execution_cycle()


def cmd_finance():
    orchestrator.run_finance_report()


def cmd_research():
    if len(sys.argv) < 3:
        print("Usage: python main.py research <topic>")
        return
    from agents import research
    topic = " ".join(sys.argv[2:])
    print(f"\nResearching: {topic}\n")
    result = research.research_opportunity(topic)
    print(result["raw"])


def cmd_marketing():
    if len(sys.argv) < 3:
        print("Usage: python main.py marketing <initiative_id>")
        return
    from agents import marketing
    initiative_id = sys.argv[2]
    data = st.load()
    initiative = next((i for i in data["initiatives"] if i["id"] == initiative_id), None)
    if not initiative:
        print(f"Initiative {initiative_id} not found.")
        return
    result = marketing.create_marketing_package(initiative)
    print(result)


def cmd_revenue():
    if len(sys.argv) < 4:
        print("Usage: python main.py revenue <amount> <source>")
        return
    from agents import finance
    amount = float(sys.argv[2])
    source = " ".join(sys.argv[3:])
    finance.record_revenue(amount, source)
    print(st.get_dashboard())


def cmd_expense():
    if len(sys.argv) < 4:
        print("Usage: python main.py expense <amount> <category>")
        return
    from agents import finance
    amount = float(sys.argv[2])
    category = " ".join(sys.argv[3:])
    finance.record_expense(amount, category)


def cmd_logs():
    data = st.load()
    logs = data.get("agent_logs", [])
    recent = logs[-20:]
    print(f"\nRecent agent activity ({len(logs)} total):\n")
    for log in recent:
        print(f"  [{log['ts'][:19]}] {log['agent']:12} | {log['action']:25} | {log['detail'][:60]}")


def cmd_full():
    context = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
    orchestrator.run_full_cycle(context)


COMMANDS = {
    "strategy": cmd_strategy,
    "approve": cmd_approve,
    "execute": cmd_execute,
    "finance": cmd_finance,
    "research": cmd_research,
    "marketing": cmd_marketing,
    "revenue": cmd_revenue,
    "expense": cmd_expense,
    "logs": cmd_logs,
    "full": cmd_full,
}


def main():
    if len(sys.argv) < 2:
        cmd_dashboard()
        return

    cmd = sys.argv[1].lower()
    if cmd in COMMANDS:
        COMMANDS[cmd]()
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)


if __name__ == "__main__":
    main()
