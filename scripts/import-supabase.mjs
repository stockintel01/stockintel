/**
 * Step 7 of supabase/README.md: load a Firestore export into Supabase, preserving each
 * Firestore document id in its legacy_firebase_* column so the two systems stay
 * reconcilable and the import can be re-run safely.
 *
 * Covers profile links, organizations, subscriptions, memberships, inventory (with
 * opening balances), expenses, usage logs and water records. Every run lists the
 * collections still to be handled.
 *
 * Auth users must already exist in Supabase (step 5); they are matched by email.
 * Row conversions live in lib/migration/firestore-mapping.ts and are covered by
 * npm run test:migration.
 *
 * Usage:
 *   npm run migrate:import -- --dry-run
 *   npm run migrate:import -- --file supabase/migration-data/firestore-....json
 *   npm run migrate:import -- --only organizations,memberships
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

import {
  asNumber,
  asText,
  asTimestamp,
  convertQuantity,
  mapExpenseBudgetRow,
  mapExpenseCategoryRow,
  mapExpenseRow,
  mapInventoryItemRow,
  mapMembershipRow,
  mapOrganizationRow,
  mapSubscriptionUpdate,
  mapUsageLogRow,
  mapWaterRecordRow,
  openingMovementKey,
  referralCodeFor,
  resolveUnitCode,
} from '../lib/migration/firestore-mapping.ts';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const STEPS = ['profiles', 'organizations', 'subscriptions', 'memberships', 'inventory', 'expenses', 'usage', 'water'];
const MIGRATION_DATA_DIR = join('supabase', 'migration-data');
const CHUNK_SIZE = 500;
const COVERED_SUBCOLLECTIONS = new Set([
  'members', 'agric_inventory', 'expense_categories', 'expense_budgets', 'expenses',
  'agric_usage', 'agric_water_records',
]);

const problems = [];
const warnings = [];
const report = [];

function note(step, message) {
  problems.push(`${step}: ${message}`);
}

/** Something to follow up that did not stop a row from importing. */
function warn(step, message) {
  warnings.push(`${step}: ${message}`);
}

function parseArgs(argv) {
  const options = { file: null, dryRun: false, only: STEPS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--file' && argv[index + 1]) options.file = argv[index += 1];
    else if (argument === '--only' && argv[index + 1]) {
      options.only = argv[index += 1].split(',').map(name => name.trim()).filter(Boolean);
    }
  }
  const unknown = options.only.filter(name => !STEPS.includes(name));
  if (unknown.length) {
    console.error(`Unknown step(s): ${unknown.join(', ')}. Available: ${STEPS.join(', ')}`);
    process.exit(1);
  }
  return options;
}

async function resolveExportFile(explicit) {
  if (explicit) return explicit;
  const entries = (await readdir(MIGRATION_DATA_DIR).catch(() => []))
    .filter(name => name.startsWith('firestore-') && name.endsWith('.json'))
    .sort();
  if (!entries.length) {
    console.error(`No export found in ${MIGRATION_DATA_DIR}. Run "npm run migrate:export" first.`);
    process.exit(1);
  }
  return join(MIGRATION_DATA_DIR, entries[entries.length - 1]);
}

function chunk(rows, size = CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

const options = parseArgs(process.argv.slice(2));
const file = await resolveExportFile(options.file);
const snapshot = JSON.parse(await readFile(file, 'utf8'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secret) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

function fail(step, error) {
  if (!error) return false;
  note(step, error.message);
  return true;
}

async function upsertAll(step, table, rows, onConflict, returning = 'id') {
  if (options.dryRun || !rows.length) return [];
  const results = [];
  for (const batch of chunk(rows)) {
    const { data, error } = await supabase.from(table).upsert(batch, { onConflict }).select(returning);
    if (fail(step, error)) return results;
    results.push(...(data ?? []));
  }
  return results;
}

let unitCache = null;
async function unitIdByCode(step) {
  if (!unitCache) {
    const { data, error } = await supabase.from('units_of_measure').select('id, code').is('organization_id', null);
    if (fail(step, error)) return new Map();
    unitCache = new Map((data ?? []).map(row => [String(row.code).toLowerCase(), row.id]));
  }
  return unitCache;
}

/**
 * Prefers the ids the upsert just returned and falls back to reading the table, so a
 * step can run on its own without re-importing what an earlier run already wrote.
 * In a dry run the ids do not exist yet and placeholders keep the checks meaningful.
 */
async function legacyIdMapFor(step, table, organizationId, legacyIds, upserted = []) {
  if (options.dryRun) return new Map(legacyIds.map(id => [id, 'dry-run']));

  const map = new Map(upserted.filter(row => row.legacy_firebase_id).map(row => [row.legacy_firebase_id, row.id]));
  if (legacyIds.every(id => map.has(id))) return map;

  for (const [legacyId, id] of await loadLegacyIdMap(step, table, organizationId)) {
    if (!map.has(legacyId)) map.set(legacyId, id);
  }
  return map;
}

/** Pages because the Data API returns at most max_rows (1000) per request. */
async function loadLegacyIdMap(step, table, organizationId) {
  const map = new Map();
  for (let from = 0; ; from += CHUNK_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('id, legacy_firebase_id')
      .eq('organization_id', organizationId)
      .not('legacy_firebase_id', 'is', null)
      .order('legacy_firebase_id')
      .range(from, from + CHUNK_SIZE - 1);
    if (fail(step, error)) return map;
    for (const row of data ?? []) map.set(row.legacy_firebase_id, row.id);
    if ((data ?? []).length < CHUNK_SIZE) return map;
  }
}

// ── Identity maps ────────────────────────────────────────────────────────────
console.log(`Reading ${file}`);
console.log(`Exported at ${snapshot.exportedAt} from ${snapshot.firebaseProjectId}`);
if (options.dryRun) console.log('Dry run: no writes will be made.');

const authUsersByEmail = new Map();
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error(`Could not list Supabase auth users: ${error.message}`);
    process.exit(1);
  }
  for (const user of data.users) {
    if (user.email) authUsersByEmail.set(user.email.toLowerCase(), user.id);
  }
  if (data.users.length < 1000) break;
}

const firebaseUsers = [
  ...(snapshot.authUsers ?? []),
  ...(snapshot.users ?? []).map(row => ({ uid: row.id, ...row.data })),
];
const emailByUid = new Map();
for (const user of firebaseUsers) {
  const email = asText(user.email)?.toLowerCase();
  if (user.uid && email && !emailByUid.has(user.uid)) emailByUid.set(user.uid, email);
}

/** Firebase uid to Supabase auth id, matched by email address. */
function authIdForUid(uid) {
  const email = emailByUid.get(uid);
  return email ? authUsersByEmail.get(email) ?? null : null;
}

report.push(['Supabase auth users', authUsersByEmail.size]);
report.push(['Firebase users in export', emailByUid.size]);

const unmatched = [...emailByUid.entries()].filter(([, email]) => !authUsersByEmail.has(email));
if (unmatched.length) {
  note('profiles', `${unmatched.length} Firebase users have no Supabase auth account yet (run the auth migration first): ${unmatched.slice(0, 5).map(([uid]) => uid).join(', ')}${unmatched.length > 5 ? ' ...' : ''}`);
}

// ── profiles ─────────────────────────────────────────────────────────────────
// The signup trigger fills profiles from auth.users but cannot know the Firebase uid,
// which is what messaging and the remaining imports join on.
if (options.only.includes('profiles')) {
  let linked = 0;
  for (const [uid, email] of emailByUid) {
    const authId = authUsersByEmail.get(email);
    if (!authId) continue;
    linked += 1;
    if (options.dryRun) continue;
    const { error } = await supabase.from('profiles').update({ legacy_firebase_uid: uid }).eq('id', authId);
    if (fail('profiles', error)) break;
  }
  report.push(['Profiles linked to Firebase uid', linked]);
}

// ── organizations ────────────────────────────────────────────────────────────
const organizations = snapshot.organizations ?? [];
const organizationIdByLegacy = new Map();
const organizationRows = [];
const referralCodes = new Map();

for (const organization of organizations) {
  const ownerAuthId = authIdForUid(organization.data?.ownerId);
  if (!ownerAuthId) {
    note('organizations', `${organization.id} (${organization.data?.name ?? 'unnamed'}) skipped: owner ${organization.data?.ownerId ?? 'unknown'} has no Supabase auth account.`);
    continue;
  }
  const referralCode = referralCodeFor(organization);
  if (referralCodes.has(referralCode)) {
    note('organizations', `${organization.id} skipped: referral code ${referralCode} is already used by ${referralCodes.get(referralCode)}.`);
    continue;
  }
  referralCodes.set(referralCode, organization.id);
  organizationRows.push(mapOrganizationRow(organization, ownerAuthId));
}

if (options.only.includes('organizations')) {
  const imported = await upsertAll('organizations', 'organizations', organizationRows, 'legacy_firebase_id', 'id, legacy_firebase_id');
  for (const row of imported) organizationIdByLegacy.set(row.legacy_firebase_id, row.id);
  report.push(['Organizations imported', options.dryRun ? organizationRows.length : imported.length]);
}

// Later steps still need the id map when organizations were imported on an earlier run.
if (!options.dryRun && organizationIdByLegacy.size === 0 && organizationRows.length) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, legacy_firebase_id')
    .in('legacy_firebase_id', organizationRows.map(row => row.legacy_firebase_id));
  if (!fail('organizations', error)) {
    for (const row of data ?? []) organizationIdByLegacy.set(row.legacy_firebase_id, row.id);
  }
}

// ── subscriptions ────────────────────────────────────────────────────────────
if (options.only.includes('subscriptions')) {
  let updated = 0;
  for (const organization of organizations) {
    const organizationId = organizationIdByLegacy.get(organization.id);
    const update = mapSubscriptionUpdate(organization.data?.subscription);
    if (!organizationId || !update) continue;
    updated += 1;
    if (options.dryRun) continue;
    const { error } = await supabase.from('organization_subscriptions').update(update).eq('organization_id', organizationId);
    if (fail('subscriptions', error)) break;
  }
  report.push(['Subscriptions updated', updated]);
}

// ── memberships ──────────────────────────────────────────────────────────────
if (options.only.includes('memberships')) {
  const membershipRows = [];
  for (const organization of organizations) {
    const organizationId = organizationIdByLegacy.get(organization.id);
    if (!organizationId) continue;
    const ownerUid = organization.data?.ownerId;

    const candidates = new Map();
    for (const member of organization.subcollections?.members ?? []) candidates.set(member.id, member.data ?? {});
    for (const user of snapshot.users ?? []) {
      if (user.data?.organizationId === organization.id && !candidates.has(user.id)) candidates.set(user.id, user.data ?? {});
    }

    for (const [uid, data] of candidates) {
      if (data.role === 'super_admin') continue;
      const userId = authIdForUid(uid);
      if (!userId) {
        note('memberships', `${organization.id}: member ${uid} has no Supabase auth account.`);
        continue;
      }
      const { row, demoted } = mapMembershipRow({ organizationId, userId, uid, ownerUid, data });
      if (demoted) {
        note('memberships', `${organization.id}: ${uid} was an owner in Firebase but the organization owner is ${ownerUid}; imported as manager.`);
      }
      membershipRows.push(row);
    }
  }
  await upsertAll('memberships', 'organization_memberships', membershipRows, 'organization_id,user_id', 'user_id');
  report.push(['Memberships imported', membershipRows.length]);
}

// ── inventory ────────────────────────────────────────────────────────────────
// Shared with the usage step so a single run does not re-read what it just wrote.
const itemUpsertsByOrganization = new Map();

if (options.only.includes('inventory')) {
  const units = await unitIdByCode('inventory');
  let itemCount = 0;
  let movementCount = 0;

  for (const organization of organizations) {
    const organizationId = organizationIdByLegacy.get(organization.id);
    const items = organization.subcollections?.agric_inventory ?? [];
    if (!organizationId || !items.length) continue;
    const ownerAuthId = authIdForUid(organization.data?.ownerId);

    const itemRows = [];
    const createdByByLegacy = new Map();
    for (const item of items) {
      const unitCode = resolveUnitCode(item.data?.uom);
      const stockUnitId = unitCode ? units.get(unitCode.toLowerCase()) : null;
      if (!stockUnitId) {
        note('inventory', `${organization.id}/${item.id}: unit "${item.data?.uom}" has no match in units_of_measure.`);
        continue;
      }
      const createdBy = authIdForUid(item.data?.createdBy) ?? ownerAuthId;
      if (!createdBy) {
        note('inventory', `${organization.id}/${item.id}: no author could be resolved.`);
        continue;
      }
      createdByByLegacy.set(item.id, createdBy);
      itemRows.push(mapInventoryItemRow({ document: item, organizationId, stockUnitId, createdBy }));
    }

    itemCount += itemRows.length;
    const imported = await upsertAll('inventory', 'inventory_items', itemRows, 'organization_id,legacy_firebase_id', 'id, legacy_firebase_id');
    itemUpsertsByOrganization.set(organizationId, imported);
    if (options.dryRun) continue;

    const itemIdByLegacy = new Map(imported.map(row => [row.legacy_firebase_id, row.id]));
    const movementRows = [];
    const balanceRows = [];
    for (const item of items) {
      const itemId = itemIdByLegacy.get(item.id);
      if (!itemId) continue;
      const quantity = Math.max(asNumber(item.data?.currentStock), 0);
      balanceRows.push({ item_id: itemId, organization_id: organizationId, quantity });
      if (quantity > 0) {
        movementRows.push({
          organization_id: organizationId,
          item_id: itemId,
          movement_type: 'opening',
          quantity_delta: quantity,
          occurred_at: asTimestamp(item.data?.lastUpdated) ?? snapshot.exportedAt,
          notes: 'Opening balance imported from Firebase',
          source_type: 'firebase_import',
          source_legacy_id: item.id,
          idempotency_key: openingMovementKey(item.id),
          created_by: createdByByLegacy.get(item.id) ?? ownerAuthId,
        });
      }
    }

    movementCount += movementRows.length;
    await upsertAll('inventory', 'inventory_movements', movementRows, 'organization_id,idempotency_key', 'id');
    await upsertAll('inventory', 'inventory_balances', balanceRows, 'item_id', 'item_id');
  }

  report.push(['Inventory items imported', itemCount]);
  report.push(['Opening movements written', movementCount]);
}

// ── expenses ─────────────────────────────────────────────────────────────────
if (options.only.includes('expenses')) {
  let categoryCount = 0;
  let budgetCount = 0;
  let expenseCount = 0;

  for (const organization of organizations) {
    const organizationId = organizationIdByLegacy.get(organization.id);
    if (!organizationId) continue;
    const ownerAuthId = authIdForUid(organization.data?.ownerId);
    const currency = (asText(organization.data?.currency, 3) ?? 'GHS').toUpperCase();

    const categoryRows = [];
    const usedNames = new Set();
    for (const document of organization.subcollections?.expense_categories ?? []) {
      const createdBy = authIdForUid(document.data?.createdBy) ?? ownerAuthId;
      if (!createdBy) {
        note('expenses', `${organization.id}/${document.id}: no author could be resolved.`);
        continue;
      }
      const mapped = mapExpenseCategoryRow({ document, organizationId, createdBy });
      if (!mapped.ok) {
        note('expenses', `${organization.id}/${document.id}: ${mapped.error}`);
        continue;
      }
      const nameKey = String(mapped.row.name).toLowerCase();
      if (usedNames.has(nameKey)) {
        note('expenses', `${organization.id}/${document.id}: category name "${mapped.row.name}" appears twice and names are unique per farm.`);
        continue;
      }
      usedNames.add(nameKey);
      categoryRows.push(mapped.row);
    }
    categoryCount += categoryRows.length;
    const categoryUpserts = await upsertAll('expenses', 'expense_categories', categoryRows, 'organization_id,legacy_firebase_id', 'id, legacy_firebase_id');
    const categoryIdByLegacy = await legacyIdMapFor('expenses', 'expense_categories', organizationId, categoryRows.map(row => row.legacy_firebase_id), categoryUpserts);

    const budgetRows = [];
    for (const document of organization.subcollections?.expense_budgets ?? []) {
      const createdBy = authIdForUid(document.data?.createdBy) ?? ownerAuthId;
      if (!createdBy) {
        note('expenses', `${organization.id}/${document.id}: no author could be resolved.`);
        continue;
      }
      const categoryId = document.data?.categoryId ? categoryIdByLegacy.get(document.data.categoryId) ?? null : null;
      const mapped = mapExpenseBudgetRow({ document, organizationId, categoryId, currency, createdBy });
      if (!mapped.ok) {
        note('expenses', `${organization.id}/${document.id}: ${mapped.error}`);
        continue;
      }
      budgetRows.push(mapped.row);
    }
    budgetCount += budgetRows.length;
    const budgetUpserts = await upsertAll('expenses', 'expense_budgets', budgetRows, 'organization_id,legacy_firebase_id', 'id, legacy_firebase_id');
    const budgetIdByLegacy = await legacyIdMapFor('expenses', 'expense_budgets', organizationId, budgetRows.map(row => row.legacy_firebase_id), budgetUpserts);

    const expenseRows = [];
    let receiptsToMove = 0;
    for (const document of organization.subcollections?.expenses ?? []) {
      if (asText(document.data?.receiptUrl)) receiptsToMove += 1;
      const submittedBy = authIdForUid(document.data?.submittedById) ?? ownerAuthId;
      if (!submittedBy) {
        note('expenses', `${organization.id}/${document.id}: no submitter could be resolved.`);
        continue;
      }
      const categoryId = categoryIdByLegacy.get(document.data?.categoryId);
      if (!categoryId) {
        note('expenses', `${organization.id}/${document.id}: category ${document.data?.categoryId ?? 'unknown'} was not imported.`);
        continue;
      }
      const mapped = mapExpenseRow({
        document,
        organizationId,
        categoryId,
        budgetId: document.data?.budgetId ? budgetIdByLegacy.get(document.data.budgetId) ?? null : null,
        currency,
        submittedBy,
        approvedBy: authIdForUid(document.data?.approvedById) ?? null,
      });
      if (!mapped.ok) {
        note('expenses', `${organization.id}/${document.id}: ${mapped.error}`);
        continue;
      }
      expenseRows.push(mapped.row);
    }
    expenseCount += expenseRows.length;
    await upsertAll('expenses', 'expenses', expenseRows, 'organization_id,legacy_firebase_id');

    if (receiptsToMove) {
      warn('expenses', `${organization.id}: ${receiptsToMove} expense receipts are Firebase Storage URLs. Copy the files into the expense-receipts bucket and set receipt_storage_path.`);
    }
  }

  report.push(['Expense categories imported', categoryCount]);
  report.push(['Expense budgets imported', budgetCount]);
  report.push(['Expenses imported', expenseCount]);
}

// ── usage ────────────────────────────────────────────────────────────────────
// History only. Balances come from the Firestore snapshot, so importing a usage log
// must never move stock a second time.
if (options.only.includes('usage')) {
  const units = await unitIdByCode('usage');
  let usageCount = 0;

  for (const organization of organizations) {
    const organizationId = organizationIdByLegacy.get(organization.id);
    const logs = organization.subcollections?.agric_usage ?? [];
    if (!organizationId || !logs.length) continue;
    const ownerAuthId = authIdForUid(organization.data?.ownerId);
    const inventoryDocuments = organization.subcollections?.agric_inventory ?? [];
    const stockUnitByLegacy = new Map(inventoryDocuments.map(document => [document.id, document.data?.uom]));
    const itemIdByLegacy = await legacyIdMapFor(
      'usage', 'inventory_items', organizationId,
      inventoryDocuments.map(document => document.id),
      itemUpsertsByOrganization.get(organizationId) ?? [],
    );

    const rows = [];
    for (const document of logs) {
      const legacyItemId = document.data?.itemId;
      const itemId = itemIdByLegacy.get(legacyItemId);
      if (!itemId) {
        note('usage', `${organization.id}/${document.id}: item ${legacyItemId ?? 'unknown'} was not imported.`);
        continue;
      }
      const unitCode = resolveUnitCode(document.data?.uom);
      const unitId = unitCode ? units.get(unitCode.toLowerCase()) : null;
      if (!unitId) {
        note('usage', `${organization.id}/${document.id}: unit "${document.data?.uom}" has no match in units_of_measure.`);
        continue;
      }
      const converted = convertQuantity(asNumber(document.data?.quantity), document.data?.uom, stockUnitByLegacy.get(legacyItemId));
      if (converted === null || converted <= 0) {
        note('usage', `${organization.id}/${document.id}: ${document.data?.quantity} ${document.data?.uom} cannot be expressed in the item's stock unit (${stockUnitByLegacy.get(legacyItemId) ?? 'unknown'}).`);
        continue;
      }
      const recordedBy = authIdForUid(document.data?.recordedBy) ?? ownerAuthId;
      if (!recordedBy) {
        note('usage', `${organization.id}/${document.id}: no recorder could be resolved.`);
        continue;
      }
      const mapped = mapUsageLogRow({
        document,
        organizationId,
        itemId,
        unitId,
        quantityInStockUnit: converted,
        recordedBy,
        supervisorId: authIdForUid(document.data?.supervisorId) ?? null,
      });
      if (!mapped.ok) {
        note('usage', `${organization.id}/${document.id}: ${mapped.error}`);
        continue;
      }
      rows.push(mapped.row);
    }
    usageCount += rows.length;
    await upsertAll('usage', 'usage_logs', rows, 'organization_id,legacy_firebase_id');
  }

  report.push(['Usage logs imported', usageCount]);
}

// ── water ────────────────────────────────────────────────────────────────────
if (options.only.includes('water')) {
  let waterCount = 0;

  for (const organization of organizations) {
    const organizationId = organizationIdByLegacy.get(organization.id);
    const records = organization.subcollections?.agric_water_records ?? [];
    if (!organizationId || !records.length) continue;
    const ownerAuthId = authIdForUid(organization.data?.ownerId);

    const rows = [];
    for (const document of records) {
      const createdBy = authIdForUid(document.data?.createdBy) ?? ownerAuthId;
      if (!createdBy) {
        note('water', `${organization.id}/${document.id}: no author could be resolved.`);
        continue;
      }
      const mapped = mapWaterRecordRow({ document, organizationId, createdBy });
      if (!mapped.ok) {
        note('water', `${organization.id}/${document.id}: ${mapped.error}`);
        continue;
      }
      rows.push(mapped.row);
    }
    waterCount += rows.length;
    await upsertAll('water', 'water_records', rows, 'organization_id,legacy_firebase_id');
  }

  report.push(['Water records imported', waterCount]);
}

// ── Result ───────────────────────────────────────────────────────────────────
console.log('');
for (const [label, value] of report) console.log(`${label.padEnd(34)} ${value}`);

const remaining = new Map();
for (const organization of organizations) {
  for (const [name, rows] of Object.entries(organization.subcollections ?? {})) {
    if (COVERED_SUBCOLLECTIONS.has(name)) continue;
    remaining.set(name, (remaining.get(name) ?? 0) + rows.length);
  }
}
if (remaining.size) {
  console.log('\nNot imported yet (each needs a step before cutover):');
  for (const [name, count] of [...remaining].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(32)} ${count} documents`);
  }
}

if (warnings.length) {
  console.log(`\n${warnings.length} follow-up(s):`);
  for (const warning of warnings.slice(0, 20)) console.log(`  - ${warning}`);
  if (warnings.length > 20) console.log(`  ... and ${warnings.length - 20} more`);
}

if (problems.length) {
  console.log(`\n${problems.length} issue(s) need attention:`);
  for (const problem of problems.slice(0, 40)) console.log(`  - ${problem}`);
  if (problems.length > 40) console.log(`  ... and ${problems.length - 40} more`);
  console.log(options.dryRun
    ? '\nDry run finished with issues. Nothing was written.'
    : '\nImport finished, but the rows listed above were not imported.');
  process.exitCode = 1;
} else {
  console.log(options.dryRun ? '\nDry run complete. No data was written.' : '\nImport complete.');
}
