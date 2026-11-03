import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { keywordCategory, mostFrequent } from "@/lib/categorize";

type Client = Prisma.TransactionClient | typeof db;

/**
 * A category for an entry the user saved without picking one. Only expenses and income get one.
 * First what this user chose before for the same merchant (then the same note); failing that, the built-in word list.
 * Returns null when nothing fits, so the entry stays uncategorised rather than being guessed wrongly.
 */
export async function autoCategoryId(c: Client, userId: string, e: { type: string; note?: string | null; merchant?: string | null }): Promise<string | null> {
  if (e.type !== "EXPENSE" && e.type !== "INCOME") return null;
  const merchant = (e.merchant ?? "").trim();
  const note = (e.note ?? "").trim();
  if (!merchant && !note) return null;

  for (const [field, value] of [["merchant", merchant], ["note", note]] as const) {
    if (!value) continue;
    const past = await c.transaction.findMany({
      where: { userId, deletedAt: null, type: e.type, categoryId: { not: null }, [field]: { equals: value, mode: "insensitive" } },
      orderBy: { createdAt: "desc" }, take: 20, select: { categoryId: true },
    });
    const id = mostFrequent(past.map((p) => p.categoryId as string));
    if (id) return id;
  }
  const categories = await c.category.findMany({ where: { userId }, select: { id: true, name: true } });
  return keywordCategory(`${merchant} ${note}`, categories);
}
