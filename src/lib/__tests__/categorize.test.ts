import { describe, expect, it } from "vitest";
import { keywordCategory, mostFrequent } from "../categorize";

const cats = ["Food", "Groceries", "Transport", "Rent", "Bills", "Shopping", "Health", "Travel", "Entertainment", "Other"].map((name) => ({ id: name.toLowerCase(), name }));

describe("keywordCategory", () => {
  it("maps common words and merchants to the user's own categories", () => {
    expect(keywordCategory("Tim Hortons coffee", cats)).toBe("food");
    expect(keywordCategory("Costco run", cats)).toBe("groceries");
    expect(keywordCategory("Netflix", cats)).toBe("entertainment");
    expect(keywordCategory("Cineplex Membership", cats)).toBe("entertainment");
    expect(keywordCategory("March rent", cats)).toBe("rent");
    expect(keywordCategory("Hydro bill", cats)).toBe("bills");
  });
  it("puts food delivery ahead of rides and a gas bill ahead of fuel", () => {
    expect(keywordCategory("Uber Eats", cats)).toBe("food");
    expect(keywordCategory("Uber to airport", cats)).toBe("transport");
    expect(keywordCategory("gas bill", cats)).toBe("bills");
    expect(keywordCategory("gas station", cats)).toBe("transport");
  });
  it("matches whole words only", () => {
    expect(keywordCategory("Trentham", cats)).toBeNull(); // contains "rent" but is not it
    expect(keywordCategory("busy day", cats)).toBeNull();
  });
  it("only uses categories the user has, and falls through to the next candidate", () => {
    expect(keywordCategory("Lunch", [{ id: "x", name: "Dining" }])).toBe("x");
    expect(keywordCategory("Lunch", [{ id: "y", name: "Pets" }])).toBeNull();
  });
  it("returns null for nothing to go on", () => {
    expect(keywordCategory("", cats)).toBeNull();
    expect(keywordCategory(null, cats)).toBeNull();
    expect(keywordCategory("zzz", cats)).toBeNull();
  });
});

describe("mostFrequent", () => {
  it("picks the most used, and the newest on a tie", () => {
    expect(mostFrequent(["a", "b", "b", "c"])).toBe("b");
    expect(mostFrequent(["a", "b"])).toBe("a");
    expect(mostFrequent([])).toBeNull();
  });
});
