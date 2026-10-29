import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ensureDefaults } from "@/app/actions";
import LogoutButton from "@/components/LogoutButton";
import NavLinks from "@/components/NavLinks";
import SyncManager from "@/components/SyncManager";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureDefaults(user.id);
  const first = user.name.split(" ")[0];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Laptop and up: persistent sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-card p-4 lg:flex">
        <Link href="/" className="mb-6 px-3 text-lg font-bold">Expense Tracker</Link>
        <nav aria-label="Main"><NavLinks variant="side" /></nav>
        <div className="mt-auto px-3"><LogoutButton name={first} /></div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Phone and tablet: slim top bar, padded for the notch / Dynamic Island */}
        <header className="flex items-center justify-between border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
          <Link href="/" className="font-bold">Expense Tracker</Link>
          <LogoutButton name={first} />
        </header>

        <main className="mx-auto w-full max-w-[88rem] flex-1 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:p-8">
          {children}
        </main>
      </div>

      {/* Phone and tablet: bottom tab bar, clear of the home indicator */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <NavLinks variant="bottom" />
      </nav>
      <SyncManager />
    </div>
  );
}
