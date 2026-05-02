# StockIntel - Intelligent Business Management Platform

![StockIntel](https://img.shields.io/badge/StockIntel-v1.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-16.1-black)
![Firebase](https://img.shields.io/badge/Firebase-Latest-orange)
![Stripe](https://img.shields.io/badge/Stripe-Integrated-purple)

**StockIntel** is a comprehensive SaaS platform for managing inventory, sales, team members, and business operations across multiple industries (Pharmacy, Agriculture, Retail).

## ✨ Features

### Core Features
- 🔐 **Google Sign-In** - Seamless authentication with Google OAuth
- 👥 **Team Management** - Role-based access control (Owner, Manager, Worker)
- 📦 **Inventory Management** - Track stock levels, expiry dates, and suppliers
- 💰 **Point of Sale (POS)** - Complete sales system with receipt generation
- 📊 **Analytics & Reports** - Comprehensive business insights
- 🎁 **Referral System** - Earn free months by referring other businesses
- 💳 **Stripe Payments** - Secure subscription management

### SaaS Features
- ⏰ **3-Month Free Trial** - No credit card required
- 🌍 **Multi-Currency Support** - USD, EUR, GBP, INR, and more
- 📧 **Team Invitations** - Invite members via email
- 📈 **Usage Analytics** - Track your business metrics
- 📤 **Export Data** - CSV and PDF export functionality
- 🎨 **Onboarding Flow** - Guided setup for new users
- 🛡️ **Secure** - Firestore security rules and Stripe compliance

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Firebase account
- Stripe account (for payments)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/stockintel.git
cd stockintel

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase and Stripe credentials

# Run development server
npm run dev
```

Visit `http://localhost:3000` to see the app.

## 📋 Configuration

### 1. Firebase Setup
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication → Google Sign-In
3. Create Firestore Database
4. Deploy security rules: `firebase deploy --only firestore:rules`
5. Copy your Firebase config to `.env.local`

### 2. Stripe Setup
1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Create products for Pro ($5/month) and Enterprise ($15/month)
3. Set up webhook endpoint: `/api/webhooks/stripe`
4. Copy API keys and Price IDs to `.env.local`

See [STRIPE_SETUP_GUIDE.md](./STRIPE_SETUP_GUIDE.md) for detailed instructions.

## 📁 Project Structure

```
stockintel/
├── app/
│   ├── api/                    # API routes
│   │   ├── checkout/          # Stripe checkout
│   │   └── webhooks/          # Stripe webhooks
│   ├── dashboard/             # Main dashboard
│   │   ├── inventory/         # Inventory management
│   │   ├── sales/             # POS system
│   │   ├── team/              # Team management
│   │   ├── rewards/           # Referral system
│   │   ├── billing/           # Subscription management
│   │   └── admin/             # Superadmin settings
│   ├── login/                 # Authentication
│   └── onboarding/            # New user onboarding
├── components/
│   ├── auth/                  # Auth context & components
│   ├── pharmacy/              # Pharmacy-specific components
│   └── ui/                    # Reusable UI components
├── lib/
│   ├── firebase.ts            # Firebase initialization
│   ├── firebase-utils.ts      # Firestore helpers
│   ├── stripe.ts              # Stripe client
│   ├── store.ts               # Zustand state management
│   ├── pricing.ts             # Currency conversion
│   └── export.ts              # CSV/PDF export
└── firestore.rules            # Firestore security rules
```

## 🔑 Environment Variables

```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PRICE_PRO=
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 💼 Business Model

### Pricing Plans

| Plan | Price | Workers | Features |
|------|-------|---------|----------|
| **Free Trial** | $0 | 3 | 3 months, all features |
| **Pro** | $5/month | 20 | Advanced analytics, priority support |
| **Enterprise** | $15/month | Unlimited | Custom integrations, dedicated manager |

### Referral Program
- **Sign-up Reward**: 1 month free when referred company signs up
- **Upgrade Reward**: 1 additional month when they upgrade to paid

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth (Google OAuth)
- **Payments**: Stripe
- **State Management**: Zustand
- **UI Components**: shadcn/ui

## 📚 Documentation

- [Stripe Setup Guide](./STRIPE_SETUP_GUIDE.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Walkthrough](./walkthrough.md) (in artifacts folder)

## 🔒 Security

- Firestore security rules enforce data access
- Stripe webhook signature verification
- HTTPS required in production
- Environment variables for sensitive data
- Role-based access control (RBAC)

## 🚢 Deployment

### Vercel (Recommended)
```bash
vercel --prod
```

### Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete instructions.

## 🧪 Testing

### Test Stripe Payments
Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

### Test Accounts
- Use any Google account for sign-in
- Invite test users via email

## 📧 Support

- **Email**: stockintel01@gmail.com
- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues

## 📄 License

Proprietary - All rights reserved

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Payments by [Stripe](https://stripe.com/)
- Database by [Firebase](https://firebase.google.com/)

---

**Made with ❤️ for businesses worldwide**
