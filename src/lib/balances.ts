// Balances and debt simplification. Computed per currency; currencies are never mixed.

export type LedgerExpense = {
  currency: string;
  paid: Record<string, number>; // memberId -> minor units paid
  owed: Record<string, number>; // memberId -> minor units owed
};
export type LedgerSettlement = { currency: string; fromId: string; toId: string; amountMinor: number };

/** net[currency][memberId] > 0 means the group owes them; < 0 means they owe the group. */
export type Net = Record<string, Record<string, number>>;

export function computeNet(expenses: LedgerExpense[], settlements: LedgerSettlement[]): Net {
  const net: Net = {};
  const add = (cur: string, id: string, v: number) => {
    net[cur] ??= {};
    net[cur][id] = (net[cur][id] ?? 0) + v;
  };
  for (const e of expenses) {
    for (const [id, v] of Object.entries(e.paid)) add(e.currency, id, v);
    for (const [id, v] of Object.entries(e.owed)) add(e.currency, id, -v);
  }
  for (const s of settlements) {
    add(s.currency, s.fromId, s.amountMinor); // paying a debt raises your balance toward zero
    add(s.currency, s.toId, -s.amountMinor);
  }
  return net;
}

export type Transfer = { fromId: string; toId: string; amountMinor: number; currency: string };

/**
 * Minimise the number of payments: repeatedly match the largest debtor with the
 * largest creditor. At most (members - 1) transfers per currency.
 */
export function simplify(net: Net): Transfer[] {
  const result: Transfer[] = [];
  for (const [currency, balances] of Object.entries(net)) {
    const debtors = Object.entries(balances).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
    const creditors = Object.entries(balances).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
    while (debtors.length && creditors.length) {
      debtors.sort((a, b) => b.v - a.v);
      creditors.sort((a, b) => b.v - a.v);
      const d = debtors[0];
      const c = creditors[0];
      const amt = Math.min(d.v, c.v);
      result.push({ fromId: d.id, toId: c.id, amountMinor: amt, currency });
      d.v -= amt;
      c.v -= amt;
      if (d.v === 0) debtors.shift();
      if (c.v === 0) creditors.shift();
    }
  }
  return result;
}

export function memberBalance(net: Net, memberId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cur, b] of Object.entries(net)) if (b[memberId]) out[cur] = b[memberId];
  return out;
}
