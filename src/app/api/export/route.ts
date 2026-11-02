import { auth } from "@/auth";
import { db } from "@/lib/db";
import { minorToInput } from "@/lib/money";

import { csvCell } from "@/lib/csv";
import { txnOrderBy, txnWhere, type TxnFilter } from "@/lib/txnFilter";

const esc = csvCell;

/** "Meshwa (12.50); Dajinder (8.00)": each person with their amount, in the transaction's currency. */
function people(list: [string, number][] | undefined, currency: string): string {
  return (list ?? []).map(([name, minor]) => `${name} (${minorToInput(minor, currency)})`).join("; ");
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  // Same filters and order as the All transactions page; with none given, everything is exported.
  const p = new URL(req.url).searchParams;
  const sp: TxnFilter = {};
  for (const k of ["q", "cat", "type", "sort", "from", "to", "group", "currency"] as const) sp[k] = p.get(k) || undefined;
  const txns = await db.transaction.findMany({ where: txnWhere(session.user.id, sp), orderBy: txnOrderBy(sp.sort), include: {
      category: true,
      account: true,
      // For a group expense: who paid and what each person owes, so the CSV shows the split next to the transaction.
      groupExpense: { select: { group: { select: { name: true } }, payers: { include: { member: { select: { name: true } } } }, shares: { include: { member: { select: { name: true } } } } } },
    },
  });
  const rows = [
    "date,type,amount,currency,category,account,merchant,note,tags,group,paid_by,owed_by",
    ...txns.map((t) =>
      [t.date.toISOString().slice(0, 10), t.type, minorToInput(t.amountMinor, t.currency), t.currency, t.category?.name ?? "", t.account?.name ?? "", t.merchant ?? "", t.note ?? "", t.tags.join(";"), t.groupExpense?.group.name ?? "", people(t.groupExpense?.payers.map((p) => [p.member.name, p.paidMinor]), t.currency), people(t.groupExpense?.shares.filter((x) => x.owedMinor > 0).map((x) => [x.member.name, x.owedMinor]), t.currency)].map(esc).join(","),
    ),
  ];
  return new Response(rows.join("\n"), { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="expenses.csv"' } });
}
