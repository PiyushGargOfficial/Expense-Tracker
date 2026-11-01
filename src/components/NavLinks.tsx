"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string; short?: string; d: string }[] = [
  { href: "/", label: "Home", d: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V11z" },
  { href: "/groups", label: "Groups", d: "M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-6 1.3-6 4v2h12v-2c0-2.7-3.3-4-6-4zm8 0c-.4 0-.8 0-1.2.1 1.2.9 2.2 2.1 2.2 3.9v2h7v-2c0-2.7-3.3-4-8-4z" },
  { href: "/accounts", label: "Accounts", d: "M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6zm0 4h18M7 15h4" },
  { href: "/investments", label: "Investments", short: "Invest", d: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/reports", label: "Reports", d: "M4 20V10m6 10V4m6 16v-7m6 7H2" },
  { href: "/budgets", label: "Budgets", d: "M12 3a9 9 0 1 0 9 9h-9V3zm2 0v7h7a7 7 0 0 0-7-7z" },
  { href: "/recurring", label: "Recurring", d: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14 3v2a3 3 0 0 1-3 3H3" },
  { href: "/settings", label: "Settings", d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.700 3h-4l-.4 2.700a7 7 0 0 0-2 1.200l-2.300-1-2 3.400 2 1.500a7.400 7.400 0 0 0 0 2.400l-2 1.500 2 3.400 2.300-1a7 7 0 0 0 2 1.200l.4 2.700h4l.4-2.700a7 7 0 0 0 2-1.200l2.300 1 2-3.400-2-1.500c.1-.4.1-.8.1-1.200z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 lg:h-5 lg:w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** One list of links rendered two ways: a bottom tab bar on phones, a vertical sidebar on laptops and up. */
export default function NavLinks({ variant }: { variant: "bottom" | "side" }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  if (variant === "bottom") {
    return (
      <ul className="flex">
        {NAV.map((n) => (
          <li key={n.href} className="flex-1">
            <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active(n.href) ? "font-semibold text-emerald-600" : "text-muted"}`}>
              <Icon d={n.d} />
              {n.short ?? n.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-1">
      {NAV.map((n) => (
        <li key={n.href}>
          <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active(n.href) ? "bg-emerald-600/10 font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>
            <Icon d={n.d} />
            {n.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
