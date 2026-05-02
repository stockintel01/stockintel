# IntelliStock AI — Deployment Guide

## Prerequisites

- Node.js 18+ and npm
- Vercel account (free tier works)
- Firebase project (Blaze plan required for Cloud Functions)
- Stripe account
- Twilio account (optional — for WhatsApp/SMS alerts)
- Anthropic API key (optional — for AI consultation and reports)

---

## 1. Firebase Setup

### 1a. Create project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project → enable Google Analytics (optional)
3. Upgrade to **Blaze** (pay-as-you-go) plan — required for external API calls

### 1b. Enable services
- **Authentication** → Sign-in method → Enable **Google**
- **Firestore Database** → Create database → Start in **production mode**
- **Storage** → Enable (for future product images)

### 1c. Deploy security rules and indexes
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project, accept defaults
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 1d. Get config values
Firebase Console → Project Settings → Your apps → Add Web App → Copy config object

---

## 2. Stripe Setup

### 2a. Create products
1. Stripe Dashboard → Products → Add Product
2. Create **IntelliStock Pro** — ₹2,499/month recurring → copy Price ID
3. Create **IntelliStock Enterprise** — custom pricing → copy Price ID

### 2b. Get API keys
Stripe Dashboard → Developers → API keys

### 2c. Configure webhook
1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://yourdomain.vercel.app/api/webhooks/stripe`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## 3. Twilio Setup (optional)

1. Create account at [twilio.com](https://console.twilio.com)
2. Get **Account SID** and **Auth Token** from dashboard
3. For SMS: Buy a phone number → `TWILIO_FROM_NUMBER`
4. For WhatsApp: Join sandbox at [console.twilio.com/try-twilio/whatsapp](https://console.twilio.com/try-twilio/whatsapp)
   - Or apply for WhatsApp Business API approval (production)
   - `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (sandbox number)
5. Generate a random secret: `openssl rand -hex 16`
   - Set as both `ALERT_WEBHOOK_SECRET` and `NEXT_PUBLIC_ALERT_SECRET`

---

## 4. Anthropic Setup (optional)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create API key → set as `ANTHROPIC_API_KEY`
3. The AI Consultation and AI Report Generator features will activate automatically

---

## 5. Deploy to Vercel

### 5a. Connect repository
```bash
# Push to GitHub first
git init && git add . && git commit -m "Initial IntelliStock AI"
git remote add origin https://github.com/yourusername/intellistock.git
git push -u origin main
```

Then:
1. [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Framework preset: **Next.js** (auto-detected)
3. Root directory: leave as `/`

### 5b. Set environment variables
In Vercel dashboard → Settings → Environment Variables, add:

```
# Firebase (all NEXT_PUBLIC_ so they're available client-side)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY                     ← server-only (no NEXT_PUBLIC_)
STRIPE_WEBHOOK_SECRET                 ← server-only
NEXT_PUBLIC_STRIPE_PRICE_PRO
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE

# Anthropic
ANTHROPIC_API_KEY                     ← server-only

# Twilio
TWILIO_ACCOUNT_SID                    ← server-only
TWILIO_AUTH_TOKEN                     ← server-only
TWILIO_FROM_NUMBER                    ← server-only
TWILIO_WHATSAPP_FROM                  ← server-only
ALERT_WEBHOOK_SECRET                  ← server-only
NEXT_PUBLIC_ALERT_SECRET              ← client-side (same value)

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.vercel.app
```

### 5c. Deploy
```bash
vercel --prod
# or just push to main — Vercel auto-deploys
```

### 5d. Update Firebase Auth domain
After getting your Vercel URL:
1. Firebase Console → Authentication → Settings → Authorized domains
2. Add `yourdomain.vercel.app`

---

## 6. Custom Domain (optional)

1. Vercel dashboard → your project → Domains → Add
2. Follow DNS instructions for your registrar
3. Update `NEXT_PUBLIC_APP_URL` to your custom domain
4. Update Firebase authorized domains

---

## 7. Post-deploy Checklist

- [ ] Test Google Sign-in works
- [ ] Test inventory loads from Firestore
- [ ] Add a test item and verify real-time sync
- [ ] Complete a test sale in POS
- [ ] Trigger a test Stripe webhook: `stripe trigger checkout.session.completed`
- [ ] Test the barcode scanner on a mobile device
- [ ] Verify offline mode: turn off WiFi, navigate the app, reconnect
- [ ] Test WhatsApp alert by temporarily lowering reorder threshold in Settings

---

## 8. Local Development

```bash
# 1. Clone and install
git clone https://github.com/yourusername/intellistock.git
cd intellistock
npm install

# 2. Set up environment
cp .env.example .env.local
# Fill in your values in .env.local

# 3. Run dev server
npm run dev
# → http://localhost:3000

# 4. Test Stripe webhooks locally
npm install -g stripe
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# 5. Run lint
npm run lint
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Vercel Edge                      │
│  Next.js 16 App Router · Standalone output           │
│                                                     │
│  /app          Pages + API routes                   │
│  /public/sw.js Service Worker (PWA)                 │
│  /lib          Firebase, Stripe, Zustand, hooks     │
│  /components   UI + Scanner + PWA Banner            │
└──────────┬──────────────────────────────────────────┘
           │
    ┌──────┴──────┐         ┌─────────────┐
    │  Firebase   │         │   Stripe    │
    │  Firestore  │         │  Checkout   │
    │  Auth       │         │  Portal     │
    │  Storage    │         │  Webhooks   │
    └─────────────┘         └─────────────┘
           │
    ┌──────┴──────┐         ┌─────────────┐
    │  Anthropic  │         │   Twilio    │
    │  Claude API │         │  WhatsApp   │
    │  (server)   │         │  SMS Alerts │
    └─────────────┘         └─────────────┘
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Google sign-in fails | Add Vercel domain to Firebase Auth authorized domains |
| Firestore permission denied | Deploy `firestore.rules` with `firebase deploy --only firestore:rules` |
| Stripe webhook 400 | Check `STRIPE_WEBHOOK_SECRET` matches the signing secret in Stripe Dashboard |
| AI consultation returns 503 | `ANTHROPIC_API_KEY` not set in Vercel environment variables |
| Barcode scanner not working | Camera requires HTTPS — works automatically on Vercel, use `https://` locally via ngrok |
| PWA install prompt not showing | Must be served over HTTPS with a valid manifest |
| Build fails: `output: standalone` | Remove `output: 'standalone'` if using Vercel (Vercel handles this automatically) |
