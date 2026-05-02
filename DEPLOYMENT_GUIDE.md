# StockIntel Production Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Setup

- [ ] Create production Firebase project
- [ ] Set up production Stripe account
- [ ] Configure production environment variables
- [ ] Set up domain and SSL certificate

### 2. Firebase Configuration

#### Create Production Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create new project: "StockIntel Production"
3. Enable Google Analytics (optional)
4. Enable Authentication → Google Sign-In
5. Create Firestore Database (production mode)

#### Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

#### Set Up Firebase Hosting (Optional)
```bash
firebase init hosting
firebase deploy --only hosting
```

### 3. Stripe Setup

#### Switch to Live Mode
1. Complete Stripe account activation
2. Add business details
3. Connect bank account for payouts
4. Verify identity documents

#### Create Live Products
1. Go to Products in Stripe Dashboard
2. Create "StockIntel Pro" ($5/month)
3. Create "StockIntel Enterprise" ($15/month)
4. Copy live Price IDs

#### Configure Webhook
1. Go to Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy webhook signing secret

### 4. Environment Variables

Create `.env.production` or configure in your hosting platform:

```env
# Firebase (Production)
NEXT_PUBLIC_FIREBASE_API_KEY=your_live_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=stockintel-prod.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=stockintel-prod
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=stockintel-prod.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Stripe (Live)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_live_secret

# Stripe Price IDs (Live)
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_live_pro_id
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=price_live_enterprise_id

# App URL (Production)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## Deployment Options

### Option 1: Vercel (Recommended)

#### Initial Setup
```bash
npm install -g vercel
vercel login
```

#### Deploy
```bash
# Build and deploy
vercel --prod

# Set environment variables
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add STRIPE_SECRET_KEY
# ... add all other env vars
```

#### Custom Domain
1. Go to Vercel Dashboard → Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed

### Option 2: Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init hosting

# Build
npm run build

# Deploy
firebase deploy --only hosting
```

### Option 3: Self-Hosted (VPS/Cloud)

#### Requirements
- Node.js 18+
- PM2 or similar process manager
- Nginx or Apache
- SSL certificate (Let's Encrypt)

#### Steps
```bash
# Clone repository
git clone your-repo-url
cd stockintel

# Install dependencies
npm install

# Build
npm run build

# Start with PM2
pm2 start npm --name "stockintel" -- start
pm2 save
pm2 startup
```

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Post-Deployment Steps

### 1. Test Payment Flow
- [ ] Sign up with test account
- [ ] Upgrade to Pro plan
- [ ] Verify webhook events received
- [ ] Check Firestore updates
- [ ] Test subscription cancellation

### 2. Configure Email Notifications
Consider using:
- SendGrid
- AWS SES
- Mailgun
- Resend

### 3. Set Up Monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Configure uptime monitoring
- [ ] Set up analytics (Google Analytics, Mixpanel)
- [ ] Enable Stripe Radar for fraud prevention

### 4. Security Hardening
- [ ] Enable CORS properly
- [ ] Set up rate limiting
- [ ] Configure CSP headers
- [ ] Enable Firebase App Check
- [ ] Review Firestore security rules

### 5. Performance Optimization
- [ ] Enable CDN
- [ ] Configure caching headers
- [ ] Optimize images
- [ ] Enable compression
- [ ] Monitor Core Web Vitals

---

## Database Initialization

### Create System Config
Run this once in Firestore Console:

**Collection**: `system`
**Document ID**: `config`
**Data**:
```json
{
  "subscriptionPricing": {
    "baseUSD": 5,
    "proPlanMultiplier": 1,
    "enterprisePlanMultiplier": 3
  },
  "features": {
    "maxWorkersFreeTrial": 3,
    "maxWorkersPro": 20,
    "maxWorkersEnterprise": 999
  }
}
```

---

## Maintenance & Updates

### Regular Tasks
- Monitor Stripe dashboard for failed payments
- Review Firestore usage and costs
- Check error logs
- Update dependencies monthly
- Backup Firestore data weekly

### Scaling Considerations
- Firestore has generous free tier
- Monitor read/write operations
- Consider Firestore indexes for complex queries
- Use Cloud Functions for heavy operations

---

## Support & Documentation

### User Documentation
Create help articles for:
- Getting started guide
- Team management
- Referral program
- Billing and subscriptions
- Export functionality

### Admin Documentation
- Firestore structure
- API endpoints
- Webhook handling
- Troubleshooting guide

---

## Rollback Plan

If issues occur:

1. **Vercel**: Revert to previous deployment
   ```bash
   vercel rollback
   ```

2. **Firebase**: Restore Firestore backup
   ```bash
   gcloud firestore import gs://[BUCKET_NAME]/[EXPORT_PREFIX]
   ```

3. **Stripe**: Webhooks can be replayed from dashboard

---

## Cost Estimates

### Firebase (Monthly)
- **Free Tier**: Up to 50K reads, 20K writes/day
- **Blaze Plan**: Pay as you go
  - Reads: $0.06 per 100K
  - Writes: $0.18 per 100K
  - Storage: $0.18/GB

### Stripe
- **2.9% + $0.30** per successful transaction
- No monthly fees

### Hosting
- **Vercel**: Free for hobby, $20/month Pro
- **Firebase Hosting**: 10GB free, then $0.026/GB

**Estimated Monthly Cost** (100 active users):
- Firebase: ~$5-10
- Stripe: Variable (based on revenue)
- Hosting: $0-20
- **Total**: $5-30/month

---

## Launch Checklist

- [ ] All environment variables configured
- [ ] Firestore rules deployed
- [ ] Stripe products created
- [ ] Webhook endpoint verified
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Test payment completed
- [ ] Error tracking enabled
- [ ] Analytics configured
- [ ] Backup strategy in place
- [ ] Support email configured
- [ ] Terms of Service added
- [ ] Privacy Policy added

**You're ready to launch! 🚀**
