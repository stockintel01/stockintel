#!/usr/bin/env node
/**
 * seed-superadmin.js
 * 
 * Run ONCE after deploying to Firebase to set up the super admin.
 * Usage: node seed-superadmin.js
 * 
 * This creates the system/config document and marks the super admin
 * user with the correct role in Firestore.
 * 
 * The super admin (stockintel01@gmail.com) must first sign in via
 * the app to create their Firebase Auth account. Then run this script.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const SUPER_ADMIN_EMAIL = 'stockintel01@gmail.com';

async function seed() {
  console.log('Seeding super admin configuration...');

  // 1. Create system/config document with default values
  await db.doc('system/config').set({
    subscriptionPricing: {
      baseUSD: 9,
      proPlanMultiplier: 1,
      enterprisePlanMultiplier: 3,
      freeTrial: { durationDays: 14 },
    },
    features: {
      maxWorkersFreeTrial: 3,
      maxWorkersPro: 25,
      maxWorkersEnterprise: 999,
      maxInventoryFreeTrial: 100,
      maxInventoryPro: 5000,
      aiConsultationEnabled: true,
    },
    maintenance: {
      isMaintenanceMode: false,
      maintenanceMessage: 'System maintenance in progress. Back shortly.',
    },
    announcements: [],
    updatedBy: SUPER_ADMIN_EMAIL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('✓ system/config created');

  // 2. Find the super admin user by email and set their role
  const users = await admin.auth().getUserByEmail(SUPER_ADMIN_EMAIL);
  const uid = users.uid;
  console.log(`Found super admin UID: ${uid}`);

  // Update or create their Firestore user document
  await db.doc(`users/${uid}`).set({
    uid,
    email: SUPER_ADMIN_EMAIL,
    displayName: 'StockIntel Admin',
    role: 'super_admin',
    organizationId: 'system',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('✓ Super admin user document set with role: super_admin');

  // 3. Create system/superadmin sentinel document
  await db.doc('system/superadmin').set({
    email: SUPER_ADMIN_EMAIL,
    uid,
    grantedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('✓ system/superadmin sentinel created');

  console.log('\n✅ Super admin setup complete!');
  console.log(`   Email: ${SUPER_ADMIN_EMAIL}`);
  console.log('   Sign in at /login with your Google account or email/password.');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
