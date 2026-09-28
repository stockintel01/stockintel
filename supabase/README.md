# StockIntel Supabase Migration

This directory contains the production PostgreSQL schema and the controlled cutover plan from Firebase. The application can run against either backend, but production must remain on Firebase until the remote Supabase schema, migrated data, role journeys and rollback procedure pass every cutover gate below.

## Target

- Supabase project: `urhngoeszqpaeripatnk`
- Firebase source project: `stock-intel-3e0dc`
- Application backend flag: `NEXT_PUBLIC_DATA_BACKEND`
- Production target value after cutover: `supabase`

Never commit a Firebase service account, database password, Supabase secret key, user export, or production data export. The repository ignores the expected migration filenames and `supabase/migration-data/`.

## Required Credentials

Collect these through the provider dashboards and keep them in the local environment or an approved secret manager:

1. Firebase Admin service-account JSON for `stock-intel-3e0dc`.
2. Firebase Authentication password hash parameters: signer key, salt separator, rounds, and memory cost.
3. Supabase database connection password for `urhngoeszqpaeripatnk`.
4. Supabase publishable key and server-only secret key.
5. Stripe webhook and product configuration for the production environment.

Do not paste credentials into SQL, migration files, issue comments, or Git history.

## Migration Order

1. Put writes into a short maintenance window and record the start time.
2. Export Firestore and the user directory with `npm run migrate:export`. The export deliberately excludes password hashes; step 5 moves those directly.
3. Apply all SQL migrations in timestamp order: `npm run db:link` once, then `npm run db:push`.
4. Run Supabase security and performance advisors and resolve all actionable findings.
5. Import Firebase Authentication users into Supabase Auth using Supabase's official Firebase migration tools. This preserves supported Firebase password hashes and avoids a forced password reset.
6. Verify that the `on_auth_user_created` trigger populated `public.profiles` and linked the three platform-admin email addresses.
7. Import with `npm run migrate:import -- --dry-run` first, then without the flag. It loads profile links, organizations, subscriptions, memberships, inventory (with opening balances), expenses, usage logs and water records, preserving each Firestore document ID in its `legacy_firebase_*` column, and is safe to re-run. Usage logs import as history: balances come from the Firestore snapshot, so no log moves stock a second time. Every run prints the collections it did not handle; add a step to `scripts/import-supabase.mjs` for each before cutover. Row conversions live in `lib/migration/firestore-mapping.ts` and are covered by `npm run test:migration`.
8. Reconcile source and target counts, organization ownership, membership permissions, inventory balances, sales totals, expense totals, and archived records.
9. Test owner, manager, worker, stockkeeper, packing-station, and superadmin journeys against the target database.
10. Set `NEXT_PUBLIC_DATA_BACKEND=supabase` in a preview deployment, complete browser acceptance tests, then promote the same build to production.
11. Keep Firebase read-only during the rollback window. Do not delete source data as part of cutover.

## Authentication Decision

The final system uses Supabase Auth. Firebase third-party JWTs are deliberately not used for the production data layer because Firebase UIDs are arbitrary strings while the schema and `auth.uid()` use UUID identities. A full Auth migration keeps RLS, foreign keys, audit actors, Storage ownership, and tenant isolation consistent.

Email/password users are migrated with their Firebase password hashes. Google users authenticate through the Google provider configured in Supabase. Redirect URLs must include the production domain and approved preview/local callback URLs.

### Signing in

`components/auth/AuthContext.tsx` chooses a provider once from `NEXT_PUBLIC_DATA_BACKEND`:

- `components/auth/auth-shared.tsx` is the contract both implement, and carries no
  Firebase or Supabase type. `app/login/page.tsx` and `app/join/page.tsx` call only
  this, so neither knows which backend is serving them.
- `components/auth/firebase-auth-provider.tsx` is the original flow. The email,
  password and reset calls the login screen used to make against Firebase directly
  now live here.
- `components/auth/supabase-auth-provider.tsx` is the Supabase flow.
- `lib/supabase/session-mapping.ts` turns rows into the store's user and organization,
  with no Supabase or React import, so `npm run test:auth` covers it.
- `lib/supabase/workspace-session.ts` runs the four queries and creates the farm.
- `lib/api-client.ts` sends the right bearer token; `requireUser` in `lib/api-auth.ts`
  validates it and loads the caller's workspace from Postgres.

What differs from Firebase, and why each one needed handling:

1. **Google is a full-page redirect, not a popup.** The browser leaves the login screen
   and returns through `/auth/callback`, so nothing after that call runs and the
   redirect decision moves into the callback.
2. **A session arrives before the workspace is known.** Supabase warns against calling
   the client from inside `onAuthStateChange`, so the listener only records who signed
   in and a second effect reads their farm.
3. **A new account has no farm.** One insert into `organizations` is enough:
   `initialize_organization` then writes the owner membership, the farm profile, the
   Sigatoka defaults and a fourteen-day trial. The provider is the only place that
   inserts it. `/join` is exempt, because an invitation assigns the membership and a
   farm created here would leave the invitee owning an empty one.
4. **Sign-up may not produce a session.** With email confirmation on, the account waits
   for the emailed link, so the screen says so instead of redirecting.
5. **Five subscription statuses, three the store knows.** A trial is active until it
   runs out, and a past-due plan stays active until the period it was paid for ends, so
   the grace period is the payment provider's rather than one invented here.
6. **Permissions are a wider enum.** `app_permission` gained the messaging values that
   `AccessKey` does not carry, so the array is filtered rather than cast.
7. **Server-side authorisation reads with the service role.** `requireUser` decides what
   a caller may do, so it must not be filtered by the policies it is about to authorise.

Organization creation and switching, invitations, invitation acceptance, team access,
referral credits, rewards activation and the join flow now select the same backend as
authentication. Firebase remains compiled as the rollback adapter; keep its variables
available during the rollback window even after the production flag moves to Supabase.

## What the repository already provides

- **Module access policies** — `20260918090000_module_access_policies.sql` gives every organization-scoped table a read rule and, where clients write directly, insert/update/delete rules. Without it, forced row-level security with no policy silently hides equipment, packhouse, sales, expenses, crops, livestock and scouting data.
- **Settling a sale** — `record_sale_payment`, `issue_sales_receipt` and `void_sales_receipt` complete the payment and receipt path, which is otherwise append-only with no writer. `shipments` stays read-only for clients because `create_shipment` writes the shipment, its allocations and the stock movements together.
- **Alerts and the deletion log** — `record_alert` and `record_deletion_audit` write the two tables that are closed to clients on purpose (`alerts` grants only `update (read_at)`, and inserts on `deletion_audit` are revoked). `record_alert` returns the existing unread alert about the same entity rather than raising a duplicate.
- **Per-farm apps** — `20260918130000_organization_app_branding.sql` adds `organizations.app_branding`, read by the manifest route with the service role because a browser fetches a manifest without a session. Only the farm's own settings screen can change it, and the importer carries it across.
- **Realtime** — `20260918110000_realtime_publication.sql` and the later runtime migrations register the tables used by expenses, stock, requests, equipment, spray plans, packing, shipping, weather, scouting, livestock and rewards. Each Supabase adapter reloads its paged snapshot after subscription and reconnection, so a missed socket event does not leave a stale screen.
- **Names on a record** — `20260922090000_workspace_member_directory.sql` adds `organization_member_directory`. Firestore stores the author's name on each document, so everyone sees who did what. Postgres keeps names in `profiles`, whose policy shows a member only their own row unless they can manage the farm, so without this a worker reads an expense ledger with nobody against the amounts. Every ported screen that shows a person needs it.
- **Sign-in** — ported. `components/auth/AuthContext.tsx` picks a provider from the backend flag, and both put the same user and organization into the store, so no screen knows which one signed the member in. See "Signing in" below.
- **Google provider** — configured in `config.toml` behind `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, disabled until those are set. The hosted project is configured in the dashboard, including the `/auth/callback` redirect URL.

The Data API returns at most `max_rows` (1000) per request, so every migrated list query needs to page with `.range()` the way `lib/comms/server/repository.ts` does.

## The data layer

Workspace services select their adapter from `NEXT_PUBLIC_DATA_BACKEND`. The Supabase
runtime now covers authentication, onboarding, workspace switching, team and
invitations, tenant settings, expenses, stock and usage, requests, equipment, spray
planning, packing and shipping, water records, disease scouting, livestock, rewards,
billing and the platform-admin console. Firebase implementations remain available for
rollback rather than being mixed into an active Supabase session.

- `lib/expenses/useExpenses.ts` picks an implementation once at module load from
  `NEXT_PUBLIC_DATA_BACKEND`, so hook order is fixed and rolling back is a redeploy of
  the same build rather than a code change.
- `lib/expenses/firebase-expenses.ts` is the original Firestore listener, unchanged
  apart from reporting load failures.
- `lib/expenses/supabase-expenses.ts` is the Supabase equivalent.
- `lib/expenses/supabase-mapping.ts` holds every row conversion with no Supabase or
  React import, so `npm run test:expenses` exercises it without a database.
- `lib/expenses/budget-health.ts` is shared, so the two backends cannot report
  different numbers for the same farm.
- `ExpensesController` in `lib/expenses/types.ts` is the contract both satisfy.

Five things a Firestore service does not have to think about, and the reason each
ported service needs more than a search and replace:

1. **Paging.** Lists stop at 1000 rows without `.range()`.
2. **Realtime is a change feed, not a query.** Messages missed while the socket was
   down are never replayed, so the snapshot is re-read every time the channel reaches
   `SUBSCRIBED`, which covers the first load and every reconnection.
3. **Names are joined, not stored.** Firestore denormalises `categoryName` and
   `submittedByName` onto the document, where they go stale on a rename. The Supabase
   reader joins them back from the rows it already has and from
   `organization_member_directory`.
4. **Identities are uuids.** A Firestore document id written into a uuid column is
   silent corruption, so every write validates the farm, the actor and each reference
   first and fails loudly.
5. **An empty screen is ambiguous.** A policy refusal and an empty ledger look
   identical, so the controller carries an `error` the screen shows.

Two deliberate behaviour changes: emptying a field now clears it (the Firestore writer
dropped empty strings, so clearing a vendor silently did nothing), and a receipt is a
path in a private bucket that has to be signed before it opens.

Onboarding follows the same shape in `lib/onboarding/`: `mapping.ts` holds the row
builders and the contract, `firebase-onboarding.ts` is the page's original writes moved
out unchanged, `supabase-onboarding.ts` is the Postgres equivalent, and `service.ts`
picks one. All three writes go through policies a new owner already satisfies —
`organizations_update` wants the `settings` permission, and `invitations_insert` wants
an active subscription, which the trial created with the farm provides. Invitations are
inserted one at a time, because a single statement would be rejected whole when one
address already has an invitation waiting and the person would not be told which.

The remaining cutover work is operational, not a hidden mixed-backend code path:
apply and validate every migration on the target project, migrate Auth and Firestore
data, reconcile counts and balances, test every role in a preview deployment, and then
change the production backend flag. Durable offline writes also need an explicit
acceptance run: the installed app caches its shell and Supabase listeners recover after
reconnection, but every mutation must be tested under connection loss before claiming
that arbitrary offline edits are queued safely.

### Currency

`organizations.currency` is `char(3)` with a `currency = upper(currency)` check, and
Firestore holds whichever symbol the onboarding list offered. Those are not the same
thing: `upper('KSh')` fails the check outright, and `₦` passes it as three bytes that
mean nothing to a report. `lib/currency.ts` resolves a symbol or a code to an ISO code
for the column and back to a symbol for display, and the farm's chosen symbol is kept
in `organizations.settings.currencySymbol` so `₵` does not come back as `GHS`.

The importer used to truncate and upper-case the symbol straight into the column, so
`npm run migrate:import` would have failed on every Kenyan farm and quietly mislabelled
every Nigerian one. It now resolves the code the same way.

## Keeping the project awake

A project on the free plan pauses after about a week without requests. While Firebase
serves farm data the application never calls Supabase, so the project receives no
traffic at all and pauses on its own. That is what happened; a paused project is
restored from the Supabase dashboard, and the data is retained.

Three ways to stop it recurring, strongest first:

1. **Move the project to a paid plan.** Paid projects are not paused for inactivity.
   This is the only guaranteed protection.
2. **The scheduled keep-alive in this repository.** `GET /api/supabase/keepalive`
   records a heartbeat through `record_platform_heartbeat`, and `vercel.json` runs it
   daily. A daily cron is permitted on every Vercel plan, unlike the per-minute
   messaging schedules. It only reaches Supabase when the deployment has
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `CRON_SECRET` set; without
   them it returns "skipped" and the project still goes idle.
3. **An external uptime check** hitting the project daily. Useful right now, because
   the deployment does not yet carry Supabase credentials.

The super admin console shows the last heartbeat under Platform, and warns when it is
more than three days old, so an unscheduled keep-alive is visible before a pause.

## Deployment Gates

The backend flag must remain `firebase` until all gates pass:

- All migrations are recorded on the target project.
- Security advisor has no unresolved RLS, exposed-definer, or anonymous-execute finding.
- Performance advisor has no unexplained missing foreign-key index.
- Source and target reconciliation is signed off.
- No orphan organization, membership, inventory, shipment, sale, receipt, expense, or scouting record exists.
- Permission tests prove each role sees only its entitled navigation, rows, and RPC operations.
- Superadmins have unlimited entitlements without changing ordinary tenant limits.
- Stripe test and live webhook paths have been validated separately.
- Offline writes queued before the maintenance window either sync before export or are explicitly reconciled.
- A rollback owner, rollback deadline, and Firebase read-only restoration procedure are recorded.

## Verification

Run the repository checks before deployment:

```powershell
npm run verify
```

That runs the type check; the Sigatoka, packing, water-balance, receipt, Supabase foundation, messaging, migration-mapping, per-farm app, expense-ledger, sign-in and onboarding suites; and the production build.

Messaging has an on-demand end-to-end check that starts a dev server and stubs Supabase and Meta, so it is kept out of the hermetic suite:

    npm run test:comms-integration

It covers scheduler authentication, template delivery, permanent-failure and rate-limit handling, consent withdrawn between queueing and sending, webhook signature rejection, and the STOP and JOIN keywords.

When Docker is available, also run:

```powershell
npx supabase start
npx supabase db reset
npx supabase db lint --level warning
```

After every remote DDL change, run both Supabase advisors through the project-specific MCP connection and save the result in the deployment record.

### Expected advisor notices

Four tables have row-level security enabled with no policy, which the security advisor reports as `rls_enabled_no_policy`. All four are reachable only through definer functions running as the service role, so the notice is the intended state rather than an unresolved finding:

- `document_sequences` — only `app_private.next_document_number` allocates numbers.
- `contact_link_codes` — a readable link code would let someone else claim a member's WhatsApp alerts.
- `notification_alert_states` — scan bookkeeping for the messaging worker.
- `inbound_message_receipts` — webhook de-duplication for the messaging worker.

Any other table reporting that notice is a real gap: `20260918090000_module_access_policies.sql` fails the migration if one appears.

## Rollback

Rollback means restoring the previous deployment with `NEXT_PUBLIC_DATA_BACKEND=firebase` while Firebase is still read-only and available. Any writes accepted by Supabase after cutover must be exported and reconciled before Firebase writes are reopened. Never roll back by deleting the Supabase project or resetting the production database.
