import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { authorizeCredentials } from "@/lib/credentials";

const providers = [
  Credentials({
    credentials: { email: {}, password: {}, code: {} },
    async authorize(raw) {
      return authorizeCredentials(
        String(raw?.email ?? "").trim().toLowerCase(),
        String(raw?.password ?? ""),
        String(raw?.code ?? ""),
      );
    },
  }),
  ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 }, // re-login weekly instead of the 30-day default
  pages: { signIn: "/login" },
  callbacks: {
    // Google users are created on first sign-in; we keep our own User table (no adapter).
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.email) {
        // Only trust Google's identity when Google itself says the address is verified.
        if (profile?.email_verified !== true) return false;
        const email = user.email.toLowerCase();
        // Password sign-ups are not email-verified, so a password set on this address before Google proved who
        // owns it may belong to someone else. Revoke it (and its 2FA) the first time the real owner signs in.
        await db.user.updateMany({
          where: { email, emailVerified: null, passwordHash: { not: null } },
          data: { passwordHash: null, totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryHashes: [] },
        });
        await db.user.upsert({
          where: { email },
          update: { image: user.image ?? undefined, emailVerified: new Date() },
          create: { email, name: user.name ?? email.split("@")[0], image: user.image, emailVerified: new Date() },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const u = await db.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (u) token.uid = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
