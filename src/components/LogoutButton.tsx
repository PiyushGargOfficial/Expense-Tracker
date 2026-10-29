"use client";
import { logout } from "@/app/actions";

/** Wipes locally cached pages and any unsynced queue before signing out, so the next person on a shared device sees nothing. */
export default function LogoutButton({ name }: { name: string }) {
  async function clearLocal() {
    try {
      for (const k of await caches.keys()) await caches.delete(k);
      indexedDB.deleteDatabase("outbox");
    } catch {}
  }
  return (
    <form action={logout} onSubmit={clearLocal}>
      <button className="text-sm text-muted underline">Sign out ({name})</button>
    </form>
  );
}
