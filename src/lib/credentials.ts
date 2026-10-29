import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isLimited, recordHit, reset, LOGIN_MAX, LOGIN_WINDOW } from "@/lib/ratelimit";
import { decrypt, normalizeRecovery, sha256 } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
const keyFor = (email: string) => `login:${email}`;

export type PasswordStatus = "locked" | "bad" | "totp" | "ok";

/**
 * Step 1 of sign-in: password check only. Used by the login form to decide whether to ask
 * for a 2FA code. Failures count toward the lockout; it never consumes a 2FA code.
 */
export async function passwordStatus(email: string, password: string): Promise<PasswordStatus> {
  const key = keyFor(email);
  if (isLimited(key, LOGIN_MAX, LOGIN_WINDOW)) return "locked";
  const user = await db.user.findUnique({ where: { email } });
  // Always run bcrypt so timing doesn't reveal whether the email exists.
  const ok = await bcrypt.compare(password.slice(0, 72), user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !ok) {
    recordHit(key, LOGIN_WINDOW);
    return "bad";
  }
  return user.totpEnabled ? "totp" : "ok";
}

/** Full check used by Auth.js: password and (when enabled) a TOTP or recovery code. */
export async function authorizeCredentials(email: string, password: string, code: string) {
  const status = await passwordStatus(email, password);
  if (status === "locked" || status === "bad") return null;
  const user = await db.user.findUniqueOrThrow({ where: { email } });

  if (status === "totp") {
    const key = keyFor(email);
    const clean = code.replace(/\s/g, "");
    let accepted = false;
    if (user.totpSecret) {
      const step = verifyTotp(decrypt(user.totpSecret), clean, user.totpLastStep);
      if (step !== null) {
        // Compare-and-set on the step so two parallel requests can't both use the same code.
        const res = await db.user.updateMany({
          where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
          data: { totpLastStep: step },
        });
        accepted = res.count === 1;
      }
    }
    if (!accepted) {
      const h = sha256(normalizeRecovery(code));
      if (user.recoveryHashes.includes(h)) {
        const res = await db.user.updateMany({ where: { id: user.id, recoveryHashes: { has: h } }, data: { recoveryHashes: user.recoveryHashes.filter((x) => x !== h) } });
        accepted = res.count === 1; // each recovery code works once
      }
    }
    if (!accepted) {
      recordHit(key, LOGIN_WINDOW); // wrong codes count toward the same lockout as wrong passwords
      return null;
    }
  }
  reset(keyFor(email));
  return { id: user.id, email: user.email, name: user.name };
}
