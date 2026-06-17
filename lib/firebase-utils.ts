
import { db } from "@/lib/firebase";
import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    getDocs,
    runTransaction,
    writeBatch,
    serverTimestamp,
    Timestamp,
    increment
} from "firebase/firestore";
import { UserRole, IndustryType } from "@/lib/store";
import { authenticatedFetch } from "@/lib/api-client";

export interface FirestoreUser {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
    organizationId: string;
    role: UserRole;
    createdAt: unknown;
}

export interface FirestoreOrg {
    id: string;
    name: string;
    industry: IndustryType;
    ownerId: string;
    referralCode: string;
    invitedByOrgId?: string; // Who invited this org
    subscription: {
        plan: 'free_trial' | 'pro' | 'enterprise';
        status: 'active' | 'expired' | 'cancelled';
        trialEndsAt: Timestamp;
        currentPeriodEnd?: Timestamp;
    };
    createdAt: unknown;
}

export interface Credit {
    id: string;
    amountMonths: number;
    reason: 'signup_referral' | 'upgrade_referral';
    status: 'pending' | 'available' | 'used';
    fromOrgId: string; // The org that signed up/upgraded
    createdAt: unknown;
}

export interface PendingInvitation {
    email: string;
    organizationId: string;
    role: 'manager' | 'worker';
    status: 'pending' | 'accepted' | 'expired';
}

// --- User & Org Management ---

export async function getUserProfile(uid: string): Promise<FirestoreUser | null> {
    const docRef = doc(db, "users", uid);
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as FirestoreUser) : null;
}

export async function createUserProfile(user: FirestoreUser) {
    await setDoc(doc(db, "users", user.uid), {
        ...user,
        createdAt: serverTimestamp()
    });
}

export async function createOrganization(
    ownerId: string,
    industry: IndustryType,
    orgName: string,
    referrerCode?: string
): Promise<string> {
    const orgRef = doc(collection(db, "organizations"));
    const referralCode = generateReferralCode(orgName);

    // Default 14-day trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const orgData: FirestoreOrg = {
        id: orgRef.id,
        name: orgName,
        industry,
        ownerId,
        referralCode,
        subscription: {
            plan: 'free_trial',
            status: 'active',
            trialEndsAt: Timestamp.fromDate(trialEndsAt)
        },
        createdAt: serverTimestamp()
    };

    if (!referrerCode) {
        await setDoc(orgRef, orgData);
        return orgRef.id;
    }

    const referralSnap = await getDocs(
        query(collection(db, "organizations"), where("referralCode", "==", referrerCode))
    );

    if (referralSnap.empty) {
        await setDoc(orgRef, orgData);
        return orgRef.id;
    }

    const referrerOrgId = referralSnap.docs[0].id;
    const batch = writeBatch(db);
    batch.set(orgRef, { ...orgData, invitedByOrgId: referrerOrgId });
    batch.set(doc(collection(db, `organizations/${referrerOrgId}/credits`)), {
        amountMonths: 1,
        reason: 'signup_referral',
        status: 'available',
        fromOrgId: orgRef.id,
        createdAt: serverTimestamp()
    });
    await batch.commit();
    return orgRef.id;
}

// --- Invitations ---

export async function inviteMember(email: string, role: string, orgId: string, orgName?: string, invitedByName?: string) {
    const response = await authenticatedFetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, organizationId: orgId, orgName, invitedBy: invitedByName }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to create invitation');
    // Return the invite link so the caller can send it via email / copy it
    const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/join?invite=${data.inviteId}`;
    return { inviteId: data.inviteId, inviteLink };
}

export async function checkPendingInvitation(email: string): Promise<PendingInvitation | null> {
    const q = query(
        collection(db, "invitations"),
        where("email", "==", email.toLowerCase()),
        where("status", "==", "pending")
    );
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as PendingInvitation);
}

// --- Utils ---

function generateReferralCode(name: string): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    return `${prefix}-${random}`;
}

export async function activateCredit(orgId: string, creditId: string, months: number) {
    void orgId;
    void months;
    const response = await authenticatedFetch('/api/credits/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to activate credit');
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export interface SaleItem {
    itemId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export interface SaleRecord {
    id?: string;
    organizationId: string;
    billNumber: string;
    cashierId: string;
    cashierName: string;
    items: SaleItem[];
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    grandTotal: number;
    paymentMethod: 'cash' | 'card' | 'upi' | 'credit';
    createdAt: unknown;
}

/**
 * Persist a completed sale and atomically decrement inventory quantities.
 * Uses a Firestore transaction so a stock shortage detected mid-sale rolls back everything.
 */
export async function persistSale(
    orgId: string,
    sale: Omit<SaleRecord, 'id' | 'createdAt'>,
): Promise<string> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Sales checkout requires an internet connection so stock can be verified safely. Other supported changes will continue syncing automatically.');
    }
    const saleRef = doc(collection(db, `organizations/${orgId}/sales`));

    await runTransaction(db, async (tx) => {
        // 1. Verify stock for every item in the cart
        const stockChecks = await Promise.all(
            sale.items.map(item =>
                tx.get(doc(db, `organizations/${orgId}/inventory/${item.itemId}`))
            )
        );

        for (let i = 0; i < sale.items.length; i++) {
            const snap = stockChecks[i];
            const saleItem = sale.items[i];
            if (!snap.exists()) throw new Error(`Item "${saleItem.name}" no longer exists in inventory.`);
            const available = snap.data().quantity as number;
            if (available < saleItem.quantity) {
                throw new Error(`Insufficient stock for "${saleItem.name}". Available: ${available}, requested: ${saleItem.quantity}.`);
            }
        }

        // 2. Decrement inventory quantities atomically
        for (let i = 0; i < sale.items.length; i++) {
            tx.update(stockChecks[i].ref, {
                quantity: increment(-sale.items[i].quantity),
                updatedAt: serverTimestamp(),
            });
        }

        // 3. Write the sale record
        tx.set(saleRef, {
            ...sale,
            organizationId: orgId,
            createdAt: serverTimestamp(),
        });
    });

    return saleRef.id;
}

// ─── Invite acceptance ────────────────────────────────────────────────────────

/**
 * Accept a pending invitation — links the newly-signed-in user to the inviting org.
 * Called after the user authenticates via Google on the /join page.
 */
export async function acceptInvitation(
    inviteId: string,
    uid: string,
    displayName: string,
    email: string,
    photoURL: string,
): Promise<{ organizationId: string; role: string }> {
    void uid; void displayName; void email; void photoURL;
    const response = await authenticatedFetch(`/api/invitations/${encodeURIComponent(inviteId)}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to accept invitation');
    return data;
}

/**
 * Find a pending invitation by invite ID (for the /join?invite=xxx flow).
 */
export async function getInvitationById(inviteId: string) {
    const response = await fetch(`/api/invitations/${encodeURIComponent(inviteId)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Unable to load invitation');
    return response.json();
}
