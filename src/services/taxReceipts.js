// IRS-style in-kind donation receipts for restaurant partners.
//
// On every completed pickup we mint a receipt doc at
//   tax_receipts/{id}
// that the restaurant can later view at
//   https://betternatureofficial.org/receipt.html?id={id}
//
// Per IRS Pub 561, the donor (restaurant) determines the fair-market value
// of the donated food — the charity acknowledges only the description and
// quantity. So this receipt deliberately leaves dollar value blank.
import {
  doc, addDoc, getDoc, getDocs, collection, query, where,
  orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

// BetterNature's nonprofit identity. EIN gets filled in once the IRS
// determination letter lands — until then the receipt page renders
// "(EIN pending)" but is otherwise valid.
export const ORG_INFO = {
  name: 'BetterNature',
  legalName: 'BetterNature Inc.',
  ein: '99-4028399',
  address: '',
  email: 'info@betternatureofficial.org',
  website: 'betternatureofficial.org',
};

function pad(n, len = 4) { return String(n).padStart(len, '0'); }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Mints a receipt doc for a completed pickup. Idempotent-ish: callers
// shouldn't re-issue, but if they do we just create a second numbered
// receipt — Firestore-ordered, never overwriting history.
export async function issueReceiptForPickup({
  pickupId, restaurantId, restaurantName, restaurantEmail,
  weightLbs, mealsEquivalent, pickedUpAt, volunteerName, chapterName,
}) {
  if (!isFirebaseConfigured) return null;

  // Sequence number is just the count of receipts for this restaurant + 1.
  // Cheap, monotonic, and human-readable on the printed receipt.
  let receiptNo = 1;
  if (restaurantId) {
    try {
      const snap = await getDocs(query(
        collection(db, 'tax_receipts'),
        where('restaurant_id', '==', restaurantId),
      ));
      receiptNo = snap.size + 1;
    } catch (e) { /* fall through with receiptNo=1 */ }
  }

  const data = {
    pickup_id: pickupId || null,
    restaurant_id: restaurantId || null,
    restaurant_name: restaurantName || '',
    restaurant_email: restaurantEmail || '',
    weight_lbs: Number(weightLbs) || 0,
    meals_equivalent: Number(mealsEquivalent) || 0,
    picked_up_at: pickedUpAt || new Date().toISOString(),
    volunteer_name: volunteerName || '',
    chapter_name: chapterName || '',
    receipt_no: pad(receiptNo),
    issued_at: serverTimestamp(),
    issued_at_iso: new Date().toISOString(),
    org: ORG_INFO,
    // Goods/services flag — IRS-required language for in-kind acks.
    no_goods_or_services: true,
  };

  const ref = await addDoc(collection(db, 'tax_receipts'), data);
  return { id: ref.id, ...data };
}

export function receiptUrl(receiptId) {
  return `https://betternatureofficial.org/receipt.html?id=${encodeURIComponent(receiptId)}`;
}

export async function getReceipt(id) {
  if (!isFirebaseConfigured || !id) return null;
  const snap = await getDoc(doc(db, 'tax_receipts', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listReceiptsForRestaurant(restaurantId, max = 50) {
  if (!isFirebaseConfigured || !restaurantId) return [];
  const snap = await getDocs(query(
    collection(db, 'tax_receipts'),
    where('restaurant_id', '==', restaurantId),
    orderBy('issued_at_iso', 'desc'),
    limit(max),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// FormSubmit-backed email so the restaurant gets the receipt link in their
// inbox the moment the pickup is logged. Best-effort: failures don't block
// the pickup itself.
export async function emailReceiptLink({ to, restaurantName, weightLbs, receiptId }) {
  if (!to) return;
  try {
    await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: `Your BetterNature donation receipt — ${weightLbs} lbs`,
        _captcha: 'false',
        _template: 'box',
        message:
          `Thank you for your donation to BetterNature.\n\n` +
          `Your IRS-style receipt for ${weightLbs} lbs of food rescued is here:\n` +
          `${receiptUrl(receiptId)}\n\n` +
          `${ORG_INFO.legalName} is a 501(c)(3) nonprofit. ` +
          `Per IRS Pub 561, please determine the fair-market value of the ` +
          `donated goods for your records — we only acknowledge the description.`,
        restaurant: restaurantName || '',
        weight_lbs: weightLbs,
        receipt_url: receiptUrl(receiptId),
      }),
    });
  } catch (e) { console.warn('email receipt failed', e); }
}

// Builds the full text that the receipt.html page renders. Kept in JS so
// the same string can be used for in-app preview / email body / future PDF.
export function buildReceiptText(r) {
  if (!r) return '';
  return [
    `${ORG_INFO.legalName}`,
    `Donation Receipt #${r.receipt_no}`,
    `Issued: ${fmtDate(r.issued_at_iso)}`,
    ``,
    `Donor: ${r.restaurant_name}`,
    `Description: ${r.weight_lbs} lbs of prepared / perishable food`,
    `(equivalent to approximately ${r.meals_equivalent} meals)`,
    `Picked up: ${fmtDate(r.picked_up_at)} by ${r.volunteer_name || 'a BetterNature volunteer'}`,
    ``,
    `No goods or services were provided in exchange for this contribution.`,
    `${ORG_INFO.legalName} is a 501(c)(3) tax-exempt nonprofit.`,
    ORG_INFO.ein ? `EIN: ${ORG_INFO.ein}` : `EIN: pending IRS determination`,
  ].join('\n');
}
