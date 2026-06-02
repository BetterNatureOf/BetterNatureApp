// Stripe scaffold for Apple Pay / Google Pay donations.
//
// Why Stripe: Apple Pay only emits an encrypted token; some processor
// has to decrypt and actually charge. Stripe is the lowest-friction
// option that supports both Apple Pay (Safari/iOS) and Google Pay
// (Chrome/Android) through a single Payment Request API.
//
// Status today: SCAFFOLD ONLY. Until EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
// is set in your Cloudflare / Expo env, isStripeConfigured() returns
// false and every donation surface gracefully falls back to Zeffy.
//
// To turn it on:
//   1. Create a Stripe account → grab the publishable key (pk_live_…)
//   2. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your env / Cloudflare
//   3. Deploy the createPaymentIntent Cloud Function from /functions
//      (needs Blaze plan; we already have the function code)
//   4. Stripe Dashboard → Settings → Payments → Apple Pay → add the
//      verification file at /.well-known/apple-developer-merchantid-
//      domain-association on betternatureofficial.org + the app subdomain
//   5. Stripe Dashboard → Apple Pay → Add domain → enter both domains
//
// On the client we use stripe.js's PaymentRequest API. It returns a
// canMakePayment() probe that tells us whether the browser/device can
// pay with Apple Pay or Google Pay; if not, we hide our PSP button.

import { Platform } from 'react-native';

const PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  // Cloudflare / Vercel-style env (web build): fall back to whatever
  // they injected at build time.
  (typeof globalThis !== 'undefined' && globalThis.__STRIPE_PK__) ||
  '';

// URL of the deployed Cloud Function that creates a PaymentIntent.
// Falls back to the on-domain rewrite if you've set up Firebase Hosting
// rewrites, otherwise the absolute function URL.
const CREATE_INTENT_URL =
  process.env.EXPO_PUBLIC_STRIPE_INTENT_URL ||
  'https://us-central1-better-nature-app.cloudfunctions.net/createPaymentIntent';

export function isStripeConfigured() {
  return !!PUBLISHABLE_KEY;
}

// Lazy-load stripe.js. We append a <script> tag at runtime instead of
// using `import 'https://js.stripe.com/v3/'` — Metro (Expo's bundler)
// can't resolve URL imports at bundle time, only at runtime, and trying
// to use a URL import broke the production build. The tag-inject path
// works in every browser and is what Stripe officially recommends for
// CSP-friendly integration.
let stripePromise = null;
function injectStripeScript() {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return resolve(null);
    if (window.Stripe) return resolve(window.Stripe);
    const existing = document.querySelector('script[src^="https://js.stripe.com/v3"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Stripe || null));
      existing.addEventListener('error', () => reject(new Error('stripe.js failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.async = true;
    s.onload = () => resolve(window.Stripe || null);
    s.onerror = () => reject(new Error('stripe.js failed to load'));
    document.head.appendChild(s);
  });
}

async function getStripe() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (!PUBLISHABLE_KEY) return null;
  if (stripePromise) return stripePromise;
  stripePromise = injectStripeScript()
    .then((Stripe) => (Stripe ? Stripe(PUBLISHABLE_KEY) : null))
    .catch((e) => {
      console.warn('Stripe load failed', e);
      return null;
    });
  return stripePromise;
}

// Returns a PaymentRequest object that auto-detects Apple Pay / Google
// Pay on the current browser. The caller mounts a PaymentRequestButton
// (rendered via stripe.js's elements) so the button shows the right
// brand (Apple Pay / Google Pay / Buy with Google).
export async function buildPaymentRequest({ amountCents, label = 'BetterNature donation' }) {
  const stripe = await getStripe();
  if (!stripe) return null;
  const pr = stripe.paymentRequest({
    country: 'US',
    currency: 'usd',
    total: { label, amount: amountCents },
    requestPayerName: true,
    requestPayerEmail: true,
  });
  const canMakePayment = await pr.canMakePayment();
  if (!canMakePayment) return null; // no Apple Pay / Google Pay on this device
  return { stripe, pr, canMakePayment };
}

// Calls our Cloud Function to mint a PaymentIntent, then confirms the
// PSP token returned from the Apple/Google Pay sheet. Caller handles
// success/error via the resolved object.
export async function confirmPaymentRequest(pr, paymentMethod) {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe is not configured');

  const intentRes = await fetch(CREATE_INTENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount_cents: paymentMethod.amount,
      currency: 'usd',
      receipt_email: paymentMethod.payerEmail,
    }),
  });
  if (!intentRes.ok) throw new Error('Could not create payment intent');
  const { client_secret } = await intentRes.json();

  const { error, paymentIntent } = await stripe.confirmCardPayment(
    client_secret,
    { payment_method: paymentMethod.paymentMethod.id },
    { handleActions: false },
  );
  if (error) throw error;
  return paymentIntent;
}
