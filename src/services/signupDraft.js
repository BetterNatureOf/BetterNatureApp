// In-memory draft of the multi-step volunteer signup.
//
// Signup steps used to pass the form (including the password) as
// navigation params, which on web are written into the URL hash and
// browser history. The draft lives only in this module instead: it is
// never persisted, never put in a URL, and is cleared once the account
// is created. A page reload loses it on purpose; steps 2 and 3 then send
// the person back to step 1.
let draft = null;

export function getSignupDraft() { return draft; }
export function setSignupDraft(values) { draft = { ...values }; return draft; }
export function updateSignupDraft(values) { draft = { ...(draft || {}), ...values }; return draft; }
export function clearSignupDraft() { draft = null; }
