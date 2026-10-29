import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { decimalsFor, formatMinor } from "@/lib/money";
import { BudgetBars, CategoryPie, MonthBars } from "@/components/Charts";
import { monthRange } from "@/lib/queries";

export default async function Reports({ searchParams }: { searchParams: Promise<{ cur?: string }> }) {
  const user = await requireUser();
  const { cur } = await searchParams;
  // Reports open in your default currency (CAD) unless another is picked (?cur=INR etc.).
  const currency = cur && /^[A-Za-z]{3}$/.test(cur) ? cur.toUpperCase() : user.defaultCurrency;
  const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 5, 1); since.setUTCHours(0, 0, 0, 0);
  const txns = await db.transaction.findMany({ where: { userId: user.id, type: "EXPENSE", currency, date: { gte: since } }, include: { category: true } });
  const div = 10 ** decimalsFor(currency);

  const byCat = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const byMerchant = new Map<string, number>();
  for (const t of txns) {
    byCat.set(t.category?.name ?? "Uncategorised", (byCat.get(t.category?.name ?? "Uncategorised") ?? 0) + t.amountMinor);
    const m = t.date.toISOString().slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amountMinor);
    const who = t.merchant || t.note;
    if (who) byMerchant.set(who, (byMerchant.get(who) ?? 0) + t.amountMinor);
  }
  const months = [...byMonth.entries()].sort();
  const last = months.at(-1)?.[1] ?? 0;
  const prev = months.at(-2)?.[1] ?? 0;
  const top = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  // Your default currency is always offered, alongside any currency you actually have transactions in.
  const used = (await db.transaction.findMany({ where: { userId: user.id }, distinct: ["currency"], select: { currency: true } })).map((c) => c.currency);
  const otherCurrencies = [...new Set([user.defaultCurrency, ...used])];

  // Budget vs used, per category. Budgets are monthly, so "used" is this month's spending only.
  const { start, end } = monthRange();
  const budgets = await db.budget.findMany({ where: { userId: user.id, currency }, include: { category: true } });
  const monthTxns = txns.filter((t) => t.date >= start && t.date < end);
  const usedBy = (categoryId: string | null) => monthTxns.filter((t) => categoryId === null || t.categoryId === categoryId).reduce((a, t) => a + t.amountMinor, 0);
  const budgetRows = budgets
    .map((b) => ({ name: b.category?.name ?? "Overall", budget: b.limitMinor / div, used: usedBy(b.categoryId) / div, order: b.categoryId === null ? 0 : 1 }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <div className="flex flex-wrap items-center justify-between gap-2 xl:col-span-2">
        <h1 className="text-xl font-bold">Reports ({currency})</h1>
        <div className="flex gap-2 text-sm">{otherCurrencies.map((c) => <a key={c} className={c === currency ? "font-semibold" : "underline"} aria-current={c === currency ? "true" : undefined} href={`/reports?cur=${c}`}>{c}</a>)}</div>
      </div>
      {txns.length === 0 && budgetRows.length === 0 ? <p className="text-muted">No expenses in {currency} for the last 6 months.</p> : (
        <>
          {txns.length > 0 && <section className="card">
            <h2 className="mb-1 font-semibold">Month over month</h2>
            {prev > 0 && <p className="mb-2 text-sm text-muted">{last >= prev ? "Up" : "Down"} {Math.abs(Math.round(((last - prev) / prev) * 100))}% vs last month ({formatMinor(prev, currency)} to {formatMinor(last, currency)})</p>}
            <MonthBars data={months.map(([month, v]) => ({ month, value: v / div }))} />
          </section>}
          <section className="card xl:row-span-2">
            <h2 className="mb-1 font-semibold">By category</h2>
            {txns.length > 0 && <CategoryPie data={[...byCat.entries()].map(([name, v]) => ({ name, value: v / div }))} />}
            <h3 className="mb-1 mt-4 text-sm font-medium">Budget vs used this month</h3>
            {budgetRows.length === 0 ? (
              <p className="text-sm text-muted">No {currency} budgets yet. <a className="underline" href="/budgets">Set one</a> to compare it here.</p>
            ) : (
              <>
                <BudgetBars data={budgetRows} currency={currency} />
                <ul className="mt-2 space-y-0.5 text-sm">
                  {budgetRows.map((r) => (
                    <li key={r.name} className="flex justify-between">
                      <span>{r.name}</span>
                      <span className={r.used > r.budget ? "text-red-600" : ""}>
                        {formatMinor(Math.round(r.used * div), currency)} of {formatMinor(Math.round(r.budget * div), currency)}
                        {r.used > r.budget ? ` · over by ${formatMinor(Math.round((r.used - r.budget) * div), currency)}` : r.used === r.budget ? " · completed" : ` · ${formatMinor(Math.round((r.budget - r.used) * div), currency)} left`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {txns.length > 0 && <section className="card">
            <h2 className="mb-2 font-semibold">Top merchants</h2>
            {top.length === 0 ? <p className="text-sm text-muted">Add a merchant or note to expenses to see this.</p> : (
              <ol className="space-y-1 text-sm">{top.map(([n, v]) => <li key={n} className="flex justify-between"><span>{n}</span><span>{formatMinor(v, currency)}</span></li>)}</ol>
            )}
          </section>}
        </>
      )}
    </div>
  );
}
