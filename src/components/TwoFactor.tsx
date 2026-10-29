"use client";
import { useState, useTransition } from "react";
import { startTotp, enableTotp, disableTotp, regenerateRecovery } from "@/app/twofactor";

export default function TwoFactor({ enabled, available, recoveryLeft }: { enabled: boolean; available: boolean; recoveryLeft: number }) {
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [on, setOn] = useState(enabled);

  if (!available) return <p className="text-sm text-muted">Two-factor applies to password sign-in. Accounts that use Google sign-in are protected by Google&apos;s own security.</p>;

  const begin = () => start(async () => {
    setError("");
    const r = await startTotp();
    if (r.ok) setSetup({ qr: r.qr, secret: r.secret }); else setError(r.error);
  });
  const confirm = () => start(async () => {
    setError("");
    const r = await enableTotp(code);
    if (r.ok) { setCodes(r.recoveryCodes); setSetup(null); setOn(true); setCode(""); } else setError(r.error);
  });
  const turnOff = () => start(async () => {
    setError("");
    const r = await disableTotp(password, code);
    if (r.ok) { setOn(false); setCode(""); setPassword(""); setCodes(null); } else setError(r.error ?? "Failed");
  });
  const regen = () => start(async () => {
    setError("");
    const r = await regenerateRecovery(code);
    if (r.ok) { setCodes(r.recoveryCodes); setCode(""); } else setError(r.error);
  });

  return (
    <div className="space-y-3">
      {codes && (
        <div className="rounded-lg border border-amber-500 p-3" role="alert">
          <p className="mb-2 text-sm font-medium">Save these recovery codes now. They won&apos;t be shown again, and each works once if you lose your phone.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <button className="btn-ghost mt-2" onClick={() => setCodes(null)}>I&apos;ve saved them</button>
        </div>
      )}

      {!on && !setup && (
        <>
          <p className="text-sm text-muted">Protect your account with a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password).</p>
          <button className="btn" onClick={begin} disabled={pending}>Set up two-factor</button>
        </>
      )}

      {setup && (
        <div className="space-y-2">
          <p className="text-sm">1. Scan this with your authenticator app.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded bg-white" />
          <p className="text-xs text-muted">Can&apos;t scan? Enter this key: <code className="break-all">{setup.secret}</code></p>
          <p className="text-sm">2. Enter the 6-digit code it shows.</p>
          <div className="flex gap-2">
            <input className="input w-40 tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={7} aria-label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" onClick={confirm} disabled={pending}>Turn on</button>
          </div>
        </div>
      )}

      {on && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">Two-factor is on. {recoveryLeft ? `${recoveryLeft} recovery codes left.` : ""}</p>
          <input className="input" placeholder="Current 6-digit code or a recovery code" aria-label="Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="input" type="password" placeholder="Password (needed to turn off)" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={regen} disabled={pending || !code}>New recovery codes</button>
            <button className="btn-ghost text-red-600" onClick={turnOff} disabled={pending || !code || !password}>Turn off</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
