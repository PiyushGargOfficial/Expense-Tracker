// Server-side write operations. Every op is idempotent via clientId, so the offline
// queue can safely retry after a dropped connection without creating duplicates.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { computeShares, validatePayers, type SplitInput } from "@/lib/split";
import { syncMirrors } from "@/lib/mirror";
import { PAYMENT_VALUES, paymentLabel } from "@/lib/payment";

const minor = z.number().int().positive().max(1_000_000_000_00);
const currency = z.string().length(3).transform((s) => s.toUpperCase());
const date = z.string().transform((s, ctx) => {
  const d = new Date(s);
  if (isNaN(+d)) ctx.addIssue({ code: "custom", message: "Bad date" });
  return d;
});

export const txnSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  amountMinor: minor,
  currency,
  date,
  note: z.string().max(500).optional(),
  merchant: z.string().max(120).optional(),
  paymentMethod: z.string().max(40).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  categoryId: z.string().nullish(),
  accountId: z.string().nullish(),
  toAccountId: z.string().nullish(),
  receiptUrl: z.string().max(500_000).nullish(),
});

export async function createTxn(userId: string, clientId: string, raw: unknown) {
  const d = txnSchema.parse(raw);
  // Ownership checks: a user can only reference their own categories/accounts.
  const ids = [d.accountId, d.toAccountId].filter(Boolean) as string[];
  if (ids.length && (await db.account.count({ where: { id: { in: ids }, userId } })) !== ids.length) throw new Error("Bad account");
  if (d.categoryId && !(await db.category.count({ where: { id: d.categoryId, userId } }))) throw new Error("Bad category");
  if (d.type === "TRANSFER" && (!d.accountId || !d.toAccountId || d.accountId === d.toAccountId)) throw new Error("Pick two different accounts");

  const existing = await db.transaction.findUnique({ where: { userId_clientId: { userId, clientId } } });
  if (existing) return existing; // already applied
  return db.transaction.create({ data: { ...d, tags: d.tags, userId, clientId } });
}

export const splitSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EQUAL"), memberIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("EXACT"), amounts: z.record(z.string(), z.number().int().min(0)) }),
  z.object({ type: z.literal("PERCENT"), percents: z.record(z.string(), z.number().min(0).max(100)) }),
  z.object({ type: z.literal("SHARES"), shares: z.record(z.string(), z.number().int().min(0)) }),
  z.object({
    type: z.literal("ITEMIZED"),
    items: z.array(z.object({ amountMinor: z.number().int().min(0), memberIds: z.array(z.string()).min(1) })).min(1),
  }),
]);

export const groupExpenseSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.string().max(40).nullish(),
  amountMinor: minor,
  currency,
  date,
  payers: z.record(z.string(), z.number().int().min(0)),
  split: splitSchema,
  // What the person entering it picked for their own personal record (category, account, note).
  personal: z
    .object({
      categoryId: z.string().nullish(),
      accountId: z.string().nullish(),
      note: z.string().max(500).nullish(),
      paymentMethod: z.string().max(40).nullish(),
    })
    .optional(),
});

type Actor = { id: string; name: string };

async function groupMemberIds(groupId: string) {
  const ms = await db.member.findMany({ where: { groupId }, select: { id: true } });
  return new Set(ms.map((m) => m.id));
}

function buildLedger(d: z.infer<typeof groupExpenseSchema>, valid: Set<string>) {
  const payers = Object.fromEntries(Object.entries(d.payers).filter(([, v]) => v > 0));
  validatePayers(d.amountMinor, payers);
  const owed = computeShares(d.amountMinor, d.split as SplitInput, Object.keys(payers));
  for (const id of [...Object.keys(payers), ...Object.keys(owed)]) if (!valid.has(id)) throw new Error("Unknown member in expense");
  return { payers, owed: Object.fromEntries(Object.entries(owed).filter(([, v]) => v > 0)) };
}

async function audit(tx: Prisma.TransactionClient, groupId: string, actor: Actor, action: string, targetId: string | null, summary: string, before?: unknown, after?: unknown) {
  await tx.auditLog.create({
    data: {
      groupId,
      actorId: actor.id,
      actorName: actor.name,
      action,
      targetId,
      summary,
      before: before as Prisma.InputJsonValue | undefined,
      after: after as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function createGroupExpense(actor: Actor, groupId: string, clientId: string, raw: unknown) {
  const d = groupExpenseSchema.parse(raw);
  const existing = await db.groupExpense.findUnique({ where: { groupId_clientId: { groupId, clientId } } });
  if (existing) return existing;
  const { payers, owed } = buildLedger(d, await groupMemberIds(groupId));
  return db.$transaction(async (tx) => {
    const e = await tx.groupExpense.create({
      data: {
        groupId,
        title: d.title,
        category: d.category ?? null,
        amountMinor: d.amountMinor,
        currency: d.currency,
        date: d.date,
        splitType: d.split.type,
        splitInput: d.split as Prisma.InputJsonValue,
        createdById: actor.id,
        clientId,
        payers: { create: Object.entries(payers).map(([memberId, paidMinor]) => ({ memberId, paidMinor })) },
        shares: { create: Object.entries(owed).map(([memberId, owedMinor]) => ({ memberId, owedMinor })) },
      },
    });
    await audit(tx, groupId, actor, "expense.create", e.id, `Added "${d.title}"`, undefined, { amountMinor: d.amountMinor, currency: d.currency, payers, owed });
    await syncMirrors(tx, e.id, { userId: actor.id, ...d.personal });
    return e;
  });
}

// The expense is always looked up WITH its group: the caller's membership/admin role was verified
// for `groupId`, so an expense id from any other group must behave as "not found".
export async function updateGroupExpense(actor: Actor, isAdmin: boolean, groupId: string, expenseId: string, raw: unknown) {
  const d = groupExpenseSchema.parse(raw);
  const old = await db.groupExpense.findFirst({ where: { id: expenseId, groupId }, include: { payers: true, shares: true } });
  if (!old || old.deletedAt) throw new Error("Expense not found");
  if (old.createdById !== actor.id && !isAdmin) throw new Error("Only the creator or a group admin can edit this");
  const { payers, owed } = buildLedger(d, await groupMemberIds(old.groupId));
  return db.$transaction(async (tx) => {
    await tx.expensePayer.deleteMany({ where: { expenseId } });
    await tx.expenseShare.deleteMany({ where: { expenseId } });
    const e = await tx.groupExpense.update({
      where: { id: expenseId },
      data: {
        title: d.title,
        category: d.category ?? null,
        amountMinor: d.amountMinor,
        currency: d.currency,
        date: d.date,
        splitType: d.split.type,
        splitInput: d.split as Prisma.InputJsonValue,
        payers: { create: Object.entries(payers).map(([memberId, paidMinor]) => ({ memberId, paidMinor })) },
        shares: { create: Object.entries(owed).map(([memberId, owedMinor]) => ({ memberId, owedMinor })) },
      },
    });
    await audit(tx, old.groupId, actor, "expense.update", e.id, `Edited "${d.title}"`,
      { title: old.title, amountMinor: old.amountMinor, payers: old.payers, shares: old.shares },
      { title: d.title, amountMinor: d.amountMinor, payers, owed });
    await syncMirrors(tx, e.id, { userId: actor.id, ...d.personal });
    return e;
  });
}

export async function deleteGroupExpense(actor: Actor, isAdmin: boolean, groupId: string, expenseId: string) {
  const old = await db.groupExpense.findFirst({ where: { id: expenseId, groupId } });
  if (!old || old.deletedAt) throw new Error("Expense not found");
  if (old.createdById !== actor.id && !isAdmin) throw new Error("Only the creator or a group admin can delete this");
  await db.$transaction(async (tx) => {
    await tx.groupExpense.update({ where: { id: expenseId }, data: { deletedAt: new Date() } }); // soft delete keeps history
    await audit(tx, old.groupId, actor, "expense.delete", expenseId, `Deleted "${old.title}"`, { amountMinor: old.amountMinor });
    await syncMirrors(tx, expenseId); // removes everyone's personal rows for this expense
  });
}

export const settlementSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  amountMinor: minor,
  currency,
  // A queued offline payment from before this change may still say "upi"; treat it as an e-Transfer.
  method: z.preprocess((v) => (v === "upi" ? "etransfer" : v), z.enum(PAYMENT_VALUES)).default("cash"),
  note: z.string().max(200).optional(),
  date: date.optional(),
});

export async function createSettlement(actor: Actor, groupId: string, clientId: string, raw: unknown) {
  const d = settlementSchema.parse(raw);
  if (d.fromId === d.toId) throw new Error("Pick two different people");
  const existing = await db.settlement.findUnique({ where: { groupId_clientId: { groupId, clientId } } });
  if (existing) return existing;
  const valid = await groupMemberIds(groupId);
  if (!valid.has(d.fromId) || !valid.has(d.toId)) throw new Error("Unknown member");
  return db.$transaction(async (tx) => {
    const s = await tx.settlement.create({
      data: { groupId, fromId: d.fromId, toId: d.toId, amountMinor: d.amountMinor, currency: d.currency, method: d.method, note: d.note, date: d.date ?? new Date(), clientId, createdById: actor.id },
    });
    await audit(tx, groupId, actor, "settle", s.id, `Recorded a payment (${paymentLabel(d.method)})`, undefined, d);
    return s;
  });
}

/** Undo a recorded payment. Soft delete, so the history and audit trail stay; balances recompute without it. */
export async function deleteSettlement(actor: Actor, isAdmin: boolean, groupId: string, settlementId: string) {
  // Looked up together with the group, so an id from another group is "not found" (same rule as expenses).
  const s = await db.settlement.findFirst({ where: { id: settlementId, groupId, deletedAt: null } });
  if (!s) throw new Error("Payment not found");
  if (s.createdById !== actor.id && !isAdmin) throw new Error("Only whoever recorded this payment, or a group admin, can undo it");
  await db.$transaction(async (tx) => {
    await tx.settlement.update({ where: { id: settlementId }, data: { deletedAt: new Date() } });
    await audit(tx, groupId, actor, "settle.undo", settlementId, "Undid a payment", { amountMinor: s.amountMinor, currency: s.currency, fromId: s.fromId, toId: s.toId });
  });
}
