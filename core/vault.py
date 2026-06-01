"""
Encrypted credential vault.

When the Operator agent (or you) creates an account for a service, the login
details are stored here — encrypted at rest with a local key. Only this machine
can read them. Powers the dashboard's "Accounts & Access" panel.

The encryption key lives in data/.vault_key (auto-generated, gitignored).
This is local-machine protection, not bank-grade secrecy — it keeps creds out
of plain sight and out of git, which is the realistic threat here.
"""

import json
import os
from datetime import datetime

from cryptography.fernet import Fernet

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
_KEY_PATH = os.path.join(_DATA_DIR, ".vault_key")
_VAULT_PATH = os.path.join(_DATA_DIR, ".vault.enc")


def _get_key():
    """Load or create the local encryption key."""
    if not os.path.exists(_KEY_PATH):
        key = Fernet.generate_key()
        with open(_KEY_PATH, "wb") as f:
            f.write(key)
        try:
            os.chmod(_KEY_PATH, 0o600)
        except OSError:
            pass  # Windows
        return key
    with open(_KEY_PATH, "rb") as f:
        return f.read()


def _fernet():
    return Fernet(_get_key())


def _read_all():
    if not os.path.exists(_VAULT_PATH):
        return []
    with open(_VAULT_PATH, "rb") as f:
        blob = f.read()
    if not blob:
        return []
    try:
        return json.loads(_fernet().decrypt(blob).decode())
    except Exception:
        return []


def _write_all(entries):
    blob = _fernet().encrypt(json.dumps(entries).encode())
    with open(_VAULT_PATH, "wb") as f:
        f.write(blob)
    try:
        os.chmod(_VAULT_PATH, 0o600)
    except OSError:
        pass


def add_account(service, email, password="", username="", url="", notes=""):
    """Store a new account credential. Returns its id."""
    entries = _read_all()
    entry = {
        "id": (max([e["id"] for e in entries], default=0) + 1),
        "service": service,
        "email": email,
        "username": username,
        "password": password,
        "url": url,
        "notes": notes,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    entries.append(entry)
    _write_all(entries)
    return entry["id"]


def list_accounts(reveal=False):
    """Return all accounts. Passwords masked unless reveal=True."""
    entries = _read_all()
    if reveal:
        return entries
    masked = []
    for e in entries:
        m = dict(e)
        m["password"] = "••••••" if e.get("password") else ""
        masked.append(m)
    return masked


def get_account(account_id):
    """Return one account with its real password (for the [show] action)."""
    for e in _read_all():
        if e["id"] == account_id:
            return e
    return None


def delete_account(account_id):
    entries = [e for e in _read_all() if e["id"] != account_id]
    _write_all(entries)


def service_exists(service):
    """True if an account for this service already exists (case-insensitive)."""
    return any(e["service"].lower() == service.lower() for e in _read_all())
