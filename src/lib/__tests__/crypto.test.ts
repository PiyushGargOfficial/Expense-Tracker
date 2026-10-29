import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret"; });

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", async () => {
    const { encrypt, decrypt } = await import("../crypto");
    const a = encrypt("JBSWY3DPEHPK3PXP"), b = encrypt("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("detects tampering", async () => {
    const { encrypt, decrypt } = await import("../crypto");
    const parts = encrypt("secret").split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("recovery codes are unique and hash to what is stored", async () => {
    const { newRecoveryCodes, sha256 } = await import("../crypto");
    const { codes, hashes } = newRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashes[0]).toBe(sha256(codes[0]));
  });
});
