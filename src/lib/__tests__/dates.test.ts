import { describe, expect, it } from "vitest";
import { todayInCanada, todayUtc } from "../dates";

describe("todayInCanada", () => {
  it("stays on the 4th in the evening, when UTC is already the 5th", () => {
    // 8:30pm in Toronto (EST) on 4 Nov 2026 is 01:30 UTC on the 5th.
    expect(todayInCanada(new Date("2026-11-05T01:30:00Z"))).toBe("2026-11-04");
  });
  it("moves to the next day after midnight Toronto time", () => {
    expect(todayInCanada(new Date("2026-11-05T05:30:00Z"))).toBe("2026-11-05");
  });
  it("handles daylight saving (EDT is UTC-4)", () => {
    expect(todayInCanada(new Date("2026-07-02T03:30:00Z"))).toBe("2026-07-01");
    expect(todayInCanada(new Date("2026-07-02T04:30:00Z"))).toBe("2026-07-02");
  });
  it("gives UTC midnight of that day for storing", () => {
    expect(todayUtc(new Date("2026-11-05T01:30:00Z")).toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });
});
