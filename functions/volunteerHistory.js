const { createHash } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v1/https');

const orgRoles = ['executive', 'admin', 'super_admin'];
const chapterRoles = ['chapter_president', 'chapter_pres', 'chapter_vol_coord'];

function accessFor(actor, member) {
  const roles = [actor?.role, ...(Array.isArray(actor?.roles) ? actor.roles : [])];
  if (!member || !actor || actor.disabled || actor.deleted_at) return null;
  if (roles.some((role) => orgRoles.includes(role))) return { chapter: null };
  if (actor.chapter_id && actor.chapter_id === member.chapter_id &&
      roles.some((role) => chapterRoles.includes(role))) return { chapter: actor.chapter_id };
  return null;
}

function workDate(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  return value?.toDate?.().toISOString().slice(0, 10) || '';
}

function validateWork(entry) {
  const { date, minutes, description } = entry;
  const label = typeof description === 'string' ? description.trim().replace(/\s+/g, ' ') : '';
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date) : null;
  if (!parsed || !Number.isFinite(parsed.valueOf()) || workDate(parsed.toISOString()) !== date ||
      date > workDate(new Date().toISOString()) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440 ||
      !label || label.length > 160) {
    throw new HttpsError('invalid-argument', 'Enter a past or current date, 1 to 1,440 minutes, and a short description.');
  }
  return { date, minutes, description: label };
}

function sameWork(a, b) {
  return a.date === b.date && a.minutes === b.minutes &&
    a.description.trim().replace(/\s+/g, ' ').toLowerCase() === b.description.toLowerCase();
}

function workKey(work) {
  return createHash('sha256').update(JSON.stringify([work.date, work.minutes, work.description.toLowerCase()])).digest('hex');
}

async function volunteerHistory(db, input, actorId) {
  if (!actorId) throw new HttpsError('unauthenticated', 'Sign in to view volunteer activity.');
  const memberId = input?.memberId;
  if (typeof memberId !== 'string' || !memberId || memberId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Choose a volunteer.');
  }
  const actorRef = db.collection('users').doc(actorId);
  const memberRef = db.collection('users').doc(memberId);
  const manual = memberRef.collection('manual_volunteer_work');
  const correctedKeys = memberRef.collection('manual_work_corrected_keys');

  return db.runTransaction(async (tx) => {
    const [actor, member] = await Promise.all([tx.get(actorRef), tx.get(memberRef)]);
    const scope = accessFor(actor.data(), member.data());
    if (!scope) throw new HttpsError('permission-denied', 'You can only manage activity for volunteers in your scope.');
    const inScope = (record) => scope.chapter === null || record.chapter_id === scope.chapter;

    if (input.change != null) {
      const { id, version, kind, reason, entry } = input.change;
      const note = typeof reason === 'string' ? reason.trim() : '';
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
          !Number.isInteger(version) || version < 0 || !['correct', 'void'].includes(kind) ||
          !note || note.length > 240 || (kind === 'correct' && !entry)) {
        throw new HttpsError('invalid-argument', 'Choose a manual entry and enter a reason.');
      }
      const after = kind === 'correct' ? validateWork(entry) : null;
      const ref = manual.doc(id);
      const current = (await tx.get(ref)).data();
      if (!current || !inScope(current)) throw new HttpsError('not-found', 'Manual work entry unavailable.');
      const previousVersion = current.version ?? 0;
      const last = current.changes?.at(-1);
      if (previousVersion === version + 1 && last?.kind === kind && last.actor_id === actorId &&
          last.reason === note && (after ? Object.keys(after).every((key) => after[key] === last.after[key])
            : last.after === null)) return { saved: true };
      if (previousVersion !== version || current.voided) {
        throw new HttpsError('failed-precondition', 'This entry changed. Reload activity before editing it.');
      }
      const before = { date: current.date, minutes: current.minutes, description: current.description };
      const previousKey = workKey(before);
      const nextKey = after ? workKey(after) : null;
      if (after) {
        if (Object.keys(after).every((key) => after[key] === before[key])) {
          throw new HttpsError('invalid-argument', 'Change the date, time, or description before saving.');
        }
        if (nextKey !== previousKey) {
          const [original, pointer] = await tx.getAll(manual.doc(nextKey), correctedKeys.doc(nextKey));
          const other = original.data();
          if ((original.id !== id && other && !other.voided && sameWork(other, after)) ||
              (pointer.exists && pointer.data().entry_id !== id)) {
            throw new HttpsError('already-exists', 'Another manual entry already records this work.');
          }
          if (nextKey !== id) tx.set(correctedKeys.doc(nextKey), { entry_id: id });
        }
      }
      if (previousKey !== id && previousKey !== nextKey) tx.delete(correctedKeys.doc(previousKey));
      tx.update(ref, {
        ...after, voided: kind === 'void', version: version + 1,
        changes: FieldValue.arrayUnion({ version: version + 1, kind, reason: note, before, after, actor_id: actorId,
          actor_name: actor.data().name || null, changed_at: new Date().toISOString() }),
      });
      return { saved: true };
    }

    if (input.entry != null) {
      const work = validateWork(input.entry);
      const id = workKey(work);
      const entry = manual.doc(id);
      const [original, pointer] = await tx.getAll(entry, correctedKeys.doc(id));
      if (!original.exists && !pointer.exists) {
        tx.create(entry, { ...work, chapter_id: member.data().chapter_id ?? null,
          recorded_by: actorId, created_at: FieldValue.serverTimestamp() });
      }
      return { saved: true };
    }

    const [pickups, entries] = await Promise.all([
      tx.get(db.collection('pickups').where('claimed_by', '==', memberId).where('status', '==', 'completed')),
      tx.get(manual),
    ]);
    const deliveries = pickups.docs.filter((doc) => inScope(doc.data())).map((doc) => {
      const pickup = doc.data();
      const minutes = Number.isFinite(pickup.hours_earned) && pickup.hours_earned >= 0
        ? Math.round(pickup.hours_earned * 60) : null;
      return { id: doc.id, kind: 'delivery', date: workDate(pickup.completed_at), minutes,
        label: pickup.restaurant_name || 'Food rescue', destination: pickup.fridge_name || '' };
    });
    const work = entries.docs.filter((doc) => inScope(doc.data())).map((doc) => {
      const entry = doc.data();
      return { id: doc.id, kind: 'manual', date: entry.date, minutes: entry.minutes, label: entry.description,
        version: entry.version ?? 0, voided: entry.voided === true, changes: entry.changes ?? [] };
    });
    return {
      entries: [...deliveries, ...work].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
      deliveryMinutes: deliveries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
      manualMinutes: work.reduce((sum, entry) => sum + (entry.voided ? 0 : entry.minutes), 0),
    };
  });
}

module.exports = { volunteerHistory, accessFor };
