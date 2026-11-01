"use client";
import { CadAmountHint } from "@/components/CadHint";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { newClientId, submitOp } from "@/lib/outbox";
import { CURRENCIES, parseToMinor } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/payment";

type M = { id: string; name: string };

/**
 * Record any payment between any two members, e.g. "Friend gave me 20 in cash", whether or not it matches the
 * suggested transfers. Partial amounts are fine; balances recompute from the ledger.
 */
export default function RecordPaymentForm({ groupId, members, meId, currency }: { groupId: string; members: M[]; meId: string; currency: string }) {
  const router = useRouter();
  const other = members.find((m) => m.id !== meId)?.id ?? "";
  const [fromId, setFromId] = useState(other);
  const [toId, setToId] = useState(meId);
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState(currency);
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (m: M) => (m.id === meId ? "You" : m.name);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amountMinor = parseToMinor(amount, cur);
    if (!amountMinor) return setMsg({ text: `Enter a valid amount in ${cur}`, bad: true });
    if (!fromId || !toId || fromId === toId) return setMsg({ text: "Pick two different people", bad: true });
    setBusy(true);
    const r = await submitOp({ kind: "settlement", groupId, clientId: newClientId(), data: { fromId, toId, amountMinor, currency: cur, method, date, note: note.trim() || undefined } });
    setBusy(false);
    if (r.status === "error") return setMsg({ text: r.error, bad: true });
    setMsg({ text: r.status === "queued" ? "Saved offline. It will sync when you're back online." : "Payment recorded" });
    setAmount(""); setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <select className="input" aria-label="Who paid" value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {members.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
        </select>
        <span className="text-sm text-muted" aria-hidden="true">paid</span>
        <select className="input" aria-label="Who received" value={toId} onChange={(e) => setToId(e.target.value)}>
          {members.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input w-32" inputMode="decimal" placeholder="Amount" aria-label="Payment amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="input w-24" aria-label="Currency" value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input w-48" aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <CadAmountHint amount={amount} currency={cur} />
      <div className="flex flex-wrap gap-2">
        <input type="date" className="input w-44" aria-label="Date paid" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input min-w-40 flex-1" placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy}>Record payment</button>
        {msg && <span role="status" className={`text-sm ${msg.bad ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
