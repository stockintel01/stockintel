import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_APP_URL',
];

const optional = ['OPENAI_API_KEY or GEMINI_API_KEY or ANTHROPIC_API_KEY', 'TWILIO_ACCOUNT_SID'];
const missing = required.filter(name => !process.env[name]);
const hasFirebaseAdmin = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  || (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY)
  || process.env.GOOGLE_APPLICATION_CREDENTIALS
  || process.env.FIREBASE_CONFIG
);
if (!hasFirebaseAdmin) missing.push('Firebase Admin credentials (service-account base64/JSON or the three FIREBASE_ADMIN_* values)');
if (!process.env.STRIPE_PRODUCT_PRO && !process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO) {
  missing.push('STRIPE_PRODUCT_PRO or NEXT_PUBLIC_STRIPE_PRICE_PRO');
}
if (!process.env.STRIPE_PRODUCT_ENTERPRISE && !process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE) {
  missing.push('STRIPE_PRODUCT_ENTERPRISE or NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE');
}

if (missing.length) {
  console.error(`Missing required production environment variables:\n${missing.map(name => `- ${name}`).join('\n')}`);
  process.exit(1);
}

const disabled = optional.filter(name => name.includes(' or ')
  ? !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY
  : !process.env[name]);
if (disabled.length) console.warn(`Optional integrations not configured: ${disabled.join(', ')}`);
console.log('Production environment variables are configured.');
