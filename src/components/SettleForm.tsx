"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { newClientId, submitOp } from "@/lib/outbox";
import { formatPlain, minorToInput, parseToMinor } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/payment";

/**
 * Records a full or partial payment against one suggested debt. Pick Full, Half or type any amount; the form
 * shows what would still be owed afterwards, and refuses to record more than is owed.
 */
export default function SettleForm({ groupId, fromId, toId, fromName, toName, amountMinor, currency }: { groupId: string; fromId: string; toId: string; fromName: string; toName: string; amountMinor: number; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(minorToInput(amountMinor, currency));
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const entered = parseToMinor(amount, currency);
  const tooMuch = entered !== null && entered > amountMinor;
  const remaining = entered !== null && !tooMuch ? amountMinor - entered : null;
  const half = Math.floor(amountMinor / 2);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!entered) return setMsg("Enter a valid amount");
    if (tooMuch) return setMsg(`That is more than the ${formatPlain(amountMinor, currency)} owed`);
    setBusy(true);
    const r = await submitOp({ kind: "settlement", groupId, clientId: newClientId(), data: { fromId, toId, amountMinor: entered, currency, method, date } });
    setBusy(false);
    if (r.status === "error") return setMsg(r.error);
    setOpen(false);
    setAmount(minorToInput(amountMinor, currency));
    setMsg("");
    router.refresh();
  }

  if (!open) return <button className="btn-ghost mt-1" onClick={() => setOpen(true)}>Record payment</button>;
  return (
    <form onSubmit={save} className="mt-2 space-y-2 rounded-lg border border-line p-3">
      <p className="text-sm">{fromName} pays {toName}. Enter the full amount or just part of it.</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick amounts">
        <button type="button" className="btn-ghost" onClick={() => setAmount(minorToInput(amountMinor, currency))}>Full {formatPlain(amountMinor, currency)}</button>
        {half > 0 && <button type="button" className="btn-ghost" onClick={() => setAmount(minorToInput(half, currency))}>Half {formatPlain(half, currency)}</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input w-36" inputMode="decimal" aria-label="Amount paid" value={amount} onChange={(e) => { setAmount(e.target.value); setMsg(""); }} />
        <select className="input w-48" aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input type="date" className="input w-44" aria-label="Date paid" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {remaining !== null && (
        <p className="text-sm text-muted" role="status">
          {remaining === 0 ? "This clears the debt." : `${formatPlain(remaining, currency)} will still be owed after this.`}
        </p>
      )}
      {(msg || tooMuch) && <p role="alert" className="text-sm text-red-600">{msg || `More than the ${formatPlain(amountMinor, currency)} owed`}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={busy || tooMuch || !entered}>Record</button>
        <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setMsg(""); }}>Cancel</button>
      </div>
    </form>
  );
}
