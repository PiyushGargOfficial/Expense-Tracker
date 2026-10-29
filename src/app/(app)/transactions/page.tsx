import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMinor } from "@/lib/money";

type SP = { q?: string; cat?: string; type?: string; sort?: string; from?: string; to?: string; group?: string };

export default async function Transactions({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const where: Prisma.TransactionWhereInput = { userId: user.id };
  if (sp.q) where.OR = [{ note: { contains: sp.q, mode: "insensitive" } }, { merchant: { contains: sp.q, mode: "insensitive" } }, { tags: { has: sp.q } }];
  if (sp.cat) where.categoryId = sp.cat;
  if (sp.group === "none") where.groupExpenseId = null;
  else if (sp.group) where.groupExpense = { groupId: sp.group };
  if (sp.type) where.type = sp.type as "EXPENSE";
  if (sp.from || sp.to) where.date = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to) } : {}) };
  const orderBy: Prisma.TransactionOrderByWithRelationInput = sp.sort === "amount" ? { amountMinor: "desc" } : sp.sort === "oldest" ? { date: "asc" } : { date: "desc" };
  const [txns, cats, groups] = await Promise.all([
    db.transaction.findMany({ where, orderBy, take: 200, include: { category: true, account: true, groupExpense: { select: { group: { select: { name: true } } } } } }),
    db.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    db.group.findMany({ where: { members: { some: { userId: user.id } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">All transactions</h1>
      <form className="card grid grid-cols-2 gap-2 lg:sticky lg:top-8">
        <input name="q" defaultValue={sp.q} className="input col-span-2" placeholder="Search note, merchant, tag" aria-label="Search" />
        <select name="cat" defaultValue={sp.cat ?? ""} className="input" aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input" aria-label="Type"><option value="">All types</option><option value="EXPENSE">Expense</option><option value="INCOME">Income</option><option value="TRANSFER">Transfer</option></select>
        <select name="group" defaultValue={sp.group ?? ""} className="input col-span-2" aria-label="Group"><option value="">All (personal and group)</option><option value="none">Personal only</option>{groups.map((g) => <option key={g.id} value={g.id}>Group: {g.name}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="From" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="To" />
        <select name="sort" defaultValue={sp.sort ?? ""} className="input" aria-label="Sort"><option value="">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Largest first</option></select>
        <button className="btn">Apply</button>
      </form>
     <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted">{txns.length} result{txns.length === 1 ? "" : "s"} · <a className="underline" href="/api/export">Export CSV</a></p>
      <ul className="card divide-y divide-line !p-0">
        {txns.map((t) => (
          <li key={t.id} className="flex justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0"><div className="truncate">{t.note || t.merchant || t.category?.name || t.type.toLowerCase()}</div><div className="text-xs text-muted">{t.date.toISOString().slice(0, 10)} · {t.category?.name ?? "Uncategorised"}{t.groupExpense ? ` · ${t.groupExpense.group.name}` : ""}</div></div>
            <span>{formatMinor(t.amountMinor, t.currency)}</span>
          </li>
        ))}
      </ul>
     </div>
    </div>
  );
}
