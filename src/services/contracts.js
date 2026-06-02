// Role contracts — the real legal text BetterNature provided, lifted
// directly from BN_*_Agreement.docx. Update the version when the legal
// text changes; everyone with an older version re-signs on next access.
//
// Each kind ships with:
//   title          → shown big at the top
//   subtitle       → small line under the title (jurisdiction etc.)
//   version        → integer; bump on text changes
//   recitals       → preamble paragraphs (above section 1)
//   sections       → ordered list of { heading, body } where body is
//                    an array of paragraphs / bullets. Bullets start
//                    with "• ".
//   fields         → structured form fields captured at signing time
//                    (name, business info, phone, address, etc.)
//   intentLine     → the "by signing below..." paragraph
//   signatureLabel → what to show next to the typed signature input
//   summarize(values, signature, user) → returns the body of the
//                    email summary that goes to info@betternatureofficial.org.
//
// One reusable signing screen (screens/auth/SignContract.js) renders
// any kind via its spec.
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

// ─────────────────────────────────────────────────────────────────────
// 1. EXECUTIVE LEADERSHIP AGREEMENT  →  exec + chapter_president roles
// ─────────────────────────────────────────────────────────────────────
const EXECUTIVE = {
  title: 'Executive Leadership Agreement',
  subtitle: 'Chapter Officer / Director Role · Governed by Tennessee Law',
  version: 1,
  recitals: [
    'BetterNature is a nonprofit organization incorporated under the laws of the State of Tennessee. This Executive Leadership Agreement ("Agreement") governs the relationship between BetterNature and the individual identified above ("Executive"), who agrees to serve in a leadership capacity as defined herein.',
    'This Agreement supplements but does not replace any applicable bylaws, policies, or board resolutions. In the event of a conflict, BetterNature’s governing documents shall control.',
  ],
  sections: [
    { heading: '1. ROLE & AUTHORITY', body: [
      '1.1 Designated Role',
      'The Executive is appointed to the role identified above and shall exercise the responsibilities, authority, and duties associated with that role as set forth in this Agreement and BetterNature’s organizational policies.',
      '1.2 Scope of Authority',
      'The Executive’s authority to bind BetterNature is limited to what has been expressly delegated by the Board of Directors or CEO. The Executive shall not:',
      '• Enter into contracts on behalf of BetterNature exceeding $500 in value without prior written authorization',
      '• Incur organizational debt or financial obligations without approval',
      '• Speak publicly on behalf of BetterNature on matters outside their designated scope',
      '• Delegate role authority to others without written approval from BetterNature leadership',
    ]},
    { heading: '2. DUTIES & RESPONSIBILITIES', body: [
      '2.1 Core Duties — The Executive agrees to faithfully perform the following:',
      '• Lead, coordinate, and oversee assigned programs, committees, or chapters',
      '• Attend required leadership meetings, trainings, and organization-wide events',
      '• Represent BetterNature professionally in all internal and external interactions',
      '• Submit required reports, updates, and documentation in a timely manner',
      '• Mentor and support member volunteers under their leadership',
      '• Manage designated chapter finances, applications, or partnerships per BetterNature’s policies',
      '2.2 Fiduciary Duties — The Executive acknowledges:',
      '• Duty of Care: act in good faith with the care a prudent person in a similar role would exercise',
      '• Duty of Loyalty: act in BetterNature’s best interests; do not place personal interests above the organization',
      '• Duty of Obedience: act in accordance with the mission, governing documents, and applicable laws',
      '2.3 Conflict of Interest',
      'The Executive shall promptly disclose any actual or potential conflict of interest, including financial relationships with entities doing business with or competing with BetterNature, and shall recuse themselves from any decision in which they have a personal interest.',
    ]},
    { heading: '3. COMPENSATION', body: [
      'This is a voluntary leadership role. No monetary compensation unless explicitly agreed to in a separate written addendum authorized by the Board of Directors. Reasonable pre-approved expenses may be reimbursed per BetterNature’s expense reimbursement policy upon timely documentation.',
    ]},
    { heading: '4. CONFIDENTIALITY & NON-DISCLOSURE', body: [
      'Given the Executive’s elevated access, the Executive agrees to:',
      '• Maintain strict confidentiality of all non-public information related to BetterNature’s operations, finances, donors, partnerships, strategies, or personnel',
      '• Not use Confidential Information for personal benefit or disclose it without express written authorization',
      '• Return or destroy all confidential materials upon termination',
      'This obligation survives termination for two (2) years.',
    ]},
    { heading: '5. INTELLECTUAL PROPERTY', body: [
      'All Work Product created by the Executive in connection with BetterNature activities — including written content, program materials, applications, databases, branding, and strategic documents — is the sole property of BetterNature. The Executive assigns all rights thereto to BetterNature.',
    ]},
    { heading: '6. NON-SOLICITATION', body: [
      'During the term and for twelve (12) months following termination, the Executive agrees not to directly solicit BetterNature’s donors, partners, or members for the benefit of any competing organization without BetterNature’s prior written consent.',
    ]},
    { heading: '7. SAFETY, DAMAGE & PERSONAL RESPONSIBILITY', body: [
      '7.1 No BetterNature Liability for Executive Conduct',
      'BetterNature does not assume responsibility for the personal actions or conduct of its executives. Participation in any BetterNature activity is undertaken at the Executive’s own risk.',
      '7.2 Executive Sole Responsibility for Damages',
      'If the Executive’s acts, negligence, or willful misconduct cause damage, harm, or loss, the Executive is solely and personally responsible for all resulting costs, damages, claims, fines, penalties, and legal expenses, including reputation damage and any judgments, settlements, or regulatory penalties arising from their conduct.',
      '7.3 Indemnification & Hold Harmless',
      'The Executive agrees to indemnify, defend, and hold harmless BetterNature and its officers, directors, employees, agents, volunteers, and representatives (the "BetterNature Parties") against any claims, demands, lawsuits, liabilities, damages, losses, costs, and reasonable attorney’s fees arising out of or related to: any act or omission of the Executive in connection with BetterNature activities; breach of this Agreement or any BetterNature policy; negligence, recklessness, gross negligence, or willful misconduct; damage to persons or property caused by the Executive; or any violation of applicable law. Survives termination.',
      '7.4 BetterNature’s Limited Liability',
      'To the maximum extent permitted by law, BetterNature’s total liability to the Executive shall not exceed the greater of (a) the value of any tangible benefit directly provided to the Executive under this Agreement or (b) $100. BetterNature shall not be liable for indirect, incidental, special, consequential, or punitive damages.',
      '7.5 Assumption of Risk',
      'The Executive acknowledges that participation may involve inherent risks (physical activity, community outreach, food handling, public interaction) and voluntarily assumes all such risks.',
      '7.6 No BetterNature Supervision of Third Parties',
      'BetterNature is not responsible for the conduct, safety, or actions of any third party encountered during BetterNature activities.',
    ]},
    { heading: '8. TERM & REMOVAL', body: [
      '8.1 Term — Effective on the Effective Date through the Term End Date unless earlier terminated.',
      '8.2 Resignation — The Executive may resign with at least thirty (30) days’ written notice and shall cooperate in transitioning duties.',
      '8.3 Removal for Cause — BetterNature may immediately remove the Executive for cause (breach of fiduciary duty, violation of this Agreement, criminal conduct, gross misconduct, or actions damaging to BetterNature’s reputation), authorized by the CEO or Board.',
      '8.4 Post-Termination Obligations — The Executive shall immediately return all BetterNature property, transfer access credentials, and cooperate in an orderly transition. Sections 4, 5, 6, and 7 survive termination.',
    ]},
    { heading: '9. GENERAL PROVISIONS', body: [
      '9.1 Governing Law & Dispute Resolution — Tennessee law. Disputes addressed first through good-faith negotiation, then mediation, before litigation.',
      '9.2 Entire Agreement — This Agreement supersedes all prior understandings. Amendments require written consent of both parties.',
      '9.3 Severability — Invalid or unenforceable provisions shall be modified to the minimum extent necessary; all other provisions remain in effect.',
    ]},
  ],
  fields: [
    { key: 'legal_name',    label: 'Your full legal name',     required: true, placeholder: 'First Middle Last' },
    { key: 'role_title',    label: 'Designated role / title',  required: true, placeholder: 'e.g., Chapter President, Director of Operations' },
    { key: 'chapter',       label: 'Chapter or scope',         required: true, placeholder: 'e.g., Memphis · or "National"' },
    { key: 'address',       label: 'Mailing address',          required: true, placeholder: 'Street, City, ST ZIP' },
    { key: 'dob',           label: 'Date of birth (YYYY-MM-DD)', required: true, placeholder: '2008-04-12' },
    { key: 'phone',         label: 'Phone',                    required: true, placeholder: '(555) 123-4567' },
    { key: 'email',         label: 'Email',                    required: true, placeholder: 'you@email.com' },
    { key: 'effective_date',label: 'Effective date',           required: true, placeholder: 'YYYY-MM-DD' },
    { key: 'term_end_date', label: 'Term end date (optional)', required: false, placeholder: 'YYYY-MM-DD' },
  ],
  intentLine: 'By typing my full legal name below, I acknowledge that I have read, understood, and agree to be bound by the terms of this Executive Leadership Agreement.',
  signatureLabel: 'Executive’s typed legal-name signature',
  summarize: (v, sig, u) => [
    `Role: Executive — ${v.role_title || ''}`,
    `Chapter / scope: ${v.chapter || ''}`,
    `Effective: ${v.effective_date || '-'} → ${v.term_end_date || 'open'}`,
    '',
    'CONTACT',
    `Name:  ${v.legal_name || u?.name || ''}`,
    `Phone: ${v.phone || u?.phone || ''}`,
    `Email: ${v.email || u?.email || ''}`,
    `Address: ${v.address || ''}`,
    `DOB: ${v.dob || ''}`,
    '',
    'SIGNATURE',
    `Typed name: ${sig}`,
    `Signed at: ${new Date().toISOString()}`,
    `Contract version: ${EXECUTIVE.version}`,
  ].join('\n'),
};

// ─────────────────────────────────────────────────────────────────────
// 2. FOOD DONOR AGREEMENT  →  restaurant + partner roles
// ─────────────────────────────────────────────────────────────────────
const RESTAURANT = {
  title: 'Food Donor Agreement',
  subtitle: 'IRIS Food Rescue Initiative · Governed by Tennessee Law',
  version: 1,
  recitals: [
    'BetterNature is a Tennessee nonprofit operating the IRIS Food Rescue Initiative, which collects surplus food from businesses and institutions and redistributes it — at no charge — to individuals and communities experiencing food insecurity.',
    'The Donor is a business or institution that generates surplus food in the ordinary course of operations and wishes to donate that surplus to BetterNature for charitable distribution. This Agreement sets forth the terms governing all food donations made by the Donor to BetterNature.',
    'Both parties acknowledge the critical public benefit of food rescue and commit to cooperating in good faith to maximize the impact of each donation while maintaining full compliance with all applicable laws.',
  ],
  sections: [
    { heading: '1. DEFINITIONS', body: [
      '• "Donated Food" — any surplus, unsold, or prepared food items transferred by the Donor to BetterNature.',
      '• "Donor" — the business or institution identified above.',
      '• "Good Faith Donation" — a donation made without knowledge that the Donated Food is unsafe and without intentional misrepresentation of its condition.',
      '• "Pickup" — each scheduled collection of Donated Food by BetterNature from the Donor’s premises.',
      '• "Gross Negligence" — conscious and voluntary disregard of the need to use reasonable care that is likely to cause foreseeable harm.',
    ]},
    { heading: '2. SCOPE OF DONATION', body: [
      '2.1 Nature of Donation — The Donor agrees to make Donated Food available on the schedule set forth in Section 5. No minimum quantity. Each donation is voluntary and constitutes a charitable contribution.',
      '2.2 Eligible Food Categories — Prepared meals, packaged goods, produce, baked goods, dairy, proteins, non-perishables, provided they comply with Section 3. Excluded unless agreed in writing:',
      '• Items subject to recall or safety alerts',
      '• Items stored above safe temperature thresholds for more than two (2) hours',
      '• Items with evidence of contamination, adulteration, or spoilage',
      '• Items past their "use by" date',
      '2.3 BetterNature’s Distribution Obligation — BetterNature shall distribute all Donated Food free of charge to eligible recipients. BetterNature shall never sell, barter, trade, or exchange Donated Food. Donated Food shall be used solely for direct charitable distribution.',
    ]},
    { heading: '3. FOOD SAFETY & QUALITY', body: [
      '3.1 Donor Warranty — The Donor warrants, to the best of its knowledge at the time of donation, that all Donated Food is fit for human consumption; has been prepared, stored, and handled in compliance with applicable federal, state, and local food safety regulations (including Tennessee Department of Agriculture standards and FDA guidelines); is accurately described to BetterNature regarding food type, quantity, and allergen / dietary information; and has not been intentionally adulterated, mislabeled, or misrepresented.',
      '3.2 Temperature — Hot foods at or above 135°F; cold foods at or below 41°F prior to Pickup. Logs available on request.',
      '3.3 Labeling — Description, date of preparation or donation, known allergens, handling / storage instructions. Clearly legible and securely affixed.',
      '3.4 Packaging — Sealed, leak-proof, food-grade containers appropriate for the food type.',
      '3.5 BetterNature’s Right to Decline — BetterNature may decline any Donated Food that does not meet Section 3 standards. Declined items returned to the Donor or disposed of by mutual agreement.',
      '3.6 Volunteer Food Handler Standards — BetterNature volunteers and staff shall comply with applicable Tennessee food handler requirements and BetterNature’s internal protocols. Records available to the Donor on request.',
    ]},
    { heading: '4. LICENSES, PERMITS & COMPLIANCE', body: [
      'The Donor is solely responsible for obtaining and maintaining all business licenses, health department permits, food service certifications, and any other regulatory approvals required to lawfully operate. Nothing in this Agreement relieves the Donor of its obligations under applicable law.',
    ]},
    { heading: '5. PICKUP LOGISTICS', body: [
      '5.1 Pickup Schedule — Either party may propose changes in writing with at least 48 hours’ advance notice.',
      '5.2 Points of Contact — Each party’s designated coordinator handles all Pickup logistics.',
      '5.3 Missed Pickup — If BetterNature cannot complete a Pickup, BetterNature shall notify the Donor at least two (2) hours before the scheduled time. BetterNature is not liable for spoilage from missed Pickups beyond BetterNature’s reasonable control. If the Donor cannot make food available, the Donor shall notify BetterNature at least two (2) hours before the scheduled Pickup.',
    ]},
    { heading: '6. RECORDS & REPORTING', body: [
      '6.1 Pickup Logs — Date, items received, estimated weight or unit count, condition notes. Shared with the Donor within five (5) business days on request.',
      '6.2 Quarterly Impact Reports — Optional; opt in via written notice to BetterNature’s Point of Contact.',
      '6.3 Tax Acknowledgment — BetterNature is recognized as tax-exempt under IRC §501(c)(3); EIN 99-4028399. Food donations may qualify for charitable deductions under IRC §170(e)(3). BetterNature provides written acknowledgments upon request. DISCLAIMER: BetterNature does not provide tax advice. The Donor should consult a qualified tax advisor.',
    ]},
    { heading: '7. FINANCIAL TERMS', body: [
      'Non-monetary. No fees, royalties, or payments owed by either party. The Donor receives no compensation for Donated Food. Voluntary publicity or recognition by BetterNature does not constitute compensation.',
    ]},
    { heading: '8. FEDERAL LIABILITY PROTECTIONS', body: [
      '8.1 Good Samaritan Protections — This Agreement is governed in part by the Bill Emerson Good Samaritan Food Donation Act (42 U.S.C. §1791) and the 2023 Food Donation Improvement Act, which limit civil and criminal liability for good-faith food donors and nonprofit distributors. Good-faith donations without actual knowledge of a defect and not the result of gross negligence or intentional misconduct are shielded.',
      '8.2 BetterNature’s Indemnification of Donor — BetterNature agrees to indemnify, defend, and hold harmless the Donor and its officers, directors, employees, and agents against third-party claims arising out of BetterNature’s handling, transport, storage, or distribution of Donated Food after Pickup, provided the Donor made a Good Faith Donation and complied with Section 3.',
      '8.3 Carve-Outs — No liability shield applies to gross negligence, willful misconduct, fraud, reckless disregard for health or safety, or donations made with actual knowledge that the food is unsafe.',
    ]},
    { heading: '9. SAFETY, DAMAGE & PERSONAL RESPONSIBILITY', body: [
      '9.1 No BetterNature Liability for Donor Conduct',
      '9.2 Donor Sole Responsibility for Damages — Negligence, recklessness, or willful misconduct by the Donor causing damage to persons or property is the Donor’s sole responsibility.',
      '9.3 Indemnification & Hold Harmless — The Donor shall indemnify, defend, and hold harmless the BetterNature Parties against any claims arising out of: the Donor’s acts or omissions in connection with BetterNature activities; breach of this Agreement; negligence, recklessness, gross negligence, or willful misconduct; damage to persons or property; or any violation of applicable law. Survives termination.',
      '9.4 BetterNature’s Limited Liability — Capped at the greater of (a) the value of any tangible benefit directly provided to the Donor under this Agreement or (b) $100. No indirect, incidental, special, consequential, or punitive damages.',
      '9.5 Assumption of Risk — The Donor voluntarily assumes inherent risks (physical activity, food handling, public interaction).',
      '9.6 No BetterNature Supervision of Third Parties.',
    ]},
    { heading: '10. TERM & TERMINATION', body: [
      '10.1 Term — Effective on the Agreement Date through the Term End Date unless earlier terminated.',
      '10.2 Renewal — By mutual written agreement prior to expiration.',
      '10.3 Termination Without Cause — Either party with 30 days’ written notice.',
      '10.4 Termination for Cause — Material breach not cured within 10 days of written notice.',
      '10.5 Effect of Termination — BetterNature ceases Pickups. Sections 6.3, 7, 8, 9, and 11 survive.',
    ]},
    { heading: '11. GENERAL PROVISIONS', body: [
      '11.1 Governing Law — Tennessee. Disputes resolved in Shelby County, TN.',
      '11.2 Dispute Resolution — Good-faith negotiation, then mediation, before litigation.',
      '11.3 Amendment — Only by a written document signed by authorized representatives of both parties.',
      '11.4 Entire Agreement — Supersedes all prior oral or written understandings.',
      '11.5 Independent Parties — No joint venture, partnership, employment, or agency relationship.',
      '11.6 Notices — Email with confirmation of receipt or certified mail.',
      '11.7 Severability — Invalid provisions modified to the minimum extent necessary.',
      '11.8 Counterparts — Including electronic signatures, each constitutes an original.',
    ]},
  ],
  fields: [
    { key: 'business_legal_name', label: 'Restaurant legal business name', required: true, placeholder: 'e.g., Cooper-Young Bistro, LLC' },
    { key: 'business_type',       label: 'Business type',                  required: true, placeholder: 'e.g., LLC, Inc., Sole Proprietorship' },
    { key: 'ein',                 label: 'EIN (optional)',                 required: false, placeholder: '12-3456789' },
    { key: 'business_address',    label: 'Business address',               required: true, placeholder: 'Street, City, ST ZIP' },
    { key: 'contact_name',        label: 'Authorized contact name',        required: true, placeholder: 'First Middle Last' },
    { key: 'contact_title',       label: 'Their title',                    required: true, placeholder: 'Owner / GM / Chef / Manager' },
    { key: 'contact_phone',       label: 'Contact phone',                  required: true, placeholder: '(555) 123-4567' },
    { key: 'contact_email',       label: 'Contact email',                  required: true, placeholder: 'manager@restaurant.com' },
    { key: 'agreement_date',      label: 'Agreement date',                 required: true, placeholder: 'YYYY-MM-DD' },
    { key: 'term_end_date',       label: 'Term end date (optional)',       required: false, placeholder: 'YYYY-MM-DD' },
    { key: 'pickup_schedule',     label: 'Recurring pickup schedule',      required: true, placeholder: 'e.g., Tuesdays + Fridays, 9pm close' },
  ],
  intentLine: 'By typing my full legal name below as an authorized representative of the Donor, I acknowledge that I have read, understood, and agree to the terms of this Food Donor Agreement on behalf of the business identified above.',
  signatureLabel: 'Authorized representative’s typed legal-name signature',
  summarize: (v, sig, u) => [
    `Role: Restaurant / Food Donor`,
    `Business: ${v.business_legal_name || ''} (${v.business_type || ''})`,
    `EIN: ${v.ein || '-'}`,
    `Business address: ${v.business_address || ''}`,
    `Pickup schedule: ${v.pickup_schedule || ''}`,
    `Agreement date: ${v.agreement_date || '-'} → ${v.term_end_date || 'open'}`,
    '',
    'AUTHORIZED CONTACT',
    `Name:  ${v.contact_name || u?.name || ''}`,
    `Title: ${v.contact_title || ''}`,
    `Phone: ${v.contact_phone || u?.phone || ''}`,
    `Email: ${v.contact_email || u?.email || ''}`,
    '',
    'SIGNATURE',
    `Typed name: ${sig}`,
    `Signed at: ${new Date().toISOString()}`,
    `Contract version: ${RESTAURANT.version}`,
  ].join('\n'),
};

// ─────────────────────────────────────────────────────────────────────
// 3. MEMBER VOLUNTEER AGREEMENT  →  volunteer / member role
// ─────────────────────────────────────────────────────────────────────
const VOLUNTEER = {
  title: 'Member Volunteer Agreement',
  subtitle: 'Standard Membership · Governed by Tennessee Law',
  version: 1,
  recitals: [
    'BetterNature is a nonprofit organization incorporated under the laws of the State of Tennessee, dedicated to environmental stewardship, food security, and community wellness. This Member Volunteer Agreement establishes the mutual rights and responsibilities between BetterNature and the individual identified above ("Member").',
    'By signing this Agreement, the Member affirms their commitment to BetterNature’s mission and agrees to abide by its policies, codes of conduct, and operational guidelines.',
  ],
  sections: [
    { heading: '1. SCOPE OF MEMBERSHIP & VOLUNTEER SERVICES', body: [
      'The Member agrees to participate in BetterNature activities in a voluntary, unpaid capacity. Volunteer services may include:',
      '• Participating in BetterNature projects (IRIS, Evergreen, Hydro, or other designated initiatives)',
      '• Attending chapter meetings, community events, and training sessions',
      '• Supporting outreach, content creation, and public awareness campaigns',
      '• Assisting with data collection, reporting, and program evaluation',
      '• Representing BetterNature at approved external events',
      'Volunteer participation does not create an employment, contractor, or agency relationship with BetterNature.',
    ]},
    { heading: '2. MEMBER RESPONSIBILITIES', body: [
      '2.1 Code of Conduct — Treat all participants, community members, and partners with dignity and respect. No discriminatory, harassing, or harmful behavior. Follow all applicable local, state, and federal laws during BetterNature activities. No unauthorized statements or commitments on behalf of BetterNature.',
      '2.2 Attendance & Reliability — Fulfill commitments to projects or events. If unable, provide reasonable advance notice.',
      '2.3 Use of Resources — BetterNature materials, equipment, funds, or resources are for approved BetterNature purposes only and must be returned in good condition upon request or termination.',
    ]},
    { heading: '3. CONFIDENTIALITY', body: [
      'The Member may access non-public information including donor data, internal strategies, partner communications, and member records ("Confidential Information"). The Member agrees to: keep all Confidential Information strictly confidential during and after the term; not disclose, reproduce, or use Confidential Information outside of BetterNature activities; and promptly notify BetterNature of any known or suspected unauthorized disclosure. This obligation survives termination.',
    ]},
    { heading: '4. INTELLECTUAL PROPERTY', body: [
      'Any Work Product — work product, creative materials, content, data, or innovations — created by the Member in connection with BetterNature activities is the sole property of BetterNature. The Member assigns all rights, title, and interest in such Work Product to BetterNature.',
    ]},
    { heading: '5. MEDIA RELEASE & PUBLICITY', body: [
      'The Member grants BetterNature a non-exclusive, royalty-free, perpetual license to use the Member’s name, photograph, likeness, and testimonials in BetterNature’s promotional activities. The Member may revoke this consent at any time by providing written notice.',
    ]},
    { heading: '6. SAFETY, DAMAGE & PERSONAL RESPONSIBILITY', body: [
      '6.1 No BetterNature Liability for Member Conduct — Participation in BetterNature activities is undertaken at the Member’s own risk.',
      '6.2 Member Sole Responsibility for Damages — Acts, negligence, recklessness, or willful misconduct by the Member causing damage to BetterNature, third parties, property, or the public is the Member’s sole responsibility.',
      '6.3 Indemnification & Hold Harmless — The Member shall indemnify, defend, and hold harmless BetterNature and its officers, directors, employees, agents, volunteers, and representatives against any claims arising out of: the Member’s acts or omissions; breach of this Agreement; negligence, recklessness, gross negligence, or willful misconduct; damage to persons or property; or violation of applicable law. Survives termination.',
      '6.4 BetterNature’s Limited Liability — Capped at the greater of (a) tangible benefits directly provided or (b) $100. No indirect, incidental, special, consequential, or punitive damages.',
      '6.5 Assumption of Risk — The Member voluntarily assumes inherent risks (physical activity, food handling, public interaction).',
      '6.6 No BetterNature Supervision of Third Parties.',
    ]},
    { heading: '7. TERM & TERMINATION', body: [
      'In effect from the Effective Date and may be terminated by either party with written notice. BetterNature may immediately suspend or terminate participation for cause (Code of Conduct violation, breach of this Agreement). Upon termination, the Member shall return BetterNature property and cease representing themselves as a BetterNature member. Sections 3, 4, and 6 survive.',
    ]},
    { heading: '8. GENERAL PROVISIONS', body: [
      '8.1 Governing Law — Tennessee. Disputes resolved in Shelby County, TN.',
      '8.2 Entire Agreement — Supersedes all prior understandings. Amendments in writing.',
      '8.3 Severability — Invalid provisions excised; the rest survive.',
      '8.4 Non-Waiver — Failure to enforce does not waive future enforcement.',
    ]},
  ],
  fields: [
    { key: 'legal_name',     label: 'Full legal name',                required: true, placeholder: 'First Middle Last' },
    { key: 'dob',            label: 'Date of birth (YYYY-MM-DD)',     required: true, placeholder: '2008-04-12' },
    { key: 'address',        label: 'Mailing address',                required: true, placeholder: 'Street, City, ST ZIP' },
    { key: 'phone',          label: 'Phone',                          required: true, placeholder: '(555) 123-4567' },
    { key: 'email',          label: 'Email',                          required: true, placeholder: 'you@email.com' },
    { key: 'chapter',        label: 'Chapter you’re joining',     required: true, placeholder: 'e.g., Memphis' },
    { key: 'guardian_name',  label: 'Parent / guardian name (if under 18)', required: false, placeholder: 'Required if you are 14–17' },
    { key: 'guardian_email', label: 'Parent / guardian email (if under 18)', required: false, placeholder: 'guardian@email.com' },
    { key: 'effective_date', label: 'Effective date',                 required: true, placeholder: 'YYYY-MM-DD' },
  ],
  intentLine: 'By typing my full legal name below, I acknowledge that I have read, understood, and agree to the terms of this Member Volunteer Agreement.',
  signatureLabel: 'Member’s typed legal-name signature',
  summarize: (v, sig, u) => [
    `Role: Volunteer Member`,
    `Chapter: ${v.chapter || ''}`,
    `Effective date: ${v.effective_date || '-'}`,
    '',
    'CONTACT',
    `Name:  ${v.legal_name || u?.name || ''}`,
    `Phone: ${v.phone || u?.phone || ''}`,
    `Email: ${v.email || u?.email || ''}`,
    `Address: ${v.address || ''}`,
    `DOB: ${v.dob || ''}`,
    v.guardian_name ? `Parent / guardian: ${v.guardian_name} <${v.guardian_email || '?'}>` : 'Of-age volunteer (no guardian on file)',
    '',
    'SIGNATURE',
    `Typed name: ${sig}`,
    `Signed at: ${new Date().toISOString()}`,
    `Contract version: ${VOLUNTEER.version}`,
  ].join('\n'),
};

// ─────────────────────────────────────────────────────────────────────
// Registry. Keys are referenced by ContractGate + SignContract route
// params. We map both 'executive' and 'president' to the same legal
// text because BetterNature’s president agreement is a sub-case
// of the Executive Leadership Agreement (Chapter Officer role).
// ─────────────────────────────────────────────────────────────────────
export const CONTRACTS = {
  executive:  EXECUTIVE,
  president:  EXECUTIVE,
  restaurant: RESTAURANT,
  volunteer:  VOLUNTEER,
};

// Pretty label for the role badge on emails / admin UI.
export function roleForKind(kind, user) {
  if (kind === 'restaurant') return 'Restaurant / Food Donor';
  if (kind === 'president')  return 'Chapter President';
  if (kind === 'executive')  return 'Executive Officer';
  if (kind === 'volunteer')  return 'Volunteer Member';
  return user?.role || 'Member';
}

// ─────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────
export async function saveContract(uid, kind, { signedName, version, extras = {} }) {
  if (!isFirebaseConfigured || !uid) return;
  if (!CONTRACTS[kind]) throw new Error(`Unknown contract kind: ${kind}`);
  const v = version ?? CONTRACTS[kind].version;
  await updateDoc(doc(db, 'users', uid), {
    [`contract_${kind}`]: {
      signed: true,
      signed_name: String(signedName || '').trim(),
      signed_at: serverTimestamp(),
      version: v,
      ...extras,
    },
    [`contract_${kind}_signed`]: true,
  });
}

export function hasSignedContract(user, kind) {
  if (!user) return false;
  const block = user[`contract_${kind}`] || {};
  if (!block.signed) return false;
  const live = CONTRACTS[kind]?.version ?? 1;
  if ((block.version || 1) < live) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Email-the-signed-contract via FormSubmit (no backend needed; same
// service we use for the marketing-site signup forms). Includes the
// summarize() block + a copy of the raw field values + the typed
// signature for an auditable record.
// ─────────────────────────────────────────────────────────────────────
const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/info@betternatureofficial.org';

export async function emailContractSummary({ kind, values, signedName, user }) {
  const spec = CONTRACTS[kind];
  if (!spec) return false;
  const businessName = values.business_legal_name || values.business_name;
  const subject = businessName
    ? `[Contract Signed: ${roleForKind(kind, user)}] ${businessName} (${values.business_type || 'business'}) · ${values.contact_name || user?.name || ''}`
    : `[Contract Signed: ${roleForKind(kind, user)}] ${values.legal_name || user?.name || user?.email || 'New signature'}`;

  const summary = spec.summarize(values, signedName, user);
  const payload = {
    _subject: subject,
    _template: 'box',
    _captcha: 'false',
    contract: spec.title,
    version: spec.version,
    role: roleForKind(kind, user),
    summary,
    typed_signature: signedName,
    signed_at: new Date().toISOString(),
    user_uid: user?.id || '',
    user_role: user?.role || '',
    user_name: user?.name || '',
    user_email: user?.email || '',
    user_phone: user?.phone || '',
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [`field_${k}`, v ?? ''])),
  };
  try {
    const res = await fetch(FORMSUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    console.warn('emailContractSummary failed', e);
    return false;
  }
}
