import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { requireUser, requireMember } from "@/lib/session";
import { formatMinor } from "@/lib/money";
import { addComment, removeExpense } from "@/app/actions";
import ExpenseForm from "@/components/ExpenseForm";
import type { SplitInput } from "@/lib/split";

export default async function ExpensePage({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  const group = await db.group.findUniqueOrThrow({ where: { id }, include: { members: true } });
  const e = await db.groupExpense.findFirst({ where: { id: eid, groupId: id, deletedAt: null }, include: { payers: true, shares: true, comments: { orderBy: { createdAt: "asc" } } } });
  if (!e) notFound();
  const categories = await db.category.findMany({ where: { userId: user.id, parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const nm = (mid: string) => group.members.find((m) => m.id === mid)?.name ?? "?";
  const canEdit = e.createdById === user.id || me.role === "ADMIN";

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
     <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-xl font-bold">{e.title}</h1>
        <p className="text-2xl font-semibold">{formatMinor(e.amountMinor, e.currency)}</p>
        <p className="text-sm text-muted">{e.date.toISOString().slice(0, 10)} · {e.splitType.toLowerCase()} split</p>
      </div>

      <section className="card text-sm">
        {e.payers.map((p) => <div key={p.id} className="flex justify-between"><span>{nm(p.memberId)} paid</span><span>{formatMinor(p.paidMinor, e.currency)}</span></div>)}
        <hr className="my-2 border-line" />
        {e.shares.map((s) => <div key={s.id} className="flex justify-between"><span>{nm(s.memberId)} owes</span><span>{formatMinor(s.owedMinor, e.currency)}</span></div>)}
      </section>

      <section className="card space-y-2" aria-label="Comments">
        <h2 className="font-semibold">Comments</h2>
        {e.comments.map((c) => <p key={c.id} className="text-sm"><span className="font-medium">{c.userName}</span>: {c.body}</p>)}
        <form action={addComment.bind(null, id, eid)} className="flex gap-2">
          <input name="body" className="input" placeholder="Add a comment" aria-label="Comment" required />
          <button className="btn">Post</button>
        </form>
      </section>
     </div>

      {canEdit ? (
        <div className="min-w-0 space-y-5">
          <section>
            <h2 className="mb-2 font-semibold">Edit</h2>
            <ExpenseForm
              groupId={id}
              meId={me.id}
              members={group.members.filter((m) => !m.left || e.shares.some((s) => s.memberId === m.id) || e.payers.some((p) => p.memberId === m.id)).map((m) => ({ id: m.id, name: m.name }))}
              defaultCurrency={group.defaultCurrency}
              categories={categories}
              initial={{
                expenseId: e.id,
                title: e.title,
                amountMinor: e.amountMinor,
                currency: e.currency,
                date: e.date.toISOString().slice(0, 10),
                category: e.category,
                payers: Object.fromEntries(e.payers.map((p) => [p.memberId, p.paidMinor])),
                split: e.splitInput as unknown as SplitInput,
              }}
            />
          </section>
          <form action={removeExpense.bind(null, id, eid)}><button className="btn-ghost text-red-600">Delete expense</button></form>
        </div>
      ) : (
        <p className="text-sm text-muted">Only the creator or a group admin can edit or delete this expense.</p>
      )}
    </div>
  );
}
