"use client";
// Offline outbox: writes are queued in IndexedDB and replayed against /api/sync when online.
import { openDB } from "idb";

export type QueuedOp =
  | { kind: "txn"; clientId: string; data: unknown }
  | { kind: "groupExpense"; clientId: string; groupId: string; data: unknown }
  | { kind: "settlement"; clientId: string; groupId: string; data: unknown };

const dbp = () =>
  openDB("outbox", 1, { upgrade: (db) => void db.createObjectStore("ops", { keyPath: "clientId" }) });

export const newClientId = () => crypto.randomUUID();

export async function pendingCount(): Promise<number> {
  return (await (await dbp()).count("ops")) as number;
}

/** Try the network first; on any failure keep the op for later. Returns "synced" | "queued" | error text. */
export async function submitOp(op: QueuedOp): Promise<{ status: "synced" | "queued" } | { status: "error"; error: string }> {
  try {
    if (!navigator.onLine) throw new Error("offline");
    const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops: [op] }) });
    if (res.status === 401) throw new Error("offline"); // session expired: keep it, sync after login
    const { results } = await res.json();
    if (results[0].ok) return { status: "synced" };
    return { status: "error", error: results[0].error ?? "Failed" }; // validation errors are not retried
  } catch {
    await (await dbp()).put("ops", op);
    window.dispatchEvent(new Event("outbox-changed"));
    return { status: "queued" };
  }
}

let flushing = false;
export async function flush(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  try {
    const db = await dbp();
    const ops = (await db.getAll("ops")) as QueuedOp[];
    if (!ops.length) return 0;
    const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) });
    if (!res.ok) return 0;
    const { results } = (await res.json()) as { results: { clientId: string; ok: boolean; error?: string }[] };
    let done = 0;
    for (const r of results) {
      // Drop synced ops and permanently-invalid ones; they would fail forever otherwise.
      await db.delete("ops", r.clientId);
      if (r.ok) done++;
    }
    window.dispatchEvent(new Event("outbox-changed"));
    return done;
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}
