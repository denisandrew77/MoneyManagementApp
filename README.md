# Pocket

Mobile-first React + TypeScript + Vite PWA, Supabase Auth (Google), Postgres/RLS, React Router, TanStack Query, Tailwind CSS. Google login, a dashboard, and a salary/category allocation editor are implemented. Transaction editing forms are the next step. No sample financial data is displayed.

## 1. Create the database

In **Supabase → SQL Editor → New query**, paste the complete contents of `supabase/migrations/001_initial_schema.sql` and click **Run**. Run it once on an empty project. It creates the tables, ownership policies, email allowlist, budget functions, and dashboard views in one transaction.

Next run `supabase/migrations/002_salary_setup.sql` in the SQL Editor to add the atomic salary setup save function. Existing projects that already ran migration 001 should run only migration 002.

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
- Category spending may exceed its allowance. Unused allowance does not roll over.
- Budget snapshots preserve past salary and allocations. Saving a plan updates the current month and defaults for future months. `ensure_current_month()` creates the current month's snapshot on dashboard load; no scheduled job is required. Months when the app is never opened are not materialized automatically.
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

Production service-worker registration checks for updates on launch, when the app returns to the foreground, when connectivity returns, and once per minute while visible and online. A ready update displays an **Update app** banner. Applying it activates the downloaded version and reloads the app. Updating is blocked while the salary form contains unsaved edits or is saving. Detection does not force a reload during editing, including when another tab activates the update. Vercel serves `sw.js` without caching to support these checks.

No SQL changes are needed. Commit and deploy the source changes to enable this on the hosted app. Existing installations need to load this release first; detection then works for subsequent deployments. Service workers run in production builds on HTTPS or localhost, not the Vite development server. To manually verify an update, open a production build, deploy a second build with a visible change, foreground the first app, wait for the banner, then apply it. Verify touch behavior and the update flow on the installed iPhone PWA; those device checks have not been performed in this workspace.
