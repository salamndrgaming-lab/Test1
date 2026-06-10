import type { ProviderResult } from "@/types";

/**
 * A live data provider. There is intentionally NO sample/seed fallback — the
 * product only ever shows real data. On failure the route returns an error
 * envelope and the UI shows an "unavailable / retry" state.
 */
export interface DataProvider<TParams, TData> {
  name: string;
  fetchLive(params: TParams, signal: AbortSignal): Promise<TData>;
}

/** Run the live source with a hard timeout; return a live or error envelope. */
export async function getLive<P, T>(
  provider: DataProvider<P, T>,
  params: P,
  timeoutMs = 8000,
): Promise<ProviderResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const data = await provider.fetchLive(params, controller.signal);
    return { data, source: "live", fetchedAt: new Date().toISOString() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return {
      data: null,
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: `${provider.name} unavailable: ${reason}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** fetch JSON with the provided abort signal + sane defaults. */
export async function fetchJson<T>(
  url: string,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json", ...headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<string> {
  const res = await fetch(url, { signal, headers, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}
