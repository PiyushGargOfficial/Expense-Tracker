import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMinor } from "@/lib/money";
import { groupLedger, monthRange } from "@/lib/queries";
import QuickAdd from "@/components/QuickAdd";
import { deleteTxn } from "@/app/actions";

export default async function Home() {
  const user = await requireUser();
  const { start, end } = monthRange();
  const [categories, accounts, recent, month, memberships] = await Promise.all([
    db.category.findMany({ where: { userId: user.id, parentId: null }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { userId: user.id, archived: false } }),
    db.transaction.findMany({
      where: { userId: user.id }, orderBy: { date: "desc" }, take: 10,
      include: { category: true, account: true, groupExpense: { select: { amountMinor: true, currency: true, group: { select: { id: true, name: true } } } } },
    }),
    db.transaction.groupBy({ by: ["type", "currency"], where: { userId: user.id, date: { gte: start, lt: end } }, _sum: { amountMinor: true } }),
    db.member.findMany({ where: { userId: user.id, left: false }, include: { group: { include: { members: { where: { left: false }, select: { id: true } } } } } }),
  ]);
  const groupOpts = memberships.map((m) => ({ id: m.groupId, name: m.group.name, meId: m.id, memberIds: m.group.members.map((x) => x.id), currency: m.group.defaultCurrency }));
  const groupSpend = await db.transaction.groupBy({ by: ["currency"], where: { userId: user.id, type: "EXPENSE", groupExpenseId: { not: null }, date: { gte: start, lt: end } }, _sum: { amountMinor: true } });

  // Overall "you owe / you are owed" across all groups, per currency.
  const totals: Record<string, number> = {};
  const perGroup: { id: string; name: string; bal: Record<string, number> }[] = [];
  for (const m of memberships) {
    const { net } = await groupLedger(m.groupId);
    const bal: Record<string, number> = {};
    for (const [cur, b] of Object.entries(net)) if (b[m.id]) { bal[cur] = b[m.id]; totals[cur] = (totals[cur] ?? 0) + b[m.id]; }
    perGroup.push({ id: m.groupId, name: m.group.name, bal });
  }

  const sum = (type: string) => month.filter((r) => r.type === type);

  return (
    // One column on phones; on laptops and larger, entry + totals on the left, balances + history on the right.
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
     <div className="space-y-5 lg:sticky lg:top-8">
      <QuickAdd categories={categories} accounts={accounts} currency={user.defaultCurrency} groups={groupOpts} />

      <section className="grid grid-cols-2 gap-3" aria-label="This month">
        <div className="card">
          <div className="text-sm text-muted">Spent this month</div>
          {sum("EXPENSE").length ? sum("EXPENSE").map((r) => <div key={r.currency} className="break-words text-lg font-semibold sm:text-xl">{formatMinor(r._sum.amountMinor ?? 0, r.currency)}</div>) : <div className="text-lg font-semibold sm:text-xl">0</div>}
          {groupSpend.length > 0 && (
            <div className="mt-1 text-xs text-muted">
              incl. your share of group expenses: {groupSpend.map((g) => formatMinor(g._sum.amountMinor ?? 0, g.currency)).join(", ")}
            </div>
          )}
        </div>
        <div className="card">
          <div className="text-sm text-muted">Income this month</div>
          {sum("INCOME").length ? sum("INCOME").map((r) => <div key={r.currency} className="break-words text-lg font-semibold sm:text-xl">{formatMinor(r._sum.amountMinor ?? 0, r.currency)}</div>) : <div className="text-lg font-semibold sm:text-xl">0</div>}
        </div>
      </section>
     </div>

     <div className="space-y-5">
      {perGroup.length > 0 && (
        <section className="card" aria-label="Group balances">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">Across your groups</h2>
            <Link href="/groups" className="-m-2 p-2 text-sm underline">All groups</Link>
          </div>
          {Object.keys(totals).length === 0 ? (
            <p className="text-muted">You&apos;re all settled up.</p>
          ) : (
            Object.entries(totals).filter(([, v]) => v).map(([cur, v]) => (
              <p key={cur} className={v > 0 ? "text-emerald-600" : "text-red-600"}>
                {v > 0 ? "You are owed" : "You owe"} {formatMinor(Math.abs(v), cur)}
              </p>
            ))
          )}
          <ul className="mt-2 divide-y divide-line text-sm">
            {perGroup.map((g) => (
              <li key={g.id} className="flex justify-between py-1.5">
                <Link href={`/groups/${g.id}`} className="underline">{g.name}</Link>
                <span>{Object.entries(g.bal).map(([c, v]) => <span key={c} className={v > 0 ? "text-emerald-600" : "text-red-600"}>{v > 0 ? "+" : "-"}{formatMinor(Math.abs(v), c)} </span>)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Recent">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Recent</h2>
          <Link href="/transactions" className="-m-2 p-2 text-sm underline">Search all</Link>
        </div>
        {recent.length === 0 && <p className="text-muted">Nothing yet. Add your first expense above.</p>}
        <ul className="divide-y divide-line card !p-0">
          {recent.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate">{t.note || t.category?.name || t.type.toLowerCase()}</div>
                <div className="text-xs text-muted">
                  {t.date.toISOString().slice(0, 10)} · {t.category?.name ?? "Uncategorised"}{t.account ? ` · ${t.account.name}` : ""}
                  {t.groupExpense && (
                    <> · <Link className="underline" href={`/groups/${t.groupExpense.group.id}`}>{t.groupExpense.group.name}</Link>
                      {t.groupExpense.amountMinor !== t.amountMinor && ` (your share of ${formatMinor(t.groupExpense.amountMinor, t.groupExpense.currency)})`}</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={t.type === "INCOME" ? "text-emerald-600" : ""}>{t.type === "INCOME" ? "+" : t.type === "EXPENSE" ? "-" : ""}{formatMinor(t.amountMinor, t.currency)}</span>
                {t.groupExpense ? (
                  <Link className="-m-2 p-2 text-xs text-muted underline" href={`/groups/${t.groupExpense.group.id}/expenses/${t.groupExpenseId}`}>Open</Link>
                ) : (
                  <form action={deleteTxn.bind(null, t.id)}><button className="-m-2 p-2 text-xs text-muted underline" aria-label="Delete">Delete</button></form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
     </div>
    </div>
  );
}
