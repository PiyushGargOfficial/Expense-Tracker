# Smoke test

Setup: `.env` filled in, then `npm run db:push && npm run db:seed && npm run dev`.
Login: `demo@example.com` / `demo-pass-123`.

## Personal
- [ ] Home shows 3 seeded transactions and "Spent this month".
- [ ] Type `250`, tap a category, press Add: it appears in Recent. Time it: under 10 seconds.
- [ ] Budgets: the Food budget shows a progress bar; adding a large Food expense turns it amber/red.
- [ ] Transactions: search "lunch" filters; sort by largest works; Export CSV downloads.
- [ ] Settings > Import: export, then import the same file again; a second import adds nothing new for identical rows.
- [ ] Recurring: add an item dated yesterday; reloading the page posts it to Recent and moves the next date forward.

## Groups
- [ ] "Demo trip" balances: Hotel 10000 (Demo paid) and Dinner 3000 (Friend paid), 3 people each.
      Expected: Demo is owed 5666.66, Friend owes 1333.33, Piyush owes 4333.33 (they sum to zero).
- [ ] Add an expense with "By item" split and tax; the preview sums to the total.
- [ ] Settle up with a partial amount: the debt reduces, not clears.
- [ ] Edit an expense as its creator: the Activity feed logs it. Sign in as Friend (not creator, not admin): no edit/delete shown.
- [ ] Invite link `/join/<code>` as a new user; claim "Piyush (no account)" and keep history.

## Offline
- [ ] DevTools > Network > Offline. Add a personal expense: "Saved offline" appears and the amber bar shows 1 waiting.
- [ ] Go back online: the bar clears and the expense appears in Recent, once.
- [ ] Repeat with a group expense and a settlement.

## Privacy
- [ ] Friend's login never shows Demo's personal transactions anywhere.

## Sign-up and 2FA
- [ ] Create an account: you are signed in straight away, with no confirmation email.
- [ ] Settings > Two-factor: scan the QR code, enter the code, save the 8 recovery codes.
- [ ] Sign out and in: after the password you are asked for a code. A wrong code stays on the code step.
- [ ] A recovery code works once; using it again is refused.
- [ ] Turning 2FA off needs your password and a code.

## Home and groups linked
- [ ] Home: enter an amount, pick "Add to group: Demo trip", leave "Just me". It appears in the group and "Spent this month" rises by that amount.
- [ ] Repeat with "Equally with everyone": Home rises by your share only; Budgets > Lent out rises by the rest.
- [ ] The Home row is tagged with the group and shows "Open" (no Delete). Deleting the expense in the group removes the Home row.
- [ ] Add an expense inside the group page with a category: it shows in Reports and counts against that category's budget.
- [ ] Transactions > Group filter: "Personal only" hides group rows, a group name shows only that group's rows.

## Partial payments
- [ ] Group > a debt > Record payment (methods: Cash, Interac e-Transfer, Bank transfer, Cheque, PayPal, Other): Full and Half fill the amount; typing any smaller amount shows what will still be owed.
- [ ] Typing more than is owed disables Record and explains why.
- [ ] After a partial payment the debt shows "X already paid · Y still owed" and the balance drops by exactly X.
- [ ] "Record a payment between any two people" works for any pair and currency.
- [ ] Undo removes a payment you recorded (admins can undo any) and the balance goes back; the Activity log notes it.
- [ ] Budgets > Edit on a saved budget: change the limit and alert %; the card updates. Bad input shows an error and keeps the form open.
