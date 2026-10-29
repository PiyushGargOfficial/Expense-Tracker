// One-off: creates the personal "your share" rows for group expenses that existed before group spending
// was linked into personal totals. Safe to re-run (it upserts). Run: npm run db:backfill
import { PrismaClient } from "@prisma/client";
import { syncMirrors } from "../src/lib/mirror";

const db = new PrismaClient();

async function main() {
  const expenses = await db.groupExpense.findMany({ select: { id: true } });
  for (const e of expenses) await syncMirrors(db, e.id);
  const rows = await db.transaction.count({ where: { groupExpenseId: { not: null } } });
  console.log(`Synced ${expenses.length} group expenses; ${rows} personal rows now mirror them.`);
}

main().finally(() => db.$disconnect());
