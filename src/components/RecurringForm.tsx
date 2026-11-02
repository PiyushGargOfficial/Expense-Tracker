"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { addRecurring } from "@/app/actions";
import { CURRENCIES } from "@/lib/money";
import { CadAmountHint } from "@/components/CadHint";
import ExpenseForm from "@/components/ExpenseForm";

type Opt = { id: string; name: string };
export type RecurringGroup = { id: string; name: string; meId: string; defaultCurrency: string; members: Opt[] };
type Type = "EXPENSE" | "INCOME" | "TRANSFER" | "INVEST";

const FREQUENCIES = [["DAILY", "Daily"], ["WEEKLY", "Weekly"], ["BIWEEKLY", "Every 2 weeks (biweekly)"], ["MONTHLY", "Monthly"], ["YEARLY", "Yearly"]] as const;

/**
 * Adds a recurring bill with the same options as a regular entry: its type, category, the account it is paid with,
 * merchant, note and tags, or a group expense with who pays and how it is split.
 */
export default function RecurringForm({ categories, accounts, groups, currency }: { categories: Opt[]; accounts: Opt[]; groups: RecurringGroup[]; currency: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"personal" | "group">("personal");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const group = groups.find((g) => g.id === groupId);

  const [type, setType] = useState<Type>("EXPENSE");
  const [cur, setCur] = useState(currency);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const invest = type === "INVEST";

  const [error, save, pending] = useActionState(async (_: string, f: FormData) => {
    const account = accounts.find((a) => a.id === accountId);
    const r = await addRecurring({
      type, title: f.get("title"), amount, currency: cur, frequency: f.get("frequency"), nextDate: f.get("nextDate"),
      categoryId: f.get("categoryId") || null, accountId: accountId || null, toAccountId: type === "TRANSFER" ? toAccountId || null : null,
      paymentMethod: account && type !== "TRANSFER" ? account.name : null,
      merchant: f.get("merchant") || null, note: f.get("note") || null, platform: f.get("platform") || null,
      tags: String(f.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (!r.ok) return r.error;
    setAmount("");
    router.refresh();
    return "";
  }, "");

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Add recurring bill</h2>
      <div role="tablist" className="flex gap-1 text-sm">
        {([["personal", "Personal"], ["group", "Group expense"]] as const).map(([k, label]) => (
          <button type="button" key={k} role="tab" aria-selected={mode === k} disabled={k === "group" && groups.length === 0} onClick={() => setMode(k)}
            className={`rounded-full px-3 py-1 disabled:opacity-50 ${mode === k ? "bg-emerald-600 text-white" : "border border-line"}`}>{label}</button>
        ))}
      </div>

      {mode === "group" && group ? (
        <div className="space-y-3">
          <select className="input" aria-label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <ExpenseForm key={group.id} recurring groupId={group.id} members={group.members} meId={group.meId} defaultCurrency={group.defaultCurrency} categories={categories} accounts={accounts} />
          <p className="text-xs text-muted">Each time you add this bill it becomes a group expense with these payers and this split, and your share also lands in your own spending.</p>
        </div>
      ) : (
        <form action={save} className="space-y-2">
          <div role="tablist" className="flex flex-wrap gap-1 text-sm">
            {(["EXPENSE", "INCOME", "TRANSFER", "INVEST"] as const).map((t) => (
              <button type="button" key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)}
                className={`rounded-full px-3 py-1 ${type === t ? "bg-emerald-600 text-white" : "border border-line"}`}>{t === "INVEST" ? "Invest" : t[0] + t.slice(1).toLowerCase()}</button>
            ))}
          </div>
          <input name="title" className="input" placeholder={invest ? "Investment name, e.g. XEQT" : "Netflix, Rent, Salary…"} aria-label={invest ? "Investment name" : "Title"} required />
          <div className="flex gap-2">
            <input inputMode="decimal" className="input" placeholder="Amount" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <select className="input w-24" aria-label="Currency" value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <CadAmountHint amount={amount} currency={cur} />
          <div className="grid grid-cols-2 gap-2">
            <select name="frequency" className="input" aria-label="Frequency" defaultValue="MONTHLY">{FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input name="nextDate" type="date" className="input" aria-label="Next date" required />
          </div>
          {type !== "TRANSFER" && !invest && (
            <select name="categoryId" className="input" aria-label="Category"><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select className="input" aria-label={type === "TRANSFER" ? "From account" : type === "INCOME" ? "Paid into" : "Paid with"} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{type === "TRANSFER" ? "From account…" : type === "INCOME" ? "Paid into: not specified" : "Paid with: not specified"}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {type === "TRANSFER" && (
              <select className="input" aria-label="To account" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">To account…</option>
                {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </div>
          {invest && <input name="platform" className="input" placeholder="Platform if this is a new investment, e.g. Questrade" aria-label="Platform" />}
          {!invest && <input name="merchant" className="input" placeholder="Merchant (optional)" aria-label="Merchant" />}
          {!invest && <input name="note" className="input" placeholder="Note (optional)" aria-label="Note" />}
          {!invest && <input name="tags" className="input" placeholder="Tags, separated by commas (optional)" aria-label="Tags" />}
          {invest && <p className="text-xs text-muted">Each time you add it, this goes onto the investment with that name and is not counted as spending.</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className="btn w-full" disabled={pending}>Add</button>
        </form>
      )}
    </div>
  );
}
