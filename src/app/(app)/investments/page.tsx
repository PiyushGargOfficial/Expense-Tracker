import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMinor } from "@/lib/money";
import { assetLabel, goalProgress, platformKey, totalsByCurrency, totalsByPlatform, type Totals } from "@/lib/investments";
import { deleteGoal, deleteInvestment } from "@/app/actions";
import { GoalEdit, GoalForm, InvestmentEdit, InvestmentForm, type GoalValues, type InvestmentValues } from "@/components/InvestmentForms";

const gainClass = (n: number) => (n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "");
const signed = (minor: number, cur: string) => `${minor > 0 ? "+" : minor < 0 ? "-" : ""}${formatMinor(Math.abs(minor), cur)}`;
const pctText = (t: Totals) => (t.gainPct === null ? "" : ` (${t.gainPct > 0 ? "+" : ""}${t.gainPct.toFixed(1)}%)`);
const fmtDate = (d: Date) => d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export default async function Investments() {
  const user = await requireUser();
  const [holdings, goals, added] = await Promise.all([
    db.investment.findMany({ where: { userId: user.id }, orderBy: [{ platform: "asc" }, { name: "asc" }] }),
    db.investmentGoal.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    db.transaction.groupBy({ by: ["investmentId"], where: { userId: user.id, type: "INVEST", investmentId: { not: null } }, _sum: { amountMinor: true } }),
  ]);
  // What came in through the Invest tab; the rest of the invested amount was already there.
  const addedBy = (id: string) => added.find((a) => a.investmentId === id)?._sum.amountMinor ?? 0;

  const totals = totalsByCurrency(holdings);
  const platforms = totalsByPlatform(holdings);
  const platformNames = platforms.map((p) => p.name);
  const goalOptions = goals.map((g) => ({ id: g.id, name: g.name, currency: g.currency }));
  const goalName = (id: string | null) => goals.find((g) => g.id === id)?.name;

  const values = (h: (typeof holdings)[number]): InvestmentValues => ({
    id: h.id, platform: h.platform, name: h.name, assetType: h.assetType, currency: h.currency, investedMinor: h.investedMinor, valueMinor: h.valueMinor, goalId: h.goalId, note: h.note,
  });
  const goalValues = (g: (typeof goals)[number]): GoalValues => ({
    id: g.id, name: g.name, currency: g.currency, targetMinor: g.targetMinor, targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null, note: g.note,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">Investments</h1>

      <section className="card space-y-3 lg:col-span-2" aria-label="Overview">
        <h2 className="font-semibold">Overview</h2>
        {Object.keys(totals).length === 0 ? (
          <p className="text-muted">No investments yet. Add one below, then set goals to track.</p>
        ) : (
          Object.entries(totals).map(([cur, t]) => (
            <div key={cur} className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-xs text-muted">Invested ({cur})</div><div className="text-lg font-semibold">{formatMinor(t.investedMinor, cur)}</div></div>
              <div><div className="text-xs text-muted">Current value ({cur})</div><div className="text-lg font-semibold">{formatMinor(t.valueMinor, cur)}</div></div>
              <div><div className="text-xs text-muted">Gain / loss ({cur})</div><div className={`text-lg font-semibold ${gainClass(t.gainMinor)}`}>{signed(t.gainMinor, cur)}<span className="text-sm">{pctText(t)}</span></div></div>
            </div>
          ))
        )}
        <p className="text-xs text-muted">Values are the ones you enter, so update them when you check your platform. Each currency is shown separately.</p>
      </section>

      {platforms.length > 0 && (
        <section className="card lg:col-span-2" aria-label="By platform">
          <h2 className="mb-2 font-semibold">By platform</h2>
          <ul className="divide-y divide-line">
            {platforms.map((p) => (
              <li key={p.key} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">{p.count} holding{p.count === 1 ? "" : "s"}</div>
                </div>
                <div className="text-right text-sm">
                  {Object.entries(p.totals).map(([cur, t]) => (
                    <div key={cur}>
                      {formatMinor(t.valueMinor, cur)} <span className="text-xs text-muted">of {formatMinor(t.investedMinor, cur)} in</span>{" "}
                      <span className={`text-xs ${gainClass(t.gainMinor)}`}>{signed(t.gainMinor, cur)}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3" aria-label="Goals">
        <h2 className="font-semibold">Goals</h2>
        {goals.length === 0 && <p className="text-muted">No goals yet. Add one to see how close you are.</p>}
        <ul className="space-y-3">
          {goals.map((g) => {
            const p = goalProgress(g, holdings);
            const linked = holdings.filter((h) => h.goalId === g.id);
            return (
              <li key={g.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-y-1">
                  <span className="font-medium">{g.name}</span>
                  <GoalEdit goal={goalValues(g)} defaultCurrency={user.defaultCurrency}>
                    <form action={deleteGoal.bind(null, g.id)}><button className="-m-2 p-2 underline">Remove</button></form>
                  </GoalEdit>
                </div>
                <div className="my-2 h-2 overflow-hidden rounded bg-black/10 dark:bg-white/10" role="progressbar" aria-label={`${g.name} progress`} aria-valuenow={Math.min(p.pct, 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${p.reached ? "bg-emerald-600" : "bg-sky-600"}`} style={{ width: `${Math.min(p.pct, 100)}%` }} />
                </div>
                <div className="text-sm">{formatMinor(p.savedMinor, g.currency)} of {formatMinor(g.targetMinor, g.currency)} ({p.pct}%)</div>
                {p.reached ? (
                  <p className="text-sm text-emerald-600">Goal reached.</p>
                ) : (
                  <p className="text-sm text-muted">
                    {formatMinor(p.remainingMinor, g.currency)} to go
                    {g.targetDate ? ` by ${fmtDate(g.targetDate)}` : ""}
                    {p.perMonthMinor !== null ? ` · about ${formatMinor(p.perMonthMinor, g.currency)} a month over ${p.monthsLeft} month${p.monthsLeft === 1 ? "" : "s"}` : g.targetDate && p.monthsLeft === 0 ? " · the date has passed" : ""}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">{linked.length === 0 ? "No investments linked yet. Pick this goal when you add or edit one." : `Linked: ${linked.map((h) => h.name).join(", ")}`}</p>
                {g.note && <p className="mt-1 text-xs text-muted">{g.note}</p>}
              </li>
            );
          })}
        </ul>
        <div className="card">
          <h3 className="mb-2 font-semibold">Add a goal</h3>
          <GoalForm defaultCurrency={user.defaultCurrency} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Holdings">
        <h2 className="font-semibold">Holdings</h2>
        {holdings.length === 0 && <p className="text-muted">Nothing here yet.</p>}
        {platforms.map((p) => (
          <div key={p.key} className="space-y-2">
            {platforms.length > 1 && <h3 className="text-sm font-medium text-muted">{p.name}</h3>}
            <ul className="space-y-3">
              {holdings.filter((h) => platformKey(h.platform) === p.key).map((h) => {
                const gain = h.valueMinor - h.investedMinor;
                return (
                  <li key={h.id} className="card">
                    <div className="flex flex-wrap items-center justify-between gap-y-1">
                      <span className="font-medium">{h.name}</span>
                      <InvestmentEdit investment={values(h)} defaultCurrency={user.defaultCurrency} platforms={platformNames} goals={goalOptions}>
                        <form action={deleteInvestment.bind(null, h.id)}><button className="-m-2 p-2 underline">Remove</button></form>
                      </InvestmentEdit>
                    </div>
                    <div className="text-xs text-muted">{h.platform} · {assetLabel(h.assetType)}{goalName(h.goalId) ? ` · Goal: ${goalName(h.goalId)}` : ""}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div><div className="text-xs text-muted">Invested</div>{formatMinor(h.investedMinor, h.currency)}</div>
                      <div><div className="text-xs text-muted">Value</div>{formatMinor(h.valueMinor, h.currency)}</div>
                      <div><div className="text-xs text-muted">Gain / loss</div><span className={gainClass(gain)}>{signed(gain, h.currency)}</span></div>
                    </div>
                    {addedBy(h.id) > 0 && (
                      <p className="mt-1 text-xs text-muted">Already invested {formatMinor(Math.max(0, h.investedMinor - addedBy(h.id)), h.currency)} · added with the Invest tab {formatMinor(addedBy(h.id), h.currency)}</p>
                    )}
                    {h.note && <p className="mt-1 text-xs text-muted">{h.note}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="card">
          <h3 className="mb-2 font-semibold">Add an investment</h3>
          <InvestmentForm defaultCurrency={user.defaultCurrency} platforms={platformNames} goals={goalOptions} />
        </div>
      </section>
    </div>
  );
}
