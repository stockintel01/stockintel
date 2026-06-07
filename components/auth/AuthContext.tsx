"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
    User,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut
} from "firebase/auth";
import { auth, googleProvider, db } from "@/lib/firebase";
import { useAppStore, User as StoreUser, Organization } from "@/lib/store";
import { isSuperAdminEmail } from "@/lib/access-control";
import {
    getUserProfile,
    checkPendingInvitation,
    createUserProfile,
    createOrganization
} from "@/lib/firebase-utils";
import { doc, getDoc } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signInWithGoogle: (referrerCode?: string) => Promise<{ isNewUser: boolean }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    signInWithGoogle: async () => ({ isNewUser: false }),
    logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
    // authReady: true once Firebase has resolved the initial auth state
    // This is the single source of truth for whether the guard should fire
    const [authReady, setAuthReady] = useState(false);

    const setStoreUser    = useAppStore((state) => state.setStoreUser);
    const setAuthenticated = useAppStore((state) => state.setAuthenticated);

    useEffect(() => {
        // Handle redirect result first (for browsers that block popups)
        getRedirectResult(auth).then(async (result) => {
            if (result?.user) {
                // New user from redirect — create profile if needed
                const existing = await getUserProfile(result.user.uid);
                if (!existing) {
                    const orgId = await createOrganization(
                        result.user.uid, 'pharmacy',
                        result.user.displayName || 'My Business'
                    );
                    await createUserProfile({
                        uid: result.user.uid,
                        email: result.user.email || '',
                        displayName: result.user.displayName || 'User',
                        photoURL: result.user.photoURL || '',
                        organizationId: orgId,
                        role: 'owner',
                        createdAt: new Date(),
                    } as any);
                }
            }
        }).catch(console.warn);

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setAuthReady(false);
            setFirebaseUser(currentUser);

            if (currentUser) {
                try {
                    let profile = await getUserProfile(currentUser.uid);

                    if (!profile) {
                        // No Firestore profile yet — user exists in Auth but hasn't finished
                        // onboarding. Still mark as authenticated so dashboard can load
                        // and onboarding page can finish writing the profile.
                        // Build a minimal store user from Firebase Auth data.
                        const storeUser: StoreUser = {
                            id:             currentUser.uid,
                            name:           currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                            email:          currentUser.email || '',
                            photoURL:       currentUser.photoURL || '',
                            organizationId: '',
                            role:           isSuperAdminEmail(currentUser.email) ? 'super_admin' : 'owner',
                        };
                        setStoreUser(storeUser, null);
                        setAuthenticated(true);
                    } else {
                        // Super admin role override
                        if (isSuperAdminEmail(currentUser.email)) {
                            (profile as any).role = 'super_admin';
                        }

                        // Fetch the org document
                        let orgData: Organization | null = null;
                        if (profile.organizationId) {
                            try {
                                const orgSnap = await getDoc(doc(db, 'organizations', profile.organizationId));
                                orgData = orgSnap.exists() ? (orgSnap.data() as Organization) : null;
                            } catch {
                                // Org read failed (rules / offline) — continue without it
                            }
                        }

                        const storeUser: StoreUser = {
                            id:             profile.uid,
                            name:           profile.displayName,
                            email:          profile.email,
                            role:           profile.role as any,
                            organizationId: profile.organizationId,
                            photoURL:       profile.photoURL,
                        };

                        setStoreUser(storeUser, orgData);
                        setAuthenticated(true);
                    }
                } catch (err) {
                    console.error('[AuthContext] profile load error:', err);
                    // Even on error, mark authenticated so the user isn't looped to /login
                    // when they ARE logged in to Firebase
                    const storeUser: StoreUser = {
                        id:             currentUser.uid,
                        name:           currentUser.displayName || 'User',
                        email:          currentUser.email || '',
                        photoURL:       currentUser.photoURL || '',
                        organizationId: '',
                        role:           isSuperAdminEmail(currentUser.email) ? 'super_admin' : 'owner',
                    };
                    setStoreUser(storeUser, null);
                    setAuthenticated(true);
                }
            } else {
                // Signed out
                setStoreUser(null, null);
                setAuthenticated(false);
            }

            // Auth state is now resolved — safe for the guard to run
            setAuthReady(true);
        });

        return () => unsubscribe();
    }, [setStoreUser, setAuthenticated]);

    // ── Google Sign In ────────────────────────────────────────────
    const signInWithGoogle = async (referrerCode?: string) => {
        let fbUser: User;
        try {
            // Try popup first (works in most desktop browsers)
            const result = await signInWithPopup(auth, googleProvider);
            fbUser = result.user;
        } catch (popupErr: any) {
            // Popup blocked or failed — fall back to redirect flow
            if (
                popupErr.code === 'auth/popup-blocked' ||
                popupErr.code === 'auth/popup-closed-by-user' ||
                popupErr.code === 'auth/cancelled-popup-request'
            ) {
                await signInWithRedirect(auth, googleProvider);
                return { isNewUser: false }; // Page will redirect; onAuthStateChanged handles the rest
            }
            throw popupErr;
        }

        // Check if this user already has a Firestore profile
        const existingProfile = await getUserProfile(fbUser.uid);

        if (!existingProfile) {
            // New user — create org + profile, then redirect to onboarding
            let role: 'owner' | 'worker' = 'owner';
            let organizationId = '';

            // Check for pending invitation first
            if (fbUser.email) {
                const invitation = await checkPendingInvitation(fbUser.email);
                if (invitation) {
                    role           = invitation.role as any;
                    organizationId = invitation.organizationId;
                }
            }

            // No invitation — create a new org shell
            if (!organizationId) {
                organizationId = await createOrganization(
                    fbUser.uid,
                    'pharmacy', // placeholder; onboarding will update industry
                    fbUser.displayName || 'My Business',
                    referrerCode ?? undefined
                );
            }

            await createUserProfile({
                uid:            fbUser.uid,
                email:          fbUser.email || '',
                displayName:    fbUser.displayName || 'User',
                photoURL:       fbUser.photoURL || '',
                organizationId,
                role,
                createdAt:      new Date(),
            } as any);

            const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
            setStoreUser({
                id: fbUser.uid,
                name: fbUser.displayName || 'User',
                email: fbUser.email || '',
                photoURL: fbUser.photoURL || '',
                organizationId,
                role: isSuperAdminEmail(fbUser.email) ? 'super_admin' : role,
            }, orgSnap.exists() ? (orgSnap.data() as Organization) : null);
            setAuthenticated(true);
            return { isNewUser: true };
        }

        return { isNewUser: false };
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (err) {
            console.error('Error signing out:', err);
        }
    };

    return (
        <AuthContext.Provider value={{ user: firebaseUser, loading: !authReady, signInWithGoogle, logout }}>
            {/* Block rendering until Firebase has resolved auth state.
                This prevents the dashboard guard from firing with stale
                isAuthenticated=false before onAuthStateChanged completes. */}
            {authReady ? children : (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center font-black text-primary-foreground text-base">SI</div>
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                </div>
            )}
        </AuthContext.Provider>
    );
}
