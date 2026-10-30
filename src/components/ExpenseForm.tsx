"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { newClientId, submitOp } from "@/lib/outbox";
import { CURRENCIES, minorToInput, parseToMinor } from "@/lib/money";
import { computeShares, SplitError, type SplitInput } from "@/lib/split";
import { editExpense } from "@/app/actions";

type M = { id: string; name: string };
type Initial = {
  expenseId: string;
  title: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: string | null;
  payers: Record<string, number>;
  split: SplitInput;
};
type Tab = "EQUAL" | "EXACT" | "PERCENT" | "SHARES" | "ITEMIZED";
type ItemRow = { amount: string; memberIds: string[] };

const TABS: { id: Tab; label: string }[] = [
  { id: "EQUAL", label: "Equally" },
  { id: "EXACT", label: "Amounts" },
  { id: "PERCENT", label: "Percent" },
  { id: "SHARES", label: "Shares" },
  { id: "ITEMIZED", label: "By item" },
];

export default function ExpenseForm({ groupId, members, meId, defaultCurrency, initial, categories = [] }: { groupId: string; members: M[]; meId: string; defaultCurrency: string; initial?: Initial; categories?: M[] }) {
  const router = useRouter();
  const all = members.map((m) => m.id);
  const init = initial?.split;
  const initCur = initial?.currency ?? defaultCurrency;
  const toStr = (o: Record<string, number>, f: (n: number) => string) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial ? minorToInput(initial.amountMinor, initCur) : "");
  const [cur, setCur] = useState(initCur);
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const initPayers = initial ? Object.keys(initial.payers) : [meId];
  const [multiPay, setMultiPay] = useState(initPayers.length > 1);
  const [payerId, setPayerId] = useState(initPayers[0] ?? meId);
  const [payAmts, setPayAmts] = useState<Record<string, string>>(initial ? toStr(initial.payers, (n) => minorToInput(n, initCur)) : {});

  const [tab, setTab] = useState<Tab>(init?.type ?? "EQUAL");
  const [eq, setEq] = useState<string[]>(init?.type === "EQUAL" ? init.memberIds : all);
  const [exact, setExact] = useState<Record<string, string>>(init?.type === "EXACT" ? toStr(init.amounts, (n) => minorToInput(n, initCur)) : {});
  const [pct, setPct] = useState<Record<string, string>>(init?.type === "PERCENT" ? toStr(init.percents, String) : {});
  const [shr, setShr] = useState<Record<string, string>>(init?.type === "SHARES" ? toStr(init.shares, String) : Object.fromEntries(all.map((i) => [i, "1"])));
  const [items, setItems] = useState<ItemRow[]>(init?.type === "ITEMIZED" ? init.items.map((i) => ({ amount: minorToInput(i.amountMinor, initCur), memberIds: i.memberIds })) : [{ amount: "", memberIds: all }]);

  const [categoryId, setCategoryId] = useState(() => categories.find((c) => c.name.toLowerCase() === (initial?.category ?? "").toLowerCase())?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = parseToMinor(amount, cur);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
  const num = (s: string | undefined) => Number(s) || 0;

  function build(): { payers: Record<string, number>; split: SplitInput } {
    if (!total) throw new SplitError(`Enter a valid amount in ${cur}`);
    let payers: Record<string, number>;
    if (!multiPay) payers = { [payerId]: total };
    else {
      payers = {};
      for (const id of all) { const v = parseToMinor(payAmts[id] || "0", cur); if (v === null) throw new SplitError("Bad payer amount"); if (v) payers[id] = v; }
    }
    let split: SplitInput;
    if (tab === "EQUAL") split = { type: "EQUAL", memberIds: eq };
    else if (tab === "EXACT") {
      const amounts: Record<string, number> = {};
      for (const id of all) { const v = parseToMinor(exact[id] || "0", cur); if (v === null) throw new SplitError("Bad amount"); if (v) amounts[id] = v; }
      split = { type: "EXACT", amounts };
    } else if (tab === "PERCENT") split = { type: "PERCENT", percents: Object.fromEntries(all.filter((id) => num(pct[id]) > 0).map((id) => [id, num(pct[id])])) };
    else if (tab === "SHARES") split = { type: "SHARES", shares: Object.fromEntries(all.filter((id) => num(shr[id]) > 0).map((id) => [id, Math.round(num(shr[id]))])) };
    else {
      split = { type: "ITEMIZED", items: items.map((it) => ({ amountMinor: parseToMinor(it.amount || "0", cur) ?? 0, memberIds: it.memberIds })).filter((i) => i.amountMinor > 0) };
    }
    computeShares(total, split, Object.keys(payers), cur); // validates before we send anything
    return { payers, split };
  }

  // Live preview of what each person owes, so mistakes are visible before saving.
  let preview: Record<string, number> | null = null;
  try { if (total) { const b = build(); preview = computeShares(total, b.split, Object.keys(b.payers)); } } catch { preview = null; }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Add a description");
    let built;
    try { built = build(); } catch (err) { return setError(err instanceof SplitError || err instanceof Error ? err.message : "Invalid"); }
    setBusy(true);
    const catName = categories.find((c) => c.id === categoryId)?.name ?? null;
    // `personal` lets your own share land in your Home totals under the category you picked.
    const data = { title: title.trim(), category: catName, amountMinor: total!, currency: cur, date, payers: built.payers, split: built.split, personal: { categoryId: categoryId || null } };
    try {
      if (initial) {
        await editExpense(groupId, initial.expenseId, data);
        router.push(`/groups/${groupId}`);
      } else {
        const r = await submitOp({ kind: "groupExpense", groupId, clientId: newClientId(), data });
        if (r.status === "error") { setError(r.error); return; }
        router.push(`/groups/${groupId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <form onSubmit={submit} className="space-y-4">
      <input className="input" placeholder="What was it for?" aria-label="Description" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <div className="flex gap-2">
        <input className="input text-xl font-semibold" inputMode="decimal" placeholder="0.00" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="input w-24" aria-label="Currency" value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <input type="date" className="input" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
      {categories.length > 0 && (
        <select className="input" aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      <fieldset className="card space-y-2">
        <legend className="px-1 text-sm text-muted">Paid by</legend>
        {!multiPay ? (
          <select className="input" aria-label="Paid by" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.id === meId ? "You" : m.name}</option>)}
          </select>
        ) : (
          members.map((m) => (
            <label key={m.id} className="flex items-center justify-between gap-3">
              <span>{m.id === meId ? "You" : m.name}</span>
              <input className="input w-32" inputMode="decimal" placeholder="0.00" value={payAmts[m.id] ?? ""} onChange={(e) => setPayAmts({ ...payAmts, [m.id]: e.target.value })} />
            </label>
          ))
        )}
        <button type="button" className="text-sm underline" onClick={() => setMultiPay(!multiPay)}>{multiPay ? "Single payer" : "Multiple payers"}</button>
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm text-muted">Split</legend>
        <div role="tablist" className="flex flex-wrap gap-1 text-sm">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-full px-3 py-1 ${tab === t.id ? "bg-emerald-600 text-white" : "border border-line"}`}>{t.label}</button>
          ))}
        </div>

        {tab === "EQUAL" && members.map((m) => (
          <label key={m.id} className="flex items-center gap-2"><input type="checkbox" checked={eq.includes(m.id)} onChange={() => setEq(toggle(eq, m.id))} />{m.id === meId ? "You" : m.name}</label>
        ))}
        {(tab === "EXACT" || tab === "PERCENT" || tab === "SHARES") && members.map((m) => {
          const [state, set, ph] = tab === "EXACT" ? [exact, setExact, "0.00"] as const : tab === "PERCENT" ? [pct, setPct, "0 %"] as const : [shr, setShr, "1"] as const;
          return (
            <label key={m.id} className="flex items-center justify-between gap-3">
              <span>{m.id === meId ? "You" : m.name}</span>
              <input className="input w-32" inputMode="decimal" placeholder={ph} value={state[m.id] ?? ""} onChange={(e) => set({ ...state, [m.id]: e.target.value })} />
            </label>
          );
        })}
        {tab === "ITEMIZED" && (
          <div className="space-y-3">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-lg border border-line p-2">
                <div className="flex gap-2">
                  <input className="input" inputMode="decimal" placeholder="Item amount" aria-label={`Item ${idx + 1} amount`} value={it.amount} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))} />
                  {items.length > 1 && <button type="button" className="btn-ghost" onClick={() => setItems(items.filter((_, i) => i !== idx))}>Remove</button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {members.map((m) => (
                    <label key={m.id} className="flex items-center gap-1"><input type="checkbox" checked={it.memberIds.includes(m.id)} onChange={() => setItems(items.map((x, i) => (i === idx ? { ...x, memberIds: toggle(x.memberIds, m.id) } : x)))} />{m.id === meId ? "You" : m.name}</label>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={() => setItems([...items, { amount: "", memberIds: all }])}>Add item</button>
            <p className="text-xs text-muted">Anything above the item total (tax, tip) is shared in proportion to what each person ordered.</p>
          </div>
        )}
      </fieldset>

      {preview && (
        <div className="card text-sm" aria-label="Preview">
          <div className="mb-1 text-muted">Each person owes</div>
          {Object.entries(preview).filter(([, v]) => v > 0).map(([id, v]) => (
            <div key={id} className="flex justify-between"><span>{id === meId ? "You" : name(id)}</span><span>{minorToInput(v, cur)} {cur}</span></div>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full" disabled={busy}>{initial ? "Save changes" : "Add expense"}</button>
    </form>
  );
}
