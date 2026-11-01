// Investment totals. Amounts are integer minor units and currencies are never mixed.

export const ASSET_TYPES = [
  { value: "TFSA", label: "TFSA" },
  { value: "RRSP", label: "RRSP" },
  { value: "FHSA", label: "FHSA" },
  { value: "RESP", label: "RESP" },
  { value: "NONREG", label: "Non-registered" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "GIC", label: "GIC / bonds" },
  { value: "REALESTATE", label: "Real estate" },
  { value: "OTHER", label: "Other" },
] as const;
export const ASSET_VALUES = ASSET_TYPES.map((a) => a.value) as string[];
export const assetLabel = (v: string) => ASSET_TYPES.find((a) => a.value === v)?.label ?? v;

export const PLATFORM_SUGGESTIONS = ["Wealthsimple", "Questrade", "TD Direct Investing", "RBC Direct Investing", "Scotia iTRADE", "BMO InvestorLine", "CIBC Investor's Edge", "Coinbase", "Bank / GIC"];

export type Holding = { platform: string; currency: string; investedMinor: number; valueMinor: number; goalId?: string | null };
export type Totals = { investedMinor: number; valueMinor: number; gainMinor: number; gainPct: number | null };

const add = (t: { investedMinor: number; valueMinor: number }, h: Holding) => {
  t.investedMinor += h.investedMinor;
  t.valueMinor += h.valueMinor;
};
const finish = (t: { investedMinor: number; valueMinor: number }): Totals => ({
  ...t,
  gainMinor: t.valueMinor - t.investedMinor,
  gainPct: t.investedMinor > 0 ? ((t.valueMinor - t.investedMinor) / t.investedMinor) * 100 : null,
});

/** Totals per currency across every holding. */
export function totalsByCurrency(holdings: Holding[]): Record<string, Totals> {
  const acc: Record<string, { investedMinor: number; valueMinor: number }> = {};
  for (const h of holdings) add((acc[h.currency] ??= { investedMinor: 0, valueMinor: 0 }), h);
  return Object.fromEntries(Object.entries(acc).map(([c, t]) => [c, finish(t)]));
}

export const platformKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Totals per platform and currency. "questrade" and " Questrade " are the same platform. */
export function totalsByPlatform(holdings: Holding[]) {
  const map = new Map<string, { name: string; count: number; byCurrency: Record<string, { investedMinor: number; valueMinor: number }> }>();
  for (const h of holdings) {
    const key = platformKey(h.platform);
    const p = map.get(key) ?? { name: h.platform.trim().replace(/\s+/g, " "), count: 0, byCurrency: {} };
    p.count += 1;
    add((p.byCurrency[h.currency] ??= { investedMinor: 0, valueMinor: 0 }), h);
    map.set(key, p);
  }
  return [...map.entries()]
    .map(([key, p]) => ({ key, name: p.name, count: p.count, totals: Object.fromEntries(Object.entries(p.byCurrency).map(([c, t]) => [c, finish(t)])) as Record<string, Totals> }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type GoalInput = { id: string; targetMinor: number; currency: string; targetDate: Date | null };

/** Progress of a goal from the amount invested in the holdings linked to it (same currency only). Gains do not count. */
export function goalProgress(goal: GoalInput, holdings: Holding[], today = new Date()) {
  const savedMinor = holdings.filter((h) => h.goalId === goal.id && h.currency === goal.currency).reduce((a, h) => a + h.investedMinor, 0);
  const remainingMinor = Math.max(0, goal.targetMinor - savedMinor);
  const pct = goal.targetMinor > 0 ? Math.floor((savedMinor / goal.targetMinor) * 100) : 0;
  let monthsLeft: number | null = null;
  let perMonthMinor: number | null = null;
  if (goal.targetDate && remainingMinor > 0) {
    const t = goal.targetDate;
    // Whole calendar months until the target date; a deadline already passed leaves nothing to spread over.
    const months = (t.getUTCFullYear() - today.getUTCFullYear()) * 12 + (t.getUTCMonth() - today.getUTCMonth()) + (t.getUTCDate() >= today.getUTCDate() ? 1 : 0);
    monthsLeft = Math.max(0, months);
    perMonthMinor = monthsLeft > 0 ? Math.ceil(remainingMinor / monthsLeft) : null;
  }
  return { savedMinor, remainingMinor, pct, reached: savedMinor >= goal.targetMinor, monthsLeft, perMonthMinor };
}
