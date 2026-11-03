// Picks a category for an entry saved without one. Two steps, both private and local (no outside service):
// 1. what the user chose before for the same merchant or note (see autoCategory.ts), then
// 2. a built-in list of common words and merchants, matched against the user's own category names.

type Cat = { id: string; name: string };

/** First rule whose word matches wins, so more specific rules (food delivery) come before broader ones (rides). */
const RULES: { words: string[]; categories: string[] }[] = [
  { words: ["uber eats", "ubereats", "doordash", "skip the dishes", "skipthedishes", "restaurant", "cafe", "coffee", "tim hortons", "starbucks", "mcdonalds", "mcdonald's", "pizza", "burger", "lunch", "dinner", "breakfast", "brunch", "sushi", "takeout", "take out", "snack", "chai", "bakery"], categories: ["Food", "Dining", "Restaurants", "Eating out"] },
  { words: ["grocery", "groceries", "walmart", "costco", "loblaws", "no frills", "sobeys", "safeway", "freshco", "instacart", "supermarket", "metro grocery", "produce"], categories: ["Groceries", "Food"] },
  { words: ["hydro", "electricity", "internet", "wifi", "phone bill", "mobile plan", "rogers", "telus", "fido", "koodo", "insurance", "utilities", "water bill", "gas bill", "bill"], categories: ["Bills", "Utilities"] },
  { words: ["pharmacy", "shoppers drug", "doctor", "dentist", "clinic", "medicine", "prescription", "physio", "hospital", "gym"], categories: ["Health", "Healthcare", "Medical"] },
  { words: ["netflix", "spotify", "disney", "movie", "movies", "cinema", "cineplex", "concert", "steam", "youtube", "prime video", "theatre", "theater", "tickets", "subscription"], categories: ["Entertainment", "Fun"] },
  { words: ["flight", "airline", "air canada", "westjet", "hotel", "airbnb", "hostel", "vacation", "booking.com"], categories: ["Travel", "Vacation"] },
  { words: ["amazon", "shopping", "clothes", "clothing", "shoes", "ikea", "best buy", "mall", "zara"], categories: ["Shopping"] },
  { words: ["rent", "landlord", "lease"], categories: ["Rent", "Housing"] },
  { words: ["uber", "lyft", "taxi", "cab", "transit", "presto", "ttc", "gas", "fuel", "petro", "parking", "train", "bus", "toll", "car wash"], categories: ["Transport", "Transportation", "Commute"] },
];

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${escape(word)}([^a-z0-9]|$)`).test(text);

/** The built-in guess for some text, using only categories the user actually has. Null when nothing fits. */
export function keywordCategory(text: string | null | undefined, categories: Cat[]): string | null {
  const t = norm(text);
  if (!t) return null;
  for (const rule of RULES) {
    if (!rule.words.some((w) => hasWord(t, w))) continue;
    for (const name of rule.categories) {
      const match = categories.find((c) => norm(c.name) === norm(name));
      if (match) return match.id;
    }
  }
  return null;
}

/** The category used most often in the list; on a tie, the one that appears first (the list is newest first). */
export function mostFrequent(ids: string[]): string | null {
  const count = new Map<string, number>();
  for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  let best: string | null = null;
  for (const id of ids) if (best === null || count.get(id)! > count.get(best)!) best = id;
  return best;
}
