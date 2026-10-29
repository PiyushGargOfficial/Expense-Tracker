import { db } from "@/lib/db";

function advance(d: Date, f: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY"): Date {
  const n = new Date(d);
  if (f === "DAILY") n.setUTCDate(n.getUTCDate() + 1);
  else if (f === "WEEKLY") n.setUTCDate(n.getUTCDate() + 7);
  else if (f === "BIWEEKLY") n.setUTCDate(n.getUTCDate() + 14);
  else if (f === "MONTHLY") n.setUTCMonth(n.getUTCMonth() + 1);
  else n.setUTCFullYear(n.getUTCFullYear() + 1);
  return n;
}

/**
 * Adds the chosen recurring items to the expenses, one occurrence each, and moves each item on to its next date.
 * Nothing is posted automatically: recurring bills only count in totals once the user adds them here.
 * Idempotent via a clientId per occurrence. Returns how many were added.
 */
export async function addRecurringToExpenses(userId: string, ids: string[]) {
  const items = await db.recurring.findMany({ where: { userId, active: true, id: { in: ids } } });
  const today = new Date();
  for (const r of items) {
    const clientId = `rec:${r.id}:${r.nextDate.toISOString().slice(0, 10)}`;
    await db.transaction.upsert({
      where: { userId_clientId: { userId, clientId } },
      update: {},
      // A bill that isn't due yet is dated today, not in the future, so it counts in the month it was added.
      create: {
        userId, type: r.type, amountMinor: r.amountMinor, currency: r.currency, date: r.nextDate <= today ? r.nextDate : today, note: r.title,
        categoryId: r.categoryId, accountId: r.accountId, recurringId: r.id, clientId,
      },
    });
    await db.recurring.update({ where: { id: r.id }, data: { nextDate: advance(r.nextDate, r.frequency) } });
  }
  return items.length;
}
