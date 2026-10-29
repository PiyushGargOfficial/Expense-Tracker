import { describe, expect, it } from "vitest";
import { passwordProblem } from "../password";
import { isLimited, recordHit, reset } from "../ratelimit";
import { csvCell } from "../csv";

describe("password policy", () => {
  it("rejects weak passwords", () => {
    expect(passwordProblem("short1")).toMatch(/10/);
    expect(passwordProblem("1234567890")).toMatch(/digits/);
    expect(passwordProblem("Password1")).not.toBeNull(); // too short
    expect(passwordProblem("a".repeat(80))).toMatch(/72/);
    expect(passwordProblem("piyushgarg-2026", "piyushgarg@x.com")).toMatch(/email/);
  });
  it("accepts a reasonable passphrase", () => expect(passwordProblem("blue-tractor-lamp-77")).toBeNull());
});

describe("rate limit", () => {
  it("blocks after max hits and recovers after the window", () => {
    reset("k");
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) recordHit("k", 60_000, t + i);
    expect(isLimited("k", 5, 60_000, t + 10)).toBe(true);
    expect(isLimited("k", 5, 60_000, t + 61_000)).toBe(false);
    reset("k");
    expect(isLimited("k", 5, 60_000, t)).toBe(false);
  });
});

describe("csv injection", () => {
  it("neutralises formulas but keeps negative numbers and quoting", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("lunch, with friends")).toBe('"lunch, with friends"');
  });
});
