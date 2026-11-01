import { describe, it, expect, beforeEach } from "vitest";
import { rateLabel, setRates, toCadMinor, FALLBACK_RATES } from "../fx";
import { formatMinor } from "../money";

describe("CAD equivalents", () => {
  beforeEach(() => setRates({ perCad: { ...FALLBACK_RATES.perCad, INR: 60, JPY: 100 }, asOf: "2026-11-01T00:00:00.000Z", live: true }));

  it("converts minor units at the current rate", () => {
    expect(toCadMinor(6000_00, "INR")).toBe(100_00); // INR 6,000.00 at 60 per CAD = CA$100.00
    expect(toCadMinor(5000, "CAD")).toBe(5000);
    expect(toCadMinor(10000, "JPY")).toBe(10000); // JPY 10,000 (no decimals) at 100 per CAD = CA$100.00
    expect(toCadMinor(100, "XXX")).toBeNull();
  });

  it("shows the CAD equivalent in brackets for other currencies only", () => {
    expect(formatMinor(6000_00, "INR", "en-IN")).toContain("(≈ CA$100.00)");
    expect(formatMinor(1234, "CAD")).not.toContain("≈");
  });

  it("states the rate both ways", () => {
    expect(rateLabel("INR")).toBe("1 INR = 0.0167 CAD · 1 CAD = 60.00 INR");
    expect(rateLabel("CAD")).toBeNull();
  });
});
