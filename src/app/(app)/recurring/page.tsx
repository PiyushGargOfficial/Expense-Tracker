import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CURRENCIES, formatMinor } from "@/lib/money";
import { addRecurring, addSelectedRecurring, deleteRecurring } from "@/app/actions";

const nowMs = () => Date.now();

export default async function Recurring() {
  const user = await requireUser();
  const [items, categories] = await Promise.all([
    db.recurring.findMany({ where: { userId: user.id }, orderBy: { nextDate: "asc" }, include: { category: true } }),
    db.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
  ]);
  const soon = nowMs();
  // Average cost per month: weekly and biweekly items cost 52/12 and 26/12 payments a month, yearly ones 1/12.
  const perMonth = { DAILY: 365 / 12, WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, MONTHLY: 1, YEARLY: 1 / 12 } as const;
  const monthly: Record<string, number> = {};
  for (const r of items) monthly[r.currency] = (monthly[r.currency] ?? 0) + r.amountMinor * perMonth[r.frequency];
  const totals = Object.entries(monthly).map(([cur, v]) => [cur, Math.round(v)] as const);
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">Recurring &amp; subscriptions</h1>
      <section className="card space-y-1 lg:col-span-2" aria-label="Monthly total of recurring bills">
        <h2 className="font-semibold">Total per month</h2>
        {totals.length === 0 ? (
          <p className="text-muted">Add a recurring bill to see what it costs each month.</p>
        ) : (
          <>
            {totals.map(([cur, v]) => <div key={cur} className="text-2xl font-semibold">{formatMinor(v, cur)}</div>)}
            <p className="text-xs text-muted">{items.length} recurring {items.length === 1 ? "bill" : "bills"}. Weekly, biweekly and yearly bills are averaged into a monthly amount, so a biweekly bill counts 26/12 times a month.</p>
          </>
        )}
      </section>
      <form action={addSelectedRecurring} className="space-y-2">
        <ul className="card divide-y divide-line !p-0">
          {items.length === 0 && <li className="p-4 text-muted">Nothing recurring yet.</li>}
          {items.map((r) => {
            const days = Math.ceil((+r.nextDate - soon) / 86400000);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <input type="checkbox" name="ids" value={r.id} id={`rec-${r.id}`} className="size-5 shrink-0" aria-label={`Select ${r.title}`} />
                <label htmlFor={`rec-${r.id}`} className="min-w-0 flex-1">
                  <div>{r.title} <span className="text-xs text-muted">{r.frequency.toLowerCase()}</span></div>
                  <div className={`text-xs ${days <= r.remindDays ? "font-medium text-amber-600" : "text-muted"}`}>
                    {days <= 0 ? "Due now · " : days <= r.remindDays ? "Due soon · " : "Next: "}{r.nextDate.toISOString().slice(0, 10)}
                  </div>
                </label>
                <div className="flex items-center gap-3">
                  <span>{formatMinor(r.amountMinor, r.currency)}</span>
                  <button formAction={deleteRecurring.bind(null, r.id)} className="-m-2 p-2 text-xs text-muted underline">Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
        {items.length > 0 && (
          <>
            <button className="btn w-full">Add selected to expenses</button>
            <p className="text-xs text-muted">Recurring bills are not added to your expenses on their own. Tick the ones you have paid and add them; each moves on to its next date.</p>
          </>
        )}
      </form>
      <form action={addRecurring} className="card grid grid-cols-2 gap-2">
        <h2 className="col-span-2 font-semibold">Add recurring expense</h2>
        <input name="title" className="input col-span-2" placeholder="Netflix, Rent…" aria-label="Title" required />
        <input name="amount" inputMode="decimal" className="input" placeholder="Amount" aria-label="Amount" required />
        <select name="currency" className="input" aria-label="Currency" defaultValue={user.defaultCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="frequency" className="input" aria-label="Frequency" defaultValue="MONTHLY"><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every 2 weeks (biweekly)</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select>
        <input name="nextDate" type="date" className="input" aria-label="Next date" required />
        <select name="categoryId" className="input col-span-2" aria-label="Category"><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn col-span-2">Add</button>
      </form>
    </div>
  );
}
