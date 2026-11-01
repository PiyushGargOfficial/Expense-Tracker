"use client";
import { useRef, useState, useTransition } from "react";
import { saveAccount } from "@/app/actions";
import { ACCOUNT_KINDS } from "@/lib/accounts";
import { CURRENCIES, minorToInput } from "@/lib/money";
import CadHint from "@/components/CadHint";

export type AccountValues = {
  id: string; name: string; kind: string; currency: string; institution: string | null; last4: string | null;
  balance: number; creditLimitMinor: number | null; statementDay: number | null; dueDay: number | null; aprBps: number | null; minPaymentMinor: number | null;
};

/** Add an account (no `account`) or edit one. Credit cards get their own fields: limit, statement and due days, rate, minimum. */
export default function AccountForm({ account, defaultCurrency, onDone }: { account?: AccountValues; defaultCurrency: string; onDone?: () => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState(account?.kind ?? "BANK");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const cur = account?.currency ?? defaultCurrency;
  const credit = kind === "CREDIT";
  const id = account?.id ?? "new";

  const initialBalance = account ? (account.kind === "CREDIT" ? minorToInput(Math.max(0, -account.balance), cur) : minorToInput(account.balance, cur)) : "";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveAccount(account?.id ?? null, data);
      if (!r.ok) { setError(r.error); setSaved(false); return; }
      setError("");
      if (account) onDone?.();
      else { ref.current?.reset(); setKind("BANK"); setSaved(true); }
    });
  }
  const clear = () => { setError(""); setSaved(false); };

  return (
    <form ref={ref} onSubmit={submit} className="grid grid-cols-2 gap-2" aria-label={account ? `Edit ${account.name}` : "Add an account"}>
      <div className="col-span-2">
        <label className="label" htmlFor={`name-${id}`}>Name</label>
        <input id={`name-${id}`} name="name" className="input" defaultValue={account?.name} placeholder="TD chequing, RBC Visa…" maxLength={60} required onChange={clear} />
      </div>
      <div>
        <label className="label" htmlFor={`kind-${id}`}>Type</label>
        <select id={`kind-${id}`} name="kind" className="input" value={kind} onChange={(e) => { setKind(e.target.value); clear(); }}>
          {ACCOUNT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`cur-${id}`}>Currency</label>
        {account
          ? <input id={`cur-${id}`} className="input" value={cur} disabled readOnly aria-describedby={`cur-hint-${id}`} />
          : <select id={`cur-${id}`} name="currency" className="input" defaultValue={defaultCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>}
      </div>
      <div>
        <label className="label" htmlFor={`inst-${id}`}>Bank or issuer</label>
        <input id={`inst-${id}`} name="institution" className="input" defaultValue={account?.institution ?? ""} placeholder="TD, RBC, Scotiabank…" maxLength={60} />
      </div>
      <div>
        <label className="label" htmlFor={`last4-${id}`}>Last 4 digits</label>
        <input id={`last4-${id}`} name="last4" className="input" defaultValue={account?.last4 ?? ""} inputMode="numeric" maxLength={4} placeholder="1234" onChange={clear} />
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor={`bal-${id}`}>{credit ? "Amount owed now" : "Current balance"} ({cur})</label>
        <input id={`bal-${id}`} name="balance" inputMode="decimal" className="input" defaultValue={initialBalance} placeholder="0.00" onChange={clear} />
        <CadHint amountName="balance" currency={account ? cur : undefined} className="mt-1" />
      </div>

      {credit && (
        <>
          <div>
            <label className="label" htmlFor={`limit-${id}`}>Credit limit</label>
            <input id={`limit-${id}`} name="limit" inputMode="decimal" className="input" defaultValue={account?.creditLimitMinor != null ? minorToInput(account.creditLimitMinor, cur) : ""} placeholder="5000.00" onChange={clear} />
          </div>
          <div>
            <label className="label" htmlFor={`min-${id}`}>Minimum payment</label>
            <input id={`min-${id}`} name="minPayment" inputMode="decimal" className="input" defaultValue={account?.minPaymentMinor != null ? minorToInput(account.minPaymentMinor, cur) : ""} placeholder="35.00" onChange={clear} />
          </div>
          <div>
            <label className="label" htmlFor={`st-${id}`}>Statement day (1-31)</label>
            <input id={`st-${id}`} name="statementDay" type="number" min={1} max={31} className="input" defaultValue={account?.statementDay ?? ""} onChange={clear} />
          </div>
          <div>
            <label className="label" htmlFor={`due-${id}`}>Payment due day (1-31)</label>
            <input id={`due-${id}`} name="dueDay" type="number" min={1} max={31} className="input" defaultValue={account?.dueDay ?? ""} onChange={clear} />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor={`apr-${id}`}>Interest rate (% per year)</label>
            <input id={`apr-${id}`} name="apr" inputMode="decimal" className="input" defaultValue={account?.aprBps != null ? (account.aprBps / 100).toFixed(2) : ""} placeholder="19.99" onChange={clear} />
          </div>
        </>
      )}

      <p id={`cur-hint-${id}`} className="col-span-2 text-xs text-muted">
        {account
          ? `Changing the balance does not alter your transactions; the balance shown is your starting balance plus the transactions you record. The currency can't be changed.`
          : "Transactions you add to this account will adjust the balance from here."}
        {credit ? " For a credit card, enter what you owe right now. Day numbers past the end of a short month use its last day." : ""}
      </p>
      {error && <p role="alert" className="col-span-2 text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="col-span-2 text-sm text-emerald-600">Account added.</p>}
      <div className="col-span-2 flex gap-2">
        <button className="btn" disabled={pending}>{account ? "Save changes" : "Add account"}</button>
        {account && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

/** Edit toggle for one account card. `children` is the Archive control, kept beside it. */
export function AccountEdit({ account, defaultCurrency, children }: { account: AccountValues; defaultCurrency: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-4 text-xs text-muted">
        <button type="button" className="-m-2 p-2 underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Cancel" : "Edit"}</button>
        {children}
      </div>
      {open && (
        <div className="order-last mt-2 w-full rounded-lg border border-line p-3 text-foreground">
          <AccountForm account={account} defaultCurrency={defaultCurrency} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
