import * as Linking from 'expo-linking';

// Zeffy handles donation processing externally.
// We deep-link to the Zeffy donation form and record the result.

// Production donation form. Matches the URL in website/content.js so
// the marketing site, the app, and the restaurant portal all funnel to
// the same Zeffy form. Zeffy is the only real 0% donation platform —
// 100% of the gift goes to BetterNature.
const ZEFFY_FORM_URL = 'https://www.zeffy.com/en-US/donation-form/betternature';

export function openDonationForm({ amount, recurring = false }) {
  let url = ZEFFY_FORM_URL;
  const params = [];
  if (amount) params.push(`amount=${amount}`);
  if (recurring) params.push('frequency=monthly');
  if (params.length) url += '?' + params.join('&');

  Linking.openURL(url);
}

export function getZeffyFormUrl() {
  return ZEFFY_FORM_URL;
}
