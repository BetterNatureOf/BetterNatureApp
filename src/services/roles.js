// Multi-role helper.
//
// Originally a user had a single `role` string ('member' | 'chapter_president'
// | 'executive' | 'super_admin'). To let one person hold more than one
// role at once — an exec who is ALSO a chapter pres, or a pres who is
// still a regular volunteer for pickups in their off-hours — we keep
// the singular `role` field as the *primary* role (drives default
// landing screen) AND add an `roles: []` array of *additional* roles.
//
// Use hasRole(user, target) anywhere you previously did
// user.role === target — it accepts either the primary or any entry
// in the supplemental array.

const EXEC_ROLES = ['executive', 'admin', 'super_admin'];
const PRES_ROLES = ['chapter_president', 'chapter_pres'];

// True when `user` holds `target` either as their primary role or in
// the supplemental `roles[]` array. `target` may be a single string
// or an array (any-match).
export function hasRole(user, target) {
  if (!user) return false;
  const targets = Array.isArray(target) ? target : [target];
  const primary = (user.role || '').toLowerCase();
  const extras = (user.roles || []).map((r) => String(r).toLowerCase());
  return targets.some((t) => {
    const tl = String(t).toLowerCase();
    return primary === tl || extras.includes(tl);
  });
}

export function isExec(user)      { return hasRole(user, EXEC_ROLES); }
export function isPresident(user) { return hasRole(user, PRES_ROLES); }
export function isMember(user)    { return hasRole(user, 'member') || !!user; }

// Build the merged role set so UIs that need to display every role
// can show chips ("Executive", "President", "Member") without
// re-deriving the union themselves.
export function allRoles(user) {
  if (!user) return [];
  const set = new Set();
  if (user.role) set.add(String(user.role).toLowerCase());
  for (const r of (user.roles || [])) set.add(String(r).toLowerCase());
  return [...set];
}

export const ROLE_KEYS = {
  EXEC: EXEC_ROLES,
  PRES: PRES_ROLES,
  MEMBER: 'member',
};
