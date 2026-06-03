// Stripe Identity verification — runs AAMVA DLDV for US driver's
// licenses under the hood (Stripe is AAMVA-certified; we're not, and
// AAMVA's direct-member program doesn't accept nonprofits at our size).
//
// What this gives us per verification:
//   • Government ID scan (DL, passport, state ID)
//   • Selfie + liveness check
//   • Face match between selfie and the document photo
//   • AAMVA DLDV cross-check for US driver's licenses — confirms the
//     DL number + name + DOB are issued to that person by the state
//   • Structured payload: first_name, last_name, dob, address,
//     id_number, expiration_date, verified: true/false
//
// Architecture:
//   1. Client calls createVerificationSession() → hits our Cloud
//      Function /createIdentitySession, which uses the Stripe secret
//      key to mint a VerificationSession + returns its client_secret.
//   2. Client opens the Stripe Identity flow with that secret. The
//      verification happens in Stripe's hosted UI — no PII touches
//      our servers.
//   3. Stripe POSTs to our webhook /stripeIdentityWebhook when the
//      session completes. The webhook reads the structured outputs
//      and updates users/{uid}.verification_status = 'approved'
//      with the AAMVA-verified fields stamped.
//
// Status: SCAFFOLD ONLY. The flow lights up once
//   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY and the server function exist.
// Until then, isStripeIdentityConfigured() returns false and screens
// gracefully fall back to the manual upload path we already have.
import { Platform } from 'react-native';
import { FEATURES } from '../config/features';

const PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  (typeof globalThis !== 'undefined' && globalThis.__STRIPE_PK__) ||
  '';

const CREATE_SESSION_URL =
  process.env.EXPO_PUBLIC_STRIPE_IDENTITY_URL ||
  'https://us-central1-better-nature-app.cloudfunctions.net/createIdentitySession';

export function isStripeIdentityConfigured() {
  // Two gates: the feature flag (set via env at build time) AND a
  // publishable key actually present. Both have to be true so we
  // never accidentally hit Stripe with an empty key.
  return !!FEATURES.STRIPE_PSP && !!PUBLISHABLE_KEY;
}

// Lazy script-tag injection for stripe.js, same pattern as
// services/stripe.js. Returns the global Stripe() instance.
let stripePromise = null;
function loadStripeJs() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return Promise.resolve(null);
  if (!PUBLISHABLE_KEY) return Promise.resolve(null);
  if (stripePromise) return stripePromise;
  stripePromise = new Promise((resolve, reject) => {
    if (window.Stripe) return resolve(window.Stripe(PUBLISHABLE_KEY));
    const existing = document.querySelector('script[src^="https://js.stripe.com/v3"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Stripe ? window.Stripe(PUBLISHABLE_KEY) : null));
      existing.addEventListener('error', () => reject(new Error('stripe.js failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.async = true;
    s.onload = () => resolve(window.Stripe ? window.Stripe(PUBLISHABLE_KEY) : null);
    s.onerror = () => reject(new Error('stripe.js failed to load'));
    document.head.appendChild(s);
  });
  return stripePromise;
}

// Ask our backend to mint a Stripe VerificationSession scoped to this
// user. The function call needs to be authenticated so the server
// stamps the right uid + sets metadata.user_id on the session (we read
// that back in the webhook to know whose users/{uid} to update).
async function fetchSession({ idToken, kind = 'document' }) {
  const res = await fetch(CREATE_SESSION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken || ''}`,
    },
    body: JSON.stringify({
      type: kind,                  // 'document' | 'id_number'
      allowed_types: ['driving_license', 'id_card', 'passport'],
      require_live_capture: true,
      require_matching_selfie: true,
      // Tell Stripe we want AAMVA DLDV for US DLs. Stripe enables it
      // automatically when allowed_types includes driving_license + a
      // matching selfie; this flag is here for explicitness if you
      // want to surface the option in the dashboard later.
      require_aamva_check: true,
    }),
  });
  if (!res.ok) throw new Error(`createIdentitySession ${res.status}`);
  return res.json();
}

// The one call screens use. Returns the result object after the user
// finishes the flow — { verified: bool, status: 'verified' | 'requires_input',
// session_id }. The webhook is the authoritative source of truth and
// will update users/{uid} regardless of what's returned here.
export async function startIdentityVerification({ idToken }) {
  if (!isStripeIdentityConfigured()) {
    throw new Error('Stripe Identity not configured — use the manual upload path.');
  }
  const stripe = await loadStripeJs();
  if (!stripe) throw new Error('Could not load Stripe.js');

  const { client_secret, id: sessionId } = await fetchSession({ idToken });
  const result = await stripe.verifyIdentity(client_secret);
  if (result.error) throw new Error(result.error.message || 'Verification failed');
  return {
    sessionId,
    status: result?.verificationSession?.status || 'requires_input',
    verified: result?.verificationSession?.status === 'verified',
  };
}
