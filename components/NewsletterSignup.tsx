"use client";

import { useState } from "react";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(r.ok ? "ok" : "err");
      if (r.ok) setEmail("");
    } catch {
      setState("err");
    }
  };

  if (state === "ok") {
    return (
      <p className="text-xs text-good">Thanks — you&apos;re on the list.</p>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-sm gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Get the daily briefing"
        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      />
      <button type="submit" className="btn-primary">
        Subscribe
      </button>
    </form>
  );
}
