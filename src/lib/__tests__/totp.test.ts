import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, newSecret, verifyTotp, stepFor } from "../totp";

// RFC 6238 test secret "12345678901234567890" (ASCII), SHA-1.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 vectors (6-digit tails)", () => {
    expect(hotp(RFC_SECRET, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(hotp(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(hotp(RFC_SECRET, Math.floor(20000000000 / 30), 8)).toBe("65353130");
  });
  it("base32 round-trips", () => {
    const s = newSecret();
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(s).toHaveLength(32);
  });
  it("accepts current and adjacent steps, rejects others and bad input", () => {
    const now = 1_700_000_000_000;
    const step = stepFor(now);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), null, now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 5), null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", null, now)).toBeNull();
  });
  it("refuses to replay a code that was already used", () => {
    const now = 1_700_000_000_000;
    const step = stepFor(now);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, step, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, step - 1, now)).toBe(step);
  });
});
