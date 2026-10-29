"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flush, pendingCount } from "@/lib/outbox";

export default function SyncManager() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      } else {
        // In dev the script files keep the same names between edits, so a caching worker serves stale code.
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
        caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      }
    }
    const refresh = async () => setPending(await pendingCount());
    const sync = async () => {
      if ((await flush()) > 0) router.refresh();
      refresh();
    };
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    queueMicrotask(() => {
      setOnline(navigator.onLine);
      sync();
    });
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener("outbox-changed", refresh);
    const t = setInterval(sync, 30000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener("outbox-changed", refresh);
      clearInterval(t);
    };
  }, [router]);

  if (online && !pending) return null;
  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-black shadow lg:bottom-4" role="status">
      {online ? `Syncing ${pending} change${pending > 1 ? "s" : ""}…` : `Offline${pending ? ` · ${pending} waiting to sync` : ""}`}
    </div>
  );
}
