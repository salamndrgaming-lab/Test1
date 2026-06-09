"use client";

import { useEffect, useState } from "react";
import type { ProviderResult } from "@/types";

/** Fetch a ProviderResult<T> from one of our /api routes with loading/error. */
export function useProvider<T>(url: string) {
  const [result, setResult] = useState<ProviderResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => r.json())
      .then((json: ProviderResult<T>) => {
        if (!cancelled) setResult(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { result, data: result?.data ?? null, loading, error };
}
