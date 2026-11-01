import { describe, expect, it } from "vitest";
import { creditSummary, dayInMonth, daysUntil, deltaFor, nextOccurrence, parseAprBps, parseSigned, previousOccurrence, type AcctTxn } from "../accounts";
import { parseToMinor } from "../money";

const d = (s: string) => new Date(s + "T00:00:00Z");
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("due dates", () => {
  it("clamps the 31st to the end of short months", () => {
    expect(iso(dayInMonth(2027, 1, 31))).toBe("2027-02-28");
    expect(iso(dayInMonth(2028, 1, 31))).toBe("2028-02-29");
  });
  it("finds the next and previous occurrence, counting today as both", () => {
    expect(iso(nextOccurrence(15, d("2026-10-29")))).toBe("2026-11-15");
    expect(iso(nextOccurrence(29, d("2026-10-29")))).toBe("2026-10-29");
    expect(iso(previousOccurrence(15, d("2026-10-29")))).toBe("2026-10-15");
    expect(iso(previousOccurrence(29, d("2026-10-29")))).toBe("2026-10-29");
    expect(iso(previousOccurrence(30, d("2026-11-05")))).toBe("2026-10-30");
  });
  it("rolls over the year", () => {
    expect(iso(nextOccurrence(5, d("2026-12-20")))).toBe("2027-01-05");
    expect(iso(previousOccurrence(25, d("2027-01-10")))).toBe("2026-12-25");
  });
  it("counts days between dates", () => {
    expect(daysUntil(d("2026-11-15"), d("2026-10-29"))).toBe(17);
    expect(daysUntil(d("2026-10-29"), d("2026-10-29"))).toBe(0);
  });
});

const t = (o: Partial<AcctTxn>): AcctTxn => ({ type: "EXPENSE", amountMinor: 0, currency: "CAD", date: d("2026-10-10"), accountId: null, toAccountId: null, ...o });

describe("balances", () => {
  it("applies expenses, income and transfers in both directions", () => {
    const txns = [
      t({ type: "EXPENSE", amountMinor: 1000, accountId: "A" }),
      t({ type: "INCOME", amountMinor: 5000, accountId: "A" }),
      t({ type: "TRANSFER", amountMinor: 2000, accountId: "A", toAccountId: "B" }),
      t({ type: "TRANSFER", amountMinor: 700, accountId: "B", toAccountId: "A" }),
    ];
    expect(deltaFor("A", "CAD", txns)).toEqual({ delta: -1000 + 5000 - 2000 + 700, skipped: 0 });
    expect(deltaFor("B", "CAD", txns)).toEqual({ delta: 2000 - 700, skipped: 0 });
  });
  it("an investment takes money out of the paying account", () => {
    expect(deltaFor("A", "CAD", [t({ type: "INVEST", amountMinor: 2500, accountId: "A" })])).toEqual({ delta: -2500, skipped: 0 });
  });
  it("does not mix currencies; it counts them as skipped", () => {
    const r = deltaFor("A", "CAD", [t({ amountMinor: 999, currency: "USD", accountId: "A" }), t({ amountMinor: 100, accountId: "A" })]);
    expect(r).toEqual({ delta: -100, skipped: 1 });
  });
  it("ignores other accounts and unassigned transactions", () => {
    expect(deltaFor("A", "CAD", [t({ amountMinor: 500, accountId: "Z" }), t({ amountMinor: 500 })])).toEqual({ delta: 0, skipped: 0 });
  });
});

describe("credit card summary", () => {
  const card = { creditLimitMinor: 500000, statementDay: 20, dueDay: 15, aprBps: 1999, minPaymentMinor: 3500 };
  it("reports what is owed, what is left, and when payment is due", () => {
    const txns = [t({ type: "TRANSFER", amountMinor: 20000, accountId: "CHQ", toAccountId: "CC", date: d("2026-10-22") })];
    const s = creditSummary(card, -120000, "CC", "CAD", txns, d("2026-10-29"));
    expect(s.owed).toBe(120000);
    expect(s.available).toBe(380000);
    expect(s.utilizationPct).toBe(24);
    expect(iso(s.statementDate!)).toBe("2026-10-20");
    expect(iso(s.nextStatement!)).toBe("2026-11-20");
    expect(iso(s.nextDue!)).toBe("2026-11-15");
    expect(s.daysToDue).toBe(17);
    expect(s.dueSoon).toBe(false);
    expect(s.paidSinceStatement).toBe(20000); // paid after the statement date
    expect(s.monthlyInterest).toBe(Math.round((120000 * 1999) / 10000 / 12));
  });
  it("flags a payment due within a week, but only when something is owed", () => {
    expect(creditSummary(card, -5000, "CC", "CAD", [], d("2026-11-10")).dueSoon).toBe(true);
    expect(creditSummary(card, 0, "CC", "CAD", [], d("2026-11-10")).dueSoon).toBe(false);
  });
  it("treats a positive balance as overpaid, not as owed", () => {
    const s = creditSummary(card, 2500, "CC", "CAD", [], d("2026-10-29"));
    expect(s.owed).toBe(0);
    expect(s.overpaid).toBe(2500);
  });
  it("copes with missing details", () => {
    const s = creditSummary({ creditLimitMinor: null, statementDay: null, dueDay: null, aprBps: null, minPaymentMinor: null }, -1000, "CC", "CAD", [], d("2026-10-29"));
    expect(s.available).toBeNull();
    expect(s.nextDue).toBeNull();
    expect(s.paidSinceStatement).toBeNull();
    expect(s.monthlyInterest).toBeNull();
  });
});

describe("parsing", () => {
  it("parses signed amounts", () => {
    const p = (x: string) => parseSigned(x, (s) => parseToMinor(s, "CAD"));
    expect(p("-12.50")).toBe(-1250);
    expect(p("12.50")).toBe(1250);
    expect(p("abc")).toBeNull();
  });
  it("parses APR to basis points", () => {
    expect(parseAprBps("19.99")).toBe(1999);
    expect(parseAprBps("22%")).toBe(2200);
    expect(parseAprBps("abc")).toBeNull();
    expect(parseAprBps("150")).toBeNull();
  });
});
