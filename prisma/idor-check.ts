// Security regression check: an expense or payment id from group B must not be editable/undoable through group A.
import { PrismaClient } from "@prisma/client";
import { updateGroupExpense, deleteGroupExpense, createSettlement, deleteSettlement } from "../src/lib/ops";

const db = new PrismaClient();

async function main() {
  const demo = await db.user.findUniqueOrThrow({ where: { email: "demo@example.com" } });
  const friend = await db.user.findUniqueOrThrow({ where: { email: "friend@example.com" } });
  const groupA = await db.group.findFirstOrThrow({ where: { name: "Demo trip" } });
  const stale = await db.group.findMany({ where: { name: "Private (friend only)" }, select: { id: true } });
  await db.groupExpense.deleteMany({ where: { groupId: { in: stale.map((g) => g.id) } } });
  await db.group.deleteMany({ where: { id: { in: stale.map((g) => g.id) } } });
  const groupB = await db.group.create({ data: { name: "Private (friend only)", members: { create: [{ userId: friend.id, name: "Friend", role: "ADMIN" }, { name: "Other" }] } }, include: { members: true } });
  const e = await db.groupExpense.create({
    data: { groupId: groupB.id, title: "Secret", amountMinor: 1000, currency: "INR", date: new Date(), splitType: "EQUAL", splitInput: { type: "EQUAL", memberIds: [groupB.members[0].id] }, createdById: friend.id,
      payers: { create: { memberId: groupB.members[0].id, paidMinor: 1000 } }, shares: { create: { memberId: groupB.members[0].id, owedMinor: 1000 } } },
  });
  const attacker = { id: demo.id, name: demo.name };
  const payload = { title: "HACKED", amountMinor: 1000, currency: "INR", date: "2026-10-28", payers: { [groupB.members[0].id]: 1000 }, split: { type: "EQUAL", memberIds: [groupB.members[0].id] } };
  const results: string[] = [];
  for (const [name, fn] of [
    ["update", () => updateGroupExpense(attacker, true, groupA.id, e.id, payload)],
    ["delete", () => deleteGroupExpense(attacker, true, groupA.id, e.id)],
  ] as const) {
    try { await fn(); results.push(`${name}: VULNERABLE`); } catch (err) { results.push(`${name}: blocked (${(err as Error).message})`); }
  }
  const after = await db.groupExpense.findUniqueOrThrow({ where: { id: e.id } });
  results.push(`expense untouched: ${after.title === "Secret" && !after.deletedAt}`);
  // Payments: undoing a group B payment through group A must be refused too.
  const pay = await createSettlement({ id: friend.id, name: "Friend" }, groupB.id, "idor-pay", { fromId: groupB.members[1].id, toId: groupB.members[0].id, amountMinor: 500, currency: "INR" });
  try { await deleteSettlement(attacker, true, groupA.id, pay.id); results.push("undo payment: VULNERABLE"); } catch (err) { results.push(`undo payment: blocked (${(err as Error).message})`); }
  const payAfter = await db.settlement.findUniqueOrThrow({ where: { id: pay.id } });
  results.push(`payment untouched: ${!payAfter.deletedAt}`);
  await db.settlement.deleteMany({ where: { groupId: groupB.id } }); // clean up
  await db.groupExpense.deleteMany({ where: { groupId: groupB.id } }); // (payers/shares cascade)
  await db.group.delete({ where: { id: groupB.id } });
  console.log(results.join("\n"));
}

main().finally(() => db.$disconnect());
