"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
    User,
    createUserWithEmailAndPassword,
    getRedirectResult,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    signOut,
    updateProfile,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import { auth, googleProvider, db } from "@/lib/firebase";
import { useAppStore, User as StoreUser, Organization, TenantMembership } from "@/lib/store";
import { isSuperAdminEmail } from "@/lib/access-control";
import { authenticatedFetch } from "@/lib/api-client";
import { createOrganization, createUserProfile, getUserProfile } from "@/lib/firebase-utils";
import {
    AuthContext,
    AuthGate,
    isGatedRoute,
    type AuthIdentity,
    type SignUpInput,
} from "./auth-shared";

function getSuperAdminOrganization(): Organization {
    return {
        id: 'system',
        name: 'StockIntel System Preview',
        industry: 'agriculture',
        ownerId: 'system',
        referralCode: 'SYSTEM',
        subscription: {
            plan: 'enterprise',
            status: 'active',
            trialEndsAt: new Date('2099-12-31'),
            currentPeriodEnd: new Date('2099-12-31'),
        },
    };
}

function identityOf(user: User | null): AuthIdentity | null {
    if (!user) return null;
    return {
        id: user.uid,
        email: user.email ?? '',
        name: user.displayName || user.email?.split('@')[0] || 'User',
        photoURL: user.photoURL ?? '',
    };
}

/** Firebase reports sign-in failures by code; these are the ones a person can act on. */
function describeError(error: unknown): string {
    const code = error instanceof FirebaseError ? error.code : '';
    const fallback = error instanceof Error ? error.message : undefined;
    const map: Record<string, string> = {
        'auth/user-not-found': 'No account found with this email. Check the address or sign up.',
        'auth/wrong-password': 'Incorrect password. Please try again or reset your password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/email-already-in-use': 'An account already exists with this email. Sign in instead.',
        'auth/weak-password': 'Password must be at least 8 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
        'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
        'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication.',
        'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
        'auth/cancelled-popup-request': 'Another sign-in is in progress.',
        'auth/popup-blocked': 'Popup was blocked by your browser. Please allow popups and try again.',
    };
    return map[code] ?? fallback ?? 'Something went wrong. Please try again.';
}

async function getTenantMemberships(
    uid: string,
    profile?: { organizationId?: string; role?: StoreUser['role']; access?: StoreUser['access'] },
) {
    const memberships: TenantMembership[] = [];
    try {
        const response = await authenticatedFetch('/api/organizations', { cache: 'no-store' });
        if (response.ok) {
            const data = await response.json() as { memberships?: TenantMembership[] };
            if (Array.isArray(data.memberships)) memberships.push(...data.memberships);
        }
    } catch {
        // Fall back to the client-readable membership collection below.
    }
    if (memberships.length === 0) {
        try {
            const membershipSnap = await getDocs(collection(db, 'users', uid, 'memberships'));
            membershipSnap.forEach(item => {
                const data = item.data();
                memberships.push({
                    organizationId: String(data.organizationId ?? item.id),
                    organizationName: data.organizationName,
                    industry: data.industry,
                    role: data.role,
                    access: Array.isArray(data.access) ? data.access : [],
                } as TenantMembership);
            });
        } catch {
            // Older accounts may only have the legacy top-level organization fields.
        }
    }
    if (profile?.organizationId && !memberships.some(item => item.organizationId === profile.organizationId)) {
        memberships.push({
            organizationId: profile.organizationId,
            role: profile.role ?? 'worker',
            access: profile.access ?? [],
        });
    }
    return memberships;
}

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [identity, setIdentity] = useState<AuthIdentity | null>(null);
    // authReady: true once Firebase has resolved the initial auth state.
    // This is the single source of truth for whether the guard should fire.
    const [authReady, setAuthReady] = useState(false);

    const setStoreUser = useAppStore((state) => state.setStoreUser);
    const setAuthenticated = useAppStore((state) => state.setAuthenticated);

    useEffect(() => {
        // Handle redirect result first (for browsers that block popups)
        getRedirectResult(auth).then(async (result) => {
            if (result?.user) {
                // New user from redirect — create profile if needed
                const existing = await getUserProfile(result.user.uid);
                if (!existing) {
                    const orgId = await createOrganization(
                        result.user.uid, 'agriculture',
                        'New Business'
                    );
                    await createUserProfile({
                        uid: result.user.uid,
                        email: result.user.email || '',
                        displayName: result.user.displayName || 'User',
                        photoURL: result.user.photoURL || '',
                        organizationId: orgId,
                        role: 'owner',
                        createdAt: new Date(),
                    });
                }
            }
        }).catch(console.warn);

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setAuthReady(false);
            setIdentity(identityOf(currentUser));

            if (currentUser) {
                try {
                    const profile = await getUserProfile(currentUser.uid);

                    if (!profile) {
                        // No Firestore profile yet — user exists in Auth but hasn't finished
                        // onboarding. Still mark as authenticated so dashboard can load
                        // and onboarding page can finish writing the profile.
                        const storeUser: StoreUser = {
                            id: currentUser.uid,
                            name: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                            email: currentUser.email || '',
                            photoURL: currentUser.photoURL || '',
                            organizationId: '',
                            role: isSuperAdminEmail(currentUser.email) ? 'super_admin' : 'owner',
                        };
                        setStoreUser(storeUser, isSuperAdminEmail(currentUser.email) ? getSuperAdminOrganization() : null);
                        setAuthenticated(true);
                    } else {
                        const role = isSuperAdminEmail(currentUser.email) ? 'super_admin' : profile.role;
                        const memberships = await getTenantMemberships(currentUser.uid, profile);
                        const activeMembership = memberships.find(item => item.organizationId === profile.organizationId) ?? memberships[0];
                        const activeOrganizationId = profile.organizationId || activeMembership?.organizationId || '';

                        let orgData: Organization | null = null;
                        if (activeOrganizationId) {
                            try {
                                const orgSnap = await getDoc(doc(db, 'organizations', activeOrganizationId));
                                orgData = orgSnap.exists() ? ({ ...(orgSnap.data() as Organization), id: orgSnap.id }) : null;
                            } catch {
                                // Org read failed (rules / offline) — continue without it
                            }
                        }

                        const storeUser: StoreUser = {
                            id: profile.uid,
                            name: profile.displayName,
                            email: profile.email,
                            role: isSuperAdminEmail(currentUser.email) ? role : activeMembership?.role ?? role,
                            organizationId: activeOrganizationId,
                            photoURL: profile.photoURL,
                            access: activeMembership?.access ?? profile.access,
                            memberships,
                        };

                        setStoreUser(storeUser, orgData ?? (isSuperAdminEmail(currentUser.email) ? getSuperAdminOrganization() : null));
                        setAuthenticated(true);
                    }
                } catch (err) {
                    console.error('[AuthContext] profile load error:', err);
                    // Fail closed. A Firebase Auth user without a readable tenant
                    // profile must not be treated as a local visitor session.
                    setStoreUser(null, null);
                    setAuthenticated(false);
                }
            } else {
                setStoreUser(null, null);
                setAuthenticated(false);
            }

            setAuthReady(true);
        });

        return () => unsubscribe();
    }, [setStoreUser, setAuthenticated]);

    // ── Google Sign In ────────────────────────────────────────────
    const signInWithGoogle = async (referrerCode?: string, options?: { deferProvisioning?: boolean }) => {
        let fbUser: User;
        try {
            // Try popup first (works in most desktop browsers)
            const result = await signInWithPopup(auth, googleProvider);
            fbUser = result.user;
        } catch (popupErr: unknown) {
            // Popup blocked or failed — fall back to redirect flow
            const code = popupErr instanceof Error && 'code' in popupErr ? String(popupErr.code) : '';
            if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                await signInWithRedirect(auth, googleProvider);
                return { isNewUser: false, email: null }; // Page will redirect; onAuthStateChanged handles the rest
            }
            throw popupErr;
        }

        const existingProfile = await getUserProfile(fbUser.uid);
        if (existingProfile) return { isNewUser: false, email: fbUser.email };

        if (options?.deferProvisioning) return { isNewUser: true, email: fbUser.email };

        // New user — create org + profile, then the caller redirects to onboarding
        const organizationId = await createOrganization(
            fbUser.uid,
            'agriculture',
            'New Business',
            referrerCode ?? undefined
        );

        await createUserProfile({
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || 'User',
            photoURL: fbUser.photoURL || '',
            organizationId,
            role: 'owner',
            createdAt: new Date(),
        });

        const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
        setStoreUser({
            id: fbUser.uid,
            name: fbUser.displayName || 'User',
            email: fbUser.email || '',
            photoURL: fbUser.photoURL || '',
            organizationId,
            role: isSuperAdminEmail(fbUser.email) ? 'super_admin' : 'owner',
            access: [],
        }, orgSnap.exists() ? (orgSnap.data() as Organization) : null);
        setAuthenticated(true);
        return { isNewUser: true, email: fbUser.email };
    };

    const signInWithEmail = async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email.trim(), password);
    };

    const signUpWithEmail = async ({ name, email, password, referrerCode }: SignUpInput) => {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });

        const organizationId = await createOrganization(credential.user.uid, 'agriculture', 'New Business', referrerCode);
        await createUserProfile({
            uid: credential.user.uid,
            email: credential.user.email ?? email,
            displayName: name.trim(),
            photoURL: credential.user.photoURL ?? '',
            organizationId,
            role: isSuperAdminEmail(credential.user.email) ? 'super_admin' : 'owner',
            createdAt: new Date(),
        });
        return { isNewUser: true, needsEmailConfirmation: false };
    };

    const sendPasswordReset = async (email: string) => {
        await sendPasswordResetEmail(auth, email.trim());
    };

    const logout = async () => {
        try {
            await signOut(auth);
            navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
        } catch (err) {
            console.error('Error signing out:', err);
        }
    };

    return (
        <AuthContext.Provider value={{
            user: identity,
            loading: !authReady,
            signInWithGoogle,
            signInWithEmail,
            signUpWithEmail,
            sendPasswordReset,
            logout,
            describeError,
        }}>
            <AuthGate ready={authReady} gated={isGatedRoute(pathname)}>{children}</AuthGate>
        </AuthContext.Provider>
    );
}
