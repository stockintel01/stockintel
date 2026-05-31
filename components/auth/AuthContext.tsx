
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
    User,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from "firebase/auth";
import { auth, googleProvider, db } from "@/lib/firebase";
import { useAppStore, SUPER_ADMIN_EMAIL, User as StoreUser, Organization } from "@/lib/store";
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
    signInWithGoogle: (referrerCode?: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    signInWithGoogle: async () => { },
    logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const setStoreUser = useAppStore((state) => state.setStoreUser);
    const setAuthenticated = useAppStore((state) => state.setAuthenticated);

    // Listen to Firebase Auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            setLoading(false);

            if (currentUser) {
                // Fetch complete profile from Firestore
                const profile = await getUserProfile(currentUser.uid);
                if (profile) {
                    // Fetch Org Details too
                    const orgSnap = await getDoc(doc(db, "organizations", profile.organizationId));
                    const orgData = orgSnap.exists() ? (orgSnap.data() as Organization) : null;

                    const storeUser: StoreUser = {
                        id: profile.uid,
                        name: profile.displayName,
                        email: profile.email,
                        role: profile.role,
                        organizationId: profile.organizationId,
                        photoURL: profile.photoURL
                    };
                    setStoreUser(storeUser, orgData);
                    setAuthenticated(true);
                } else {
                    // Authenticated in Firebase but no profile yet (mid-registration)
                    // Do nothing, wait for registration flow to complete
                }
            } else {
                setStoreUser(null, null);
                setAuthenticated(false);
            }
        });

        return () => unsubscribe();
    }, [setStoreUser, setAuthenticated]);

    const signInWithGoogle = async (referrerCode?: string) => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            // Check if user exists in Firestore
            const existingProfile = await getUserProfile(user.uid);

            if (!existingProfile) {
                // New User Flow — create org shell, then send to onboarding to fill details
                let role: "owner" | "worker" = "owner";
                let organizationId = "";

                // 1. Check for Pending Invitation
                if (user.email) {
                    const invitation = await checkPendingInvitation(user.email);
                    if (invitation) {
                        role = invitation.role as any;
                        organizationId = invitation.organizationId;
                    }
                }

                // 2. If no invitation, create new Organization shell (industry chosen in onboarding)
                if (!organizationId) {
                    const orgName = user.displayName || "My Business";
                    organizationId = await createOrganization(
                        user.uid,
                        'pharmacy', // placeholder — onboarding will update this
                        orgName,
                        referrerCode ?? undefined
                    );
                }

                // 3. Create User Profile
                const newProfile: StoreUser = {
                    id: user.uid,
                    name: user.displayName || "User",
                    email: user.email || "",
                    photoURL: user.photoURL || "",
                    organizationId,
                    role
                };

                await createUserProfile({
                    uid: user.uid,
                    email: user.email || "",
                    displayName: user.displayName || "User",
                    photoURL: user.photoURL || "",
                    organizationId,
                    role,
                    createdAt: new Date()
                } as any);

                // Fetch Org Data
                const orgSnap = await getDoc(doc(db, "organizations", organizationId));
                const orgData = orgSnap.exists() ? (orgSnap.data() as Organization) : null;

                setStoreUser(newProfile, orgData);
                setAuthenticated(true);
            }
        } catch (error) {
            console.error("Error signing in with Google", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
