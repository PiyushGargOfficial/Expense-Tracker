"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { editTxn } from "@/app/actions";
import { CURRENCIES, minorToInput, parseToMinor } from "@/lib/money";
import { CadAmountHint } from "@/components/CadHint";
import { ASSET_TYPES, PLATFORM_SUGGESTIONS } from "@/lib/investments";

type Opt = { id: string; name: string };
export type TxnValues = {
  id: string; type: "EXPENSE" | "INCOME" | "TRANSFER" | "INVEST"; amountMinor: number; currency: string; date: string;
  note: string; merchant: string; tags: string[]; categoryId: string; accountId: string; toAccountId: string;
};
/** The holding an investment entry belongs to: the same details as the Add investment form. */
export type HoldingValues = { platform: string; assetType: string; goalId: string; valueMinor: number; note: string };

/** Edit form for an entry you added yourself. An investment keeps its name and currency; a transfer keeps its type. */
export default function TxnEditForm({ txn, categories, accounts, holding, platforms = [], goals = [] }: { txn: TxnValues; categories: Opt[]; accounts: Opt[]; holding?: HoldingValues; platforms?: string[]; goals?: (Opt & { currency: string })[] }) {
  const router = useRouter();
  const [type, setType] = useState(txn.type);
  const [amount, setAmount] = useState(minorToInput(txn.amountMinor, txn.currency));
  const [cur, setCur] = useState(txn.currency);
  const [date, setDate] = useState(txn.date);
  const [note, setNote] = useState(txn.note);
  const [merchant, setMerchant] = useState(txn.merchant);
  const [tags, setTags] = useState(txn.tags.join(", "));
  const [categoryId, setCategoryId] = useState(txn.categoryId);
  const [accountId, setAccountId] = useState(txn.accountId);
  const [toAccountId, setToAccountId] = useState(txn.toAccountId);
  const [platform, setPlatform] = useState(holding?.platform ?? "");
  const [assetType, setAssetType] = useState(holding?.assetType ?? "OTHER");
  const [goalId, setGoalId] = useState(holding?.goalId ?? "");
  const [value, setValue] = useState(holding ? minorToInput(holding.valueMinor, txn.currency) : "");
  const [holdingNote, setHoldingNote] = useState(holding?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const transfer = txn.type === "TRANSFER";
  const invest = txn.type === "INVEST";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amountMinor = parseToMinor(amount, cur);
    if (!amountMinor) return setError(`Enter a valid amount in ${cur}`);
    if (transfer && (!accountId || !toAccountId || accountId === toAccountId)) return setError("Pick two different accounts");
    // A current value is only sent when it was changed; otherwise the holding's value moves with the amount.
    const valueChanged = invest && holding && value.trim() !== minorToInput(holding.valueMinor, txn.currency);
    const valueMinor = valueChanged ? parseToMinor(value, cur) : undefined;
    if (valueChanged && valueMinor == null) return setError(`Current value must be a number in ${cur}`);
    if (invest && !platform.trim()) return setError("Enter the platform, like Wealthsimple or Questrade");
    setBusy(true);
    const r = await editTxn(txn.id, {
      ...(invest && holding ? { platform, assetType, goalId, valueMinor, holdingNote } : {}),
      type: transfer || invest ? undefined : type, amountMinor, currency: cur, date, note, merchant, categoryId: categoryId || null,
      accountId: accountId || null, toAccountId: transfer ? toAccountId || null : null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.back();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!transfer && !invest && (
        <div role="tablist" className="flex gap-1 text-sm">
          {(["EXPENSE", "INCOME"] as const).map((t) => (
            <button type="button" key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)} className={`rounded-full px-3 py-1 ${type === t ? "bg-emerald-600 text-white" : "border border-line"}`}>{t[0] + t.slice(1).toLowerCase()}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input className="input text-xl font-semibold" inputMode="decimal" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="input w-24" aria-label="Currency" value={cur} disabled={invest} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <CadAmountHint amount={amount} currency={cur} />
      <input type="date" className="input" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
      {!transfer && !invest && (
        <select className="input" aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 gap-2">
        <select className="input" aria-label={transfer ? "From account" : invest ? "Paid from account" : "Account"} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">{transfer ? "From account…" : "No account"}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {transfer && (
          <select className="input" aria-label="To account" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">To account…</option>
            {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
      {invest ? (
        <>
          {holding && (
            <div className="grid grid-cols-2 gap-2">
              <input className="input" aria-label="Platform" list="edit-platforms" value={platform} maxLength={60} onChange={(e) => setPlatform(e.target.value)} />
              <datalist id="edit-platforms">{[...new Set([...platforms, ...PLATFORM_SUGGESTIONS])].map((p) => <option key={p} value={p} />)}</datalist>
              <select className="input" aria-label="Type" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                {ASSET_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <select className="input" aria-label="Goal" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">No goal</option>
                {goals.filter((g) => g.currency === txn.currency).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input className="input" inputMode="decimal" aria-label="Current value" placeholder="Current value" value={value} onChange={(e) => setValue(e.target.value)} />
              <input className="input col-span-2" aria-label="Investment note" placeholder="Note about this investment (optional)" maxLength={300} value={holdingNote} onChange={(e) => setHoldingNote(e.target.value)} />
            </div>
          )}
          <p className="text-xs text-muted">Investment: {txn.note}. Changing the amount also changes what you have put into it, and its current value unless you type a new one. Its name and currency stay as they are.</p>
        </>
      ) : (
        <>
          <input className="input" placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <input className="input" placeholder="Merchant (optional)" aria-label="Merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </>
      )}
      <input className="input" placeholder="Tags, separated by commas (optional)" aria-label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={busy}>Save changes</button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
