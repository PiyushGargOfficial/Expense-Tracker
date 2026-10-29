"use client";
import { useActionState, useState, useTransition } from "react";
import { login, register, googleLogin } from "@/app/actions";
import { TOTP_REQUIRED } from "@/lib/authMessages";

type Creds = { email: string; password: string };

export default function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  // One action state per mode: swapping the action passed to a single hook leaves the form bound to the old one.
  const [loginResult, loginAction, loginPending] = useActionState(login, undefined);
  const [registerResult, registerAction, registerPending] = useActionState(register, undefined);
  const [result, action, pending] = mode === "login" ? [loginResult, loginAction, loginPending] : [registerResult, registerAction, registerPending];
  const [submitting, startTransition] = useTransition();
  // Remembered between the password step and the 2FA code step. React 19 clears form fields after a submit, so
  // the code step carries these in hidden inputs instead of relying on the visible fields keeping their text.
  const [creds, setCreds] = useState<Creds | null>(null);

  const isCodeResult = result?.startsWith(TOTP_REQUIRED) ?? false;
  const showCode = mode === "login" && isCodeResult && creds !== null;
  const codeError = isCodeResult && result!.length > TOTP_REQUIRED.length ? result!.slice(TOTP_REQUIRED.length + 1) : null;
  const error = result && !isCodeResult ? result : null;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (mode === "login") setCreds({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
    startTransition(() => action(data));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:max-w-md">
      <h1 className="text-2xl font-bold">Expense Tracker</h1>
      <p className="text-muted">Track your spending. Split bills with friends.</p>

      <form onSubmit={onSubmit} className="card flex flex-col gap-3">
        {showCode ? (
          <>
            <input type="hidden" name="email" value={creds.email} />
            <input type="hidden" name="password" value={creds.password} />
            <p className="text-sm">Signing in as <span className="font-medium">{creds.email}</span></p>
            <div>
              <label className="label" htmlFor="code">Authentication code</label>
              <input key={result} id="code" name="code" className="input tracking-widest" inputMode="text" autoComplete="one-time-code" placeholder="123456 or a recovery code" autoFocus required />
              <p className="mt-1 text-xs text-muted">From your authenticator app, or one of your recovery codes.</p>
            </div>
            {codeError && <p role="alert" className="text-sm text-red-600">{codeError}</p>}
            <button className="btn" disabled={pending || submitting}>Verify and sign in</button>
            <button type="button" className="text-sm text-muted underline" onClick={() => setCreds(null)}>Use a different account</button>
          </>
        ) : (
          <>
            {mode === "register" && (
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" name="name" className="input" autoComplete="name" required />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="input" autoComplete="email" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" minLength={mode === "register" ? 10 : undefined} maxLength={72} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
              {mode === "register" && <p className="mt-1 text-xs text-muted">At least 10 characters.</p>}
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button className="btn" disabled={pending || submitting}>{mode === "login" ? "Sign in" : "Create account"}</button>
          </>
        )}
      </form>

      {googleEnabled && (
        <form action={googleLogin}>
          <button className="btn-ghost w-full">Continue with Google</button>
        </form>
      )}

      <button className="text-sm text-muted underline" onClick={() => { setCreds(null); setMode(mode === "login" ? "register" : "login"); }}>
        {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </main>
  );
}
