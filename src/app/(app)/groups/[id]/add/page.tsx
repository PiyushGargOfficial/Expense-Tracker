import { db } from "@/lib/db";
import { requireUser, requireMember } from "@/lib/session";
import ExpenseForm from "@/components/ExpenseForm";
import type { SplitInput } from "@/lib/split";

export default async function AddExpense({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ recurring?: string }> }) {
  const { id } = await params;
  const { recurring } = await searchParams;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  const group = await db.group.findUniqueOrThrow({ where: { id }, include: { members: { where: { left: false }, orderBy: { name: "asc" } } } });
  const categories = await db.category.findMany({ where: { userId: user.id, parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const accounts = await db.account.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  // Opened from "Review & add" on a recurring group bill: the form starts filled in, and adding it moves the bill to its next date.
  const bill = recurring ? await db.recurring.findFirst({ where: { id: recurring, userId: user.id, groupId: id, active: true }, include: { category: true } }) : null;
  const gd = bill?.groupData as { payers: Record<string, number>; split: SplitInput } | null;
  const today = new Date();
  const initial = bill && gd ? {
    expenseId: "", title: bill.title, amountMinor: bill.amountMinor, currency: bill.currency,
    date: (bill.nextDate <= today ? bill.nextDate : today).toISOString().slice(0, 10), category: bill.category?.name ?? null,
    payers: gd.payers, split: gd.split, accountId: bill.accountId,
  } : undefined;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">{initial ? "Review recurring bill" : "Add expense"} · {group.name}</h1>
      {initial && <p className="text-sm text-muted">Check the amount and split, change anything for this time, then add it. The bill itself moves on to its next date and keeps its saved details.</p>}
      <ExpenseForm groupId={id} members={group.members.map((m) => ({ id: m.id, name: m.name }))} meId={me.id} defaultCurrency={group.defaultCurrency} categories={categories} accounts={accounts} initial={initial} fromRecurringId={initial ? bill!.id : undefined} />
    </div>
  );
}
