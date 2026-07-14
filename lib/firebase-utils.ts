
import { auth, db } from "@/lib/firebase";
import {
    addDoc,
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { UserRole, IndustryType, type Organization } from "@/lib/store";
import { authenticatedFetch } from "@/lib/api-client";
import type { AccessKey } from "@/lib/access-permissions";

export interface FirestoreUser {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
    organizationId: string;
    role: UserRole;
    access?: AccessKey[];
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
        trialEndsAt: unknown;
        currentPeriodEnd?: unknown;
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
    orgName?: string;
    industry?: IndustryType;
    role: 'manager' | 'worker';
    access?: AccessKey[];
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
        access: user.access ?? [],
        createdAt: serverTimestamp()
    });
}

export async function createOrganization(
    ownerId: string,
    industry: IndustryType,
    orgName: string,
    referrerCode?: string
): Promise<string> {
    void ownerId;
    const response = await authenticatedFetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, orgName, referrerCode }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to create organization');
    return data.organizationId;
}

// --- Invitations ---

function shouldUseClientInviteFallback(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return [
        'firebase admin',
        'default credentials',
        'unable to load your user profile',
        'service account',
        'authentication token',
        'credentials are not configured',
    ].some(fragment => message.includes(fragment));
}

export async function inviteMember(email: string, role: string, orgId: string, orgName?: string, invitedByName?: string, access?: AccessKey[]) {
    let data: { inviteId: string; error?: string };
    try {
        const response = await authenticatedFetch('/api/invitations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role, organizationId: orgId, orgName, invitedBy: invitedByName, access }),
        });
        data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Unable to create invitation');
    } catch (error) {
        if (!shouldUseClientInviteFallback(error)) throw error;
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Sign in again before inviting a team member.');
        const orgSnap = await getDoc(doc(db, 'organizations', orgId));
        const orgData = orgSnap.exists() ? (orgSnap.data() as FirestoreOrg) : null;
        const inviteRef = await addDoc(collection(db, 'invitations'), {
            email: email.trim().toLowerCase(),
            role,
            access: access ?? [],
            organizationId: orgId,
            orgName: orgName ?? orgData?.name ?? 'Your workspace',
            industry: orgData?.industry ?? 'agriculture',
            status: 'pending',
            invitedBy: invitedByName ?? currentUser.displayName ?? currentUser.email ?? 'Team admin',
            createdBy: currentUser.uid,
            createdByEmail: currentUser.email ?? '',
            createdAt: serverTimestamp(),
        });
        data = { inviteId: inviteRef.id };
    }
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
): Promise<{ organizationId: string; role: string; access?: AccessKey[]; organization?: import('@/lib/store').Organization }> {
    try {
        const response = await authenticatedFetch(`/api/invitations/${encodeURIComponent(inviteId)}`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Unable to accept invitation');
        return data;
    } catch (error) {
        if (!shouldUseClientInviteFallback(error)) throw error;
        const inviteRef = doc(db, 'invitations', inviteId);
        const inviteSnap = await getDoc(inviteRef);
        if (!inviteSnap.exists()) throw new Error('This invitation link is invalid or has expired.');
        const invite = inviteSnap.data() as PendingInvitation;
        if (invite.status !== 'pending') throw new Error('This invitation has already been used or was cancelled.');
        if (invite.email.toLowerCase() !== email.toLowerCase()) {
            throw new Error(`This invitation was sent to ${invite.email}. Sign in with that Google account to accept it.`);
        }

        const access = invite.access ?? [];
        const role = invite.role;
        const userRef = doc(db, 'users', uid);
        const existingUserSnap = await getDoc(userRef);
        const memberPayload = {
            uid,
            email,
            displayName: displayName || email.split('@')[0] || 'Team member',
            photoURL: photoURL || '',
            organizationId: invite.organizationId,
            organizationName: invite.orgName ?? 'Your workspace',
            industry: invite.industry ?? 'agriculture',
            role,
            access,
            acceptedInviteId: inviteId,
            updatedAt: serverTimestamp(),
        };

        const batch = writeBatch(db);
        batch.set(userRef, existingUserSnap.exists() ? memberPayload : {
            ...memberPayload,
            createdAt: serverTimestamp(),
        }, { merge: true });
        batch.set(doc(db, `users/${uid}/memberships/${invite.organizationId}`), {
            ...memberPayload,
            status: 'active',
            joinedAt: serverTimestamp(),
        }, { merge: true });
        batch.set(doc(db, `organizations/${invite.organizationId}/members/${uid}`), {
            ...memberPayload,
            status: 'active',
            joinedAt: serverTimestamp(),
        }, { merge: true });
        batch.update(inviteRef, {
            status: 'accepted',
            acceptedAt: serverTimestamp(),
            acceptedByUid: uid,
        });
        await batch.commit();
        const orgSnap = await getDoc(doc(db, 'organizations', invite.organizationId)).catch(() => null);
        const organization = orgSnap?.exists()
            ? { ...(orgSnap.data() as Organization), id: orgSnap.id }
            : {
                id: invite.organizationId,
                name: invite.orgName ?? 'Your workspace',
                industry: invite.industry ?? 'agriculture',
                ownerId: '',
                referralCode: '',
                subscription: { plan: 'free_trial' as const, status: 'active' as const, trialEndsAt: new Date() },
            };
        return { organizationId: invite.organizationId, role, access, organization };
    }
}

/**
 * Find a pending invitation by invite ID (for the /join?invite=xxx flow).
 */
export async function getInvitationById(inviteId: string) {
    try {
        const response = await fetch(`/api/invitations/${encodeURIComponent(inviteId)}`);
        if (response.status === 404) return null;
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error ?? 'Unable to load invitation');
        }
        return response.json();
    } catch (error) {
        if (!shouldUseClientInviteFallback(error)) throw error;
        const snap = await getDoc(doc(db, 'invitations', inviteId));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }
}
