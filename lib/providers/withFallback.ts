import type { ProviderResult } from "@/types";

/**
 * A data provider attempts a live free source, and always has a seed fallback.
 * `fetchLive` MAY throw (network blocked, source changed shape, timeout).
 * `seed` MUST NOT throw — it returns realistic bundled data.
 */
export interface DataProvider<TParams, TData> {
  name: string;
  fetchLive(params: TParams, signal: AbortSignal): Promise<TData>;
  seed(params: TParams): TData;
}

/**
 * Try the live source with a hard timeout; on any failure fall back to seed.
 * This guarantees fast, graceful behavior in sandboxed/offline environments.
 */
export async function withFallback<P, T>(
  provider: DataProvider<P, T>,
  params: P,
  timeoutMs = 4000,
): Promise<ProviderResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const data = await provider.fetchLive(params, controller.signal);
    return {
      data,
      source: "live",
      fetchedAt: new Date().toISOString(),
      note: `Live via ${provider.name}`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return {
      data: provider.seed(params),
      source: "seed",
      fetchedAt: new Date().toISOString(),
      note: `Sample data (${provider.name} unavailable: ${reason})`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Small helper for fetch with the provided abort signal + sane defaults. */
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
  const res = await fetch(url, {
    signal,
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}
