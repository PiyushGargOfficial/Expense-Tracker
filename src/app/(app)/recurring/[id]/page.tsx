import { notFound } from "next/navigation";
import RecurringForm from "@/components/RecurringForm";
import { minorToInput } from "@/lib/money";
import type { SplitInput } from "@/lib/split";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function EditRecurring({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const r = await db.recurring.findFirst({ where: { id, userId: user.id }, include: { category: true } });
  if (!r) notFound();
  const [categories, accounts, memberships] = await Promise.all([
    db.category.findMany({ where: { userId: user.id, parentId: null }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { userId: user.id, OR: [{ archived: false }, { id: { in: [r.accountId, r.toAccountId].filter(Boolean) as string[] } }] }, orderBy: { name: "asc" } }),
    db.member.findMany({ where: { userId: user.id, left: false, group: { deletedAt: null } }, include: { group: { include: { members: { where: { left: false }, orderBy: { name: "asc" } } } } } }),
  ]);
  const groups = memberships.map((m) => ({ id: m.group.id, name: m.group.name, meId: m.id, defaultCurrency: m.group.defaultCurrency, members: m.group.members.map((x) => ({ id: x.id, name: x.name })) }));
  const gd = r.groupData as { payers: Record<string, number>; split: SplitInput } | null;
  return (
    <div className="mx-auto max-w-2xl">
      <RecurringForm
        recurringId={r.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        groups={groups}
        currency={user.defaultCurrency}
        initial={{
          type: r.type, title: r.title, amount: minorToInput(r.amountMinor, r.currency), amountMinor: r.amountMinor, currency: r.currency, frequency: r.frequency,
          nextDate: r.nextDate.toISOString().slice(0, 10), categoryId: r.categoryId ?? "", categoryName: r.category?.name ?? null, accountId: r.accountId ?? "", toAccountId: r.toAccountId ?? "",
          merchant: r.merchant ?? "", note: r.note ?? "", tags: r.tags.join(", "), platform: r.platform ?? "",
          group: r.groupId && gd ? { groupId: r.groupId, payers: gd.payers, split: gd.split } : null,
        }}
      />
    </div>
  );
}
