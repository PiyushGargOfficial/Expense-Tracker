import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ensureDefaults } from "@/app/actions";
import LogoutButton from "@/components/LogoutButton";
import NavLinks from "@/components/NavLinks";
import SyncManager from "@/components/SyncManager";
import { RatesHydrator } from "@/components/CadHint";
import { getRates, rateLabel } from "@/lib/fx";
import { CURRENCIES } from "@/lib/money";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureDefaults(user.id);
  const first = user.name.split(" ")[0];
  const rates = getRates();
  const labels = CURRENCIES.filter((c) => c !== "CAD").map((c) => rateLabel(c, rates)).filter(Boolean) as string[];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <RatesHydrator rates={rates} />
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
          <details className="mt-8 text-xs text-muted">
            <summary className="cursor-pointer">Exchange rates to Canadian dollars</summary>
            <ul className="mt-2 space-y-0.5">{labels.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="mt-1">{rates.live && rates.asOf ? `Updated ${new Date(rates.asOf).toISOString().slice(0, 10)}, refreshed every few hours. ` : "Approximate rates, live rates are unavailable right now. "}Amounts in other currencies show their Canadian-dollar equivalent in brackets; nothing is converted or added across currencies.</p>
          </details>
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
