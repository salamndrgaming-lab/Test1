"""Finance Agent — tracks revenue, expenses, and progress toward $10k/month MRR."""
import anthropic
from core import state as st

MODEL = "claude-opus-4-8"

SYSTEM = """You are the Finance Agent for an AI revenue organization targeting $10k/month MRR.
You track all revenue, expenses, and financial metrics. You analyze financial health,
identify gaps between current MRR and goal, and recommend revenue acceleration strategies.
You are precise, data-driven, and always show the path to $10k/month."""


def get_financial_report() -> str:
    """Generate a detailed financial report."""
    client = anthropic.Anthropic()
    data = st.load()

    revenue_events = data.get("revenue_events", [])
    mrr = data.get("mrr", 0)
    expenses = data.get("expenses", 0)
    goal = data.get("goal_mrr", 10000)
    gap = goal - mrr

    messages = [
        {
            "role": "user",
            "content": (
                f"Generate a financial report for our AI revenue organization.\n\n"
                f"Current MRR: ${mrr:,.2f}\n"
                f"Goal MRR: ${goal:,}\n"
                f"Gap to goal: ${gap:,.2f}\n"
                f"Total expenses: ${expenses:,.2f}\n"
                f"Revenue events: {len(revenue_events)}\n"
                f"Recent events: {revenue_events[-5:] if revenue_events else 'none'}\n"
                f"Approved initiatives: {len(data.get('approved_initiatives', []))}\n"
                f"Milestones: {data.get('milestones', {})}\n\n"
                "Provide:\n"
                "1. Current financial status summary\n"
                "2. Progress toward $10k/month goal\n"
                "3. Revenue velocity analysis\n"
                "4. Gap analysis — what's needed to hit goal\n"
                "5. Top 3 recommended financial actions this week\n"
                "6. Projected timeline to $10k/month at current trajectory"
            ),
        }
    ]

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=SYSTEM,
        messages=messages,
    )

    text = ""
    for block in response.content:
        if hasattr(block, "text"):
            text += block.text

    st.log_agent_action("finance", "report_generated", f"MRR=${mrr}")
    return text


def record_revenue(amount: float, source: str, note: str = "") -> None:
    """Record a revenue event."""
    st.record_revenue(amount, source, note)
    st.log_agent_action("finance", "revenue_recorded", f"${amount} from {source}")
    print(f"  ✓ Revenue recorded: ${amount:,.2f} from {source}")


def record_expense(amount: float, category: str, note: str = "") -> None:
    """Record an expense."""
    data = st.load()
    data["expenses"] = data.get("expenses", 0) + amount
    data.setdefault("expense_events", []).append({
        "amount": amount,
        "category": category,
        "note": note,
    })
    st.save(data)
    st.log_agent_action("finance", "expense_recorded", f"${amount} for {category}")
    print(f"  ✓ Expense recorded: ${amount:,.2f} for {category}")


def analyze_initiative_roi(initiative: dict) -> str:
    """Analyze ROI for a specific initiative."""
    client = anthropic.Anthropic()

    messages = [
        {
            "role": "user",
            "content": (
                f"Analyze the financial ROI of this initiative:\n"
                f"Title: {initiative.get('title')}\n"
                f"Revenue Model: {initiative.get('revenue_model')}\n"
                f"Estimated MRR: ${initiative.get('estimated_mrr', 0):,}\n"
                f"Time to Revenue: {initiative.get('time_to_revenue', 'unknown')}\n"
                f"Tools: free only = {initiative.get('free_tools_only', True)}\n\n"
                "Provide ROI analysis, risk-adjusted MRR estimate, and confidence score (0-100)."
            ),
        }
    ]

    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM,
        messages=messages,
    )

    text = ""
    for block in response.content:
        if hasattr(block, "text"):
            text += block.text

    return text
