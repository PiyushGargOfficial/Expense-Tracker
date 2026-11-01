import { FALLBACK_RATES, getRates, setRates, type Rates } from "@/lib/fx";

const TTL_MS = 6 * 60 * 60 * 1000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

/** Fetch current CAD rates (cached for 6 hours in memory). Never throws: on failure the last known rates stay. */
export function loadRates(): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return Promise.resolve();
  inflight ??= (async () => {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/CAD", { signal: AbortSignal.timeout(4000), next: { revalidate: 21600 } });
      const j = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
      if (j.result !== "success" || !j.rates?.INR) throw new Error("bad rate response");
      const asOf = j.time_last_update_utc ? new Date(j.time_last_update_utc).toISOString() : new Date().toISOString();
      setRates({ perCad: { ...FALLBACK_RATES.perCad, ...j.rates }, asOf, live: true } satisfies Rates);
      loadedAt = Date.now();
    } catch {
      loadedAt = Date.now() - TTL_MS + 5 * 60 * 1000; // try again in 5 minutes
      if (!getRates()) setRates(FALLBACK_RATES);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
