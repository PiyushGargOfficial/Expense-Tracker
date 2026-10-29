const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwertyuiop", "iloveyou1", "admin1234", "letmein123"]);

/** Returns a user-facing problem, or null if the password is acceptable. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 10) return "Password must be at least 10 characters";
  // bcrypt only uses the first 72 bytes; longer input would be silently truncated.
  if (new TextEncoder().encode(password).length > 72) return "Password must be at most 72 bytes";
  if (/^\d+$/.test(password)) return "Password can't be only digits";
  if (COMMON.has(password.toLowerCase())) return "That password is too common";
  const local = email.split("@")[0];
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "Password can't contain your email name";
  return null;
}
