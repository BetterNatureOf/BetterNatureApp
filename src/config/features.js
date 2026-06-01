// Feature flags — used to hide UI for paths that need third-party setup
// before they'll work in production. All flags are read once at module
// load and can be overridden by env vars at build time so we don't have
// to ship a code change to flip a switch.
//
// Default everything to OFF so a fresh deploy never exposes a button
// that errors when tapped. Flip to true (here or via env) once the
// upstream config is in place.

function flag(envKey, fallback) {
  const v = process.env[envKey];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

export const FEATURES = {
  // Apple sign-in. Needs:
  //   1. Apple Developer Program ($99/yr)
  //   2. Apple Services ID created at developer.apple.com
  //   3. Firebase Console → Authentication → Sign-in method → Apple → Enable
  //   4. Add app.betternatureofficial.org to Firebase Authorized domains
  // Env: EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=true
  APPLE_SIGNIN: flag('EXPO_PUBLIC_APPLE_SIGNIN_ENABLED', false),

  // Stripe Apple Pay / Google Pay donations. Needs:
  //   1. Stripe account → pk_live_…
  //   2. EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY env var set
  //   3. createPaymentIntent Cloud Function deployed (needs Blaze plan)
  //   4. Apple Pay domain registration in Stripe Dashboard
  // The DonationCTA component already checks isStripeConfigured() and
  // self-hides, so this flag is more for cross-screen gating if needed.
  STRIPE_PSP: flag('EXPO_PUBLIC_STRIPE_ENABLED', false),
};
