import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CURRENCIES, formatMinor } from "@/lib/money";
import { groupLedger, monthRange } from "@/lib/queries";
import Link from "next/link";
import { deleteBudget, setBudget } from "@/app/actions";
import BudgetEdit from "@/components/BudgetEdit";
import CadHint from "@/components/CadHint";
import { totalsByCurrency } from "@/lib/investments";
import { deltaFor } from "@/lib/accounts";

export default async function Budgets() {
  const user = await requireUser();
  const { start, end } = monthRange();
  const [budgets, categories, spent, investedNow, holdings, chequing, acctTxns] = await Promise.all([
    db.budget.findMany({ where: { userId: user.id }, include: { category: true } }),
    db.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    db.transaction.groupBy({ by: ["categoryId", "currency"], where: { userId: user.id, deletedAt: null, type: "EXPENSE", date: { gte: start, lt: end } }, _sum: { amountMinor: true } }),
    db.transaction.groupBy({ by: ["currency"], where: { userId: user.id, deletedAt: null, type: "INVEST", date: { gte: start, lt: end } }, _sum: { amountMinor: true } }),
    db.investment.findMany({ where: { userId: user.id }, select: { platform: true, currency: true, investedMinor: true, valueMinor: true } }),
    db.account.findMany({ where: { userId: user.id, kind: "BANK", archived: false } }),
    db.transaction.findMany({
      where: { userId: user.id, deletedAt: null, OR: [{ accountId: { not: null } }, { toAccountId: { not: null } }] },
      select: { type: true, amountMinor: true, currency: true, date: true, accountId: true, toAccountId: true },
    }),
  ]);
  // Investing is not spending, so it never uses up a budget; it is shown here with the balance it came out of.
  const portfolio = totalsByCurrency(holdings);
  const cash: Record<string, number> = {};
  for (const a of chequing) cash[a.currency] = (cash[a.currency] ?? 0) + a.openingMinor + deltaFor(a.id, a.currency, acctTxns).delta;
  // Lent out: money you paid on behalf of others that they haven't paid back yet, across all your groups.
  const memberships = await db.member.findMany({ where: { userId: user.id, left: false, group: { deletedAt: null } }, include: { group: { include: { members: true } } } });
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

  // Opens All transactions filtered to this budget: its category and currency, this month, largest first.
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const txnsHref = (b: (typeof budgets)[number]) => {
    const q = new URLSearchParams({ type: "EXPENSE", currency: b.currency, from: day(start), to: day(new Date(+end - 1)), sort: "amount" });
    if (b.categoryId) q.set("cat", b.categoryId);
    return `/transactions?${q}`;
  };
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
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
                <Link href={txnsHref(b)} className="font-medium underline-offset-2 hover:underline">{b.category?.name ?? "Overall"} <span aria-hidden className="text-muted">›</span></Link>
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

      <section className="card space-y-2" aria-label="Investments">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Investments</h2>
          <Link href="/investments" className="-m-2 p-2 text-xs underline">Investments</Link>
        </div>
        <p className="text-xs text-muted">Money you invest comes off your chequing balance but is not counted as spending or against any budget.</p>
        {[...new Set([...investedNow.map((r) => r.currency), ...Object.keys(portfolio), ...Object.keys(cash)])].map((cur) => (
          <dl key={cur} className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Invested this month ({cur})</dt><dd className="text-right font-semibold text-sky-600">{formatMinor(investedNow.find((r) => r.currency === cur)?._sum.amountMinor ?? 0, cur)}</dd>
            <dt className="text-muted">Total invested ({cur})</dt><dd className="text-right font-semibold">{formatMinor(portfolio[cur]?.investedMinor ?? 0, cur)}</dd>
            <dt className="text-muted">Portfolio value ({cur})</dt><dd className="text-right font-semibold">{formatMinor(portfolio[cur]?.valueMinor ?? 0, cur)}</dd>
            {cur in cash && <><dt className="text-muted">Chequing balance ({cur})</dt><dd className={`text-right font-semibold ${cash[cur] < 0 ? "text-red-600" : ""}`}>{formatMinor(cash[cur], cur)}</dd></>}
          </dl>
        ))}
        {investedNow.length === 0 && Object.keys(portfolio).length === 0 && <p className="text-sm text-muted">Nothing invested yet.</p>}
      </section>

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
        <CadHint amountName="limit" className="col-span-2" />
        <input name="alert" type="number" min={1} max={100} className="input" defaultValue={80} aria-label="Alert at percent" />
        <button className="btn col-span-2">Save budget</button>
      </form>
    </div>
  );
}
