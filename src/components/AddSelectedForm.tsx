"use client";
import { useActionState, useEffect, useRef } from "react";
import { addSelectedRecurring } from "@/app/actions";

/** The tick-and-add form around the recurring list. Shows what was added and what could not be (a left group, a split that changed). */
export default function AddSelectedForm({ children, hasItems }: { children: React.ReactNode; hasItems: boolean }) {
  const [message, action, pending] = useActionState(addSelectedRecurring, "");
  const form = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  // Untick everything once the bills are added, so a second click does not add the next occurrence by mistake.
  useEffect(() => {
    if (wasPending.current && !pending) form.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((c) => { c.checked = false; });
    wasPending.current = pending;
  }, [pending]);
  return (
    <form ref={form} action={action} className="space-y-2">
      {children}
      {hasItems && (
        <>
          <button className="btn w-full" disabled={pending}>Add selected to expenses</button>
          {message && <p role="status" className="text-sm">{message}</p>}
          <p className="text-xs text-muted">Recurring bills are not added to your expenses on their own. Tick the ones you have paid and add them; each moves on to its next date.</p>
        </>
      )}
    </form>
  );
}
