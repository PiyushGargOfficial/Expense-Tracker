"use server";

import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { decrypt, encrypt, newRecoveryCodes, normalizeRecovery, sha256 } from "@/lib/crypto";
import { newSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { isLimited, recordHit, reset } from "@/lib/ratelimit";

type Setup = { ok: true; qr: string; secret: string } | { ok: false; error: string };

/** Starts enrolment. The secret is stored encrypted but inactive until a valid code proves the app is set up. */
export async function startTotp(): Promise<Setup> {
  const u = await requireUser();
  if (!u.passwordHash) return { ok: false, error: "2FA applies to password sign-in. Google accounts use Google's own protection." };
  if (u.totpEnabled) return { ok: false, error: "2FA is already on" };
  const secret = newSecret();
  await db.user.update({ where: { id: u.id }, data: { totpSecret: encrypt(secret), totpLastStep: null } });
  return { ok: true, secret, qr: await QRCode.toDataURL(otpauthUri(secret, u.email), { margin: 1, width: 220 }) };
}

export async function enableTotp(code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const u = await requireUser();
  if (u.totpEnabled || !u.totpSecret) return { ok: false, error: "Start setup first" };
  const key = `totp-setup:${u.id}`;
  if (isLimited(key, 8, 15 * 60_000)) return { ok: false, error: "Too many attempts. Try again later." };
  const step = verifyTotp(decrypt(u.totpSecret), code.replace(/\s/g, ""), null);
  if (step === null) {
    recordHit(key, 15 * 60_000);
    return { ok: false, error: "That code isn't right. Check the time on your phone and try again." };
  }
  reset(key);
  const { codes, hashes } = newRecoveryCodes();
  await db.user.update({ where: { id: u.id }, data: { totpEnabled: true, totpLastStep: step, recoveryHashes: hashes } });
  revalidatePath("/settings");
  return { ok: true, recoveryCodes: codes }; // the only time the raw recovery codes are ever shown
}

/** Turning 2FA off needs the password AND a current code (or recovery code), so a hijacked session can't strip it. */
export async function disableTotp(password: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const u = await requireUser();
  if (!u.totpEnabled || !u.totpSecret || !u.passwordHash) return { ok: false, error: "2FA is not on" };
  const key = `totp-disable:${u.id}`;
  if (isLimited(key, 5, 15 * 60_000)) return { ok: false, error: "Too many attempts. Try again later." };
  const pwOk = await bcrypt.compare(password.slice(0, 72), u.passwordHash);
  const clean = code.replace(/\s/g, "");
  const codeOk = verifyTotp(decrypt(u.totpSecret), clean, u.totpLastStep) !== null || u.recoveryHashes.includes(sha256(normalizeRecovery(code)));
  if (!pwOk || !codeOk) {
    recordHit(key, 15 * 60_000);
    return { ok: false, error: "Password or code is incorrect" };
  }
  reset(key);
  await db.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryHashes: [] } });
  revalidatePath("/settings");
  return { ok: true };
}

/** Replaces all recovery codes (old ones stop working). Requires a current authenticator code. */
export async function regenerateRecovery(code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const u = await requireUser();
  if (!u.totpEnabled || !u.totpSecret) return { ok: false, error: "2FA is not on" };
  const key = `totp-regen:${u.id}`;
  if (isLimited(key, 5, 15 * 60_000)) return { ok: false, error: "Too many attempts. Try again later." };
  const step = verifyTotp(decrypt(u.totpSecret), code.replace(/\s/g, ""), u.totpLastStep);
  if (step === null) {
    recordHit(key, 15 * 60_000);
    return { ok: false, error: "Invalid code" };
  }
  const { codes, hashes } = newRecoveryCodes();
  await db.user.update({ where: { id: u.id }, data: { recoveryHashes: hashes, totpLastStep: step } });
  return { ok: true, recoveryCodes: codes };
}
