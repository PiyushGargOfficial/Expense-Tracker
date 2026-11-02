"use client";
import { useRef, useState } from "react";
import { removeGroup } from "@/app/actions";

/** "Delete group" with a confirmation pop up. The delete is a soft delete on the server: the data is kept for audit. */
export default function DeleteGroupButton({ groupId, name }: { groupId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await removeGroup(groupId); // redirects to /groups on success
    } catch (e) {
      // Next's redirect is thrown as an error and must keep propagating.
      if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
      setError(e instanceof Error ? e.message : "Could not delete the group");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="-m-2 p-2 text-sm text-red-600 underline" onClick={() => { setError(""); dialog.current?.showModal(); }}>Delete group</button>
      <dialog ref={dialog} aria-labelledby="del-group-title" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-line bg-[var(--background,white)] p-5 text-[var(--foreground,inherit)] backdrop:bg-black/50">
        <h2 id="del-group-title" className="text-lg font-semibold">Delete “{name}”?</h2>
        <p className="mt-2 text-sm">This removes the group for everyone in it. Every member&apos;s share of its expenses is taken out of their spending, budgets and reports, and nobody can open the group again.</p>
        <p className="mt-2 text-sm text-muted">Nothing is erased from the database: it is marked deleted and kept for audit.</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className="btn !bg-red-600" disabled={busy} onClick={confirm}>{busy ? "Deleting…" : "Delete group"}</button>
        </div>
      </dialog>
    </>
  );
}
