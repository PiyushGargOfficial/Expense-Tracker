import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import Link from "next/link";
import { addCategory, deleteAccount } from "@/app/actions";
import ImportForm from "@/components/ImportForm";
import TwoFactor from "@/components/TwoFactor";

export default async function Settings() {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([
    db.account.findMany({ where: { userId: user.id } }),
    db.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <h1 className="text-xl font-bold lg:col-span-2">Settings</h1>

      <section className="card space-y-2">
        <h2 className="font-semibold">Accounts</h2>
        <p className="text-sm text-muted">You have {accounts.filter((a) => !a.archived).length} account{accounts.filter((a) => !a.archived).length === 1 ? "" : "s"}. Balances, credit cards and due dates are on the Accounts page.</p>
        <Link href="/accounts" className="btn-ghost inline-flex">Manage accounts</Link>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Categories</h2>
        <ul className="text-sm">{categories.filter((c) => !c.parentId).map((c) => (
          <li key={c.id}>{c.name}{categories.filter((s) => s.parentId === c.id).map((s) => <span key={s.id} className="text-muted"> › {s.name}</span>)}</li>
        ))}</ul>
        <form action={addCategory} className="grid grid-cols-3 gap-2">
          <input name="name" className="input col-span-3" placeholder="New category or subcategory" aria-label="Category name" required />
          <select name="parentId" className="input col-span-2" aria-label="Parent"><option value="">Top level</option>{categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>Under {c.name}</option>)}</select>
          <button className="btn">Add</button>
        </form>
      </section>

      <section className="card space-y-2" aria-label="Two-factor authentication">
        <h2 className="font-semibold">Two-factor authentication</h2>
        <TwoFactor enabled={user.totpEnabled} available={Boolean(user.passwordHash)} recoveryLeft={user.recoveryHashes.length} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Your data</h2>
        <a className="btn-ghost" href="/api/export">Export all transactions (CSV)</a>
        <ImportForm />
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold text-red-600">Delete account</h2>
        <p className="text-sm text-muted">Removes your personal data permanently. Shared group history stays for the other members.</p>
        <form action={deleteAccount} className="flex gap-2">
          <input name="confirm" className="input" placeholder={`Type ${user.email} to confirm`} aria-label="Confirm email" />
          <button className="btn !bg-red-600">Delete</button>
        </form>
      </section>
    </div>
  );
}
