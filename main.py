"""
CEO Dashboard — the command center for your AI agent organization.

Goal: reach $10,000/month MRR through legal means, using only free tools.
You are the CEO. Nothing new launches without your approval.

Run it with:  python main.py
(Free Groq key required: https://console.groq.com  -> set GROQ_API_KEY)
"""

import os

from agents import finance, research
from core import orchestrator, state


def _demo_banner():
    if not os.environ.get("GROQ_API_KEY", "").strip():
        print(
            "\n  *** DEMO MODE — no API key set ***"
            "\n  Agents will reply with scripted responses so you can see the flow."
            "\n  When ready for real agents: https://console.groq.com (free key)\n"
        )

MENU = """
==================== CEO DASHBOARD ====================
  1. Propose a new initiative   (Strategy + Research -> your approval)
  2. Finance report             (progress toward $10k/mo)
  3. Research a topic           (free web search)
  4. View pending initiatives
  5. View activity log
  6. Record revenue             (log a real sale)
  0. Exit
======================================================"""


def show_status():
    data = state.load()
    pct = round((data["mrr"] / data["goal_mrr"]) * 100, 1)
    bar_len = 30
    filled = int(bar_len * min(pct, 100) / 100)
    bar = "#" * filled + "-" * (bar_len - filled)
    print(f"\nMRR: ${data['mrr']} / ${data['goal_mrr']}  [{bar}] {pct}%")


def view_pending():
    data = state.load()
    pending = [i for i in data["initiatives"] if i["status"] == "pending"]
    if not pending:
        print("\nNo pending initiatives.")
        return
    for i in pending:
        print(f"\n#{i['id']} {i['title']} (cost: {i['cost']})")
        print("  " + i["pitch"][:200])


def view_log():
    data = state.load()
    for entry in data["agent_logs"][-15:]:
        print(f"  [{entry['time']}] {entry['actor']}: {entry['message']}")
    if not data["agent_logs"]:
        print("  (no activity yet)")


def record_revenue():
    try:
        amount = float(input("  Amount received ($): ").strip())
    except ValueError:
        print("  Invalid amount.")
        return
    source = input("  Source / customer: ").strip() or "unspecified"
    state.record_revenue(amount, source)
    print(f"  Logged ${amount} from {source}.")


def main():
    print("\nWelcome, CEO. Your AI organization is online.")
    _demo_banner()
    while True:
        show_status()
        print(MENU)
        choice = input("Select: ").strip()
        if choice == "1":
            ctx = input("Any direction for the team? (enter to skip): ").strip()
            orchestrator.new_initiative_flow(context=ctx)
        elif choice == "2":
            print("\n" + finance.report())
        elif choice == "3":
            topic = input("Topic to research: ").strip()
            if topic:
                print("\n" + research.research(topic))
        elif choice == "4":
            view_pending()
        elif choice == "5":
            view_log()
        elif choice == "6":
            record_revenue()
        elif choice == "0":
            print("\nGoodbye, CEO. Progress saved.\n")
            break
        else:
            print("  Unknown option.")


if __name__ == "__main__":
    main()
