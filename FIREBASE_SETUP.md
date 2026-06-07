# Firebase Setup for StockIntel

## Required steps before Google Sign-In works

### 1. Enable Google Sign-In in Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → **Authentication** → **Sign-in method**
3. Enable **Google** → Add your support email → Save
4. Enable **Email/Password** → Save

### 2. Add Authorized Domains
In Firebase Console → Authentication → **Settings** → **Authorized domains**, add:
- `localhost` (already there)
- `your-app.vercel.app` (your Vercel deployment URL)
- Any custom domain you use

**This is the most common reason Google sign-in fails.** If the domain isn't authorized, the OAuth popup will show an error.

### 3. Set up Super Admins

The approved complimentary-access super admin accounts are:

- `mawuklegodson@gmail.com`
- `enochapafloe@gmail.com`

Both accounts must sign in once before running:

```bash
node seed-superadmin.js
```
1. Sign in to the app once using Google or email
2. Download `serviceAccountKey.json` from Firebase Console → Project Settings → Service accounts
3. Place it in the project root
4. Run: `node seed-superadmin.js`

### 4. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 5. Environment Variables (Vercel)
Set these in Vercel → Project Settings → Environment Variables:
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
STRIPE_SECRET_KEY          (optional — for billing)
STRIPE_WEBHOOK_SECRET      (optional)
ANTHROPIC_API_KEY          (optional — for AI consultation)
```

## Auth Flow Explained
1. User clicks "Continue with Google" → popup opens
2. On success → `onAuthStateChanged` fires → profile loaded from Firestore → store hydrated
3. New users → redirected to `/onboarding` to set up their business
4. Existing users → redirected to `/dashboard`
5. On any page load → `AuthContext` blocks rendering until Firebase resolves (prevents login loop)

## Troubleshooting the Login Loop
If you're redirected back to `/login` after signing in:
1. Check **Authorized domains** in Firebase Console (most common issue)
2. Check browser console for `[AuthContext]` errors
3. Verify environment variables are set correctly in Vercel
4. Try signing out completely (clear cookies/localStorage) and sign in fresh
