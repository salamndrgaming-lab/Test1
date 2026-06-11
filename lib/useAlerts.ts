"use client";

import { usePersistentState } from "@/lib/usePersistentState";

export type AlertType = "topic" | "stock" | "team" | "weather";

export interface AlertRule {
  id: string;
  type: AlertType;
  value: string; // keyword / ticker / team abbr / place
  threshold?: number; // for stock: percent move
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  topic: "Breaking on topic",
  stock: "Stock move",
  team: "Team game today",
  weather: "Severe weather",
};

export function useAlerts() {
  const [rules, setRules] = usePersistentState<AlertRule[]>(
    "newsscope.alerts",
    [],
  );

  const addRule = (rule: Omit<AlertRule, "id">) =>
    setRules((r) => [{ ...rule, id: `${Date.now()}` }, ...r]);

  const removeRule = (id: string) =>
    setRules((r) => r.filter((x) => x.id !== id));

  return { rules, addRule, removeRule };
}
