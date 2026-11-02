import AddSelectedForm from "@/components/AddSelectedForm";
import RecurringForm from "@/components/RecurringForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMinor } from "@/lib/money";
import { computeShares, type SplitInput } from "@/lib/split";
import { deleteRecurring } from "@/app/actions";

const nowMs = () => Date.now();

export default async function Recurring() {
  const user = await requireUser();
  const [items, categories, accounts, memberships] = await Promise.all([
    db.recurring.findMany({ where: { userId: user.id }, orderBy: { nextDate: "asc" }, include: { category: true } }),
    db.category.findMany({ where: { userId: user.id, parentId: null }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    db.member.findMany({ where: { userId: user.id, left: false }, include: { group: { include: { members: { where: { left: false }, orderBy: { name: "asc" } } } } } }),
  ]);
  const groups = memberships.map((m) => ({ id: m.group.id, name: m.group.name, meId: m.id, defaultCurrency: m.group.defaultCurrency, members: m.group.members.map((x) => ({ id: x.id, name: x.name })) }));
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;
  const typeLabel = { EXPENSE: "", INCOME: "Income", TRANSFER: "Transfer", INVEST: "Invested" } as const;
  const soon = nowMs();
  // Average cost per month: weekly and biweekly items cost 52/12 and 26/12 payments a month, yearly ones 1/12.
  const perMonth = { DAILY: 365 / 12, WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, MONTHLY: 1, YEARLY: 1 / 12 } as const;
  const monthly: Record<string, number> = {};
  // Only what you spend counts: income, transfers and investments are not costs, and a group bill counts your own share.
  const myCost = (r: (typeof items)[number]) => {
    const g = r.groupData as { payers: Record<string, number>; split: SplitInput } | null;
    const me = groups.find((x) => x.id === r.groupId)?.meId;
    if (!g || !me) return r.amountMinor;
    try { return computeShares(r.amountMinor, g.split, Object.keys(g.payers), r.currency)[me] ?? 0; } catch { return r.amountMinor; }
  };
  for (const r of items) if (r.type === "EXPENSE") monthly[r.currency] = (monthly[r.currency] ?? 0) + myCost(r) * perMonth[r.frequency];
  const totals = Object.entries(monthly).map(([cur, v]) => [cur, Math.round(v)] as const);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">Recurring &amp; subscriptions</h1>
      <section className="card space-y-1 lg:col-span-2" aria-label="Monthly total of recurring bills">
        <h2 className="font-semibold">Total per month</h2>
        {totals.length === 0 ? (
          <p className="text-muted">Add a recurring bill to see what it costs each month.</p>
        ) : (
          <>
            {totals.map(([cur, v]) => <div key={cur} className="text-2xl font-semibold">{formatMinor(v, cur)}</div>)}
            <p className="text-xs text-muted">{items.length} recurring {items.length === 1 ? "bill" : "bills"}. Income, transfers and investments are not counted, and a group bill counts your share. Weekly, biweekly and yearly bills are averaged into a monthly amount, so a biweekly bill counts 26/12 times a month.</p>
          </>
        )}
      </section>
      <AddSelectedForm hasItems={items.length > 0}>
        <ul className="card divide-y divide-line !p-0">
          {items.length === 0 && <li className="p-4 text-muted">Nothing recurring yet.</li>}
          {items.map((r) => {
            const days = Math.ceil((+r.nextDate - soon) / 86400000);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <input type="checkbox" name="ids" value={r.id} id={`rec-${r.id}`} className="size-5 shrink-0" aria-label={`Select ${r.title}`} />
                <label htmlFor={`rec-${r.id}`} className="min-w-0 flex-1">
                  <div>{r.title} <span className="text-xs text-muted">{r.frequency.toLowerCase()}</span></div>
                  <div className="text-xs text-muted">
                    {[typeLabel[r.type], groupName(r.groupId) ? `Group: ${groupName(r.groupId)}` : r.groupId ? "Group" : "", r.category?.name, accountName(r.accountId) && `${r.type === "INCOME" ? "Into" : "With"} ${accountName(r.accountId)}`, r.type === "TRANSFER" && accountName(r.toAccountId) ? `To ${accountName(r.toAccountId)}` : "", r.merchant, r.platform, r.tags.length ? r.tags.map((t) => `#${t}`).join(" ") : ""].filter(Boolean).join(" · ")}
                    {r.note ? ` — ${r.note}` : ""}
                  </div>
                  <div className={`text-xs ${days <= r.remindDays ? "font-medium text-amber-600" : "text-muted"}`}>
                    {days <= 0 ? "Due now · " : days <= r.remindDays ? "Due soon · " : "Next: "}{r.nextDate.toISOString().slice(0, 10)}
                  </div>
                </label>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span>{formatMinor(r.amountMinor, r.currency)}</span>
                  <button formAction={deleteRecurring.bind(null, r.id)} className="-m-2 p-2 text-xs text-muted underline">Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      </AddSelectedForm>
      <RecurringForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} groups={groups} currency={user.defaultCurrency} />
    </div>
  );
}
