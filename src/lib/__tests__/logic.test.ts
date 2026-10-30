import { describe, expect, it } from "vitest";
import { parseToMinor, formatMinor } from "../money";
import { computeShares, SplitError, allocate } from "../split";
import { computeNet, simplify } from "../balances";

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe("money", () => {
  it("parses to minor units without float errors", () => {
    expect(parseToMinor("450.5", "INR")).toBe(45050);
    expect(parseToMinor("0.1", "USD")).toBe(10);
    expect(parseToMinor("1,234.56", "USD")).toBe(123456);
    expect(parseToMinor("500", "JPY")).toBe(500);
    expect(parseToMinor("1.234", "USD")).toBeNull();
    expect(parseToMinor("abc", "USD")).toBeNull();
  });
  it("formats", () => expect(formatMinor(45050, "INR", "en-IN")).toContain("450.50"));
});

describe("split", () => {
  it("100 rupees / 3 gives the remainder to the payer and sums exactly", () => {
    const s = computeShares(10000, { type: "EQUAL", memberIds: ["a", "b", "c"] }, ["b"]);
    expect(sum(s)).toBe(10000);
    expect(s.b).toBe(3334);
    expect(s.a).toBe(3333);
  });
  it("always sums for awkward totals", () => {
    for (let total = 0; total < 200; total++) {
      expect(sum(computeShares(total, { type: "EQUAL", memberIds: ["a", "b", "c", "d", "e", "f", "g"] }))).toBe(total);
    }
  });
  it("exact must match", () => {
    expect(() => computeShares(100, { type: "EXACT", amounts: { a: 60, b: 30 } })).toThrow(SplitError);
    expect(computeShares(100, { type: "EXACT", amounts: { a: 60, b: 40 } })).toEqual({ a: 60, b: 40 });
  });
  it("percent uses basis points", () => {
    const s = computeShares(10000, { type: "PERCENT", percents: { a: 33.33, b: 33.33, c: 33.34 } });
    expect(sum(s)).toBe(10000);
    expect(s.c).toBe(3334);
    expect(() => computeShares(100, { type: "PERCENT", percents: { a: 50, b: 40 } })).toThrow();
  });
  it("shares weights", () => {
    expect(computeShares(1000, { type: "SHARES", shares: { a: 2, b: 1, c: 1 } })).toEqual({ a: 500, b: 250, c: 250 });
  });
  it("itemized spreads tax proportionally", () => {
    const s = computeShares(1100, {
      type: "ITEMIZED",
      items: [
        { amountMinor: 600, memberIds: ["a"] },
        { amountMinor: 400, memberIds: ["b"] },
      ],
    });
    expect(s).toEqual({ a: 660, b: 440 });
  });
  it("allocate ignores zero weights", () => expect(allocate(5, [1, 0, 1], [])).toEqual([3, 0, 2]));
});

describe("balances", () => {
  it("net + simplify settles everything", () => {
    const net = computeNet(
      [
        { currency: "INR", paid: { a: 30000 }, owed: { a: 10000, b: 10000, c: 10000 } },
        { currency: "INR", paid: { b: 15000 }, owed: { a: 5000, b: 5000, c: 5000 } },
      ],
      [],
    );
    expect(net.INR).toEqual({ a: 15000, b: 0, c: -15000 });
    expect(simplify(net)).toEqual([{ fromId: "c", toId: "a", amountMinor: 15000, currency: "INR" }]);
  });
  it("settlement reduces debt; currencies stay separate", () => {
    const net = computeNet(
      [
        { currency: "INR", paid: { a: 1000 }, owed: { b: 1000 } },
        { currency: "USD", paid: { b: 500 }, owed: { a: 500 } },
      ],
      [{ currency: "INR", fromId: "b", toId: "a", amountMinor: 400 }],
    );
    expect(net.INR).toEqual({ a: 600, b: -600 });
    expect(simplify(net)).toHaveLength(2);
  });
  it("three-way debts collapse to fewer transfers", () => {
    expect(simplify({ INR: { a: -100, b: 0, c: 100 } })).toHaveLength(1);
  });
});

describe("split error amounts", () => {
  it("shows decimals when a currency is given", () => {
    expect(() => computeShares(1431, { type: "EXACT", amounts: { a: 1331 } }, [], "CAD")).toThrow("Amounts add up to 13.31, expected 14.31");
  });
});
