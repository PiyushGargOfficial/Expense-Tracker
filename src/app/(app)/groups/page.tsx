import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CURRENCIES } from "@/lib/money";
import { createGroup } from "@/app/actions";

export default async function Groups() {
  const user = await requireUser();
  const memberships = await db.member.findMany({ where: { userId: user.id, left: false }, include: { group: { include: { _count: { select: { members: true } } } } } });
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
