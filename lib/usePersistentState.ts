"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useState mirrored to localStorage. SSR-safe (returns the initial value on the
 * server and first client render, then hydrates). All hook instances sharing a
 * key stay in sync within the page (custom event) and across tabs (`storage`).
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const lastJson = useRef<string | null>(null);
  const hydrated = useRef(false);

  const read = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null && raw !== lastJson.current) {
        lastJson.current = raw;
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, [key]);

  // hydrate + subscribe to same-page and cross-tab updates
  useEffect(() => {
    read();
    const onLocal = () => read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) read();
    };
    window.addEventListener(`persist:${key}`, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(`persist:${key}`, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, read]);

  // persist + broadcast on change (skip the pre-hydration first render)
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      const json = JSON.stringify(value);
      if (json === lastJson.current) return;
      lastJson.current = json;
      window.localStorage.setItem(key, json);
      window.dispatchEvent(new Event(`persist:${key}`));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) =>
        typeof next === "function" ? (next as (p: T) => T)(prev) : next,
      ),
    [],
  );

  return [value, set];
}
