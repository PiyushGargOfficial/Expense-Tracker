"use client";
import { useActionState } from "react";
import { importCsv } from "@/app/actions";

export default function ImportForm() {
  const [msg, action, pending] = useActionState(importCsv, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="file" name="file" accept=".csv,text/csv" className="input" aria-label="CSV file" />
      <p className="text-xs text-muted">Header: date,amount,currency,type,category,note</p>
      <button className="btn" disabled={pending}>Import</button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  );
}
