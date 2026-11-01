"use client";
import { useEffect, useRef, useState } from "react";
import { rateLabel, setRates, toCadMinor, type Rates } from "@/lib/fx";
import { formatCad, parseToMinor } from "@/lib/money";

/** Puts the server's exchange rates in place for client components. Rendered once, first, in the app layout. */
export function RatesHydrator({ rates }: { rates: Rates }) {
  setRates(rates);
  return null;
}

/** "≈ CA$16.67 · 1 INR = 0.0167 CAD · 1 CAD = 60.00 INR" for a non-CAD currency; nothing for CAD. */
export function CadAmountHint({ amount, currency, className = "" }: { amount: string; currency: string; className?: string }) {
  const rate = rateLabel(currency);
  if (!rate) return null;
  const minor = amount.trim() ? parseToMinor(amount, currency) : null;
  const cad = minor === null ? null : toCadMinor(minor, currency);
  return (
    <p className={`text-xs text-muted ${className}`}>
      {cad !== null && <span className="font-medium text-foreground">≈ {formatCad(cad)} · </span>}
      {rate}
    </p>
  );
}

/**
 * Same hint for forms that keep their values in the DOM (server-rendered forms). It reads the closest form's amount
 * field (and its currency select, when there is one) as the user types. Pass `currency` for a fixed currency.
 */
export default function CadHint({ amountName, currencyName = "currency", currency, className = "" }: { amountName: string; currencyName?: string; currency?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState({ amount: "", currency: currency ?? "" });

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
    const read = () => setState({ amount: val(amountName), currency: currency ?? val(currencyName) });
    const afterReset = () => setTimeout(read);
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    form.addEventListener("reset", afterReset);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
      form.removeEventListener("reset", afterReset);
    };
  }, [amountName, currencyName, currency]);

  return (
    <>
      <span ref={ref} hidden />
      <CadAmountHint amount={state.amount} currency={state.currency} className={className} />
    </>
  );
}
