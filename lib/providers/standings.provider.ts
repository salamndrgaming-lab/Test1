import type { League, Standing } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";
import { ESPN_PATH } from "./espn";

export interface StandingsParams {
  league: League;
}

// ESPN standings schema varies by sport; parse defensively.
interface EspnStat {
  name?: string;
  type?: string;
  displayValue?: string;
  value?: number;
}
interface EspnEntry {
  team?: { displayName?: string; abbreviation?: string };
  stats?: EspnStat[];
}
interface EspnGroup {
  name?: string;
  standings?: { entries?: EspnEntry[] };
  entries?: EspnEntry[];
}
interface EspnStandings {
  children?: EspnGroup[];
  standings?: { entries?: EspnEntry[] };
  name?: string;
}

function stat(entry: EspnEntry, names: string[]): EspnStat | undefined {
  return entry.stats?.find(
    (s) => names.includes(s.name ?? "") || names.includes(s.type ?? ""),
  );
}

function mapEntries(group: string, entries: EspnEntry[]): Standing[] {
  return entries.map((e) => ({
    group,
    team: e.team?.displayName ?? "—",
    abbreviation: e.team?.abbreviation ?? "",
    wins: stat(e, ["wins"])?.value ?? 0,
    losses: stat(e, ["losses"])?.value ?? 0,
    pct: stat(e, ["winPercent", "winpercent"])?.displayValue ?? "—",
    gamesBehind: stat(e, ["gamesBehind", "gamesbehind"])?.displayValue,
  }));
}

export const standingsProvider: DataProvider<StandingsParams, Standing[]> = {
  name: "ESPN Standings",
  async fetchLive({ league }, signal) {
    const data = await fetchJson<EspnStandings>(
      `https://site.api.espn.com/apis/v2/sports/${ESPN_PATH[league]}/standings`,
      signal,
    );
    const out: Standing[] = [];
    if (data.children?.length) {
      for (const g of data.children) {
        const entries = g.standings?.entries ?? g.entries ?? [];
        out.push(...mapEntries(g.name ?? "Standings", entries));
      }
    } else if (data.standings?.entries) {
      out.push(...mapEntries(data.name ?? "Standings", data.standings.entries));
    }
    if (out.length === 0) throw new Error("no standings");
    return out;
  },
};
