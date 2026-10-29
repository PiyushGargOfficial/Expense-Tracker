import { db } from "@/lib/db";
import { computeNet, simplify } from "@/lib/balances";

export function monthRange(d = new Date()) {
  return { start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) };
}

/** Ledger for a group: balances are always derived from non-deleted expenses and settlements. */
export async function groupLedger(groupId: string) {
  const [expenses, settlements] = await Promise.all([
    db.groupExpense.findMany({ where: { groupId, deletedAt: null }, include: { payers: true, shares: true } }),
    db.settlement.findMany({ where: { groupId, deletedAt: null } }),
  ]);
  const net = computeNet(
    expenses.map((e) => ({
      currency: e.currency,
      paid: Object.fromEntries(e.payers.map((p) => [p.memberId, p.paidMinor])),
      owed: Object.fromEntries(e.shares.map((s) => [s.memberId, s.owedMinor])),
    })),
    settlements.map((s) => ({ currency: s.currency, fromId: s.fromId, toId: s.toId, amountMinor: s.amountMinor })),
  );
  return { net, transfers: simplify(net), expenses, settlements };
}
