# Pocket

Mobile-first React + TypeScript + Vite PWA, Supabase Auth (Google), Postgres/RLS, React Router, TanStack Query, Tailwind CSS. Google login, a dashboard, a salary/category allocation editor, expense entry, Flying Blue top-ups, transaction history, editing/deletion, and full/partial refunds are implemented. No sample financial data is displayed.

## 1. Create the database

In **Supabase → SQL Editor → New query**, paste the complete contents of `supabase/migrations/001_initial_schema.sql` and click **Run**. Run it once on an empty project. It creates the tables, ownership policies, email allowlist, budget functions, and dashboard views in one transaction.

Next run migrations `002_salary_setup.sql`, `003_expenses_and_budget_carryover.sql`, `004_flying_blue_top_ups.sql`, `005_transaction_history_and_refunds.sql`, `006_category_icons.sql`, and `007_positive_budget_carryover.sql` in order, each in the SQL Editor. Existing projects should run only migrations not yet applied. Migration 003 adds expense creation and replaces the budget summary view to carry negative category balances forward.

Then run this query, replacing the example email with your actual Google account email:

```sql
insert into private.allowed_emails (email)
values (lower('YOUR_GOOGLE_EMAIL@gmail.com'))
on conflict (email) do nothing;
```

Users whose email is not listed can authenticate with Google, but cannot access or modify application records. The restriction is enforced in Postgres, not the frontend. This is a data-access allowlist, not a signup hook: it does not prevent Supabase Auth from creating an unapproved auth account. Disable email/password and anonymous sign-in if you only want Google login.

## 2. Configure Google sign-in

1. Create a **Web application** OAuth client in Google Cloud and configure the consent screen. If the consent app is in Testing mode, add your Google account as a test user.
2. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the Google client ID and client secret. These credentials belong in Supabase, never in frontend environment variables.
3. Copy the callback URL displayed by Supabase (normally `https://PROJECT_REF.supabase.co/auth/v1/callback`) into Google's **Authorized redirect URIs**.
4. Add `http://localhost:5173` to Google's **Authorized JavaScript origins**.
5. In Supabase **Authentication → URL Configuration**, set the development Site URL to `http://localhost:5173` and add `http://localhost:5173/auth/callback` to the redirect URL allowlist. For deployment, use your HTTPS production origin as Site URL and add its `/auth/callback` redirect too.

Reference: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

## 3. Run the frontend

```sh
cp .env.example .env
npm install
npm run dev
```

Edit `.env` with your project URL and **publishable key** from Supabase project settings, then restart Vite. Never use a service-role key, secret key, or database password in a `VITE_` variable. These variables are public in the built bundle.

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Visit `http://localhost:5173`. Without configuration, the login screen explains what is missing and disables sign-in. With configuration, Google sign-in returns to a protected dashboard. Sign-out clears the in-memory query cache. Financial data is not persisted in a service-worker cache; only static application files are precached.

## 4. Verify

```sh
npm test
npm run build
npm run preview
```

Production hosting needs an SPA fallback to `index.html`, including `/auth/callback`. A Netlify/Cloudflare-style `_redirects` file is included; configure equivalent rewrites on other hosts. Hosting must use HTTPS for PWA installation and service workers. No hosting or Supabase changes have been made automatically.

On iPhone, open the HTTPS URL in Safari → Share → Add to Home Screen → Open as Web App. Test Google sign-in from the installed app on your device as well as Safari. OAuth redirects and local-network development need the exact redirect origin registered; using `localhost` on an iPhone points to the phone, not your computer. A hosted HTTPS preview is the simplest device test.

## Data behavior

- Salary is a configurable expected monthly amount, not a bank deposit or an actual account balance.
- Every expense affects only its selected category. Flying Blue expenses additionally reduce available Flying Blue credit.
- Top-ups affect credit only. Credit carries forward across months and may go negative.
- A refund is linked to one expense, inherits its category, and restores budget in the refund's month. Its actual destination determines whether Flying Blue credit increases. Partial refunds are supported; the combined amount cannot exceed the purchase amount.
- Category spending may exceed its allowance. The full month-end category balance rolls forward: positive surplus increases next month’s available budget and negative balances reduce it. This applies separately to each category and accumulates across months.
- Budget snapshots preserve past salary and allocations. Saving a plan updates the current month and defaults for future months. `ensure_current_month()` creates the current month's snapshot on dashboard load; no scheduled job is required. Months when the app is never opened are not materialized automatically; the carryover view calculates those intervening months using the latest saved plan at that point in time. An explicit plan omitting a category assigns it zero allowance while preserving the full carried balance, including a positive surplus.
- Opening credit is your net Flying Blue credit immediately before your first tracked transactions. It must not include top-ups already entered in the app.
- All amounts are exact RON decimals. Percent allocations recalculate with salary; fixed allocations retain their amount. A complete plan must allocate the full salary. Rounding residue goes to the largest category.
- Linked refunds must be explicitly deleted before deleting their expense. A refunded expense's payment source/category cannot be changed until its refunds are removed.
- Historical salary and allowances stay fixed. Editing a past transaction intentionally updates the spending calculated for that past month.

## Salary & budgets screen

Open **Salary & budgets** in the sidebar or bottom navigation, or visit `/budget`. Enter a positive monthly salary, add/name categories, choose `%` or `lei` for each allocation, and allocate the full salary. The summary updates live; saving updates the current month and future defaults. Previous months retain their salary and allowances. On first setup, optional starting Flying Blue credit is available under the salary field.

New categories and the plan are saved atomically through `save_salary_setup`. The UI supports decimal dots or commas. Removing a category from the plan preserves its historical records; the database prevents removing categories with current-month expenses or refunds.

## Budget RPC

Create categories through the authenticated client, then call:

```ts
await supabase.rpc('save_budget_plan', {
  p_salary: 6000,
  p_opening_credit: 600, // Initial setup only; omit on later edits.
  p_allocations: [
    { category_id: expensesCategoryId, allocation_type: 'percentage', allocation_value: 80 },
    { category_id: gasCategoryId, allocation_type: 'fixed', allocation_value: 1200 },
  ],
});
```

Settings and budget snapshot tables allow direct reads only. Use this RPC to change salary and allocations atomically. No custom application server is required.

## Verification in this checkout

- TypeScript and production/PWA build passed.
- Embedded-Postgres integration tests cover: category-only deductions, independent top-ups, full/partial refund limits, negative credit, complete salary allocation, historical salary preservation/month rollover, cross-user isolation, and allowlist/anonymous restrictions.
- Local `/login` and `/auth/callback` routes returned HTTP 200.
- Live Supabase/Google OAuth and installed-iPhone behavior require your project configuration and were not tested here. The SQL was exercised against embedded Postgres with a minimal Supabase Auth mock; it has not been run against your hosted database.
- The test runner was upgraded to address its critical advisories. Six low/moderate development-tool dependency advisories remain in the PWA build-tool chain; npm's compatible audit fix did not resolve them. They are not shipped as application runtime dependencies.

## Refresh and application updates

On a touch device, scroll to the top of Overview or Salary & budgets, pull down, and release when “Release to refresh” appears. This fetches fresh active Supabase queries and checks for an app update without reloading the page. The Refresh button provides the same action on desktop and as an accessible alternative. Unsaved salary edits are preserved, including if a background refresh fails. A clean salary form adopts the refreshed saved values.

Production service-worker registration checks for updates on launch, when the app returns to the foreground, when connectivity returns, and once per minute while visible and online. A ready update displays an **Update app** banner. Applying it activates the downloaded version and reloads the app. Updating is blocked while a salary, expense, or top-up form contains unsaved edits or is saving, or while a transaction action dialog is open. Detection does not force a reload during editing, including when another tab activates the update. Vercel serves `sw.js` without caching to support these checks.

No SQL changes are needed. Commit and deploy the source changes to enable this on the hosted app. Existing installations need to load this release first; detection then works for subsequent deployments. Service workers run in production builds on HTTPS or localhost, not the Vite development server. To manually verify an update, open a production build, deploy a second build with a visible change, foreground the first app, wait for the banner, then apply it. Verify touch behavior and the update flow on the installed iPhone PWA; those device checks have not been performed in this workspace.


## Add expense and budget carryover

Run `supabase/migrations/003_expenses_and_budget_carryover.sql` in Supabase SQL Editor after migrations 001 and 002, then deploy the frontend. No existing rows are deleted. The migration is safe to re-run.

Use **Add expense** in the navigation or the dashboard, or open `/expenses/new`. Enter an amount, select Personal or Flying Blue, select a budget category, choose a date in the current month up to today. Comma and dot decimals are supported. A live warning and **Save expense anyway** button appear if the purchase would leave the category negative. The warning never blocks a valid expense. A confirmation shows the saved category remainder; the overview refreshes after saving.

The save RPC checks ownership and preserves RLS. A client-generated expense ID makes retries with identical details idempotent, avoiding duplicate spending after a lost response. Reusing that ID for different details is rejected.

For each category:

```text
Carry-in = previous month’s remaining balance
Remaining = monthly allowance + carry-in − expenses + refunds received this month
```

For example: Gas allowance 500 lei, ending at −200 lei, starts the next month with 300 lei available. Spending 400 lei then leaves −100 lei. A later month’s allowance covers that debt. Positive leftover money also carries forward: ending at +200 lei with a new 500 lei allowance gives 700 lei available next month. An omitted category retains its positive or negative balance with zero new allowance. Each month’s saved salary and allowances are preserved, while derived remainders reflect historical transaction edits.

The dashboard’s monthly total is now salary plus category carry-ins, minus current-month expenses, plus current-month refunds. Flying Blue credit remains an independent running balance and is not reduced again when category debt carries forward.

Verification: production build and 30 tests passed, including multi-month carryover, unopened months, surplus accumulation, removed-category balances, full/partial refund rules, retry idempotency, and cross-user isolation. The migration was tested against embedded Postgres; apply it to your hosted Supabase project before using expense entry. Live production and iPhone form testing still require the deployed release.


## Flying Blue top-ups

Run `supabase/migrations/004_flying_blue_top_ups.sql` after the earlier migrations, then deploy the frontend. Existing projects should run only this new migration. Open **Top up** from the navigation or visit `/top-ups/new`.

Enter the amount transferred from Personal to Flying Blue and the transfer date (today or earlier). The preview shows your available credit after adding the transfer. These entries record transfers already made; they do not perform bank transfers. Complete the salary/starting-credit setup first so the running credit can be calculated.

Flying Blue credit is independent of budget categories:

```text
Available credit = starting credit + top-ups − all Flying Blue expenses + refunds returned to Flying Blue
```

A 600 lei top-up followed by a 500 lei Flying Blue expense leaves 100 lei available. Only the expense uses the selected category’s budget. A top-up has no category, does not change salary or category allocations, and does not reset at month boundaries. Backdated top-ups contribute to overall credit; only transfers dated this month appear in this month’s top-up total.

Saving uses a server-validated, owner-restricted RPC and a stable request ID, so retrying an identical save does not count a transfer twice. After saving, the dashboard credit and top-up total refresh. Unsaved top-up inputs are preserved by pull-to-refresh and block application updates until saved or the page is left. Verification covers credit changes, unchanged category/salary figures, duplicate retry handling, invalid inputs and cross-user isolation.


## Transaction history, editing/deletion and refunds

Run `supabase/migrations/005_transaction_history_and_refunds.sql` in Supabase SQL Editor after migrations 001–004, then deploy the frontend. Existing projects should apply only migration 005. It adds update timestamps, a unified history view, and owner-restricted transaction RPCs. It preserves all existing records and can be re-run.

Open **History** from the navigation or **View all** in the overview. Expenses, top-ups and refunds appear newest first with pagination (30 records per page). Filter by month or all months, type, account and category. Since top-ups move money between the two accounts, they appear under either account filter; category filters exclude these category-independent transfers. Expense rows show the refunded total and the remaining refundable amount. Refund rows identify the original purchase by date and amount.

- **Edit:** change amount/date and, where applicable, payment source, refund destination or expense category. Historical expenses can be corrected in months where the chosen category has a budget. Overspending remains allowed. The dashboard, history and derived balances refresh after a successful change.
- **Delete:** requires a confirmation dialog. Deleting an expense with refunds also requires explicitly checking the box to delete all its linked refunds. That deletion is atomic. Top-ups and individual refunds can be deleted separately.
- **Refund:** choose a partial amount or **Refund remaining** (the full purchase amount when there are no previous refunds), the received date, and the actual receiving account. Refunds cannot exceed the original purchase when combined, or predate it. They restore the original category's budget in the refund's month, and increase Flying Blue credit only when received in Flying Blue.
- An expense with refunds retains its account/category until its refunds are removed. Its amount cannot be reduced below the amount already refunded, or its purchase date moved after a refund.
- Edits/deletions compare the record's update timestamp with the version opened in the dialog, rejecting stale corrections rather than overwriting another change. Refund changes also update the parent expense's version. Refund creation uses a stable request ID so retrying an identical submission does not duplicate a refund.

Verification: production build and 43 tests passed. Database integration tests cover historical corrections and carryover, top-up and refund editing/deletion, full/partial refunds, idempotent requests, stale-record detection, explicit linked-refund deletion, and RLS isolation. These use embedded Postgres with a minimal Supabase Auth mock. Apply the migration and verify the dialogs against your deployed Supabase project and installed iPhone app before relying on the production workflow.


## Category icons

Run `supabase/migrations/006_category_icons.sql` after migrations 001–005, then deploy the frontend. This adds a validated icon identifier to each category and extends the existing atomic salary-setup save function. Existing Expenses/Cheltuieli, Gas/Fuel and Savings categories receive receipt, fuel and savings symbols; other categories default to a wallet. Re-running the migration preserves chosen icons.

In **Salary & budgets**, click the symbol next to a category name, choose from the 20 icons, and click **Save salary & budgets**. The picker works for new and existing categories. Saved icons appear on the featured dashboard category, category budget rows, recent expenses, expense balance previews, and expense rows in History. Icons are stored in Supabase and apply across devices. They do not change allocations or transaction amounts. Legacy callers that omit the icon retain the previously saved choice.

Verification includes icon persistence/defaults, unchanged category balances and credit, compatibility with older save requests, and rollback when an unsupported icon is submitted. The current production build and 45 tests pass; deployed Supabase and iPhone UI verification still require applying the migration and deploying this release.


## Positive and negative category carryover

Run `supabase/migrations/007_positive_budget_carryover.sql` after migrations 001–006, then deploy the frontend. It replaces the category summary calculation, preserves RLS and all saved transactions/allowances, and is safe to re-run.

Every category now carries its entire remaining balance forward. A positive 200 lei balance plus next month’s 500 lei allowance gives 700 lei available. A negative 200 lei balance gives 300 lei available. Unopened months are calculated using the latest saved plan, and removing a category from a later plan gives it zero new allowance without discarding its saved-up money or debt. Refunds and historical corrections recalculate subsequent balances. Flying Blue credit is unchanged by this rule.

The rule applies from the earliest recorded category budget, so unused amounts from earlier months will be included in today's available balances after applying the migration. Monthly salary and allocation snapshots remain unchanged. The dashboard shows positive carry-ins as “carried forward” and deficits as “previous shortfall”; progress uses the allowance plus carry-in.

Production build and 46 tests passed, including positive accumulation, negative carryover, omitted categories, historical corrections and unchanged allowances. Live hosted verification requires applying this migration in Supabase.
