// Demo data for a smoke test. Run: npm run db:seed
// Login: demo@example.com / demo-pass-123 (a second user, friend@example.com, uses the same password)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeShares } from "../src/lib/split";

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo-pass-123", 10);
  const mk = (email: string, name: string) =>
    db.user.upsert({ where: { email }, update: {}, create: { email, name, passwordHash } });
  const [me, friend] = await Promise.all([mk("demo@example.com", "Demo"), mk("friend@example.com", "Friend")]);

  if (!(await db.category.count({ where: { userId: me.id } }))) {
    await db.category.createMany({ data: ["Food", "Transport", "Rent", "Shopping"].map((name) => ({ userId: me.id, name })) });
    const acc = await db.account.create({ data: { userId: me.id, name: "Cash" } });
    const food = await db.category.findFirstOrThrow({ where: { userId: me.id, name: "Food" } });
    await db.transaction.createMany({
      data: [450, 1200, 90].map((n, i) => ({
        userId: me.id, type: "EXPENSE" as const, amountMinor: n * 100, currency: "CAD", date: new Date(Date.now() - i * 86400000),
        note: ["Lunch", "Groceries", "Chai"][i], categoryId: food.id, accountId: acc.id, clientId: `seed-${i}`,
      })),
    });
    await db.budget.create({ data: { userId: me.id, categoryId: food.id, limitMinor: 300000, currency: "CAD" } });
  }

  if (!(await db.group.count({ where: { name: "Demo trip" } }))) {
    const g = await db.group.create({ data: { name: "Demo trip", defaultCurrency: "CAD" } });
    const [a, b, c] = await Promise.all([
      db.member.create({ data: { groupId: g.id, userId: me.id, name: me.name, role: "ADMIN" } }),
      db.member.create({ data: { groupId: g.id, userId: friend.id, name: friend.name } }),
      db.member.create({ data: { groupId: g.id, name: "Piyush (no account)" } }),
    ]);
    const add = async (title: string, total: number, payer: string, ids: string[]) => {
      const owed = computeShares(total, { type: "EQUAL", memberIds: ids }, [payer]);
      await db.groupExpense.create({
        data: {
          groupId: g.id, title, amountMinor: total, currency: "CAD", date: new Date(), splitType: "EQUAL", splitInput: { type: "EQUAL", memberIds: ids },
          createdById: me.id, payers: { create: { memberId: payer, paidMinor: total } },
          shares: { create: Object.entries(owed).map(([memberId, owedMinor]) => ({ memberId, owedMinor })) },
        },
      });
    };
    await add("Hotel", 1000000, a.id, [a.id, b.id, c.id]); // 10000.00 / 3 -> uneven split, sums exactly
    await add("Dinner", 300000, b.id, [a.id, b.id, c.id]);
  }
  console.log("Seeded. Log in as demo@example.com / demo-pass-123");
}

main().finally(() => db.$disconnect());
