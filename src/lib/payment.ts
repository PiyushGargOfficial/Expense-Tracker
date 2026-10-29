// Ways people actually settle up in Canada. One list drives the forms, validation and how payments are shown.
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "etransfer", label: "Interac e-Transfer" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "paypal", label: "PayPal" },
  { value: "other", label: "Other" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export const PAYMENT_VALUES = PAYMENT_METHODS.map((m) => m.value) as [PaymentMethod, ...PaymentMethod[]];

/** Display name for a stored method. Older "upi" payments are shown as Interac e-Transfer, the nearest equivalent. */
export function paymentLabel(value: string): string {
  const v = value === "upi" ? "etransfer" : value;
  return PAYMENT_METHODS.find((m) => m.value === v)?.label ?? value;
}
