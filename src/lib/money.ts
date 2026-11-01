// All amounts are integers in minor units (paise, cents). Never floats.
import { toCadMinor } from "./fx";

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

/** The amount in its own currency only. */
export function formatPlain(minor: number, currency: string, locale?: string): string {
  const d = decimalsFor(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(minor / 10 ** d);
}

/** "CA$16.50", always marked as Canadian dollars so it is never mistaken for US dollars. */
export function formatCad(cadMinor: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "CAD", currencyDisplay: "symbol" }).format(cadMinor / 100);
}

/** The amount, plus its Canadian-dollar equivalent in brackets when the currency is not CAD: "₹1,000.00 (≈ CA$16.67)". */
export function formatMinor(minor: number, currency: string, locale?: string): string {
  const plain = formatPlain(minor, currency, locale);
  if (currency === "CAD") return plain;
  const cad = toCadMinor(minor, currency);
  return cad === null ? plain : `${plain} (≈ ${formatCad(cad)})`;
}

/** Minor units -> plain editable string, e.g. 45050 -> "450.50" */
export function minorToInput(minor: number, currency: string): string {
  const d = decimalsFor(currency);
  return (minor / 10 ** d).toFixed(d);
}
