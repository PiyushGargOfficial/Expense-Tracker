import { db } from "@/lib/db";
import { requireUser, requireMember } from "@/lib/session";
import ExpenseForm from "@/components/ExpenseForm";

export default async function AddExpense({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  const group = await db.group.findUniqueOrThrow({ where: { id }, include: { members: { where: { left: false }, orderBy: { name: "asc" } } } });
  const categories = await db.category.findMany({ where: { userId: user.id, parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Add expense · {group.name}</h1>
      <ExpenseForm groupId={id} members={group.members.map((m) => ({ id: m.id, name: m.name }))} meId={me.id} defaultCurrency={group.defaultCurrency} categories={categories} />
    </div>
  );
}
