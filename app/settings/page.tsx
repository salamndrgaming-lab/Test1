"use client";

import { useState } from "react";
import type { GeoResult } from "@/lib/providers/weather.provider";
import type { ProviderResult } from "@/types";
import { useSettings } from "@/components/SettingsProvider";
import { PageHeader, Card } from "@/components/ui";
import { accentVars } from "@/lib/sections";
import { classNames } from "@/lib/format";

function Segment<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={classNames(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-[var(--surface)] text-[var(--accent)] shadow"
              : "text-[var(--muted)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] py-4 last:border-0">
      <div>
        <p className="font-medium">{title}</p>
        {desc && <p className="text-sm text-[var(--muted)]">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
      const j = (await r.json()) as ProviderResult<GeoResult[]>;
      setResults(j.data ?? []);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={accentVars("home")}>
      <PageHeader
        kicker="Preferences"
        title="Settings"
        subtitle="Theme, text size, motion, and your default location — saved on this device."
      />

      <Card>
        <Row title="Theme" desc="Light or dark appearance.">
          <Segment
            value={settings.theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { label: "Dark", value: "dark" as const },
              { label: "Light", value: "light" as const },
            ]}
          />
        </Row>

        <Row title="Text size" desc="Scale the interface text.">
          <Segment
            value={settings.textScale}
            onChange={(v) => update({ textScale: v })}
            options={[
              { label: "S", value: 0.9 },
              { label: "M", value: 1 },
              { label: "L", value: 1.15 },
              { label: "XL", value: 1.3 },
            ]}
          />
        </Row>

        <Row
          title="Reduce motion"
          desc="Disable animations and the trending marquee."
        >
          <Segment
            value={settings.reduceMotion ? "on" : "off"}
            onChange={(v) => update({ reduceMotion: v === "on" })}
            options={[
              { label: "Off", value: "off" as const },
              { label: "On", value: "on" as const },
            ]}
          />
        </Row>

        <Row
          title="Default location"
          desc={
            settings.defaultLocation
              ? `Current: ${settings.defaultLocation.place}`
              : "Used for local news and weather."
          }
        >
          {settings.defaultLocation && (
            <button
              onClick={() => update({ defaultLocation: undefined })}
              className="chip text-xs"
            >
              Clear
            </button>
          )}
        </Row>

        <form onSubmit={search} className="mt-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a city…"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
          />
          <button type="submit" className="btn-primary" disabled={searching}>
            {searching ? "…" : "Search"}
          </button>
        </form>

        {results.length > 0 && (
          <ul className="mt-2 space-y-1">
            {results.map((r) => {
              const place = [r.name, r.admin1, r.country]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    onClick={() => {
                      update({
                        defaultLocation: { place, lat: r.lat, lon: r.lon },
                      });
                      setResults([]);
                      setQ("");
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                  >
                    {place}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
