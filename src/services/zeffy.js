import * as Linking from 'expo-linking';

// Zeffy handles donation processing externally.
// We deep-link to the Zeffy donation form and record the result.

const ZEFFY_FORM_URL = 'https://www.zeffy.com/en-US/donation-form/YOUR_FORM_ID';

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
