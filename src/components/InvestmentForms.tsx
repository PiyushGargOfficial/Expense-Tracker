"use client";
import { useRef, useState, useTransition } from "react";
import { saveInvestment, saveGoal } from "@/app/actions";
import { ASSET_TYPES, PLATFORM_SUGGESTIONS } from "@/lib/investments";
import { CURRENCIES, minorToInput } from "@/lib/money";

export type InvestmentValues = { id: string; platform: string; name: string; assetType: string; currency: string; investedMinor: number; valueMinor: number; goalId: string | null; note: string | null };
export type GoalValues = { id: string; name: string; currency: string; targetMinor: number; targetDate: string | null; note: string | null };
type GoalOption = { id: string; name: string; currency: string };

/** Add a holding (no `investment`) or edit one. The currency is fixed once saved. */
export function InvestmentForm({ investment, defaultCurrency, platforms, goals, onDone }: { investment?: InvestmentValues; defaultCurrency: string; platforms: string[]; goals: GoalOption[]; onDone?: () => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const [cur, setCur] = useState(investment?.currency ?? defaultCurrency);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const id = investment?.id ?? "new";
  const list = [...new Set([...platforms, ...PLATFORM_SUGGESTIONS])];

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveInvestment(investment?.id ?? null, data);
      if (!r.ok) { setError(r.error); setSaved(false); return; }
      setError("");
      if (investment) onDone?.();
      else { ref.current?.reset(); setSaved(true); }
    });
  }
  const clear = () => { setError(""); setSaved(false); };

  return (
    <form ref={ref} onSubmit={submit} className="grid grid-cols-2 gap-2" aria-label={investment ? `Edit ${investment.name}` : "Add an investment"}>
      <div>
        <label className="label" htmlFor={`plat-${id}`}>Platform</label>
        <input id={`plat-${id}`} name="platform" list={`plats-${id}`} className="input" defaultValue={investment?.platform} placeholder="Wealthsimple" maxLength={60} required onChange={clear} />
        <datalist id={`plats-${id}`}>{list.map((p) => <option key={p} value={p} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor={`type-${id}`}>Type</label>
        <select id={`type-${id}`} name="assetType" className="input" defaultValue={investment?.assetType ?? "TFSA"}>
          {ASSET_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor={`name-${id}`}>What is it?</label>
        <input id={`name-${id}`} name="name" className="input" defaultValue={investment?.name} placeholder="XEQT, Bitcoin, Emergency GIC…" maxLength={80} required onChange={clear} />
      </div>
      <div>
        <label className="label" htmlFor={`cur-${id}`}>Currency</label>
        {investment
          ? <input id={`cur-${id}`} className="input" value={cur} disabled readOnly />
          : <select id={`cur-${id}`} name="currency" className="input" value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>}
      </div>
      <div>
        <label className="label" htmlFor={`goal-${id}`}>Goal</label>
        <select id={`goal-${id}`} name="goalId" className="input" defaultValue={investment?.goalId ?? ""}>
          <option value="">No goal</option>
          {goals.filter((g) => g.currency === cur).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`inv-${id}`}>Already invested</label>
        <input id={`inv-${id}`} name="invested" inputMode="decimal" className="input" defaultValue={investment ? minorToInput(investment.investedMinor, cur) : ""} placeholder="What you have put in so far" onChange={clear} />
      </div>
      <div>
        <label className="label" htmlFor={`val-${id}`}>Current value</label>
        <input id={`val-${id}`} name="value" inputMode="decimal" className="input" defaultValue={investment ? minorToInput(investment.valueMinor, cur) : ""} placeholder="Same as invested" onChange={clear} />
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor={`note-${id}`}>Note (optional)</label>
        <input id={`note-${id}`} name="note" className="input" defaultValue={investment?.note ?? ""} maxLength={300} onChange={clear} />
      </div>
      <p className="col-span-2 text-xs text-muted">Already invested is everything you have put in so far, including before you started using this app. Current value is what it is worth today; leave it blank if it is the same. Later contributions from the Invest tab on Home are added to both automatically.</p>
      {error && <p role="alert" className="col-span-2 text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="col-span-2 text-sm text-emerald-600">Investment added.</p>}
      <div className="col-span-2 flex gap-2">
        <button className="btn" disabled={pending}>{investment ? "Save changes" : "Add investment"}</button>
        {investment && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

/** Add a goal (no `goal`) or edit one. */
export function GoalForm({ goal, defaultCurrency, onDone }: { goal?: GoalValues; defaultCurrency: string; onDone?: () => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const cur = goal?.currency ?? defaultCurrency;
  const id = goal?.id ?? "new";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveGoal(goal?.id ?? null, data);
      if (!r.ok) { setError(r.error); setSaved(false); return; }
      setError("");
      if (goal) onDone?.();
      else { ref.current?.reset(); setSaved(true); }
    });
  }
  const clear = () => { setError(""); setSaved(false); };

  return (
    <form ref={ref} onSubmit={submit} className="grid grid-cols-2 gap-2" aria-label={goal ? `Edit ${goal.name}` : "Add a goal"}>
      <div className="col-span-2">
        <label className="label" htmlFor={`gname-${id}`}>Goal</label>
        <input id={`gname-${id}`} name="name" className="input" defaultValue={goal?.name} placeholder="House down payment, Retirement…" maxLength={80} required onChange={clear} />
      </div>
      <div>
        <label className="label" htmlFor={`gtarget-${id}`}>Target amount</label>
        <input id={`gtarget-${id}`} name="target" inputMode="decimal" className="input" defaultValue={goal ? minorToInput(goal.targetMinor, cur) : ""} placeholder="50000.00" required onChange={clear} />
      </div>
      <div>
        <label className="label" htmlFor={`gcur-${id}`}>Currency</label>
        {goal
          ? <input id={`gcur-${id}`} className="input" value={cur} disabled readOnly />
          : <select id={`gcur-${id}`} name="currency" className="input" defaultValue={defaultCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>}
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor={`gdate-${id}`}>Target date (optional)</label>
        <input id={`gdate-${id}`} name="targetDate" type="date" className="input" defaultValue={goal?.targetDate ?? ""} onChange={clear} />
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor={`gnote-${id}`}>Note (optional)</label>
        <input id={`gnote-${id}`} name="note" className="input" defaultValue={goal?.note ?? ""} maxLength={300} onChange={clear} />
      </div>
      <p className="col-span-2 text-xs text-muted">Progress is the amount you have invested in the investments linked to this goal (same currency). Gains and losses are not counted.</p>
      {error && <p role="alert" className="col-span-2 text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="col-span-2 text-sm text-emerald-600">Goal added.</p>}
      <div className="col-span-2 flex gap-2">
        <button className="btn" disabled={pending}>{goal ? "Save changes" : "Add goal"}</button>
        {goal && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

function Toggle({ open, setOpen, children }: { open: boolean; setOpen: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted">
      <button type="button" className="-m-2 p-2 underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Cancel" : "Edit"}</button>
      {children}
    </div>
  );
}

/** Edit toggle on a holding card. `children` is the Remove control, kept beside it. */
export function InvestmentEdit({ investment, defaultCurrency, platforms, goals, children }: { investment: InvestmentValues; defaultCurrency: string; platforms: string[]; goals: GoalOption[]; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Toggle open={open} setOpen={setOpen}>{children}</Toggle>
      {open && (
        <div className="order-last mt-2 w-full rounded-lg border border-line p-3 text-foreground">
          <InvestmentForm investment={investment} defaultCurrency={defaultCurrency} platforms={platforms} goals={goals} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/** Edit toggle on a goal card. */
export function GoalEdit({ goal, defaultCurrency, children }: { goal: GoalValues; defaultCurrency: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Toggle open={open} setOpen={setOpen}>{children}</Toggle>
      {open && (
        <div className="order-last mt-2 w-full rounded-lg border border-line p-3 text-foreground">
          <GoalForm goal={goal} defaultCurrency={defaultCurrency} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
