import { describe, it, expect } from "vitest";
import { totalsByPerson, personKey } from "../balances";

const g = (name: string, meId: string, names: Record<string, string>, transfers: { fromId: string; toId: string; amountMinor: number; currency: string }[]) => ({ name, meId, names, transfers });

describe("totalsByPerson", () => {
  it("merges the same name across groups, ignoring case and spacing", () => {
    const out = totalsByPerson([
      g("Trip", "me1", { a1: "Meshwa" }, [{ fromId: "me1", toId: "a1", amountMinor: 1000, currency: "CAD" }]),
      g("Flat", "me2", { a2: " meshwa  " }, [{ fromId: "me2", toId: "a2", amountMinor: 2500, currency: "CAD" }]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lentToMe).toEqual({ CAD: 3500 });
    expect(out[0].groups).toEqual(["Trip", "Flat"]);
  });

  it("keeps currencies and directions apart and ignores transfers between others", () => {
    const out = totalsByPerson([
      g("Trip", "me", { a: "Sam", b: "Lee" }, [
        { fromId: "me", toId: "a", amountMinor: 500, currency: "USD" },
        { fromId: "a", toId: "me", amountMinor: 200, currency: "CAD" },
        { fromId: "a", toId: "b", amountMinor: 900, currency: "CAD" },
      ]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lentToMe).toEqual({ USD: 500 });
    expect(out[0].iLent).toEqual({ CAD: 200 });
    expect(personKey("  A  b ")).toBe("a b");
  });
});
