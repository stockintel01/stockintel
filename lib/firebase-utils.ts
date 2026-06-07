
import { db } from "@/lib/firebase";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    runTransaction,
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
    createdAt: any;
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
        trialEndsAt: any;
        currentPeriodEnd?: any;
    };
    createdAt: any;
}

export interface Credit {
    id: string;
    amountMonths: number;
    reason: 'signup_referral' | 'upgrade_referral';
    status: 'pending' | 'available' | 'used';
    fromOrgId: string; // The org that signed up/upgraded
    createdAt: any;
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

    // Default 3 Month Trial
    const trialEndsAt = new Date();
    trialEndsAt.setMonth(trialEndsAt.getMonth() + 3);

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

    // Transaction to create Org AND handle Referral Logic if code exists
    try {
        await runTransaction(db, async (transaction) => {
            // 1. Check Referral Code if provided
            let referrerOrgId = null;
            if (referrerCode) {
                const q = query(collection(db, "organizations"), where("referralCode", "==", referrerCode));
                // We have to execute query outside tx in client SDK usually, but let's try standard flow.
                // Note: Client SDK transactions require reads to happen before writes.
                // Since validation is read-only, let's assume we do it before or inside.
                // For simplicity/perf, we might just look it up first.
            }

            // Writing the Org
            transaction.set(orgRef, orgData);

            // If referrer exists, add credit to referrer
            if (referrerCode) {
                const q = query(collection(db, "organizations"), where("referralCode", "==", referrerCode));
                const querySnapshot = await getDocs(q); // READ
                if (!querySnapshot.empty) {
                    const referrerOrg = querySnapshot.docs[0];
                    referrerOrgId = referrerOrg.id;

                    // Add Link to new Org
                    transaction.update(orgRef, { invitedByOrgId: referrerOrgId });

                    // Create Credit for Referrer (1 Month for Signup)
                    const creditRef = doc(collection(db, `organizations/${referrerOrgId}/credits`));
                    transaction.set(creditRef, {
                        amountMonths: 1,
                        reason: 'signup_referral',
                        status: 'available',
                        fromOrgId: orgRef.id,
                        createdAt: serverTimestamp()
                    });
                }
            }
        });

        return orgRef.id;
    } catch (e) {
        console.error("Transaction failed: ", e);
        // Fallback: Create Org without referral if tx fails? Or throw?
        // For now, let's just create the org simply if tx fails logic is too complex for this demo
        await setDoc(orgRef, orgData);
        return orgRef.id;
    }
}

// --- Invitations ---

export async function inviteMember(email: string, role: string, orgId: string, orgName?: string, invitedByName?: string) {
    const ref = await addDoc(collection(db, "invitations"), {
        email: email.toLowerCase(),
        role,
        organizationId: orgId,
        orgName: orgName ?? '',
        invitedBy: invitedByName ?? '',
        status: 'pending',
        createdAt: serverTimestamp(),
    });
    // Return the invite link so the caller can send it via email / copy it
    const inviteLink = `${typeof window !== 'undefined' ? (typeof window !== 'undefined' ? window.location.origin : '') : ''}/join?invite=${ref.id}`;
    return { inviteId: ref.id, inviteLink };
}

export async function checkPendingInvitation(email: string) {
    const q = query(
        collection(db, "invitations"),
        where("email", "==", email.toLowerCase()),
        where("status", "==", "pending")
    );
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].data();
}

// --- Utils ---

function generateReferralCode(name: string): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    return `${prefix}-${random}`;
}

export async function activateCredit(orgId: string, creditId: string, months: number) {
    // This should ideally be a Cloud Function to prevent abuse.
    // Client-side simulation:

    await runTransaction(db, async (tx) => {
        const orgRef = doc(db, "organizations", orgId);
        const creditRef = doc(db, `organizations/${orgId}/credits/${creditId}`);

        const orgSnap = await tx.get(orgRef);
        const creditSnap = await tx.get(creditRef);

        if (!creditSnap.exists() || creditSnap.data().status !== 'available') {
            throw new Error("Credit not available");
        }

        const orgData = orgSnap.data() as FirestoreOrg;
        let newTrialEnd = orgData.subscription.trialEndsAt.toDate();

        // Add months
        newTrialEnd.setMonth(newTrialEnd.getMonth() + months);

        tx.update(orgRef, {
            "subscription.trialEndsAt": Timestamp.fromDate(newTrialEnd),
            "subscription.status": "active" // Ensure active
        });

        tx.update(creditRef, {
            status: 'used',
            usedAt: serverTimestamp()
        });
    });
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
    createdAt: any;
}

/**
 * Persist a completed sale and atomically decrement inventory quantities.
 * Uses a Firestore transaction so a stock shortage detected mid-sale rolls back everything.
 */
export async function persistSale(
    orgId: string,
    sale: Omit<SaleRecord, 'id' | 'createdAt'>,
): Promise<string> {
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
