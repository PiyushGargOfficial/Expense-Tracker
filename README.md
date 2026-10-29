# Expense Tracker with Splitwise-style groups

Next.js 16 + TypeScript + Prisma + Postgres. PWA with an offline write queue.

## Run it

1. Create a free Postgres database (Neon or Supabase) and copy its connection strings.
2. `cp .env.example .env` and set `DATABASE_URL`, `DIRECT_URL`, and `AUTH_SECRET` (`npx auth secret`).
   Optional Google sign-in: set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
   (redirect URI: `/api/auth/callback/google`).
3. `npm install && npm run db:push && npm run dev`
4. `npm test` runs the money, split and balance tests.

Free-tier deploy: Vercel (app) + Neon (database).

## What is built (MVP)

**Personal**: add/delete expense, income and transfers; accounts; categories and subcategories; monthly budgets
with threshold alerts; recurring items (never posted automatically: tick the ones you paid and add them to expenses; highlighted when due soon); search, filter, sort;
CSV import/export; reports (by category, month over month, top merchants); account deletion.

**Accounts**: balance per account (starting balance plus recorded transactions, per currency), and for credit
cards the amount owed, limit, available credit, utilisation, statement and payment due dates, minimum payment,
interest rate, and what was paid since the last statement. Cards due within 7 days are flagged.

**Groups**: create groups, invite link, name-only members (claimable on join), equal / exact / percent / shares /
itemized splits, single or multiple payers, per-group balances, simplified "who owes whom", partial settle-up
(cash, Interac e-Transfer, bank transfer, cheque, PayPal), edit/delete (creator or admin, soft delete), audit log activity feed, comments.

**Offline**: new expenses and settlements are queued in IndexedDB and replayed through `/api/sync`; every op
carries a `clientId`, so retries never duplicate. Visited pages are cached by the service worker.

## Security

- Passwords: bcrypt (cost 12), 10 to 72 characters, common/numeric/email-derived passwords rejected.
- Login: 5 failed attempts per email locks sign-in for 15 minutes; unknown emails cost the same bcrypt time and
  get the same error message. Sign-ups limited to 5 per hour per IP. Sessions last 7 days.
- Sign-up can no longer attach a password to an existing Google account (that was an account-takeover path).
- No email confirmation: password sign-ups can sign in straight away, so the address is not proven to belong to
  the person. To stop address squatting, when the real owner later signs in with Google (which does prove
  ownership) any password set on that address beforehand is revoked, along with its 2FA.
- Optional two-factor (TOTP, works with any authenticator app): secret encrypted at rest (AES-256-GCM),
  a code can't be reused, 8 single-use recovery codes stored hashed, wrong codes count toward the login lockout,
  and turning it off needs the password plus a code. Applies to password sign-in; Google accounts rely on Google.
- Authorization: every group read/write checks membership, and expenses are always looked up together with
  their group (`prisma/idor-check.ts` is a regression check for this).
- Headers: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; `/api/*` is `no-store`.
- Sync API: 50 ops and 1 MB per request, 120 requests per minute per user, all input validated with zod.
- CSV export neutralises spreadsheet formulas; group invite codes are 144-bit random.
- Sign-out clears the service-worker cache and the offline queue on that device.

Known limits: the rate limiter is in-memory (use a shared store such as Upstash when deployed to serverless);
a per-email lockout lets someone deliberately lock another person out for 15 minutes; 2FA covers password
sign-in only and rotating `AUTH_SECRET` invalidates stored 2FA secrets; the CSP still allows inline scripts (needed by Next unless nonces are added).

## Decisions

- Money is integer minor units everywhere. Uneven splits give leftover units to the payer first, and always sum exactly.
- Multi-currency: each expense keeps its own currency. Balances, budgets and reports are per currency
  (no silent conversion, so no wrong totals). Exchange-rate conversion is a v2 item.
- Home and Groups are linked. Adding an expense on Home with a group picked creates a group expense paid by you
  (default split "just me"; or equally with everyone; "More split options" opens the full form). Group expenses
  entered in the group section count in your personal totals too.
- The group expense is the single source of truth. Each member who has an account gets a personal row holding
  THEIR SHARE (`Transaction.groupExpenseId`, kept in step by `lib/mirror.ts` on create, edit and delete), so Home
  totals, reports, budgets, search and CSV export include it with no double counting. What you paid beyond your
  share is not spending; it shows up under Budgets > "Lent out" until it is paid back. Settlements move money
  between people and are not spending.
- Those personal rows are managed from the group (Home shows "Open" instead of "Delete"). Other members never see
  your personal data, only the group expense itself.
- Existing data from before this link: run `npm run db:backfill` once (safe to repeat).
- Balances are always recomputed from the ledger, so back-dated edits are correct automatically.

## Not done yet (v2)

Receipt photo upload/OCR, PDF export, email/push notifications and payment reminders, bank-statement parsing
beyond the simple CSV format, natural-language entry, FX conversion, editing personal transactions,
offline editing of existing records, full-text i18n.
