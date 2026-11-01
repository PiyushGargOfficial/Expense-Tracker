"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { requireUser, requireMember } from "@/lib/session";
import { CURRENCIES, formatPlain, parseToMinor } from "@/lib/money";
import { KIND_VALUES, deltaFor, parseAprBps, parseSigned, type AccountKindValue } from "@/lib/accounts";
import { deleteGroupExpense, deleteSettlement, updateGroupExpense } from "@/lib/ops";
import { parseCsv } from "@/lib/csv";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { isLimited, recordHit } from "@/lib/ratelimit";
import { passwordStatus } from "@/lib/credentials";
import { syncGroupMirrors } from "@/lib/mirror";
import { addRecurringToExpenses } from "@/lib/recurring";
import { TOTP_REQUIRED } from "@/lib/authMessages";
import { passwordProblem } from "@/lib/password";
import { ASSET_VALUES } from "@/lib/investments";

const DEFAULT_CATEGORIES = ["Food", "Groceries", "Transport", "Rent", "Bills", "Shopping", "Health", "Travel", "Entertainment", "Other"];
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------- auth ----------

export async function register(_: string | undefined, f: FormData) {
  const email = s(f, "email").toLowerCase();
  const name = s(f, "name");
  const password = s(f, "password");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return "Enter your name and a valid email";
  const weak = passwordProblem(password, email);
  if (weak) return weak;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (isLimited(`register:${ip}`, 5, 60 * 60_000)) return "Too many sign-ups from this network. Try again later.";
  recordHit(`register:${ip}`, 60 * 60_000);
  const existing = await db.user.findUnique({ where: { email } });
  // Never attach a password to an existing account, or anyone could take over a Google-created account
  // just by knowing its address.
  if (existing) return existing.passwordHash ? "That email is already registered" : "That email is registered with Google. Use Continue with Google.";
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({ data: { email, name, passwordHash } });
  await db.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ userId: user.id, name: c })) });
  await db.account.create({ data: { userId: user.id, name: "Cash", kind: "CASH" } });
  return login(undefined, f);
}

export async function login(_: string | undefined, f: FormData) {
  const email = s(f, "email").toLowerCase();
  const password = s(f, "password");
  const code = s(f, "code");
  // Step 1: password check, so we know whether to ask for a code.
  const status = await passwordStatus(email, password);
  // Same message whether the email is unknown or the password is wrong.
  if (status === "bad") return "Wrong email or password";
  if (status === "locked") return "Too many attempts. Try again in 15 minutes.";
  if (status === "totp" && !code) return TOTP_REQUIRED;
  try {
    await signIn("credentials", { email, password, code, redirectTo: "/" });
  } catch (e) {
    // A bad code keeps the user on the code step (the sentinel prefix), with the message after the colon.
    if (e instanceof AuthError) return status === "totp" ? `${TOTP_REQUIRED}:Invalid code. Try again or use a recovery code.` : "Wrong email or password";
    throw e; // redirect
  }
}

export async function googleLogin() {
  await signIn("google", { redirectTo: "/" });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

/** Google users get defaults on their first visit. */
export async function ensureDefaults(userId: string) {
  if (await db.category.count({ where: { userId } })) return;
  await db.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ userId, name: c })) });
  await db.account.create({ data: { userId, name: "Cash", kind: "CASH" } });
}

// ---------- personal ----------

export async function deleteTxn(id: string) {
  const u = await requireUser();
  // Rows that mirror a group expense are managed from the group (deleting only the mirror would just bring it back).
  const t = await db.transaction.findFirst({ where: { id, userId: u.id, groupExpenseId: null }, select: { investmentId: true, amountMinor: true } });
  if (!t) return;
  await db.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id } });
    // Taking back an investment contribution takes it off the holding too (never below zero).
    if (t.investmentId) {
      const h = await tx.investment.findUnique({ where: { id: t.investmentId } });
      if (h) await tx.investment.update({ where: { id: h.id }, data: { investedMinor: Math.max(0, h.investedMinor - t.amountMinor), valueMinor: Math.max(0, h.valueMinor - t.amountMinor) } });
    }
  });
  revalidatePath("/"); revalidatePath("/investments");
}

type SaveResult = { ok: true } | { ok: false; error: string };

/** Adds an account (id null) or edits one. On edit the "current balance" is turned back into an opening balance. */
export async function saveAccount(id: string | null, f: FormData): Promise<SaveResult> {
  const u = await requireUser();
  const name = s(f, "name").slice(0, 60);
  if (!name) return { ok: false, error: "Give the account a name" };
  const kind = s(f, "kind") as AccountKindValue;
  if (!KIND_VALUES.includes(kind)) return { ok: false, error: "Pick an account type" };
  const existing = id ? await db.account.findFirst({ where: { id, userId: u.id } }) : null;
  if (id && !existing) return { ok: false, error: "Account not found" };
  const currency = existing ? existing.currency : s(f, "currency") || u.defaultCurrency;
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { ok: false, error: "Unknown currency" };
  const money = (x: string) => parseToMinor(x, currency);

  const credit = kind === "CREDIT";
  const rawBalance = s(f, "balance") || "0";
  const entered = credit ? money(rawBalance) : parseSigned(rawBalance, money);
  if (entered === null) return { ok: false, error: `Enter the ${credit ? "amount owed" : "balance"} as a number in ${currency}` };
  const balance = credit ? -entered : entered; // a credit card balance is money owed, so it is negative

  const optMoney = (key: string): number | null | "bad" => {
    const v = s(f, key);
    if (!v) return null;
    const m = money(v);
    return m === null ? "bad" : m;
  };
  const day = (key: string): number | null | "bad" => {
    const v = s(f, key);
    if (!v) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : "bad";
  };
  let creditLimitMinor: number | null = null, minPaymentMinor: number | null = null, statementDay: number | null = null, dueDay: number | null = null, aprBps: number | null = null;
  if (credit) {
    const lim = optMoney("limit"), min = optMoney("minPayment"), st = day("statementDay"), due = day("dueDay");
    if (lim === "bad") return { ok: false, error: `Credit limit must be a number in ${currency}` };
    if (min === "bad") return { ok: false, error: `Minimum payment must be a number in ${currency}` };
    if (st === "bad" || due === "bad") return { ok: false, error: "Statement and due days must be a day of the month, 1 to 31" };
    creditLimitMinor = lim; minPaymentMinor = min; statementDay = st; dueDay = due;
    if (s(f, "apr")) {
      aprBps = parseAprBps(s(f, "apr"));
      if (aprBps === null) return { ok: false, error: "Interest rate must be a percentage like 19.99" };
    }
  }
  const last4 = s(f, "last4");
  if (last4 && !/^\d{4}$/.test(last4)) return { ok: false, error: "Last 4 digits must be exactly 4 numbers" };

  const fields = { name, kind, institution: s(f, "institution").slice(0, 60) || null, last4: last4 || null, creditLimitMinor, statementDay, dueDay, aprBps, minPaymentMinor };
  if (!existing) {
    await db.account.create({ data: { userId: u.id, currency, openingMinor: balance, ...fields } });
  } else {
    // Keep the transactions as they are: opening = what you say the balance is now, minus what they added up to.
    const txns = await db.transaction.findMany({ where: { userId: u.id, OR: [{ accountId: existing.id }, { toAccountId: existing.id }] }, select: { type: true, amountMinor: true, currency: true, date: true, accountId: true, toAccountId: true } });
    const { delta } = deltaFor(existing.id, currency, txns);
    // The amount owed on a card is calculated from its starting balance and the recorded transactions. It can be
    // raised (fees, interest), but not lowered by editing: pay it down by recording a payment.
    const calculatedOwed = Math.max(0, -(existing.openingMinor + delta));
    if (existing.kind === "CREDIT" && credit && -balance < calculatedOwed) {
      return { ok: false, error: `The amount owed can't be lower than the calculated ${formatPlain(calculatedOwed, currency)}. To reduce it, record a payment to this card.` };
    }
    await db.account.update({ where: { id: existing.id }, data: { openingMinor: balance - delta, ...fields } });
  }
  revalidatePath("/accounts"); revalidatePath("/settings"); revalidatePath("/");
  return { ok: true };
}

export async function setAccountArchived(id: string, archived: boolean) {
  const u = await requireUser();
  await db.account.updateMany({ where: { id, userId: u.id }, data: { archived } });
  revalidatePath("/accounts"); revalidatePath("/");
}

// ---------- investments (private to the signed-in user) ----------

export async function saveInvestment(id: string | null, f: FormData): Promise<SaveResult> {
  const u = await requireUser();
  const platform = s(f, "platform").replace(/\s+/g, " ").slice(0, 60);
  const name = s(f, "name").slice(0, 80);
  if (!platform) return { ok: false, error: "Enter the platform, like Wealthsimple or Questrade" };
  if (!name) return { ok: false, error: "Give the investment a name" };
  const assetType = s(f, "assetType") || "OTHER";
  if (!ASSET_VALUES.includes(assetType)) return { ok: false, error: "Pick a type" };
  const existing = id ? await db.investment.findFirst({ where: { id, userId: u.id } }) : null;
  if (id && !existing) return { ok: false, error: "Investment not found" };
  const currency = existing ? existing.currency : s(f, "currency") || u.defaultCurrency;
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { ok: false, error: "Unknown currency" };
  const investedMinor = parseToMinor(s(f, "invested") || "0", currency);
  if (investedMinor === null) return { ok: false, error: `Amount invested must be a number in ${currency}` };
  const valueMinor = s(f, "value") ? parseToMinor(s(f, "value"), currency) : investedMinor;
  if (valueMinor === null) return { ok: false, error: `Current value must be a number in ${currency}` };
  const goalId = s(f, "goalId") || null;
  if (goalId) {
    const goal = await db.investmentGoal.findFirst({ where: { id: goalId, userId: u.id } });
    if (!goal) return { ok: false, error: "Goal not found" };
    if (goal.currency !== currency) return { ok: false, error: `That goal is in ${goal.currency}; this investment is in ${currency}` };
  }
  const data = { platform, name, assetType, investedMinor, valueMinor, goalId, note: s(f, "note").slice(0, 300) || null };
  if (existing) await db.investment.update({ where: { id: existing.id }, data });
  else await db.investment.create({ data: { ...data, userId: u.id, currency } });
  revalidatePath("/investments");
  return { ok: true };
}

export async function deleteInvestment(id: string) {
  const u = await requireUser();
  await db.investment.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/investments");
}

export async function saveGoal(id: string | null, f: FormData): Promise<SaveResult> {
  const u = await requireUser();
  const name = s(f, "name").slice(0, 80);
  if (!name) return { ok: false, error: "Give the goal a name" };
  const existing = id ? await db.investmentGoal.findFirst({ where: { id, userId: u.id } }) : null;
  if (id && !existing) return { ok: false, error: "Goal not found" };
  const currency = existing ? existing.currency : s(f, "currency") || u.defaultCurrency;
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { ok: false, error: "Unknown currency" };
  const targetMinor = parseToMinor(s(f, "target"), currency);
  if (!targetMinor) return { ok: false, error: `Enter the target amount as a number in ${currency}` };
  let targetDate: Date | null = null;
  if (s(f, "targetDate")) {
    targetDate = new Date(`${s(f, "targetDate")}T00:00:00.000Z`);
    if (Number.isNaN(+targetDate)) return { ok: false, error: "Enter a valid target date" };
  }
  const data = { name, targetMinor, targetDate, note: s(f, "note").slice(0, 300) || null };
  if (existing) await db.investmentGoal.update({ where: { id: existing.id }, data });
  else await db.investmentGoal.create({ data: { ...data, userId: u.id, currency } });
  revalidatePath("/investments");
  return { ok: true };
}

export async function deleteGoal(id: string) {
  const u = await requireUser();
  await db.investmentGoal.deleteMany({ where: { id, userId: u.id } }); // holdings stay, just unlinked
  revalidatePath("/investments");
}

export async function addCategory(f: FormData) {
  const u = await requireUser();
  const name = s(f, "name");
  const parentId = s(f, "parentId") || null;
  if (!name) return;
  if (parentId && !(await db.category.count({ where: { id: parentId, userId: u.id } }))) return;
  await db.category.create({ data: { userId: u.id, name, parentId } });
  revalidatePath("/settings");
}

export async function setBudget(f: FormData) {
  const u = await requireUser();
  const currency = s(f, "currency") || u.defaultCurrency;
  const limitMinor = parseToMinor(s(f, "limit"), currency);
  const categoryId = s(f, "categoryId") || null;
  if (!limitMinor) return;
  if (categoryId && !(await db.category.count({ where: { id: categoryId, userId: u.id } }))) return;
  const existing = await db.budget.findFirst({ where: { userId: u.id, categoryId, currency } });
  const alertAtPct = Math.min(100, Math.max(1, Number(s(f, "alert")) || 80));
  if (existing) await db.budget.update({ where: { id: existing.id }, data: { limitMinor, alertAtPct } });
  else await db.budget.create({ data: { userId: u.id, categoryId, currency, limitMinor, alertAtPct } });
  revalidatePath("/budgets");
}

/** Edit a saved budget's monthly limit and alert threshold. Category and currency identify the budget, so they stay fixed. */
export async function updateBudget(id: string, f: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await requireUser();
  const b = await db.budget.findFirst({ where: { id, userId: u.id } }); // only your own budgets
  if (!b) return { ok: false, error: "Budget not found" };
  const limitMinor = parseToMinor(s(f, "limit"), b.currency);
  if (!limitMinor) return { ok: false, error: `Enter a valid amount in ${b.currency}` };
  const alertAtPct = Number(s(f, "alert"));
  if (!Number.isInteger(alertAtPct) || alertAtPct < 1 || alertAtPct > 100) return { ok: false, error: "Alert must be a whole number from 1 to 100" };
  await db.budget.update({ where: { id }, data: { limitMinor, alertAtPct } });
  revalidatePath("/budgets");
  revalidatePath("/reports");
  return { ok: true };
}

export async function deleteBudget(id: string) {
  const u = await requireUser();
  await db.budget.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/budgets");
}

export async function addRecurring(f: FormData) {
  const u = await requireUser();
  const currency = s(f, "currency") || u.defaultCurrency;
  const amountMinor = parseToMinor(s(f, "amount"), currency);
  const title = s(f, "title");
  const nextDate = new Date(s(f, "nextDate"));
  if (!amountMinor || !title || isNaN(+nextDate)) return;
  await db.recurring.create({
    data: { userId: u.id, title, amountMinor, currency, frequency: s(f, "frequency") as "MONTHLY", nextDate, categoryId: s(f, "categoryId") || null },
  });
  revalidatePath("/recurring");
}

/** Adds the ticked recurring bills to the expenses (one occurrence each). Recurring bills are never posted automatically. */
export async function addSelectedRecurring(f: FormData) {
  const u = await requireUser();
  const ids = f.getAll("ids").map(String).slice(0, 100);
  if (ids.length) await addRecurringToExpenses(u.id, ids);
  revalidatePath("/recurring"); revalidatePath("/"); revalidatePath("/transactions"); revalidatePath("/budgets"); revalidatePath("/reports");
}

export async function deleteRecurring(id: string) {
  const u = await requireUser();
  await db.recurring.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/recurring");
}

/** CSV import. Expected header: date,amount,currency,type,category,note (type/category/currency optional). */
export async function importCsv(_: string | undefined, f: FormData) {
  const u = await requireUser();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a CSV file";
  if (file.size > 2_000_000) return "File too large (2 MB max)";
  const rows = parseCsv(await file.text());
  const head = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (n: string) => head.indexOf(n);
  if (col("date") < 0 || col("amount") < 0) return "CSV needs date and amount columns";
  const cats = await db.category.findMany({ where: { userId: u.id } });
  let ok = 0, bad = 0;
  for (const [i, r] of rows.entries()) {
    const cur = (r[col("currency")] || u.defaultCurrency).trim().toUpperCase();
    const amountMinor = parseToMinor((r[col("amount")] ?? "").replace(/^-/, ""), cur);
    const date = new Date(r[col("date")]);
    const t = (r[col("type")] || "EXPENSE").trim().toUpperCase();
    if (!amountMinor || isNaN(+date) || !["EXPENSE", "INCOME", "TRANSFER"].includes(t) || t === "TRANSFER") { bad++; continue; }
    const catName = (r[col("category")] ?? "").trim().toLowerCase();
    // Stable clientId makes re-importing the same file a no-op.
    const clientId = `csv:${date.toISOString().slice(0, 10)}:${amountMinor}:${cur}:${i}:${(r[col("note")] ?? "").slice(0, 40)}`;
    await db.transaction.upsert({
      where: { userId_clientId: { userId: u.id, clientId } },
      update: {},
      create: { userId: u.id, clientId, type: t as "EXPENSE", amountMinor, currency: cur, date, note: r[col("note")] || null, categoryId: cats.find((c) => c.name.toLowerCase() === catName)?.id ?? null },
    });
    ok++;
  }
  revalidatePath("/");
  return `Imported ${ok} row${ok === 1 ? "" : "s"}${bad ? `, skipped ${bad} invalid` : ""}`;
}

export async function deleteAccount(f: FormData) {
  const u = await requireUser();
  if (s(f, "confirm").toLowerCase() !== u.email) return;
  await db.user.delete({ where: { id: u.id } }); // cascades all personal data; group history stays with the name-only member
  await signOut({ redirectTo: "/login" });
}

// ---------- groups ----------

export async function createGroup(f: FormData) {
  const u = await requireUser();
  const name = s(f, "name");
  if (!name) return;
  const g = await db.group.create({
    data: {
      name,
      inviteCode: randomBytes(18).toString("base64url"), // unguessable, unlike a sequential-ish cuid
      kind: s(f, "kind") || "trip",
      defaultCurrency: s(f, "currency") || u.defaultCurrency,
      members: { create: { userId: u.id, name: u.name, email: u.email, role: "ADMIN" } },
    },
  });
  redirect(`/groups/${g.id}`);
}

export async function addMember(groupId: string, f: FormData) {
  const u = await requireUser();
  await requireMember(groupId, u.id);
  const name = s(f, "name");
  const email = s(f, "email").toLowerCase() || null;
  if (!name) return;
  const registered = email ? await db.user.findUnique({ where: { email } }) : null;
  if (registered && (await db.member.count({ where: { groupId, userId: registered.id } }))) return;
  await db.member.create({ data: { groupId, name, email, phone: s(f, "phone") || null, userId: registered?.id ?? null } });
  revalidatePath(`/groups/${groupId}`);
}

/** Join through an invite link. If a name-only member is picked, the user takes over that member (keeps history). */
export async function joinGroup(code: string, claimMemberId?: string) {
  const u = await requireUser();
  const g = await db.group.findUnique({ where: { inviteCode: code } });
  if (!g) throw new Error("Invalid invite");
  const mine = await db.member.findFirst({ where: { groupId: g.id, userId: u.id } });
  if (mine) {
    if (mine.left) await db.member.update({ where: { id: mine.id }, data: { left: false } });
  } else if (claimMemberId) {
    const target = await db.member.findFirst({ where: { id: claimMemberId, groupId: g.id, userId: null } });
    if (!target) throw new Error("That member is already claimed");
    await db.member.update({ where: { id: target.id }, data: { userId: u.id, email: u.email } });
    await syncGroupMirrors(g.id); // the new owner's share of past expenses now counts in their personal totals
  } else {
    await db.member.create({ data: { groupId: g.id, userId: u.id, name: u.name, email: u.email } });
  }
  redirect(`/groups/${g.id}`);
}

export async function leaveGroup(groupId: string) {
  const u = await requireUser();
  const m = await requireMember(groupId, u.id);
  await db.member.update({ where: { id: m.id }, data: { left: true } }); // history and balances stay intact
  redirect("/groups");
}

export async function removeExpense(groupId: string, expenseId: string) {
  const u = await requireUser();
  const m = await requireMember(groupId, u.id);
  await deleteGroupExpense({ id: u.id, name: u.name }, m.role === "ADMIN", groupId, expenseId);
  revalidatePath(`/groups/${groupId}`);
}

export async function undoSettlement(groupId: string, settlementId: string) {
  const u = await requireUser();
  const m = await requireMember(groupId, u.id);
  await deleteSettlement({ id: u.id, name: u.name }, m.role === "ADMIN", groupId, settlementId);
  revalidatePath(`/groups/${groupId}`);
}

export async function editExpense(groupId: string, expenseId: string, payload: unknown) {
  const u = await requireUser();
  const m = await requireMember(groupId, u.id);
  await updateGroupExpense({ id: u.id, name: u.name }, m.role === "ADMIN", groupId, expenseId, payload);
  revalidatePath(`/groups/${groupId}`);
}

export async function addComment(groupId: string, expenseId: string, f: FormData) {
  const u = await requireUser();
  await requireMember(groupId, u.id);
  const body = s(f, "body");
  if (!body || !(await db.groupExpense.count({ where: { id: expenseId, groupId } }))) return;
  await db.comment.create({ data: { expenseId, userId: u.id, userName: u.name, body: body.slice(0, 1000) } });
  revalidatePath(`/groups/${groupId}/expenses/${expenseId}`);
}
