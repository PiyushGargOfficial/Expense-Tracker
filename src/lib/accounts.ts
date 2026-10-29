// Pure account maths: balances, credit-card figures and due dates. All amounts are integer minor units.

export const ACCOUNT_KINDS = [
  { value: "BANK", label: "Chequing / bank" },
  { value: "SAVINGS", label: "Savings" },
  { value: "CREDIT", label: "Credit card" },
  { value: "CARD", label: "Debit / prepaid card" },
  { value: "CASH", label: "Cash" },
  { value: "WALLET", label: "Wallet" },
] as const;

export type AccountKindValue = (typeof ACCOUNT_KINDS)[number]["value"];
export const KIND_VALUES = ACCOUNT_KINDS.map((k) => k.value) as [AccountKindValue, ...AccountKindValue[]];
export const kindLabel = (k: string) => ACCOUNT_KINDS.find((x) => x.value === k)?.label ?? k;

export type AcctTxn = { type: string; amountMinor: number; currency: string; date: Date; accountId: string | null; toAccountId: string | null };

const DAY = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** The given day of a month, clamped to the month's last day (the 31st in February is the 28th or 29th). */
export function dayInMonth(year: number, month: number, day: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last)));
}

/** First date on or after `from` that falls on this day of the month. */
export function nextOccurrence(day: number, from: Date): Date {
  const f = utcDay(from);
  const y = from.getUTCFullYear(), m = from.getUTCMonth();
  const here = dayInMonth(y, m, day);
  return +here >= f ? here : dayInMonth(y, m + 1, day);
}

/** Latest date on or before `from` that falls on this day of the month. */
export function previousOccurrence(day: number, from: Date): Date {
  const f = utcDay(from);
  const y = from.getUTCFullYear(), m = from.getUTCMonth();
  const here = dayInMonth(y, m, day);
  return +here <= f ? here : dayInMonth(y, m - 1, day);
}

export const daysUntil = (to: Date, from: Date) => Math.round((utcDay(to) - utcDay(from)) / DAY);

/**
 * What the recorded transactions did to this account, in the account's own currency. Transactions in another
 * currency are not converted, so they are counted separately instead of silently changing the balance.
 */
export function deltaFor(accountId: string, currency: string, txns: AcctTxn[]) {
  let delta = 0, skipped = 0;
  for (const t of txns) {
    const out = t.accountId === accountId, into = t.toAccountId === accountId;
    if (!out && !into) continue;
    if (t.currency !== currency) { skipped++; continue; }
    if (t.type === "TRANSFER") delta += (into ? t.amountMinor : 0) - (out ? t.amountMinor : 0);
    else if (out) delta += t.type === "INCOME" ? t.amountMinor : -t.amountMinor;
  }
  return { delta, skipped };
}

export type CreditFields = { creditLimitMinor: number | null; statementDay: number | null; dueDay: number | null; aprBps: number | null; minPaymentMinor: number | null };

export function creditSummary(a: CreditFields, balance: number, accountId: string, currency: string, txns: AcctTxn[], today: Date) {
  const owed = Math.max(0, -balance);
  const overpaid = Math.max(0, balance);
  const statementDate = a.statementDay ? previousOccurrence(a.statementDay, today) : null;
  const nextStatement = a.statementDay ? nextOccurrence(a.statementDay, today) : null;
  const nextDue = a.dueDay ? nextOccurrence(a.dueDay, today) : null;
  const daysToDue = nextDue ? daysUntil(nextDue, today) : null;
  const paidSinceStatement = statementDate
    ? txns.filter((t) => t.type === "TRANSFER" && t.toAccountId === accountId && t.currency === currency && utcDay(t.date) >= +statementDate).reduce((s, t) => s + t.amountMinor, 0)
    : null;
  return {
    owed,
    overpaid,
    available: a.creditLimitMinor != null ? a.creditLimitMinor - owed : null,
    utilizationPct: a.creditLimitMinor ? Math.round((owed / a.creditLimitMinor) * 100) : null,
    statementDate, nextStatement, nextDue, daysToDue,
    dueSoon: owed > 0 && daysToDue != null && daysToDue <= 7,
    paidSinceStatement,
    // A rough guide only: one month of interest at the card's rate on what is owed now.
    monthlyInterest: a.aprBps && owed ? Math.round((owed * a.aprBps) / 10_000 / 12) : null,
  };
}

/** Parse a possibly negative money string ("-12.50") to signed minor units; null when invalid. */
export function parseSigned(input: string, parse: (s: string) => number | null): number | null {
  const t = input.trim();
  if (t.startsWith("-")) { const v = parse(t.slice(1)); return v === null ? null : -v; }
  return parse(t);
}

/** "19.99" -> 1999 basis points; null when it isn't a percentage with at most two decimals. */
export function parseAprBps(input: string): number | null {
  const t = input.trim().replace(/%$/, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps <= 10_000 ? bps : null;
}
