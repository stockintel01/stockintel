
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCAHEZYxd0w0Ei03bgQzyRPh2drxWf3hVY",
    authDomain: "stock-intel-3e0dc.firebaseapp.com",
    projectId: "stock-intel-3e0dc",
    storageBucket: "stock-intel-3e0dc.firebasestorage.app",
    messagingSenderId: "1013113693953",
    appId: "1:1013113693953:web:657fae8b0591e6f20d1d00",
    measurementId: "G-QS7HGJC92K"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Analytics only on client side and if supported
let analytics;
if (typeof window !== "undefined") {
    isSupported().then((supported) => {
        if (supported) {
            analytics = getAnalytics(app);
        }
    });
}

const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, analytics, db, auth, googleProvider };
