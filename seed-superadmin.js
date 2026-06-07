#!/usr/bin/env node
/**
 * Run once after both approved super admins have signed in to Firebase Auth.
 * Usage: node seed-superadmin.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const SUPER_ADMIN_EMAILS = [
  'mawuklegodson@gmail.com',
  'enochapafloe@gmail.com',
];

async function seed() {
  console.log('Seeding super admin configuration...');

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
    updatedBy: SUPER_ADMIN_EMAILS[0],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  for (const email of SUPER_ADMIN_EMAILS) {
    const user = await admin.auth().getUserByEmail(email);
    const uid = user.uid;

    await db.doc(`users/${uid}`).set({
      uid,
      email,
      displayName: user.displayName || 'StockIntel Admin',
      role: 'super_admin',
      organizationId: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.doc(`system_superadmins/${uid}`).set({
      email,
      uid,
      grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Configured super admin: ${email}`);
  }

  console.log('Super admin setup complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
