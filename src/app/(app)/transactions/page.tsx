import Link from "next/link";
import { db } from "@/lib/db";
import { txnOrderBy, txnWhere, type TxnFilter } from "@/lib/txnFilter";
import { requireUser } from "@/lib/session";
import { CURRENCIES, formatMinor } from "@/lib/money";

type SP = TxnFilter;

export default async function Transactions({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const where = txnWhere(user.id, sp);
  const orderBy = txnOrderBy(sp.sort);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")).toString();
  const [txns, cats, groups] = await Promise.all([
    db.transaction.findMany({ where, orderBy, take: 200, include: { category: true, account: true, groupExpense: { select: { group: { select: { name: true } } } } } }),
    db.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    db.group.findMany({ where: { deletedAt: null, members: { some: { userId: user.id } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">All transactions</h1>
      <form className="card grid grid-cols-2 gap-2 lg:sticky lg:top-8">
        <input name="q" defaultValue={sp.q} className="input col-span-2" placeholder="Search note, merchant, tag" aria-label="Search" />
        <select name="cat" defaultValue={sp.cat ?? ""} className="input" aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input" aria-label="Type"><option value="">All types</option><option value="EXPENSE">Expense</option><option value="INCOME">Income</option><option value="TRANSFER">Transfer</option><option value="INVEST">Invested</option></select>
        <select name="group" defaultValue={sp.group ?? ""} className="input col-span-2" aria-label="Group"><option value="">All (personal and group)</option><option value="none">Personal only</option>{groups.map((g) => <option key={g.id} value={g.id}>Group: {g.name}</option>)}</select>
        <select name="currency" defaultValue={sp.currency ?? ""} className="input col-span-2" aria-label="Currency"><option value="">All currencies</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="From" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="To" />
        <select name="sort" defaultValue={sp.sort ?? ""} className="input" aria-label="Sort"><option value="">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Largest first</option></select>
        <button className="btn">Apply</button>
      </form>
     <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted">{txns.length} result{txns.length === 1 ? "" : "s"}{txns.length === 200 ? " shown" : ""} · <a className="underline" href={`/api/export${exportQuery ? `?${exportQuery}` : ""}`}>Export CSV{exportQuery ? " (these filters)" : ""}</a></p>
      <ul className="card divide-y divide-line !p-0">
        {txns.map((t) => (
          <li key={t.id} className="flex justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0"><div className="truncate">{t.note || t.merchant || t.category?.name || t.type.toLowerCase()}</div><div className="text-xs text-muted">{t.date.toISOString().slice(0, 10)} · {t.type === "INVEST" ? "Invested" : t.category?.name ?? "Uncategorised"}{t.groupExpense ? ` · ${t.groupExpense.group.name}` : ""}</div></div>
            <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span>{formatMinor(t.amountMinor, t.currency)}</span>
              <Link className="-m-2 p-2 text-xs text-muted underline" href={`/transactions/${t.id}`}>{t.groupExpenseId ? "Open" : "Edit"}</Link>
            </div>
          </li>
        ))}
      </ul>
     </div>
    </div>
  );
}
