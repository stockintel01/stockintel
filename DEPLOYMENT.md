# IntelliStock AI — Deployment Guide

## Prerequisites

- Node.js 18+ and npm
- Vercel account (free tier works)
- Firebase project (Blaze plan required for Cloud Functions)
- Stripe account with Pro and Enterprise recurring prices
- Meta Business account with WhatsApp Cloud API access (optional — for WhatsApp alerts)
- OpenAI, Google Gemini, or Anthropic API key (optional — for AI features)

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

## 3. WhatsApp Cloud API Setup (optional)

WhatsApp messaging stores its queue, contacts, and consent records in Supabase, so the Supabase variables must be configured too. A farm can receive alerts once its organization exists in Supabase.

1. In [Meta Business Suite](https://business.facebook.com), start **Business verification**. It takes the longest, so begin first.
2. Create an app at [developers.facebook.com](https://developers.facebook.com/apps) and add the **WhatsApp** product.
3. Register the sending phone number. It must not already be active on the WhatsApp or WhatsApp Business app.
4. Create a **System User** with `whatsapp_business_messaging` and `whatsapp_business_management` permissions and generate a permanent token → `WHATSAPP_ACCESS_TOKEN`
5. From **WhatsApp → API Setup**, copy the phone number ID → `WHATSAPP_PHONE_NUMBER_ID` and the WhatsApp Business Account ID → `WHATSAPP_BUSINESS_ACCOUNT_ID`. Set `WHATSAPP_DISPLAY_PHONE_NUMBER` to the number in international format.
6. From **App settings → Basic**, copy the app secret → `WHATSAPP_APP_SECRET`
7. Generate two random secrets with `openssl rand -hex 32` → `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `CRON_SECRET`
8. In **WhatsApp → Configuration**, set the callback URL to `https://yourdomain.vercel.app/api/comms/webhooks/whatsapp`, enter the verify token, and subscribe to the **messages** field.
9. Submit the `stockintel_low_stock_alert` template (category **Utility**, language **English**) with this body, plus a **Visit website** button pointing at your stock management page:

   ```text
   Low stock at {{1}}: {{2}} below minimum. {{3}}. Open StockIntel to reorder or adjust stock.
   ```

   After Meta approves it, mark it approved in Supabase:

   ```sql
   update public.message_templates set status = 'approved'
   where organization_id is null and template_key = 'inventory_low_stock';
   ```
10. Schedule the two worker routes, sending `Authorization: Bearer <CRON_SECRET>`:
    - `GET /api/comms/cron/dispatch` — every minute (sends queued messages)
    - `GET /api/comms/cron/scan` — every 15 minutes (checks stock levels)

    Vercel Pro can schedule these in `vercel.json`. Vercel Hobby only allows daily cron jobs, so use Supabase `pg_cron` or another scheduler instead.

None of these values may use a `NEXT_PUBLIC_` prefix.

---

## 4. AI Provider Setup (optional)

Set `AI_PROVIDER` to `openai`, `gemini`, `anthropic`, or `auto`. Configure the matching `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `ANTHROPIC_API_KEY`. With `auto`, IntelliStock tries OpenAI, then Gemini, then Anthropic.

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
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

# Firebase Admin service account (server-only)
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY                 ← preserve \n escapes in Vercel

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY                     ← server-only (no NEXT_PUBLIC_)
STRIPE_WEBHOOK_SECRET                 ← server-only
NEXT_PUBLIC_STRIPE_PRICE_PRO
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE

# AI provider
AI_PROVIDER=auto
OPENAI_API_KEY
OPENAI_MODEL
GEMINI_API_KEY
GEMINI_MODEL
ANTHROPIC_API_KEY
ANTHROPIC_MODEL

# WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN                 ← server-only
WHATSAPP_PHONE_NUMBER_ID              ← server-only
WHATSAPP_BUSINESS_ACCOUNT_ID          ← server-only
WHATSAPP_DISPLAY_PHONE_NUMBER         ← server-only
WHATSAPP_APP_SECRET                   ← server-only
WHATSAPP_WEBHOOK_VERIFY_TOKEN         ← server-only
WHATSAPP_GRAPH_API_VERSION=v23.0
CRON_SECRET                           ← server-only
COMMS_QUOTA_MODE=observe

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
- [ ] Complete a test agriculture stock import and packhouse shipping record
- [ ] Trigger a test Stripe webhook: `stripe trigger checkout.session.completed`
- [ ] Test the barcode scanner on a mobile device
- [ ] Verify offline mode: turn off WiFi, navigate the app, reconnect
- [ ] Connect WhatsApp from Stock Management, raise an item's minimum above its stock, then call the scan and dispatch routes

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
    │  Anthropic  │         │  Meta Cloud │
    │  Claude API │         │  API        │
    │  (server)   │         │  WhatsApp   │
    └─────────────┘         └─────────────┘
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Google sign-in fails | Add Vercel domain to Firebase Auth authorized domains |
| Firestore permission denied | Deploy `firestore.rules` with `firebase deploy --only firestore:rules` |
| Stripe webhook 400 | Check `STRIPE_WEBHOOK_SECRET` matches the signing secret in Stripe Dashboard |
| AI report generation returns 503 | Set `AI_PROVIDER` and its matching API key in Vercel |
| Barcode scanner not working | Camera requires HTTPS — works automatically on Vercel, use `https://` locally via ngrok |
| PWA install prompt not showing | Must be served over HTTPS with a valid manifest |
| Build fails: `output: standalone` | Remove `output: 'standalone'` if using Vercel (Vercel handles this automatically) |
