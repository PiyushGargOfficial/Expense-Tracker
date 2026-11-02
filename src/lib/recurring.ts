import { db } from "@/lib/db";
import { createGroupExpense, createTxn } from "@/lib/ops";

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
 * Adds the chosen recurring items, one occurrence each, and moves each item on to its next date.
 * An item is added the way a regular entry is: a normal transaction (expense, income, transfer or investment), or a
 * group expense with its payers and split, which also puts the user's share in their own spending.
 * Nothing is posted automatically: recurring bills only count in totals once the user adds them here.
 * Idempotent via a clientId per occurrence. Returns how many were added and what could not be.
 */
export async function addRecurringToExpenses(userId: string, ids: string[]) {
  const items = await db.recurring.findMany({ where: { userId, active: true, id: { in: ids } } });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  const today = new Date();
  let added = 0;
  const failed: string[] = [];
  for (const r of items) {
    const clientId = `rec:${r.id}:${r.nextDate.toISOString().slice(0, 10)}`;
    // A bill that isn't due yet is dated today, not in the future, so it counts in the month it was added.
    const date = (r.nextDate <= today ? r.nextDate : today).toISOString();
    try {
      if (r.groupId && r.groupData) {
        const member = await db.member.findFirst({ where: { groupId: r.groupId, userId, left: false, group: { deletedAt: null } } });
        if (!member) throw new Error("You are no longer in that group");
        const g = r.groupData as { payers: Record<string, number>; split: unknown };
        const category = r.categoryId ? (await db.category.findFirst({ where: { id: r.categoryId, userId }, select: { name: true } }))?.name ?? null : null;
        await createGroupExpense({ id: userId, name: user.name }, r.groupId, clientId, {
          title: r.title, category, amountMinor: r.amountMinor, currency: r.currency, date, payers: g.payers, split: g.split,
          personal: { categoryId: r.categoryId, accountId: r.accountId, note: r.note, paymentMethod: r.paymentMethod },
        });
      } else {
        await createTxn(userId, clientId, {
          type: r.type, amountMinor: r.amountMinor, currency: r.currency, date,
          // An investment is matched by name, so its title is the note; other entries keep their own note.
          note: r.type === "INVEST" ? r.title : r.note ?? r.title,
          merchant: r.merchant ?? undefined, paymentMethod: r.paymentMethod ?? undefined, tags: r.tags,
          categoryId: r.categoryId, accountId: r.accountId, toAccountId: r.type === "TRANSFER" ? r.toAccountId : null,
          platform: r.platform ?? undefined,
        });
      }
    } catch (e) {
      failed.push(`${r.title}: ${e instanceof Error ? e.message : "could not be added"}`);
      continue;
    }
    await db.recurring.update({ where: { id: r.id }, data: { nextDate: advance(r.nextDate, r.frequency) } });
    added++;
  }
  return { added, failed };
}
