import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM with a key derived from AUTH_SECRET. Rotating AUTH_SECRET invalidates stored 2FA secrets.
function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`totp-at-rest:${secret}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const randomToken = () => randomBytes(32).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 8 single-use recovery codes like "k3f9-x2mq-7d4h". Returns raw codes (show once) and their hashes (store). */
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const codes = Array.from({ length: 8 }, () => {
    const b = randomBytes(12);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c)) };
}

export const normalizeRecovery = (s: string) => s.trim().toLowerCase();
