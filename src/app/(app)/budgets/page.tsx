import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CURRENCIES, formatMinor } from "@/lib/money";
import { groupLedger, monthRange } from "@/lib/queries";
import Link from "next/link";
import { deleteBudget, setBudget } from "@/app/actions";
import BudgetEdit from "@/components/BudgetEdit";

export default async function Budgets() {
  const user = await requireUser();
  const { start, end } = monthRange();
  const [budgets, categories, spent] = await Promise.all([
    db.budget.findMany({ where: { userId: user.id }, include: { category: true } }),
    db.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    db.transaction.groupBy({ by: ["categoryId", "currency"], where: { userId: user.id, type: "EXPENSE", date: { gte: start, lt: end } }, _sum: { amountMinor: true } }),
  ]);
  // Lent out: money you paid on behalf of others that they haven't paid back yet, across all your groups.
  const memberships = await db.member.findMany({ where: { userId: user.id, left: false }, include: { group: { include: { members: true } } } });
  const lent: { groupId: string; group: string; owes: { name: string; amountMinor: number; currency: string }[] }[] = [];
  const lentTotals: Record<string, number> = {};
  const borrowedTotals: Record<string, number> = {};
  for (const m of memberships) {
    const { net, transfers } = await groupLedger(m.groupId);
    for (const [cur, b] of Object.entries(net)) {
      if ((b[m.id] ?? 0) < 0) borrowedTotals[cur] = (borrowedTotals[cur] ?? 0) - b[m.id];
    }
    const owes = transfers
      .filter((t) => t.toId === m.id)
      .map((t) => ({ name: m.group.members.find((x) => x.id === t.fromId)?.name ?? "?", amountMinor: t.amountMinor, currency: t.currency }));
    for (const o of owes) lentTotals[o.currency] = (lentTotals[o.currency] ?? 0) + o.amountMinor;
    if (owes.length) lent.push({ groupId: m.groupId, group: m.group.name, owes });
  }

  const used = (b: (typeof budgets)[number]) =>
    spent.filter((s) => s.currency === b.currency && (b.categoryId === null || s.categoryId === b.categoryId)).reduce((a, s) => a + (s._sum.amountMinor ?? 0), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">Monthly budgets</h1>
      <ul className="space-y-3">
        {budgets.length === 0 && <li className="text-muted">No budgets yet.</li>}
        {budgets.map((b) => {
          const u = used(b);
          // Compare real amounts, not a rounded percentage: spending exactly the budget is "completed", not "over".
          const pct = Math.floor((u / b.limitMinor) * 100); // floor so 99.6% never shows as 100%
          const over = u > b.limitMinor;
          const completed = u === b.limitMinor;
          const warn = u * 100 >= b.alertAtPct * b.limitMinor;
          return (
            <li key={b.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-y-1">
                <span className="font-medium">{b.category?.name ?? "Overall"}</span>
                <BudgetEdit id={b.id} currency={b.currency} limitMinor={b.limitMinor} alertAtPct={b.alertAtPct}>
                  <form action={deleteBudget.bind(null, b.id)}><button className="-m-2 p-2 underline">Remove</button></form>
                </BudgetEdit>
              </div>
              <div className="my-2 h-2 overflow-hidden rounded bg-black/10 dark:bg-white/10" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full ${over ? "bg-red-600" : warn ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="text-sm">{formatMinor(u, b.currency)} of {formatMinor(b.limitMinor, b.currency)} ({pct}%)</div>
              {warn && (
                <p role="alert" className={`text-sm ${over ? "text-red-600" : "text-amber-600"}`}>
                  {over ? `Over budget by ${formatMinor(u - b.limitMinor, b.currency)}` : completed ? "Budget completed" : `You have passed ${b.alertAtPct}% of this budget`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <section className="card space-y-2" aria-label="Lent out">
        <h2 className="font-semibold">Lent out</h2>
        <p className="text-xs text-muted">Money you paid for others in groups that hasn&apos;t come back yet. It is not counted as your spending or against budgets.</p>
        {Object.keys(lentTotals).length === 0 ? (
          <p className="text-muted">Nothing lent out. Everyone has paid you back.</p>
        ) : (
          <>
            {Object.entries(lentTotals).map(([cur, v]) => <div key={cur} className="text-2xl font-semibold text-emerald-600">{formatMinor(v, cur)}</div>)}
            <ul className="divide-y divide-line text-sm">
              {lent.map((g) => (
                <li key={g.groupId} className="py-2">
                  <Link href={`/groups/${g.groupId}`} className="font-medium underline">{g.group}</Link>
                  <ul className="mt-1 space-y-0.5">
                    {g.owes.map((o, i) => <li key={i} className="flex justify-between"><span>{o.name} owes you</span><span>{formatMinor(o.amountMinor, o.currency)}</span></li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
        {Object.keys(borrowedTotals).length > 0 && (
          <p className="text-sm text-muted">You owe others: {Object.entries(borrowedTotals).map(([c, v]) => formatMinor(v, c)).join(", ")}</p>
        )}
      </section>

      <form action={setBudget} className="card grid grid-cols-2 gap-2">
        <h2 className="col-span-2 font-semibold">Set a budget</h2>
        <select name="categoryId" className="input" aria-label="Category"><option value="">Overall</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="currency" className="input" aria-label="Currency" defaultValue={user.defaultCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        <input name="limit" inputMode="decimal" className="input" placeholder="Monthly limit" aria-label="Monthly limit" required />
        <input name="alert" type="number" min={1} max={100} className="input" defaultValue={80} aria-label="Alert at percent" />
        <button className="btn col-span-2">Save budget</button>
      </form>
    </div>
  );
}
