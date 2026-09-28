import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const dataBackend = (process.env.NEXT_PUBLIC_DATA_BACKEND || 'firebase').trim().toLowerCase();
if (!['firebase', 'supabase'].includes(dataBackend)) {
  console.error('NEXT_PUBLIC_DATA_BACKEND must be either "firebase" or "supabase".');
  process.exit(1);
}

const required = ['NEXT_PUBLIC_APP_URL', 'PAYMENT_PROVIDER'];
const firebasePublicVariables = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const optional = ['OPENAI_API_KEY or GEMINI_API_KEY or ANTHROPIC_API_KEY', 'WHATSAPP_ACCESS_TOKEN'];
const missing = required.filter(name => !process.env[name]);
const hasFirebaseAdmin = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  || (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY)
  || process.env.GOOGLE_APPLICATION_CREDENTIALS
  || process.env.FIREBASE_CONFIG
);
if (dataBackend === 'firebase') {
  for (const name of firebasePublicVariables) {
    if (!process.env[name]) missing.push(name);
  }
  if (!hasFirebaseAdmin) missing.push('Firebase Admin credentials (service-account base64/JSON or the three FIREBASE_ADMIN_* values)');
}

const hasAnySupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_PROJECT_REF
);
if (dataBackend === 'supabase' || hasAnySupabaseConfig) {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
    if (!process.env[name]) missing.push(name);
  }
}
const whatsappVariables = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_DISPLAY_PHONE_NUMBER',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'CRON_SECRET',
];
if (whatsappVariables.some(name => process.env[name])) {
  for (const name of whatsappVariables) {
    if (!process.env[name]) missing.push(name);
  }
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
    if (!process.env[name] && !missing.includes(name)) missing.push(`${name} (WhatsApp messaging stores its data in Supabase)`);
  }
}
if (!['observe', 'enforce'].includes((process.env.COMMS_QUOTA_MODE || 'observe').trim().toLowerCase())) {
  missing.push('COMMS_QUOTA_MODE must be "observe" or "enforce"');
}
const paymentProvider = (process.env.PAYMENT_PROVIDER
  || (process.env.PAYSTACK_SECRET_KEY ? 'paystack' : process.env.STRIPE_SECRET_KEY ? 'stripe' : 'paystack'))
  .trim().toLowerCase();
if (!['paystack', 'stripe'].includes(paymentProvider)) missing.push('PAYMENT_PROVIDER must be "paystack" or "stripe"');

if (paymentProvider === 'paystack') {
  for (const name of [
    'PAYSTACK_SECRET_KEY',
    'PAYSTACK_PLAN_CODE_PRO',
    'PAYSTACK_PLAN_CODE_ENTERPRISE',
    'NEXT_PUBLIC_MERCHANT_LEGAL_NAME',
    'NEXT_PUBLIC_MERCHANT_ADDRESS',
    'NEXT_PUBLIC_SUPPORT_EMAIL',
  ]) {
    if (!process.env[name]) missing.push(name);
  }
  const placeholderPatterns = [/^your\b/i, /example\.com/i, /^accra,?\s*ghana$/i];
  for (const name of ['NEXT_PUBLIC_MERCHANT_LEGAL_NAME', 'NEXT_PUBLIC_MERCHANT_ADDRESS', 'NEXT_PUBLIC_SUPPORT_EMAIL']) {
    const value = String(process.env[name] || '').trim();
    if (value && placeholderPatterns.some(pattern => pattern.test(value))) missing.push(`${name} must contain real merchant information`);
  }
} else {
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    if (!process.env[name]) missing.push(name);
  }
  if (!process.env.STRIPE_PRODUCT_PRO && !process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO) {
    missing.push('STRIPE_PRODUCT_PRO or NEXT_PUBLIC_STRIPE_PRICE_PRO');
  }
  if (!process.env.STRIPE_PRODUCT_ENTERPRISE && !process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE) {
    missing.push('STRIPE_PRODUCT_ENTERPRISE or NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE');
  }
}

if (process.env.VERCEL_ENV === 'production') {
  if (!String(process.env.NEXT_PUBLIC_APP_URL).startsWith('https://')) missing.push('NEXT_PUBLIC_APP_URL must use HTTPS in production');
  if (paymentProvider === 'paystack' && !String(process.env.PAYSTACK_SECRET_KEY).startsWith('sk_live_')) {
    missing.push('PAYSTACK_SECRET_KEY must be a live key in production');
  }
}

if (missing.length) {
  console.error(`Missing required production environment variables:\n${missing.map(name => `- ${name}`).join('\n')}`);
  process.exit(1);
}

const disabled = optional.filter(name => name.includes(' or ')
  ? !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY
  : !process.env[name]);
if (disabled.length) console.warn(`Optional integrations not configured: ${disabled.join(', ')}`);
if (!hasAnySupabaseConfig) console.warn('Supabase migration connection is not configured; Firebase remains active.');
console.log(`Production environment variables are configured for the ${dataBackend} backend and ${paymentProvider} payments.`);
