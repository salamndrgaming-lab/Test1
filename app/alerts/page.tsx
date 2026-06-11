"use client";

import { useCallback, useEffect, useState } from "react";
import type { Article, Game, Quote, WeatherAlert, ProviderResult } from "@/types";
import { useAlerts, ALERT_TYPE_LABEL, type AlertRule, type AlertType } from "@/lib/useAlerts";
import { usePro } from "@/lib/usePro";
import { useSettings } from "@/components/SettingsProvider";
import { UpgradeCard } from "@/components/UpgradeCard";
import { PageHeader, Card, Spinner } from "@/components/ui";
import { accentVars } from "@/lib/sections";

async function getData<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    const j = (await r.json()) as ProviderResult<T>;
    return j.data;
  } catch {
    return null;
  }
}

interface Hit {
  ruleId: string;
  message: string;
}

export default function AlertsPage() {
  const { isPro } = usePro();
  const { rules, addRule, removeRule } = useAlerts();
  const { settings } = useSettings();
  const [type, setType] = useState<AlertType>("topic");
  const [value, setValue] = useState("");
  const [threshold, setThreshold] = useState(3);
  const [hits, setHits] = useState<Hit[]>([]);
  const [checking, setChecking] = useState(false);

  const evaluate = useCallback(async () => {
    if (rules.length === 0) {
      setHits([]);
      return;
    }
    setChecking(true);
    const loc = settings.defaultLocation;
    const results = await Promise.all(
      rules.map(async (rule): Promise<Hit | null> => {
        if (rule.type === "topic") {
          const arts = await getData<Article[]>(
            `/api/news?q=${encodeURIComponent(rule.value)}`,
          );
          const top = arts?.[0];
          if (top && Date.now() - +new Date(top.publishedAt) < 6 * 3600_000) {
            return { ruleId: rule.id, message: `New coverage: ${top.title}` };
          }
        } else if (rule.type === "stock") {
          const t = rule.value.toUpperCase();
          const q = await getData<Quote[]>(
            `/api/markets/quote?symbols=${t}|${t}`,
          );
          const quote = q?.[0];
          if (quote && Math.abs(quote.changePct) >= (rule.threshold ?? 3)) {
            return {
              ruleId: rule.id,
              message: `${t} moved ${quote.changePct > 0 ? "+" : ""}${quote.changePct}%`,
            };
          }
        } else if (rule.type === "team") {
          const games = await getData<Game[]>("/api/sports");
          const abbr = rule.value.toUpperCase();
          const g = games?.find(
            (x) =>
              x.status !== "final" &&
              (x.home.abbreviation === abbr || x.away.abbreviation === abbr),
          );
          if (g)
            return {
              ruleId: rule.id,
              message: `${abbr} plays today: ${g.away.abbreviation} @ ${g.home.abbreviation}`,
            };
        } else if (rule.type === "weather") {
          if (loc) {
            const alerts = await getData<WeatherAlert[]>(
              `/api/weather/alerts?lat=${loc.lat}&lon=${loc.lon}`,
            );
            const a = alerts?.[0];
            if (a) return { ruleId: rule.id, message: `${a.event}: ${a.headline || a.area}` };
          }
        }
        return null;
      }),
    );
    setHits(results.filter((h): h is Hit => h !== null));
    setChecking(false);
  }, [rules, settings.defaultLocation]);

  useEffect(() => {
    if (isPro) evaluate();
  }, [isPro, evaluate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type !== "weather" && !value.trim()) return;
    addRule({
      type,
      value: type === "weather" ? "local" : value.trim(),
      threshold: type === "stock" ? threshold : undefined,
    });
    setValue("");
  };

  const placeholder: Record<AlertType, string> = {
    topic: "Keyword (e.g. election)",
    stock: "Ticker (e.g. AAPL)",
    team: "Team abbr (e.g. LAL)",
    weather: "Uses your saved location",
  };

  return (
    <div style={accentVars("news")}>
      <PageHeader
        kicker="Alerts"
        title="Smart Alerts"
        subtitle="Get notified when your topics break, stocks move, teams play, or weather turns."
        right={
          isPro && (
            <button onClick={evaluate} className="chip text-xs">
              {checking ? "Checking…" : "Check now"}
            </button>
          )
        }
      />

      {!isPro ? (
        <UpgradeCard feature="Smart alerts" />
      ) : (
        <div className="space-y-4">
          {hits.length > 0 && (
            <Card className="border-[var(--accent)]/40">
              <h3 className="mb-2 font-semibold text-[var(--accent)]">
                Triggered now
              </h3>
              <ul className="space-y-1.5 text-sm">
                {hits.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden>🔔</span>
                    {h.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="mb-3 font-semibold">New alert</h3>
            <form onSubmit={submit} className="flex flex-wrap gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AlertType)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
              >
                {(Object.keys(ALERT_TYPE_LABEL) as AlertType[]).map((t) => (
                  <option key={t} value={t}>
                    {ALERT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              {type !== "weather" && (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder[type]}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                />
              )}
              {type === "stock" && (
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                  title="Percent move"
                />
              )}
              <button type="submit" className="btn-primary">
                Add
              </button>
            </form>
          </Card>

          <Card>
            <h3 className="mb-2 font-semibold">Your alerts</h3>
            {rules.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No alerts yet.</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((r: AlertRule) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      <span className="text-[var(--muted)]">
                        {ALERT_TYPE_LABEL[r.type]}:
                      </span>{" "}
                      {r.type === "weather" ? "saved location" : r.value}
                      {r.type === "stock" && ` (±${r.threshold}%)`}
                    </span>
                    <button
                      onClick={() => removeRule(r.id)}
                      className="chip text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="text-center text-xs text-[var(--muted-2)]">
            Alerts are checked when you open this page. Background push &amp; email
            alerts arrive with the server upgrade (see roadmap).
          </p>
        </div>
      )}
    </div>
  );
}
