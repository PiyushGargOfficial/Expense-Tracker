// Exchange rates for showing a Canadian-dollar equivalent next to other currencies. Display only: stored amounts
// stay in their own currency and are never converted or added across currencies.

export type Rates = {
  /** Units of each currency per 1 CAD, e.g. INR: 60.5 means 1 CAD = 60.5 INR. */
  perCad: Record<string, number>;
  /** When the rates were published (ISO string), or null for the built-in approximations. */
  asOf: string | null;
  live: boolean;
};

// Used only until live rates arrive (or when the rate service cannot be reached).
export const FALLBACK_RATES: Rates = {
  perCad: { CAD: 1, USD: 0.72, INR: 60, EUR: 0.62, GBP: 0.54, AED: 2.65, AUD: 1.02, SGD: 0.93, JPY: 108 },
  asOf: null,
  live: false,
};

let current: Rates = FALLBACK_RATES;
export const setRates = (r: Rates) => { current = r; };
export const getRates = () => current;

/** Canadian-dollar minor units (cents) for an amount in `currency` minor units, or null when no rate is known. */
export function toCadMinor(minor: number, currency: string, rates: Rates = current): number | null {
  if (currency === "CAD") return minor;
  const per = rates.perCad[currency];
  if (!per) return null;
  const dec = (c: string) => (c === "JPY" ? 0 : 2);
  const major = minor / 10 ** dec(currency);
  return Math.round((major / per) * 100);
}

/** "1 INR = 0.0167 CAD" and the inverse, "1 CAD = 60.00 INR". Null for CAD or an unknown currency. */
export function rateLabel(currency: string, rates: Rates = current): string | null {
  const per = rates.perCad[currency];
  if (currency === "CAD" || !per) return null;
  const one = 1 / per;
  const digits = one >= 1 ? 2 : one >= 0.1 ? 3 : 4;
  return `1 ${currency} = ${one.toFixed(digits)} CAD · 1 CAD = ${per.toFixed(per >= 100 ? 1 : 2)} ${currency}`;
}
