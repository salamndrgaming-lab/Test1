"""
Web dashboard entry point.

Run:  python app.py
Then open http://localhost:5000 in your browser.

Agents run automatically in the background. You only need to approve or
reject initiatives through the web UI — everything else is hands-free.
"""

import json
import os
import queue
import threading
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, Response, jsonify, render_template, request

from agents import execution, finance, marketing, research, strategy
from core import state, vault

app = Flask(__name__)

# Thread-safe queue for streaming activity to the browser
_event_queue = queue.Queue(maxsize=200)

# One lock so background agents don't step on each other
_agent_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Background agent jobs
# ---------------------------------------------------------------------------

def _run_strategy_cycle():
    """Propose one initiative if none are pending. Runs on a schedule."""
    with _agent_lock:
        data = state.load()
        pending = [i for i in data["initiatives"] if i["status"] == "pending"]
        if pending:
            _emit("scheduler", f"Skipping proposal — {len(pending)} initiative(s) already awaiting your approval.")
            return
        _emit("Strategy Agent", "Scanning for revenue opportunities...")
        try:
            initiative_id = strategy.propose()
            data = state.load()
            initiative = next(i for i in data["initiatives"] if i["id"] == initiative_id)
            _emit("Strategy Agent", f"Proposed: {initiative['title']}")
            _emit("Research Agent", f"Validating '{initiative['title']}' with web search...")
            analysis = research.research(initiative["title"])
            # Store the research on the initiative so the CEO can read it
            data = state.load()
            for i in data["initiatives"]:
                if i["id"] == initiative_id:
                    i["research"] = analysis
                    break
            state.save(data)
            _emit("Research Agent", "Research complete — initiative ready for your approval.")
        except Exception as exc:
            _emit("scheduler", f"Strategy cycle error: {exc}")


def _run_finance_report():
    """Generate a finance report. Runs daily."""
    with _agent_lock:
        _emit("Finance Agent", "Generating daily finance report...")
        try:
            report = finance.report()
            _emit("Finance Agent", report)
        except Exception as exc:
            _emit("Finance Agent", f"Report error: {exc}")


def _run_post_approval(initiative_id, title):
    """After CEO approval, Execution + Marketing run automatically."""
    with _agent_lock:
        try:
            _emit("Execution Agent", f"Starting launch plan for '{title}'...")
            plan = execution.build_plan(
                initiative_id,
                emit=lambda msg: _emit("Execution Agent", msg),
            )
            _emit("Execution Agent", f"Launch plan complete for '{title}'.")
            _emit("Marketing Agent", f"Starting promotion for '{title}'...")
            content = marketing.create_content(
                initiative_id,
                title,
                emit=lambda msg: _emit("Marketing Agent", msg),
            )
            _emit("Marketing Agent", f"Promotion ready for '{title}'.")
        except Exception as exc:
            _emit("Execution Agent", f"Post-approval error: {exc}")


def _emit(actor, message):
    """Push a log event to the browser SSE stream."""
    entry = {
        "time": datetime.now().strftime("%H:%M:%S"),
        "actor": actor,
        "message": message,
    }
    try:
        _event_queue.put_nowait(entry)
    except queue.Full:
        _event_queue.get_nowait()
        _event_queue.put_nowait(entry)
    # Also persist to state log
    try:
        state.log(actor, message)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Flask routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def api_status():
    data = state.load()
    mrr = data["mrr"]
    goal = data["goal_mrr"]
    pct = round((mrr / goal) * 100, 1) if goal else 0
    return jsonify({
        "mrr": mrr,
        "goal": goal,
        "pct": pct,
        "expenses": data["expenses"],
        "net": round(mrr - data["expenses"], 2),
        "milestones": data["milestones"],
        "approved_count": len(data["approved_initiatives"]),
        "rejected_count": len(data["rejected_initiatives"]),
        "revenue_events": data["revenue_events"][-5:],
    })


@app.route("/api/initiatives")
def api_initiatives():
    data = state.load()
    pending = [i for i in data["initiatives"] if i["status"] == "pending"]
    return jsonify(pending)


@app.route("/api/approve/<int:initiative_id>", methods=["POST"])
def api_approve(initiative_id):
    data = state.load()
    for i in data["initiatives"]:
        if i["id"] == initiative_id:
            i["status"] = "approved"
            i["decided_at"] = datetime.now().isoformat(timespec="seconds")
            data["approved_initiatives"].append(initiative_id)
            title = i["title"]
            break
    else:
        return jsonify({"error": "not found"}), 404
    state.save(data)
    state.log("CEO", f"APPROVED initiative #{initiative_id}")
    _emit("CEO", f"Approved: {title}")
    threading.Thread(target=_run_post_approval, args=(initiative_id, title), daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/reject/<int:initiative_id>", methods=["POST"])
def api_reject(initiative_id):
    data = state.load()
    for i in data["initiatives"]:
        if i["id"] == initiative_id:
            i["status"] = "rejected"
            i["decided_at"] = datetime.now().isoformat(timespec="seconds")
            data["rejected_initiatives"].append(initiative_id)
            title = i["title"]
            break
    else:
        return jsonify({"error": "not found"}), 404
    state.save(data)
    state.log("CEO", f"REJECTED initiative #{initiative_id}")
    _emit("CEO", f"Rejected: {title}")
    return jsonify({"ok": True})


@app.route("/api/revenue", methods=["POST"])
def api_revenue():
    body = request.json or {}
    amount = float(body.get("amount", 0))
    source = body.get("source", "unspecified")
    if amount <= 0:
        return jsonify({"error": "invalid amount"}), 400
    state.record_revenue(amount, source)
    _emit("Finance Agent", f"Revenue recorded: ${amount} from {source}")
    return jsonify({"ok": True})


@app.route("/api/run-now", methods=["POST"])
def api_run_now():
    """CEO-triggered: run the strategy cycle immediately."""
    threading.Thread(target=_run_strategy_cycle, daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/tasks")
def api_tasks():
    data = state.load()
    tasks = data.get("tasks", [])
    tasks = sorted(tasks, key=lambda t: t.get("started_at", ""), reverse=True)
    return jsonify(tasks[:20])


@app.route("/api/tasks/<int:initiative_id>/resolve-blocker/<int:blocker_id>", methods=["POST"])
def api_resolve_blocker(initiative_id, blocker_id):
    state.resolve_blocker(initiative_id, blocker_id)
    state.log("CEO", f"Resolved blocker #{blocker_id} on initiative #{initiative_id}")
    _emit("CEO", f"Marked blocker resolved on initiative #{initiative_id}")
    return jsonify({"ok": True})


@app.route("/api/accounts")
def api_accounts():
    return jsonify(vault.list_accounts(reveal=False))


@app.route("/api/accounts/<int:account_id>/reveal")
def api_account_reveal(account_id):
    acct = vault.get_account(account_id)
    if not acct:
        return jsonify({"error": "not found"}), 404
    return jsonify({"id": acct["id"], "password": acct.get("password", "")})


@app.route("/api/accounts", methods=["POST"])
def api_account_add():
    b = request.json or {}
    if not b.get("service"):
        return jsonify({"error": "service required"}), 400
    aid = vault.add_account(
        service=b.get("service"),
        email=b.get("email", ""),
        password=b.get("password", ""),
        username=b.get("username", ""),
        url=b.get("url", ""),
        notes=b.get("notes", ""),
    )
    return jsonify({"ok": True, "id": aid})


@app.route("/api/accounts/<int:account_id>", methods=["DELETE"])
def api_account_delete(account_id):
    vault.delete_account(account_id)
    return jsonify({"ok": True})


@app.route("/api/log")
def api_log():
    data = state.load()
    return jsonify(data["agent_logs"][-50:])


@app.route("/stream")
def stream():
    """Server-Sent Events — pushes live agent activity to the browser."""
    def generate():
        yield "data: {\"actor\":\"system\",\"message\":\"Connected to live feed\",\"time\":\"now\"}\n\n"
        while True:
            try:
                event = _event_queue.get(timeout=25)
                yield f"data: {json.dumps(event)}\n\n"
            except queue.Empty:
                yield ": heartbeat\n\n"
    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------------
# Scheduler setup
# ---------------------------------------------------------------------------

def start_scheduler():
    scheduler = BackgroundScheduler()
    # Propose a new idea every 4 hours
    scheduler.add_job(_run_strategy_cycle, "interval", hours=4, id="strategy",
                      next_run_time=datetime.now())  # also run once on startup
    # Finance report every 24 hours
    scheduler.add_job(_run_finance_report, "interval", hours=24, id="finance")
    scheduler.start()
    return scheduler


if __name__ == "__main__":
    scheduler = start_scheduler()
    demo = not os.environ.get("GROQ_API_KEY", "").strip()
    if demo:
        print("\n  *** DEMO MODE — set GROQ_API_KEY for real agents ***")
    print("\n  CEO Dashboard running at http://localhost:5000\n")
    app.run(debug=False, threaded=True, port=5000)
