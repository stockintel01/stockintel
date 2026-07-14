# StockIntel Agri

StockIntel Agri is a production-focused agriculture SaaS platform for farm stock, packhouse operations, livestock records, weather-aware planning, expenses, team permissions, subscriptions, and offline-ready field workflows.

## Features

- Google authentication with tenant-aware onboarding.
- Role-based team access for owners, managers, stock keepers, packhouse supervisors, and field workers.
- Agriculture stock management with CSV/XLSX bulk import, stock alerts, soft-delete audit notes, and adjustment approval flow.
- Field usage tracking, stock requests, spray planning, equipment checkout, packhouse packing/shipping, and agriculture reports.
- Livestock tools for flock/herd records, eggs, feed, health, mortality, growth, and milk production.
- Expense categories, budgets, and spending tracking per tenant.
- Firestore persistence and PWA service worker support for previously loaded data and supported offline writes.
- Stripe subscriptions, referral rewards, and superadmin controls.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Visit `http://localhost:3000`.

## Required Services

- Firebase Authentication with Google sign-in enabled.
- Firestore with `firestore.rules` deployed.
- Stripe for subscription billing.
- Optional AI provider for agriculture report generation: OpenAI or Google Gemini via `AI_PROVIDER` and the matching API key.

## Project Structure

```text
app/
  api/                 Server routes for billing, invites, reports, team, alerts
  dashboard/
    agriculture/       Agriculture workspace modules
    billing/           Subscription management
    expenses/          Expense intelligence
    rewards/           Referral rewards
    settings/          Tenant settings
    team/              Team roles and access
components/
  auth/                Authentication context
  pwa/                 Offline/install banner
  scanner/             Stock-label scanner
lib/
  agric/               Agriculture data services, hooks, and types
  expenses/            Expense tracking
  firebase*.ts         Firebase client/admin setup
  access-*.ts          Superadmin and tenant permission logic
```

## Production Checklist

- Deploy Firestore rules: `firebase deploy --only firestore:rules`.
- Configure Firebase Admin credentials in Vercel.
- Configure Stripe keys, price IDs, and webhook secret.
- Configure `NEXT_PUBLIC_APP_URL`.
- Configure AI provider variables if report generation is enabled.
- Run `npm run build` before every deployment.
