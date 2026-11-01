"use client";
import { useState, useTransition } from "react";
import { updateBudget } from "@/app/actions";
import { formatMinor, minorToInput } from "@/lib/money";
import CadHint from "@/components/CadHint";

/**
 * "Edit" for one saved budget: change the monthly limit and the alert threshold in place. Rendered inside the
 * card's header row; the form drops onto its own line below. `children` is the Remove control, kept beside Edit.
 */
export default function BudgetEdit({ id, currency, limitMinor, alertAtPct, children }: { id: string; currency: string; limitMinor: number; alertAtPct: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(minorToInput(limitMinor, currency));
  const [alert, setAlert] = useState(String(alertAtPct));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function openForm() {
    // Start from what is saved right now, not from an earlier unsaved edit.
    setLimit(minorToInput(limitMinor, currency));
    setAlert(String(alertAtPct));
    setError("");
    setOpen(true);
  }

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateBudget(id, data);
      if (r.ok) setOpen(false);
      else setError(r.error);
    });
  }

  return (
    <>
      <div className="flex items-center gap-4 text-xs text-muted">
        <button type="button" className="-m-2 p-2 underline" aria-expanded={open} onClick={() => (open ? setOpen(false) : openForm())}>
          {open ? "Cancel" : "Edit"}
        </button>
        {children}
      </div>
      {open && (
        <form onSubmit={save} className="order-last mt-2 grid w-full grid-cols-2 gap-2 rounded-lg border border-line p-3 text-foreground">
          <div>
            <label className="label" htmlFor={`limit-${id}`}>Monthly limit ({currency})</label>
            <input id={`limit-${id}`} name="limit" inputMode="decimal" className="input" value={limit} onChange={(e) => { setLimit(e.target.value); setError(""); }} required />
          </div>
          <div>
            <label className="label" htmlFor={`alert-${id}`}>Alert at (%)</label>
            <input id={`alert-${id}`} name="alert" type="number" min={1} max={100} step={1} inputMode="numeric" className="input" value={alert} onChange={(e) => { setAlert(e.target.value); setError(""); }} required />
          </div>
          <CadHint amountName="limit" currency={currency} className="col-span-2" />
          <p className="col-span-2 text-xs text-muted">Currently {formatMinor(limitMinor, currency)}, alert at {alertAtPct}%. The category and currency can&apos;t be changed; remove the budget and add a new one for that.</p>
          {error && <p role="alert" className="col-span-2 text-sm text-red-600">{error}</p>}
          <div className="col-span-2 flex gap-2">
            <button className="btn" disabled={pending}>Save changes</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </>
  );
}
