import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

interface ServiceAccountShape {
    project_id?: string;
    client_email?: string;
    private_key?: string;
}

function normalizePrivateKey(value?: string) {
    if (!value) return undefined;
    return value
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n');
}

function decodeBase64Json(value?: string) {
    if (!value) return null;
    try {
        return Buffer.from(value.trim(), 'base64').toString('utf8');
    } catch {
        return null;
    }
}

function serviceAccountJson() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ?? decodeBase64Json(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64)
        ?? undefined;
    if (!raw) return null;
    try {
        return JSON.parse(raw.trim().replace(/^["']|["']$/g, '')) as ServiceAccountShape;
    } catch {
        return null;
    }
}

function serviceAccountFromJson() {
    const parsed = serviceAccountJson();
    if (!parsed) return null;
    try {
        if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
        return cert({
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: normalizePrivateKey(parsed.private_key),
        });
    } catch {
        return null;
    }
}

export function adminProjectId() {
    return serviceAccountJson()?.project_id
        ?? process.env.FIREBASE_ADMIN_PROJECT_ID
        ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        ?? '';
}

function getCredential() {
    const jsonCredential = serviceAccountFromJson();
    if (jsonCredential) return jsonCredential;

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
        projectId: adminProjectId(),
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
    get(_target, prop) {
        const instance = getAdminAuth();
        const value = Reflect.get(instance, prop, instance);
        return typeof value === 'function' ? value.bind(instance) : value;
    },
});

export const adminDb = new Proxy({} as Firestore, {
    get(_target, prop) {
        const instance = getAdminDb();
        const value = Reflect.get(instance, prop, instance);
        return typeof value === 'function' ? value.bind(instance) : value;
    },
});
