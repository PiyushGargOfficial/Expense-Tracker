// Split computation. Every function returns shares that sum EXACTLY to the total.
import { minorToInput } from "./money";

export type SplitType = "EQUAL" | "EXACT" | "PERCENT" | "SHARES" | "ITEMIZED";

export type Item = { amountMinor: number; memberIds: string[] };

export type SplitInput =
  | { type: "EQUAL"; memberIds: string[] }
  | { type: "EXACT"; amounts: Record<string, number> }
  | { type: "PERCENT"; percents: Record<string, number> } // e.g. 33.33
  | { type: "SHARES"; shares: Record<string, number> } // integer weights, e.g. 2,1,1
  | { type: "ITEMIZED"; items: Item[] }; // tax/tip = total - sum(items), spread proportionally

export class SplitError extends Error {}

/** Amounts in messages are shown as the user typed them (12.50), not as minor units. */
const fmt = (minor: number, currency?: string) => (currency ? minorToInput(minor, currency) : String(minor));

/**
 * Distribute `total` by integer `weights`. Floors each part, then hands the
 * leftover minor units out one at a time following `priority` (the payer first,
 * then everyone else in order). Deterministic, always sums to `total`.
 */
export function allocate(total: number, weights: number[], priority: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new SplitError("Total must be a non-negative integer");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || sum <= 0) throw new SplitError("Nothing to split between");
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = [...priority, ...weights.map((_, i) => i)].filter(
    (i, pos, arr) => arr.indexOf(i) === pos && weights[i] > 0,
  );
  for (let k = 0; left > 0; k = (k + 1) % order.length) {
    parts[order[k]] += 1;
    left -= 1;
  }
  return parts;
}

function priorityFor(ids: string[], payerIds: string[]): number[] {
  return payerIds.map((p) => ids.indexOf(p)).filter((i) => i >= 0);
}

/** Returns memberId -> owed minor units. `payerIds` only decides who absorbs leftover units. */
export function computeShares(total: number, input: SplitInput, payerIds: string[] = [], currency?: string): Record<string, number> {
  const out: Record<string, number> = {};
  const fill = (ids: string[], parts: number[]) => ids.forEach((id, i) => (out[id] = (out[id] ?? 0) + parts[i]));

  switch (input.type) {
    case "EQUAL": {
      const ids = [...new Set(input.memberIds)];
      fill(ids, allocate(total, ids.map(() => 1), priorityFor(ids, payerIds)));
      return out;
    }
    case "EXACT": {
      const ids = Object.keys(input.amounts);
      if (ids.some((id) => !Number.isInteger(input.amounts[id]) || input.amounts[id] < 0)) throw new SplitError("Invalid amount");
      const sum = ids.reduce((a, id) => a + input.amounts[id], 0);
      if (sum !== total) throw new SplitError(`Amounts add up to ${fmt(sum, currency)}, expected ${fmt(total, currency)}`);
      return { ...input.amounts };
    }
    case "PERCENT": {
      const ids = Object.keys(input.percents);
      // basis points avoid float drift: 33.33% -> 3333
      const bps = ids.map((id) => Math.round(input.percents[id] * 100));
      if (bps.reduce((a, b) => a + b, 0) !== 10000) throw new SplitError("Percentages must add up to 100");
      fill(ids, allocate(total, bps, priorityFor(ids, payerIds)));
      return out;
    }
    case "SHARES": {
      const ids = Object.keys(input.shares);
      const w = ids.map((id) => input.shares[id]);
      if (w.some((x) => !Number.isInteger(x) || x < 0)) throw new SplitError("Shares must be whole numbers");
      fill(ids, allocate(total, w, priorityFor(ids, payerIds)));
      return out;
    }
    case "ITEMIZED": {
      const itemsTotal = input.items.reduce((a, it) => a + it.amountMinor, 0);
      if (itemsTotal > total) throw new SplitError("Items exceed the bill total");
      const extra = total - itemsTotal; // tax, tip, fees
      const base: Record<string, number> = {};
      for (const it of input.items) {
        const ids = [...new Set(it.memberIds)];
        if (!ids.length) throw new SplitError("Every item needs at least one person");
        const parts = allocate(it.amountMinor, ids.map(() => 1), priorityFor(ids, payerIds));
        ids.forEach((id, i) => (base[id] = (base[id] ?? 0) + parts[i]));
      }
      const ids = Object.keys(base);
      for (const id of ids) out[id] = base[id];
      if (extra > 0) {
        if (itemsTotal === 0) throw new SplitError("Add at least one item");
        const parts = allocate(extra, ids.map((id) => base[id]), priorityFor(ids, payerIds));
        ids.forEach((id, i) => (out[id] += parts[i]));
      }
      return out;
    }
  }
}

/** Paid amounts must sum to the total. A single payer is the common case. */
export function validatePayers(total: number, paid: Record<string, number>, currency?: string): void {
  const sum = Object.values(paid).reduce((a, b) => a + b, 0);
  if (sum !== total) throw new SplitError(`Payments add up to ${fmt(sum, currency)}, expected ${fmt(total, currency)}`);
}
