import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const projectRoot = process.cwd();
const migrationsDirectory = join(projectRoot, 'supabase', 'migrations');
const migrationNames = (await readdir(migrationsDirectory))
  .filter(name => name.endsWith('.sql'))
  .sort();

const failures = [];

if (migrationNames.length < 24) {
  failures.push(`Expected at least 24 Supabase migrations, found ${migrationNames.length}.`);
}

if (new Set(migrationNames.map(name => name.slice(0, 14))).size !== migrationNames.length) {
  failures.push('Supabase migration timestamps must be unique.');
}

const migrations = await Promise.all(migrationNames.map(async name => ({
  name,
  sql: await readFile(join(migrationsDirectory, name), 'utf8'),
})));

for (const { name, sql } of migrations) {
  if (!/^\s*begin;/i.test(sql) || !/commit;\s*$/i.test(sql)) {
    failures.push(`${name} must be wrapped in a transaction.`);
  }
  if (/grant\s+(?:all|execute|select|insert|update|delete)[\s\S]{0,180}\s+to\s+anon\b/i.test(sql)) {
    failures.push(`${name} grants database access to anon.`);
  }
}

const combinedSql = migrations.map(({ sql }) => sql).join('\n');
const requiredFragments = [
  "select tablename from pg_tables where schemaname = 'public'",
  "execute format('alter table public.%I enable row level security', table_name)",
  'force row level security',
  'stockintel01@gmail.com',
  'mawuklegodson@gmail.com',
  'enochapafloe@gmail.com',
  'grant select, insert, update, delete on all tables in schema public to authenticated',
  'create_packhouse_dispatch',
  'create_inventory_item',
  'confirm_stock_request_receipt',
  'record_livestock_event',
  'save_sigatoka_observation',
  'manage_sigatoka_observation',
  'activate_referral_credit',
  'claim_paystack_webhook_event',
  'activate_paystack_checkout',
  'paystack_checkout_transactions',
];

for (const fragment of requiredFragments) {
  if (!combinedSql.toLowerCase().includes(fragment.toLowerCase())) {
    failures.push(`Missing required Supabase foundation fragment: ${fragment}`);
  }
}

// Row-level security is forced on every table, so a table with no policy is invisible
// to the application. These four are reached only by definer functions running as the
// service role; see the expected advisor notices in supabase/README.md.
const serviceRoleOnlyTables = new Set([
  'document_sequences',
  'contact_link_codes',
  'notification_alert_states',
  'inbound_message_receipts',
  'paystack_subscription_secrets',
]);
const createdTables = [...combinedSql.matchAll(/^create table public\.([a-z_]+)/gm)].map(match => match[1]);
const tablesWithPolicy = new Set([
  // Written directly, and generated from the module mapping in the access-policy migration.
  ...[...combinedSql.matchAll(/create policy [a-z_]+ on public\.([a-z_]+)/g)].map(match => match[1]),
  ...[...combinedSql.matchAll(/^\s+\('([a-z_]+)',\s*array\[/gm)].map(match => match[1]),
]);
const unreachableTables = createdTables.filter(name => !tablesWithPolicy.has(name) && !serviceRoleOnlyTables.has(name));
if (unreachableTables.length > 0) {
  failures.push(`Tables with row-level security and no policy: ${unreachableTables.join(', ')}`);
}

const envExample = await readFile(join(projectRoot, '.env.example'), 'utf8');
for (const variable of [
  'NEXT_PUBLIC_DATA_BACKEND',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_PROJECT_REF',
]) {
  if (!envExample.includes(variable)) failures.push(`.env.example is missing ${variable}.`);
}

const proxySource = await readFile(join(projectRoot, 'proxy.ts'), 'utf8');
if (!proxySource.includes('isSupabaseBackendActive() || !isSupabaseConfigured()')) {
  failures.push('The Next.js proxy must not initialize Supabase while Firebase is active.');
}

const keepaliveSource = await readFile(join(projectRoot, 'app/api/supabase/keepalive/route.ts'), 'utf8');
for (const fragment of ['await recordHeartbeat', 'await readHeartbeats', 'requests: 3', "status: isSupabaseBackendActive() ? 503 : 200"]) {
  if (!keepaliveSource.includes(fragment)) failures.push(`Supabase keep-alive is missing: ${fragment}`);
}
const vercelConfig = await readFile(join(projectRoot, 'vercel.json'), 'utf8');
if (!vercelConfig.includes('/api/supabase/keepalive') || !vercelConfig.includes('0 6 * * *')) {
  failures.push('Vercel must schedule the Supabase keep-alive daily.');
}

const requiredRuntimeFiles = [
  'lib/agric/supabase-agric-service.ts',
  'lib/agric/supabase-livestock-service.ts',
  'lib/agric/supabase-packhouse-record-service.ts',
  'lib/agric/supabase-packing-service.ts',
  'lib/agric/supabase-sigatoka-service.ts',
  'lib/agric/supabase-water-service.ts',
  'lib/supabase/workspace-session.ts',
];
for (const file of requiredRuntimeFiles) {
  try {
    await readFile(join(projectRoot, file), 'utf8');
  } catch {
    failures.push(`Supabase runtime adapter is missing: ${file}.`);
  }
}

if (failures.length > 0) {
  console.error(`Supabase foundation verification failed:\n${failures.map(item => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Supabase foundation verified (${migrationNames.length} ordered migrations, RLS and environment guards present).`);
