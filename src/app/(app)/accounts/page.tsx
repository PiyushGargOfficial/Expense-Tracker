import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMinor } from "@/lib/money";
import { creditSummary, deltaFor, kindLabel, type AcctTxn } from "@/lib/accounts";
import { monthRange } from "@/lib/queries";
import { setAccountArchived } from "@/app/actions";
import AccountForm, { AccountEdit, type AccountValues } from "@/components/AccountForm";

const fmtDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const dueText = (days: number) => (days === 0 ? "due today" : days === 1 ? "due tomorrow" : `in ${days} days`);

export default async function Accounts() {
  const user = await requireUser();
  const today = new Date();
  const { start, end } = monthRange(today);
  const [accounts, txns] = await Promise.all([
    db.account.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.transaction.findMany({
      where: { userId: user.id, OR: [{ accountId: { not: null } }, { toAccountId: { not: null } }] },
      orderBy: { date: "desc" },
      select: { id: true, type: true, amountMinor: true, currency: true, date: true, accountId: true, toAccountId: true, note: true, merchant: true, category: { select: { name: true } } },
    }),
  ]);
  const acctTxns: AcctTxn[] = txns;

  const rows = accounts.map((a) => {
    const { delta, skipped } = deltaFor(a.id, a.currency, acctTxns);
    const balance = a.openingMinor + delta;
    const mine = txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id);
    const inMonth = mine.filter((t) => t.currency === a.currency && t.date >= start && t.date < end);
    return {
      a, balance, skipped,
      spent: inMonth.filter((t) => t.type === "EXPENSE" && t.accountId === a.id).reduce((s, t) => s + t.amountMinor, 0),
      moneyIn: inMonth.filter((t) => (t.type === "INCOME" && t.accountId === a.id) || (t.type === "TRANSFER" && t.toAccountId === a.id)).reduce((s, t) => s + t.amountMinor, 0),
      recent: mine.slice(0, 5),
      credit: a.kind === "CREDIT" ? creditSummary(a, balance, a.id, a.currency, acctTxns, today) : null,
    };
  });
  const active = rows.filter((r) => !r.a.archived);
  const archived = rows.filter((r) => r.a.archived);

  // Per currency: what you hold, what you owe, and the net. Never added across currencies.
  const totals: Record<string, { have: number; owe: number }> = {};
  for (const r of active) {
    const t = (totals[r.a.currency] ??= { have: 0, owe: 0 });
    if (r.balance >= 0) t.have += r.balance; else t.owe += -r.balance;
  }
  const dueSoon = active.filter((r) => r.credit?.dueSoon);

  const values = (r: (typeof rows)[number]): AccountValues => ({
    id: r.a.id, name: r.a.name, kind: r.a.kind, currency: r.a.currency, institution: r.a.institution, last4: r.a.last4, balance: r.balance,
    creditLimitMinor: r.a.creditLimitMinor, statementDay: r.a.statementDay, dueDay: r.a.dueDay, aprBps: r.a.aprBps, minPaymentMinor: r.a.minPaymentMinor,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">Accounts</h1>

      <section className="card space-y-2 lg:col-span-2" aria-label="Summary">
        <h2 className="font-semibold">Overview</h2>
        {Object.keys(totals).length === 0 ? (
          <p className="text-muted">No accounts yet. Add one below.</p>
        ) : (
          Object.entries(totals).map(([cur, t]) => (
            <div key={cur} className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-xs text-muted">You have ({cur})</div><div className="text-lg font-semibold">{formatMinor(t.have, cur)}</div></div>
              <div><div className="text-xs text-muted">You owe ({cur})</div><div className={`text-lg font-semibold ${t.owe ? "text-red-600" : ""}`}>{formatMinor(t.owe, cur)}</div></div>
              <div><div className="text-xs text-muted">Net ({cur})</div><div className="text-lg font-semibold">{formatMinor(t.have - t.owe, cur)}</div></div>
            </div>
          ))
        )}
        {dueSoon.length > 0 && (
          <ul role="alert" className="space-y-0.5 pt-1 text-sm text-amber-600">
            {dueSoon.map((r) => (
              <li key={r.a.id}>{r.a.name}: payment {dueText(r.credit!.daysToDue!)} ({fmtDate(r.credit!.nextDue!)}), {formatMinor(r.credit!.owed, r.a.currency)} owed{r.a.minPaymentMinor ? `, minimum ${formatMinor(r.a.minPaymentMinor, r.a.currency)}` : ""}</li>
            ))}
          </ul>
        )}
      </section>

      <ul className="space-y-3">
        {active.map((r) => {
          const { a, credit: c } = r;
          const cur = a.currency;
          return (
            <li key={a.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-y-1">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted">{[kindLabel(a.kind), a.institution, a.last4 ? `••${a.last4}` : null, cur].filter(Boolean).join(" · ")}</div>
                </div>
                <AccountEdit account={values(r)} defaultCurrency={user.defaultCurrency}>
                  <form action={setAccountArchived.bind(null, a.id, true)}><button className="-m-2 p-2 underline">Archive</button></form>
                </AccountEdit>
              </div>

              {c ? (
                <>
                  <div className="mt-2">
                    <div className="text-xs text-muted">{c.overpaid ? "Credit balance" : "Amount owed"}</div>
                    <div className={`text-2xl font-semibold ${c.owed ? "text-red-600" : ""}`}>{formatMinor(c.overpaid || c.owed, cur)}</div>
                  </div>
                  {c.utilizationPct !== null && (
                    <div className="my-2">
                      <div className="h-2 overflow-hidden rounded bg-black/10 dark:bg-white/10" role="progressbar" aria-label="Credit used" aria-valuenow={Math.min(c.utilizationPct, 100)} aria-valuemin={0} aria-valuemax={100}>
                        <div className={`h-full ${c.utilizationPct >= 90 ? "bg-red-600" : c.utilizationPct >= 30 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.min(c.utilizationPct, 100)}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-muted">{c.utilizationPct}% of your limit used</div>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {a.creditLimitMinor != null && <Stat label="Credit limit" value={formatMinor(a.creditLimitMinor, cur)} />}
                    {c.available != null && <Stat label="Available credit" value={formatMinor(c.available, cur)} />}
                    {c.nextDue && <Stat label="Payment due" value={`${fmtDate(c.nextDue)} (${dueText(c.daysToDue!)})`} warn={c.dueSoon} />}
                    {a.minPaymentMinor != null && <Stat label="Minimum payment" value={formatMinor(a.minPaymentMinor, cur)} />}
                    {c.nextStatement && <Stat label="Next statement" value={fmtDate(c.nextStatement)} />}
                    {c.paidSinceStatement != null && <Stat label="Paid since last statement" value={formatMinor(c.paidSinceStatement, cur)} />}
                    {a.aprBps != null && <Stat label="Interest rate" value={`${(a.aprBps / 100).toFixed(2)}% a year`} />}
                    {c.monthlyInterest != null && <Stat label="Interest if unpaid, about" value={`${formatMinor(c.monthlyInterest, cur)} a month`} />}
                    <Stat label="Spent this month" value={formatMinor(r.spent, cur)} />
                    <Stat label="Payments this month" value={formatMinor(r.moneyIn, cur)} />
                  </dl>
                  {!a.dueDay && <p className="mt-2 text-xs text-muted">Add a payment due day with Edit to see when to pay.</p>}
                </>
              ) : (
                <>
                  <div className="mt-2">
                    <div className="text-xs text-muted">Current balance</div>
                    <div className={`text-2xl font-semibold ${r.balance < 0 ? "text-red-600" : ""}`}>{formatMinor(r.balance, cur)}</div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <Stat label="Spent this month" value={formatMinor(r.spent, cur)} />
                    <Stat label="Money in this month" value={formatMinor(r.moneyIn, cur)} />
                  </dl>
                </>
              )}

              {r.skipped > 0 && <p className="mt-2 text-xs text-muted">{r.skipped} transaction{r.skipped === 1 ? "" : "s"} in another currency {r.skipped === 1 ? "is" : "are"} not counted, because the balance is in {cur}.</p>}

              <div className="mt-3 border-t border-line pt-2">
                <div className="text-xs font-medium text-muted">Recent activity</div>
                {r.recent.length === 0 ? (
                  <p className="text-sm text-muted">No transactions yet. Pick this account when you add an expense.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {r.recent.map((t) => {
                      const incoming = t.toAccountId === a.id || (t.type === "INCOME" && t.accountId === a.id);
                      return (
                        <li key={t.id} className="flex justify-between gap-2 py-1.5">
                          <span className="min-w-0 truncate">{t.merchant || t.note || t.category?.name || (t.type === "TRANSFER" ? "Transfer" : "Transaction")} <span className="text-xs text-muted">{t.date.toISOString().slice(0, 10)}</span></span>
                          <span className={incoming ? "text-emerald-600" : ""}>{incoming ? "+" : "-"}{formatMinor(t.amountMinor, t.currency)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-5">
        <section className="card space-y-2" aria-label="Add an account">
          <h2 className="font-semibold">Add an account</h2>
          <AccountForm defaultCurrency={user.defaultCurrency} />
        </section>

        {archived.length > 0 && (
          <details className="card">
            <summary className="cursor-pointer font-semibold">Archived ({archived.length})</summary>
            <ul className="mt-2 divide-y divide-line text-sm">
              {archived.map((r) => (
                <li key={r.a.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{r.a.name} <span className="text-xs text-muted">{formatMinor(r.balance, r.a.currency)}</span></span>
                  <form action={setAccountArchived.bind(null, r.a.id, false)}><button className="-m-2 p-2 text-xs text-muted underline">Restore</button></form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={warn ? "font-medium text-amber-600" : ""}>{value}</dd>
    </div>
  );
}
