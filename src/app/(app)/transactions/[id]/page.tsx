import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import TxnEditForm from "@/components/TxnEditForm";

export default async function EditTransaction({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const t = await db.transaction.findFirst({ where: { id, userId: user.id, deletedAt: null }, include: { groupExpense: { select: { groupId: true } } } });
  if (!t) notFound();
  // A share of a group expense is edited from the group, where everyone's split stays in step.
  if (t.groupExpense) redirect(`/groups/${t.groupExpense.groupId}/expenses/${t.groupExpenseId}`);
  const [categories, accounts] = await Promise.all([
    db.category.findMany({ where: { userId: user.id, parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.account.findMany({ where: { userId: user.id, OR: [{ archived: false }, { id: { in: [t.accountId, t.toAccountId].filter(Boolean) as string[] } }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Edit {t.type === "INVEST" ? "investment" : t.type.toLowerCase()}</h1>
      <TxnEditForm
        txn={{
          id: t.id, type: t.type, amountMinor: t.amountMinor, currency: t.currency, date: t.date.toISOString().slice(0, 10), note: t.note ?? "", merchant: t.merchant ?? "",
          tags: t.tags, categoryId: t.categoryId ?? "", accountId: t.accountId ?? "", toAccountId: t.toAccountId ?? "",
        }}
        categories={categories}
        accounts={accounts}
      />
    </div>
  );
}
