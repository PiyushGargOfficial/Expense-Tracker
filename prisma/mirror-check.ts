// Regression check: a group expense must show up in each member's personal totals as THEIR SHARE, and stay in
// step through edits and deletes. Cleans up after itself. Run: npx tsx prisma/mirror-check.ts
import { PrismaClient } from "@prisma/client";
import { createGroupExpense, updateGroupExpense, deleteGroupExpense } from "../src/lib/ops";

const db = new PrismaClient();
const out: string[] = [];
const ok = (name: string, pass: boolean, detail = "") => out.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);

async function rows(userId: string, expenseId: string) {
  return db.transaction.findMany({ where: { userId, groupExpenseId: expenseId } });
}

async function main() {
  const demo = await db.user.findUniqueOrThrow({ where: { email: "demo@example.com" } });
  const friend = await db.user.findUniqueOrThrow({ where: { email: "friend@example.com" } });
  const food = await db.category.findFirstOrThrow({ where: { userId: demo.id, name: "Food" } });
  const g = await db.group.create({
    data: { name: "mirror-check", members: { create: [{ userId: demo.id, name: "Demo", role: "ADMIN" }, { userId: friend.id, name: "Friend" }, { name: "No Account" }] } },
    include: { members: true },
  });
  const [me, fr, na] = ["Demo", "Friend", "No Account"].map((n) => g.members.find((m) => m.name === n)!);
  const actor = { id: demo.id, name: demo.name };
  const date = new Date().toISOString().slice(0, 10);
  try {
    // 1) "Just me" from Home: I paid 1000 and owe 1000.
    const solo = await createGroupExpense(actor, g.id, "mc-solo", {
      title: "Solo lunch", amountMinor: 100000, currency: "INR", date, payers: { [me.id]: 100000 },
      split: { type: "EXACT", amounts: { [me.id]: 100000 } }, personal: { categoryId: food.id, note: "Solo lunch" },
    });
    const s = await rows(demo.id, solo.id);
    ok("just-me expense mirrors the full amount", s.length === 1 && s[0].amountMinor === 100000 && s[0].categoryId === food.id);

    // 2) Split three ways: I paid 3000, my share is 1000, the friend's is 1000, the no-account member has no ledger.
    const split = await createGroupExpense(actor, g.id, "mc-split", {
      title: "Dinner", category: "Food", amountMinor: 300000, currency: "INR", date, payers: { [me.id]: 300000 },
      split: { type: "EQUAL", memberIds: [me.id, fr.id, na.id] },
    });
    const mine = await rows(demo.id, split.id);
    const theirs = await rows(friend.id, split.id);
    ok("my row is my share, not what I paid", mine.length === 1 && mine[0].amountMinor === 100000, `${mine[0]?.amountMinor}`);
    ok("category matched by name when none chosen", mine[0]?.categoryId === food.id);
    ok("friend gets their own share row", theirs.length === 1 && theirs[0].amountMinor === 100000);
    ok("name-only member has no personal row", (await db.transaction.count({ where: { groupExpenseId: split.id } })) === 2);

    // 3) Edit to 6000: shares double, and rows follow.
    await updateGroupExpense(actor, true, g.id, split.id, {
      title: "Dinner", category: "Food", amountMinor: 600000, currency: "INR", date, payers: { [me.id]: 600000 },
      split: { type: "EQUAL", memberIds: [me.id, fr.id, na.id] },
    });
    ok("editing updates the personal rows", (await rows(demo.id, split.id))[0]?.amountMinor === 200000 && (await rows(friend.id, split.id))[0]?.amountMinor === 200000);

    // 4) Edit so the friend is no longer in the split: their row disappears.
    await updateGroupExpense(actor, true, g.id, split.id, {
      title: "Dinner", category: "Food", amountMinor: 600000, currency: "INR", date, payers: { [me.id]: 600000 },
      split: { type: "EQUAL", memberIds: [me.id, na.id] },
    });
    ok("removing someone from the split removes their row", (await rows(friend.id, split.id)).length === 0 && (await rows(demo.id, split.id))[0]?.amountMinor === 300000);

    // 5) Idempotent replay (offline retry) creates nothing new.
    await createGroupExpense(actor, g.id, "mc-split", { title: "Dinner", amountMinor: 300000, currency: "INR", date, payers: { [me.id]: 300000 }, split: { type: "EQUAL", memberIds: [me.id] } });
    ok("replaying the same client id does not duplicate", (await rows(demo.id, split.id)).length === 1);

    // 6) Delete: every personal row goes.
    await deleteGroupExpense(actor, true, g.id, split.id);
    ok("deleting the group expense removes personal rows", (await db.transaction.count({ where: { groupExpenseId: split.id } })) === 0);
    ok("other expense unaffected", (await rows(demo.id, solo.id)).length === 1);
  } finally {
    await db.transaction.deleteMany({ where: { groupExpense: { groupId: g.id } } });
    await db.groupExpense.deleteMany({ where: { groupId: g.id } });
    await db.group.delete({ where: { id: g.id } });
  }
  console.log(out.join("\n"));
  if (out.some((l) => l.startsWith("FAIL"))) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
