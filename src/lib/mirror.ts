import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

/** What the person who entered the expense chose on the form; applied to that person's own row only. */
export type PersonalHints = { userId: string; categoryId?: string | null; accountId?: string | null; note?: string | null; paymentMethod?: string | null };

/**
 * Keeps every registered member's personal "Transaction" in step with a group expense. Each member's row holds
 * THEIR SHARE (what they actually spent), not the full bill; money fronted for others shows up as "lent" instead.
 * Rows are created, updated, or removed (expense deleted, or the member's share is 0).
 */
export async function syncMirrors(c: Client, expenseId: string, hints?: PersonalHints) {
  const e = await c.groupExpense.findUnique({
    where: { id: expenseId },
    include: { shares: true, group: { include: { members: true } } },
  });
  if (!e) return;

  for (const m of e.group.members) {
    if (!m.userId) continue; // name-only members have no personal ledger
    const share = e.shares.filter((s) => s.memberId === m.id).reduce((a, s) => a + s.owedMinor, 0);
    const where = { userId_groupExpenseId: { userId: m.userId, groupExpenseId: e.id } };

    if (e.deletedAt || share === 0) {
      await c.transaction.deleteMany({ where: { userId: m.userId, groupExpenseId: e.id } });
      continue;
    }

    const mine = hints && hints.userId === m.userId ? hints : undefined;
    // Only trust ids that belong to this user.
    const categoryId = mine?.categoryId && (await c.category.count({ where: { id: mine.categoryId, userId: m.userId } })) ? mine.categoryId : undefined;
    const accountId = mine?.accountId && (await c.account.count({ where: { id: mine.accountId, userId: m.userId } })) ? mine.accountId : undefined;
    const byName = !categoryId && e.category ? await c.category.findFirst({ where: { userId: m.userId, name: { equals: e.category, mode: "insensitive" } } }) : null;

    await c.transaction.upsert({
      where,
      update: {
        amountMinor: share,
        currency: e.currency,
        date: e.date,
        note: mine?.note || e.title,
        ...(categoryId ? { categoryId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(mine?.paymentMethod ? { paymentMethod: mine.paymentMethod } : {}),
      },
      create: {
        userId: m.userId,
        type: "EXPENSE",
        amountMinor: share,
        currency: e.currency,
        date: e.date,
        note: mine?.note || e.title,
        categoryId: categoryId ?? byName?.id ?? null,
        accountId: accountId ?? null,
        paymentMethod: mine?.paymentMethod ?? null,
        groupExpenseId: e.id,
      },
    });
  }
}

/** Re-syncs every expense in a group (used when a name-only member is claimed by a user). */
export async function syncGroupMirrors(groupId: string) {
  const expenses = await db.groupExpense.findMany({ where: { groupId }, select: { id: true } });
  for (const e of expenses) await syncMirrors(db, e.id);
}
