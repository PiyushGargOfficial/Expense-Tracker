// All amounts are integers in minor units (paise, cents). Never floats.

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "UGX"]);
const THREE_DECIMAL = new Set(["KWD", "BHD", "OMR", "JOD", "TND"]);

export const CURRENCIES = ["CAD", "USD", "INR", "EUR", "GBP", "AED", "AUD", "SGD", "JPY"] as const;

export function decimalsFor(currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

/** "450.5" -> 45050 (INR). Returns null for invalid input. */
export function parseToMinor(input: string, currency: string): number | null {
  const d = decimalsFor(currency);
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > d) return null;
  const minor = Number(whole || "0") * 10 ** d + Number(frac.padEnd(d, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMinor(minor: number, currency: string, locale?: string): string {
  const d = decimalsFor(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(minor / 10 ** d);
}

/** Minor units -> plain editable string, e.g. 45050 -> "450.50" */
export function minorToInput(minor: number, currency: string): string {
  const d = decimalsFor(currency);
  return (minor / 10 ** d).toFixed(d);
}
