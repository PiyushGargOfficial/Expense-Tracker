import { auth } from "@/auth";
import { db } from "@/lib/db";
import { minorToInput } from "@/lib/money";

import { csvCell } from "@/lib/csv";

const esc = csvCell;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const txns = await db.transaction.findMany({ where: { userId: session.user.id }, orderBy: { date: "desc" }, include: { category: true, account: true } });
  const rows = [
    "date,type,amount,currency,category,account,merchant,note,tags",
    ...txns.map((t) =>
      [t.date.toISOString().slice(0, 10), t.type, minorToInput(t.amountMinor, t.currency), t.currency, t.category?.name ?? "", t.account?.name ?? "", t.merchant ?? "", t.note ?? "", t.tags.join(";")].map(esc).join(","),
    ),
  ];
  return new Response(rows.join("\n"), { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="expenses.csv"' } });
}
