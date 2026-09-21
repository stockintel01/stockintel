# StockIntel Supabase Migration

This directory contains the production PostgreSQL schema and the controlled cutover plan from Firebase. Firebase remains the active backend until every cutover gate below passes.

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

## What the repository already provides

- **Module access policies** — `20260918090000_module_access_policies.sql` gives every organization-scoped table a read rule and, where clients write directly, insert/update/delete rules. Without it, forced row-level security with no policy silently hides equipment, packhouse, sales, expenses, crops, livestock and scouting data.
- **Settling a sale** — `record_sale_payment`, `issue_sales_receipt` and `void_sales_receipt` complete the payment and receipt path, which is otherwise append-only with no writer. `shipments` stays read-only for clients because `create_shipment` writes the shipment, its allocations and the stock movements together.
- **Alerts and the deletion log** — `record_alert` and `record_deletion_audit` write the two tables that are closed to clients on purpose (`alerts` grants only `update (read_at)`, and inserts on `deletion_audit` are revoked). `record_alert` returns the existing unread alert about the same entity rather than raising a duplicate.
- **Per-farm apps** — `20260918130000_organization_app_branding.sql` adds `organizations.app_branding`, read by the manifest route with the service role because a browser fetches a manifest without a session. Only the farm's own settings screen can change it, and the importer carries it across.
- **Realtime** — `20260918110000_realtime_publication.sql` registers the tables behind the live subscriptions in `lib/agric/agric-service.ts` and `lib/expenses/useExpenses.ts`. The client still has to subscribe through Supabase channels; the publication only makes the changes available.
- **Sign-in** — `app/auth/callback/route.ts` exchanges the OAuth code for a session and `lib/supabase/auth.ts` starts it. `components/auth/AuthContext.tsx` still signs in through Firebase and is the remaining step.
- **Google provider** — configured in `config.toml` behind `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, disabled until those are set. The hosted project is configured in the dashboard, including the `/auth/callback` redirect URL.

The Data API returns at most `max_rows` (1000) per request, so every migrated list query needs to page with `.range()` the way `lib/comms/server/repository.ts` does.

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

That runs the type check; the Sigatoka, packing, water-balance, receipt, Supabase foundation, messaging and migration-mapping suites; and the production build.

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
