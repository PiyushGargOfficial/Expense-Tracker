"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { newClientId, submitOp } from "@/lib/outbox";
import { parseToMinor, CURRENCIES } from "@/lib/money";

type Opt = { id: string; name: string };
export type GroupOpt = { id: string; name: string; meId: string; memberIds: string[]; currency: string };

export default function QuickAdd({ categories, accounts, currency, groups }: { categories: Opt[]; accounts: (Opt & { currency: string })[]; currency: string; groups: GroupOpt[] }) {
  const router = useRouter();
  const amountRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<"EXPENSE" | "INCOME" | "TRANSFER">("EXPENSE");
  const [cur, setCur] = useState(currency);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [splitMode, setSplitMode] = useState<"me" | "equal">("me");
  const group = type === "EXPENSE" ? groups.find((g) => g.id === groupId) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountMinor = parseToMinor(amount, cur);
    if (!amountMinor) return setMsg({ text: `Enter a valid amount in ${cur}`, bad: true });
    setBusy(true);
    // With a group selected this becomes a group expense (paid by you); your share also lands in your personal
    // totals automatically, so nothing is entered twice.
    const catName = categories.find((c) => c.id === categoryId)?.name;
    const r = group
      ? await submitOp({
          kind: "groupExpense",
          groupId: group.id,
          clientId: newClientId(),
          data: {
            title: note.trim() || catName || "Expense",
            category: catName ?? null,
            amountMinor, currency: cur, date,
            payers: { [group.meId]: amountMinor },
            split: splitMode === "equal" ? { type: "EQUAL", memberIds: group.memberIds } : { type: "EXACT", amounts: { [group.meId]: amountMinor } },
            personal: { categoryId: categoryId || null, accountId: accountId || null, note: note.trim() || null },
          },
        })
      : await submitOp({
      kind: "txn",
      clientId: newClientId(),
      data: {
        type, amountMinor, currency: cur, date, note: note || undefined,
        categoryId: type === "TRANSFER" ? null : categoryId || null,
        accountId: accountId || null,
        toAccountId: type === "TRANSFER" ? toAccountId || null : null,
      },
    });
    setBusy(false);
    if (r.status === "error") return setMsg({ text: r.error, bad: true });
    setMsg({ text: r.status === "queued" ? "Saved offline. Will sync when you're back online." : "Added" });
    setAmount(""); setNote("");
    amountRef.current?.focus();
    if (r.status === "synced") router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div role="tablist" className="flex gap-1 text-sm">
        {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((t) => (
          <button type="button" key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)}
            className={`rounded-full px-3 py-1 ${type === t ? "bg-emerald-600 text-white" : "border border-line"}`}>
            {t[0] + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input ref={amountRef} autoFocus inputMode="decimal" placeholder="0.00" aria-label="Amount" className="input text-2xl font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select aria-label="Currency" className="input w-24" value={cur} onChange={(e) => setCur(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {type !== "TRANSFER" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {categories.map((c) => (
            <button type="button" key={c.id} aria-pressed={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)}
              className={`rounded-full border px-3 py-1 text-sm ${categoryId === c.id ? "border-emerald-600 bg-emerald-600/10" : "border-line"}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <select aria-label={type === "TRANSFER" ? "From account" : "Account"} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {type === "TRANSFER" ? (
          <select aria-label="To account" className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">To account…</option>
            {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          <input type="date" aria-label="Date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </div>
      <input placeholder="Note (optional)" aria-label="Note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />

      {type === "EXPENSE" && groups.length > 0 && (
        <div className="space-y-2 rounded-lg border border-line p-2">
          <select aria-label="Group" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group (personal only)</option>
            {groups.map((g) => <option key={g.id} value={g.id}>Add to group: {g.name}</option>)}
          </select>
          {group && (
            <div role="group" aria-label="Split" className="flex flex-wrap items-center gap-2 text-sm">
              {([["me", "Just me"], ["equal", `Equally with everyone (${group.memberIds.length})`]] as const).map(([k, label]) => (
                <button type="button" key={k} aria-pressed={splitMode === k} onClick={() => setSplitMode(k)}
                  className={`rounded-full px-3 py-1 ${splitMode === k ? "bg-emerald-600 text-white" : "border border-line"}`}>{label}</button>
              ))}
              <a className="underline" href={`/groups/${group.id}/add`}>More split options</a>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy}>Add</button>
        {msg && <span role="status" className={`text-sm ${msg.bad ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
