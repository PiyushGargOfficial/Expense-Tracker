# Deploy for free: Vercel + Neon

Both have free tiers with no card needed. You'll create the accounts yourself.

## 1. Database (Neon)
1. Sign up at neon.tech and create a project (pick the region nearest you).
2. From the dashboard copy two connection strings:
   - **Pooled** (host contains `-pooler`) goes in `DATABASE_URL`
   - **Direct** (no `-pooler`) goes in `DIRECT_URL`
3. Create the tables once, from this folder:
   ```bash
   DATABASE_URL="<direct string>" DIRECT_URL="<direct string>" npx prisma db push
   ```
   Do **not** run `npm run db:seed` against production: it creates accounts with a known password.

## 2. App (Vercel)
1. Push this folder to a GitHub repository (the `.env` file is git-ignored; `.env.example` is the template).
2. At vercel.com choose **Add New > Project**, import the repo, keep the Next.js defaults.
3. Set these environment variables (Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled string |
   | `DIRECT_URL` | Neon direct string |
   | `AUTH_SECRET` | a new random value: `npx auth secret` (or `openssl rand -base64 32`) |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional, for Google sign-in |

4. Deploy. For Google sign-in add `https://your-app.vercel.app/api/auth/callback/google` as an authorised redirect URI.

## Before real users
- The login/sync rate limiter is in memory, which on Vercel is per serverless instance. Swap it for a shared
  store (Upstash Redis has a free tier) before relying on it.
- Free-tier databases pause when idle, so the first request after a quiet spell can be slow.
- Set up backups in Neon (point-in-time restore is on the free plan for a short window).
