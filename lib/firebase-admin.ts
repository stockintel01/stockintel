import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

function normalizePrivateKey(value?: string) {
    if (!value) return undefined;
    return value
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n');
}

function getCredential() {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

    if (projectId && clientEmail && privateKey) {
        return cert({ projectId, clientEmail, privateKey });
    }

    return applicationDefault();
}

let adminApp: App | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function getAdminApp() {
    if (adminApp) return adminApp;
    adminApp = getApps()[0] ?? initializeApp({
        credential: getCredential(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
    return adminApp;
}

function getAdminAuth() {
    authInstance ??= getAuth(getAdminApp());
    return authInstance;
}

function getAdminDb() {
    dbInstance ??= getFirestore(getAdminApp());
    return dbInstance;
}

export const adminAuth = new Proxy({} as Auth, {
    get(_target, prop, receiver) {
        return Reflect.get(getAdminAuth(), prop, receiver);
    },
});

export const adminDb = new Proxy({} as Firestore, {
    get(_target, prop, receiver) {
        return Reflect.get(getAdminDb(), prop, receiver);
    },
});
