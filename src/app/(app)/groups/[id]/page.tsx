import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, requireMember } from "@/lib/session";
import { formatMinor } from "@/lib/money";
import { groupLedger } from "@/lib/queries";
import { addMember, leaveGroup, undoSettlement } from "@/app/actions";
import SettleForm from "@/components/SettleForm";
import RecordPaymentForm from "@/components/RecordPaymentForm";
import { paymentLabel } from "@/lib/payment";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  const group = await db.group.findUniqueOrThrow({ where: { id }, include: { members: { orderBy: { name: "asc" } } } });
  const [{ net, transfers, expenses, settlements }, audit] = await Promise.all([
    groupLedger(id),
    db.auditLog.findMany({ where: { groupId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const nm = (mid: string) => (mid === me.id ? "You" : group.members.find((m) => m.id === mid)?.name ?? "?");
  const mine = Object.entries(net).filter(([, b]) => b[me.id]);
  // Total already paid from one person to another in a currency (recorded, not undone).
  const paidSoFar = (fromId: string, toId: string, currency: string) =>
    settlements.filter((s) => s.fromId === fromId && s.toId === toId && s.currency === currency).reduce((a, s) => a + s.amountMinor, 0);
  const feed = [...expenses.map((e) => ({ t: e.date, k: "e" as const, e })), ...settlements.map((s) => ({ t: s.date, k: "s" as const, s }))].sort((a, b) => +b.t - +a.t);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="flex items-start justify-between gap-3 lg:col-span-2">
        <div>
          <h1 className="text-xl font-bold">{group.name}</h1>
          <p className="text-sm text-muted">{group.kind} · default {group.defaultCurrency}</p>
        </div>
        <Link href={`/groups/${id}/add`} className="btn">Add expense</Link>
      </div>

     <div className="min-w-0 space-y-5">
      <section className="card" aria-label="Balances">
        <h2 className="mb-2 font-semibold">Who owes whom</h2>
        {mine.length > 0 && mine.map(([cur, b]) => (
          <p key={cur} className={b[me.id] > 0 ? "text-emerald-600" : "text-red-600"}>
            {b[me.id] > 0 ? "You are owed" : "You owe"} {formatMinor(Math.abs(b[me.id]), cur)}
          </p>
        ))}
        {transfers.length === 0 ? <p className="text-muted">Everyone is settled up.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {transfers.map((t, i) => (
              <li key={i} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{nm(t.fromId)} → {nm(t.toId)}</span>
                  <span className="font-medium">{formatMinor(t.amountMinor, t.currency)}</span>
                </div>
                {paidSoFar(t.fromId, t.toId, t.currency) > 0 && (
                  <p className="text-xs text-emerald-600">{formatMinor(paidSoFar(t.fromId, t.toId, t.currency), t.currency)} already paid · {formatMinor(t.amountMinor, t.currency)} still owed</p>
                )}
                <SettleForm groupId={id} fromId={t.fromId} toId={t.toId} fromName={nm(t.fromId)} toName={nm(t.toId)} amountMinor={t.amountMinor} currency={t.currency} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Payments are simplified to the fewest transfers. Each currency is settled separately. Pay part now and the rest later: the amount still owed updates each time.</p>

        <details className="mt-3 rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">Record a payment between any two people</summary>
          <div className="mt-3">
            <RecordPaymentForm groupId={id} members={group.members.filter((m) => !m.left).map((m) => ({ id: m.id, name: m.name }))} meId={me.id} currency={group.defaultCurrency} />
          </div>
        </details>
      </section>

      <section aria-label="Expenses">
        <h2 className="mb-2 font-semibold">Expenses</h2>
        <ul className="card divide-y divide-line !p-0">
          {feed.length === 0 && <li className="p-4 text-muted">No expenses yet.</li>}
          {feed.map((x) => x.k === "e" ? (
            <li key={x.e.id}>
              <Link href={`/groups/${id}/expenses/${x.e.id}`} className="flex justify-between px-4 py-2.5 hover:bg-black/5 dark:hover:bg-white/5">
                <div>
                  <div>{x.e.title}</div>
                  <div className="text-xs text-muted">{x.e.date.toISOString().slice(0, 10)} · paid by {x.e.payers.map((p) => nm(p.memberId)).join(", ")}</div>
                </div>
                <span>{formatMinor(x.e.amountMinor, x.e.currency)}</span>
              </Link>
            </li>
          ) : (
            <li key={x.s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-muted">
              <div className="min-w-0">
                <div>{nm(x.s.fromId)} paid {nm(x.s.toId)} ({paymentLabel(x.s.method)})</div>
                <div className="text-xs">{x.s.date.toISOString().slice(0, 10)} · payment{x.s.note ? ` · ${x.s.note}` : ""}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span>{formatMinor(x.s.amountMinor, x.s.currency)}</span>
                {(x.s.createdById === user.id || me.role === "ADMIN") && (
                  <form action={undoSettlement.bind(null, id, x.s.id)}><button className="-m-2 p-2 text-xs underline" aria-label="Undo this payment">Undo</button></form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

     </div>

     <div className="min-w-0 space-y-5">
      <section className="card space-y-3" aria-label="Members">
        <h2 className="font-semibold">Members</h2>
        <ul className="text-sm">
          {group.members.map((m) => (
            <li key={m.id} className="flex justify-between py-0.5">
              <span>{m.name}{m.left ? " (left)" : ""}{!m.userId ? " · no account" : ""}</span>
              <span className="text-muted">{m.role.toLowerCase()}</span>
            </li>
          ))}
        </ul>
        <form action={addMember.bind(null, id)} className="grid grid-cols-2 gap-2">
          <input name="name" className="input" placeholder="Name" aria-label="Name" required />
          <input name="email" type="email" className="input" placeholder="Email (optional)" aria-label="Email" />
          <input name="phone" className="input" placeholder="Phone (optional)" aria-label="Phone" />
          <button className="btn">Add person</button>
        </form>
        <p className="text-sm">Invite link: <code className="break-all rounded bg-black/5 px-1 dark:bg-white/10">/join/{group.inviteCode}</code></p>
        <form action={leaveGroup.bind(null, id)}><button className="-m-2 p-2 text-sm text-muted underline">Leave group</button></form>
      </section>

      <section className="card" aria-label="Activity">
        <h2 className="mb-2 font-semibold">Activity</h2>
        <ul className="space-y-1 text-sm">
          {audit.map((a) => <li key={a.id}><span className="font-medium">{a.actorName}</span> {a.summary.toLowerCase()} <span className="text-xs text-muted">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span></li>)}
        </ul>
      </section>
     </div>
    </div>
  );
}
