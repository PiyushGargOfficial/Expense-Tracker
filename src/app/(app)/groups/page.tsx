import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CURRENCIES, formatMinor } from "@/lib/money";
import { groupLedger } from "@/lib/queries";
import { totalsByPerson } from "@/lib/balances";
import { createGroup } from "@/app/actions";

export default async function Groups() {
  const user = await requireUser();
  const memberships = await db.member.findMany({ where: { userId: user.id, left: false }, include: { group: { include: { _count: { select: { members: true } } } } } });
  const groups = await db.group.findMany({ where: { id: { in: memberships.map((m) => m.groupId) } }, include: { members: true } });
  const people = totalsByPerson(
    await Promise.all(
      memberships.map(async (m) => {
        const g = groups.find((x) => x.id === m.groupId)!;
        const { transfers } = await groupLedger(m.groupId);
        return { name: g.name, meId: m.id, names: Object.fromEntries(g.members.map((x) => [x.id, x.name])), transfers };
      }),
    ),
  );
  const money = (r: Record<string, number>) => Object.entries(r).map(([c, v]) => formatMinor(v, c)).join(" + ");
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">Groups</h1>
      <ul className="card divide-y divide-line !p-0">
        {memberships.length === 0 && <li className="p-4 text-muted">No groups yet. Create one for a trip, flat or couple.</li>}
        {memberships.map((m) => (
          <li key={m.id}>
            <Link href={`/groups/${m.groupId}`} className="flex justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5">
              <span>{m.group.name}</span>
              <span className="text-sm text-muted">{m.group.kind} · {m.group._count.members} people</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="card lg:col-span-2" aria-label="Lent to me by person">
        <h2 className="font-semibold">Lent to me, by person</h2>
        <p className="mb-2 text-xs text-muted">Totals across all your groups. People with the same name in different groups are counted as one person; each currency is shown separately.</p>
        {people.length === 0 ? <p className="text-muted">Nobody has anything unsettled with you.</p> : (
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.key} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">{p.groups.join(", ")}</div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  {Object.keys(p.lentToMe).length > 0 && <div className="text-red-600">Lent you {money(p.lentToMe)}</div>}
                  {Object.keys(p.iLent).length > 0 && <div className="text-emerald-600">You lent {money(p.iLent)}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={createGroup} className="card space-y-3">
        <h2 className="font-semibold">New group</h2>
        <input name="name" className="input" placeholder="Goa trip, Flat 4B…" aria-label="Group name" required />
        <div className="grid grid-cols-2 gap-2">
          <select name="kind" className="input" aria-label="Type"><option value="trip">Trip</option><option value="flat">Flat / roommates</option><option value="couple">Couple</option><option value="other">Other</option></select>
          <select name="currency" className="input" aria-label="Default currency" defaultValue={user.defaultCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <button className="btn">Create group</button>
      </form>
    </div>
  );
}
