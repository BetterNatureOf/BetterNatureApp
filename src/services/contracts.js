// Role contracts.
//
// Every role above plain volunteer has a document they must sign before
// they can do role-specific work. We store one boolean + name + date
// per kind on users/{uid} so the gate can read it in O(1):
//
//   contract_restaurant_signed         + _name + _at + _version
//   contract_executive_signed          + _name + _at + _version
//   contract_president_signed          + _name + _at + _version
//
// The legal text + version for each lives in the KIND map below — bump
// the version when the text changes and everyone resigns on next access.
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

// ── Contract registry ───────────────────────────────────────────────
// Add a new kind by appending an entry. Title is what the screen shows
// in the header; clauses is an ordered list of paragraphs.
export const CONTRACTS = {
  restaurant: {
    title: 'Restaurant Partner Agreement',
    eyebrow: 'For restaurant accounts',
    version: 1,
    intentLine: 'By typing my legal name below as the authorized representative of the business, I agree to the terms above on behalf of the restaurant.',
    extraFields: [
      { key: 'business_legal_name', label: 'Restaurant legal name', required: true, placeholder: 'e.g., Cooper-Young Bistro, LLC' },
      { key: 'ein',                 label: 'EIN (optional)',         required: false, placeholder: '12-3456789' },
      { key: 'contact_name',        label: 'Primary contact name',   required: true, placeholder: 'First Middle Last' },
      { key: 'contact_role',        label: 'Their role at the restaurant', required: true, placeholder: 'Owner / GM / Chef / Manager' },
      { key: 'contact_phone',       label: 'Primary contact phone',  required: true, placeholder: '(555) 123-4567' },
      { key: 'contact_email',       label: 'Primary contact email',  required: true, placeholder: 'manager@restaurant.com' },
    ],
    clauses: [
      'The Restaurant agrees to make excess, edible food available to BetterNature ' +
      'volunteers at reasonable times. The Restaurant retains full discretion over ' +
      'what food it donates and is under no obligation to donate any specific amount.',

      'The Restaurant warrants that the food donated is fit for human consumption ' +
      'at the time of donation. The Restaurant is protected under the federal Bill ' +
      'Emerson Good Samaritan Food Donation Act (42 U.S.C. § 1791) for good-faith ' +
      'donations of apparently fit grocery-style food.',

      'BetterNature will weigh and document every pickup, issue an IRS-style tax ' +
      'receipt within thirty (30) days, and provide a monthly impact report summarizing ' +
      'weight rescued, meals equivalent, and CO₂ avoided.',

      'The Restaurant authorizes BetterNature to use the restaurant’s name and logo ' +
      'in social posts, impact reports, and marketing materials acknowledging the ' +
      'partnership, subject to the Restaurant’s right to revoke this authorization in ' +
      'writing at any time.',

      'Either party may terminate this agreement at any time by written notice. ' +
      'Termination does not affect tax receipts or impact records for past pickups.',
    ],
  },

  executive: {
    title: 'Executive Officer Agreement',
    eyebrow: 'For executive / admin accounts',
    version: 1,
    intentLine: 'By typing my legal name below, I acknowledge and agree to the responsibilities, conflict-of-interest policies, and confidentiality obligations described above.',
    extraFields: [
      { key: 'legal_name', label: 'Your full legal name',     required: true, placeholder: 'First Middle Last' },
      { key: 'address',    label: 'Mailing address',          required: true, placeholder: 'Street, City, ST ZIP' },
      { key: 'dob',        label: 'Date of birth (YYYY-MM-DD)', required: true, placeholder: '2008-04-12' },
    ],
    clauses: [
      'As an Executive Officer of BetterNature, I will act in good faith and in the best ' +
      'interests of the organization, exercising the care that an ordinarily prudent person ' +
      'in a like position would exercise under similar circumstances (the "duty of care").',

      'I will avoid any actual or apparent conflict of interest. Where a conflict arises, ' +
      'I will disclose it in writing to the other Executive Officers within seven (7) days ' +
      'of becoming aware of it and will recuse myself from related decisions.',

      'I will maintain the confidentiality of all non-public information about volunteers, ' +
      'restaurants, donors, and finances. This duty survives the termination of my role ' +
      'in the organization.',

      'I will support full and accurate record-keeping, will not commingle organization ' +
      'funds with personal funds, and will report any suspected fraud, embezzlement, or ' +
      'misuse to a fellow Executive Officer or the Board immediately.',

      'I understand that my position is voluntary and unpaid except for expense ' +
      'reimbursement explicitly approved by the Board. My role may be terminated at any ' +
      'time by majority vote of the Executive Officers.',
    ],
  },

  president: {
    title: 'Chapter President Agreement',
    eyebrow: 'For chapter presidents',
    version: 1,
    intentLine: 'By typing my legal name below, I accept the chapter president role and the responsibilities above.',
    extraFields: [
      { key: 'legal_name', label: 'Your full legal name',     required: true, placeholder: 'First Middle Last' },
      { key: 'chapter',    label: 'Chapter you lead',         required: true, placeholder: 'e.g., Memphis' },
      { key: 'dob',        label: 'Date of birth (YYYY-MM-DD)', required: true, placeholder: '2008-04-12' },
    ],
    clauses: [
      'As Chapter President, I will recruit and onboard volunteers, coordinate weekly ' +
      'pickup operations, maintain the chapter’s restaurant + community-fridge relationships, ' +
      'and report monthly chapter impact to the Executive Officers.',

      'I will follow BetterNature’s national policies, safety guidelines, and brand standards. ' +
      'I will escalate disputes, safety incidents, or partner-relationship issues to the ' +
      'Executive Officers within twenty-four (24) hours.',

      'I will maintain confidentiality of all non-public information about chapter ' +
      'volunteers, partners, and donors. This duty survives the end of my role.',

      'I understand that my role is voluntary and unpaid. The Executive Officers may ' +
      'reassign or end my chapter-president role at any time. I retain my underlying ' +
      'volunteer access if removed.',
    ],
  },
};

// ── Save helper ─────────────────────────────────────────────────────
// Writes the {kind}_signed boolean + signed_name + signed_at + version
// + optional extra fields (e.g., the restaurant's EIN). The caller
// validates the form; this just persists.
export async function saveContract(uid, kind, { signedName, version, extras = {} }) {
  if (!isFirebaseConfigured || !uid) return;
  if (!CONTRACTS[kind]) throw new Error(`Unknown contract kind: ${kind}`);
  const v = version ?? CONTRACTS[kind].version;

  // We write under a single object key per kind so admins can see the
  // full snapshot in one Firestore field instead of N flat fields.
  const update = {
    [`contract_${kind}`]: {
      signed: true,
      signed_name: String(signedName || '').trim(),
      signed_at: serverTimestamp(),
      version: v,
      ...extras,
    },
    [`contract_${kind}_signed`]: true,    // flat boolean for cheap gate reads
  };
  await updateDoc(doc(db, 'users', uid), update);
}

// ── Gate helpers ────────────────────────────────────────────────────
// These return true if the role has signed the appropriate doc (or if
// it doesn't apply), false if they're blocked.
export function hasSignedContract(user, kind) {
  if (!user) return false;
  const block = user[`contract_${kind}`] || {};
  if (!block.signed) return false;
  const live = CONTRACTS[kind]?.version ?? 1;
  if ((block.version || 1) < live) return false;   // text was updated → resign
  return true;
}
