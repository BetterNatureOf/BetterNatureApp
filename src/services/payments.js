import { Alert, Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

// ─────────────────────────────────────────────────────────────────────────────
// Apple Pay (PassKit) payment service.
//
// This file talks to Apple Pay *directly* via PassKit instead of going
// through Stripe's React Native SDK. The actual native bridge lives (or will
// live) in `modules/apple-pay/` as a custom Expo module that wraps:
//
//   • PKPaymentRequest                        — describes the charge
//   • PKPaymentAuthorizationViewController    — shows the sheet + Touch/Face ID
//   • PKPayment / PKPaymentToken              — opaque, encrypted result
//
// Reference: https://developer.apple.com/documentation/passkit/apple-pay
//
// IMPORTANT: Apple Pay ONLY produces an encrypted PKPaymentToken. It does NOT
// move any money. To actually charge the card, your backend has to forward
// that token to a payment processor (Stripe/Braintree/Adyen/Square) OR use
// Apple Pay Payment Processing certificates with your own merchant bank.
// We'll do that in `redeemTokenOnBackend()` below.
//
// Runtime modes:
//   1. Expo Go            → no native code can load → mock Alert sheet.
//   2. EAS dev/prod build → real PassKit sheet via NativeModules.AppleNature.
// ─────────────────────────────────────────────────────────────────────────────

const isExpoGo = Constants.executionEnvironment === 'storeClient';

// The native module name our (future) Expo module will register under.
// Until that module is built, NativeModules.AppleNature will be undefined and
// we'll automatically fall back to the mock sheet.
const PassKitNative = !isExpoGo ? NativeModules.AppleNature : null;

export const isApplePayAvailable = Platform.OS === 'ios';
export const isRealPassKitAvailable = !!PassKitNative && !isExpoGo;

// TODO: replace with the real Apple Merchant ID you register at
// https://developer.apple.com/account/resources/identifiers/list/merchant
const MERCHANT_ID = 'merchant.org.betternature';
const COUNTRY_CODE = 'US';
const CURRENCY = 'USD';

/**
 * Pay with Apple Pay (PassKit).
 *
 * @param {Object} opts
 * @param {number} opts.amount      - dollar amount (e.g. 25)
 * @param {string} opts.label       - line item label shown in the sheet
 * @param {boolean} [opts.recurring=false]
 * @returns {Promise<{ok:boolean, mock?:boolean, token?:string, error?:string}>}
 */
export async function payWithApplePay({ amount, label, recurring = false }) {
  if (!isApplePayAvailable) {
    return { ok: false, error: 'Apple Pay is only available on iOS devices.' };
  }

  // Real path — only runs inside an EAS build that bundles our PassKit module.
  if (isRealPassKitAvailable) {
    try {
      // The native side returns a base64 PKPaymentToken once the user
      // authorizes with Touch/Face ID.
      const { token } = await PassKitNative.requestPayment({
        merchantIdentifier: MERCHANT_ID,
        countryCode: COUNTRY_CODE,
        currencyCode: CURRENCY,
        // PKPaymentSummaryItem array — last item is the grand total.
        summaryItems: [
          {
            label,
            amount: amount.toFixed(2),
            type: recurring ? 'pending' : 'final',
          },
          {
            label: 'BetterNature',
            amount: amount.toFixed(2),
            type: 'final',
          },
        ],
        merchantCapabilities: ['3DS'],
        supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
      });

      // Hand the token to your backend, which redeems it through your payment
      // processor (Stripe/Braintree/etc.) and actually moves the money.
      const charged = await redeemTokenOnBackend({ token, amount, recurring });
      if (!charged.ok) return { ok: false, error: charged.error };

      return { ok: true, token };
    } catch (e) {
      return { ok: false, error: e?.message || 'Payment failed' };
    }
  }

  // Expo Go fallback — mock the Apple Pay sheet so the UI is testable.
  return new Promise((resolve) => {
    Alert.alert(
      'Apple Pay (Demo Mode)',
      `Charge ${label} for $${amount.toFixed(2)}${recurring ? ' / month' : ''}?\n\n` +
        `Real Apple Pay needs the native PassKit module — see ` +
        `src/services/payments.js for setup steps.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve({ ok: false, mock: true }) },
        {
          text: 'Pay with Touch ID',
          onPress: () => resolve({ ok: true, mock: true }),
        },
      ]
    );
  });
}

/**
 * Charge a card without Apple Pay (e.g. Android, or iOS users without a
 * provisioned card). In demo mode this is just an Alert; in production you'd
 * push the user to a hosted checkout page (Stripe Checkout, etc.) since we no
 * longer ship the Stripe SDK in-app.
 */
export async function payWithCard({ amount, label, recurring = false }) {
  return new Promise((resolve) => {
    Alert.alert(
      'Card Payment (Demo Mode)',
      `Charge ${label} for $${amount.toFixed(2)}${recurring ? ' / month' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve({ ok: false, mock: true }) },
        { text: 'Confirm', onPress: () => resolve({ ok: true, mock: true }) },
      ]
    );
  });
}

/**
 * Send the encrypted PKPaymentToken to our backend for processor redemption.
 *
 * Apple Pay tokens are opaque — they cannot be charged client-side. The
 * backend decrypts them with your Apple Pay Payment Processing certificate
 * (or hands them to Stripe/Braintree as a `payment_method`) and creates the
 * actual charge.
 *
 * Until the backend exists this is a no-op that just resolves OK so the UI
 * flow keeps working.
 */
async function redeemTokenOnBackend({ token, amount, recurring }) {
  try {
    // TODO: point this at the real nonprofit API once it exists.
    // const res = await fetch('https://api.betternature.app/payments/applepay', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ token, amount: Math.round(amount * 100), recurring }),
    // });
    // const json = await res.json();
    // if (!res.ok) return { ok: false, error: json.error || 'Charge failed' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export const PAYMENT_CONFIG = {
  merchantId: MERCHANT_ID,
  countryCode: COUNTRY_CODE,
  currency: CURRENCY,
};
