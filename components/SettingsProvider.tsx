"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { usePersistentState } from "@/lib/usePersistentState";

export interface SavedLocation {
  place: string;
  lat: number;
  lon: number;
}

export interface Settings {
  theme: "dark" | "light";
  textScale: number; // 0.9 .. 1.3
  reduceMotion: boolean;
  defaultLocation?: SavedLocation;
}

const DEFAULTS: Settings = {
  theme: "dark",
  textScale: 1,
  reduceMotion: false,
};

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = usePersistentState<Settings>(
    "newsscope.settings",
    DEFAULTS,
  );

  // Reflect settings onto <html> so CSS (theme palette, text scale, motion)
  // applies globally.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty("--text-scale", String(settings.textScale));
    if (settings.reduceMotion) root.dataset.reduceMotion = "true";
    else delete root.dataset.reduceMotion;
  }, [settings]);

  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
