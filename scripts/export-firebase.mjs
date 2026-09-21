/**
 * Step 2 of supabase/README.md: dump Firestore and the Firebase user directory to
 * supabase/migration-data/ so the import can run against a fixed snapshot.
 *
 * Password hashes are deliberately not exported. Supabase's official Firebase auth
 * migration tool moves those directly, and a hash in a JSON file on a laptop is a
 * credential leak waiting to happen. This export carries only the identity fields the
 * import needs to match a Firebase user to a Supabase auth user.
 *
 * Usage: npm run migrate:export -- [--out supabase/migration-data]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { adminAuth, adminDb, adminProjectId } = await import('../lib/firebase-admin.ts');

const ROOT_COLLECTIONS = ['users', 'organizations', 'invitations'];

function parseArgs(argv) {
  const options = { out: join('supabase', 'migration-data') };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out' && argv[index + 1]) options.out = argv[index + 1];
  }
  return options;
}

/** Firestore values are not all JSON-safe: timestamps, references and bytes need converting. */
function toPlainValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (typeof value !== 'object') return value;

  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value.path === 'string' && typeof value.id === 'string') return { __ref: value.path };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (Buffer.isBuffer(value)) return { __bytes: value.toString('base64') };

  const plain = {};
  for (const [key, nested] of Object.entries(value)) plain[key] = toPlainValue(nested);
  return plain;
}

async function readCollection(reference) {
  const snapshot = await reference.get();
  return snapshot.docs.map(document => ({ id: document.id, data: toPlainValue(document.data()) }));
}

/** Subcollections differ per organization, so they are discovered rather than hardcoded. */
async function readOrganization(document) {
  const subcollections = {};
  for (const collection of await document.ref.listCollections()) {
    subcollections[collection.id] = await readCollection(collection);
  }
  return { id: document.id, data: toPlainValue(document.data()), subcollections };
}

async function readAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const user of page.users) {
      users.push({
        uid: user.uid,
        email: user.email ?? null,
        emailVerified: user.emailVerified,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        disabled: user.disabled,
        createdAt: user.metadata?.creationTime ?? null,
        lastSignInAt: user.metadata?.lastSignInTime ?? null,
        providers: user.providerData.map(provider => provider.providerId),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

const options = parseArgs(process.argv.slice(2));
const startedAt = new Date();

console.log(`Exporting Firebase project ${adminProjectId()} ...`);

const authUsers = await readAuthUsers();
console.log(`  auth users: ${authUsers.length}`);

const root = {};
for (const name of ROOT_COLLECTIONS) {
  if (name === 'organizations') continue;
  root[name] = await readCollection(adminDb.collection(name));
  console.log(`  ${name}: ${root[name].length}`);
}

const organizationDocs = await adminDb.collection('organizations').get();
const organizations = [];
for (const document of organizationDocs.docs) {
  const organization = await readOrganization(document);
  organizations.push(organization);
  const documentCount = Object.values(organization.subcollections).reduce((total, rows) => total + rows.length, 0);
  console.log(`  organization ${organization.id}: ${Object.keys(organization.subcollections).length} subcollections, ${documentCount} documents`);
}

const payload = {
  exportedAt: startedAt.toISOString(),
  firebaseProjectId: adminProjectId(),
  passwordHashesIncluded: false,
  authUsers,
  users: root.users ?? [],
  invitations: root.invitations ?? [],
  organizations,
};

await mkdir(options.out, { recursive: true });
const file = join(options.out, `firestore-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

const totalDocuments = organizations.reduce(
  (total, organization) => total + Object.values(organization.subcollections).reduce((sum, rows) => sum + rows.length, 0),
  organizations.length + (root.users?.length ?? 0) + (root.invitations?.length ?? 0),
);

console.log('');
console.log(`Wrote ${file}`);
console.log(`Auth users: ${authUsers.length}. Firestore documents: ${totalDocuments}.`);
console.log('Migrate passwords with Supabase\'s Firebase auth migration tool; this file has no hashes.');
