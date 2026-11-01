import { describe, it, expect } from "vitest";
import { totalsByCurrency, totalsByPlatform, goalProgress } from "../investments";

const h = (platform: string, currency: string, investedMinor: number, valueMinor: number, goalId: string | null = null) => ({ platform, currency, investedMinor, valueMinor, goalId });

describe("investments", () => {
  it("totals per currency with gain and percent", () => {
    const t = totalsByCurrency([h("A", "CAD", 100000, 125000), h("B", "CAD", 50000, 40000), h("C", "USD", 0, 500)]);
    expect(t.CAD).toMatchObject({ investedMinor: 150000, valueMinor: 165000, gainMinor: 15000, gainPct: 10 });
    expect(t.USD.gainPct).toBeNull();
  });

  it("groups platforms ignoring case and spacing", () => {
    const p = totalsByPlatform([h("Questrade", "CAD", 100, 150), h("  questrade ", "CAD", 200, 250), h("Wealthsimple", "CAD", 10, 10)]);
    expect(p).toHaveLength(2);
    expect(p[0].name).toBe("Questrade");
    expect(p[0].count).toBe(2);
    expect(p[0].totals.CAD.valueMinor).toBe(400);
  });

  it("goal progress counts only linked holdings in the goal currency", () => {
    const g = { id: "g1", targetMinor: 100000, currency: "CAD", targetDate: new Date(Date.UTC(2027, 0, 15)) };
    const r = goalProgress(g, [h("A", "CAD", 0, 25000, "g1"), h("B", "USD", 0, 99999, "g1"), h("C", "CAD", 0, 5000, "other")], new Date(Date.UTC(2026, 9, 20)));
    expect(r.savedMinor).toBe(25000);
    expect(r.pct).toBe(25);
    expect(r.remainingMinor).toBe(75000);
    expect(r.monthsLeft).toBe(3); // Nov, Dec, Jan (the 15th has not passed in January)
    expect(r.perMonthMinor).toBe(25000);
  });

  it("marks reached goals and passed deadlines", () => {
    const g = { id: "g", targetMinor: 1000, currency: "CAD", targetDate: new Date(Date.UTC(2020, 0, 1)) };
    expect(goalProgress(g, [h("A", "CAD", 0, 1500, "g")]).reached).toBe(true);
    const late = goalProgress(g, [h("A", "CAD", 0, 100, "g")], new Date(Date.UTC(2026, 0, 1)));
    expect(late.monthsLeft).toBe(0);
    expect(late.perMonthMinor).toBeNull();
  });
});
