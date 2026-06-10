import type { Standing } from "@/types";

export function StandingsTable({ standings }: { standings: Standing[] }) {
  // group rows by their division/conference name
  const groups = new Map<string, Standing[]>();
  for (const s of standings) {
    const g = groups.get(s.group) ?? [];
    g.push(s);
    groups.set(s.group, g);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([name, rows]) => (
        <div key={name}>
          <h3 className="mb-2 font-serif text-base font-medium text-[var(--text)]">
            {name}
          </h3>
          <div className="overflow-hidden rounded-xl border border-[var(--border-soft)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--surface-2)] text-left text-xs text-[var(--muted)]">
                  <th className="px-3 py-2 font-medium">Team</th>
                  <th className="px-2 py-2 text-right font-medium">W</th>
                  <th className="px-2 py-2 text-right font-medium">L</th>
                  <th className="px-2 py-2 text-right font-medium">Pct</th>
                  <th className="px-3 py-2 text-right font-medium">GB</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr
                    key={`${s.abbreviation}-${i}`}
                    className="border-t border-[var(--border-soft)]"
                  >
                    <td className="px-3 py-2 font-medium">{s.team}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.wins}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {s.losses}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.pct}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                      {s.gamesBehind ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
