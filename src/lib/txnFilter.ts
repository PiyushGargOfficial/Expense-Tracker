import type { Prisma } from "@prisma/client";

export type TxnFilter = { q?: string; cat?: string; type?: string; sort?: string; from?: string; to?: string; group?: string; currency?: string };

const TYPES = ["EXPENSE", "INCOME", "TRANSFER", "INVEST"];
const validDate = (s: string | undefined) => (s && !Number.isNaN(new Date(s).getTime()) ? s : undefined);

/** The search filters shared by the All transactions page and its CSV export, so the file matches what is on screen. */
export function txnWhere(userId: string, sp: TxnFilter): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  if (sp.q) where.OR = [{ note: { contains: sp.q, mode: "insensitive" } }, { merchant: { contains: sp.q, mode: "insensitive" } }, { tags: { has: sp.q } }];
  if (sp.cat) where.categoryId = sp.cat;
  if (sp.group === "none") where.groupExpenseId = null;
  else if (sp.group) where.groupExpense = { groupId: sp.group };
  if (sp.currency) where.currency = sp.currency;
  if (sp.type && TYPES.includes(sp.type)) where.type = sp.type as "EXPENSE";
  const from = validDate(sp.from);
  const to = validDate(sp.to);
  if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) };
  return where;
}

export function txnOrderBy(sort: string | undefined): Prisma.TransactionOrderByWithRelationInput {
  return sort === "amount" ? { amountMinor: "desc" } : sort === "oldest" ? { date: "asc" } : { date: "desc" };
}
