import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { joinGroup } from "@/app/actions";

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await requireUser();
  const g = await db.group.findUnique({ where: { inviteCode: code }, include: { members: { where: { userId: null, left: false } } } });
  if (!g) notFound();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">Join {g.name}</h1>
      <form action={joinGroup.bind(null, code, undefined)}><button className="btn">Join as myself</button></form>
      {g.members.length > 0 && (
        <div className="card space-y-2">
          <p className="text-sm text-muted">Already added by name? Claim that person to keep their history.</p>
          {g.members.map((m) => (
            <form key={m.id} action={joinGroup.bind(null, code, m.id)}><button className="btn-ghost">I am {m.name}</button></form>
          ))}
        </div>
      )}
    </div>
  );
}
