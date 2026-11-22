// A small Firestore client over the REST API that matches the parts of the
// firebase-admin Firestore API the rescue code uses, so functions/*.js runs
// unchanged inside a Cloudflare Worker (free) instead of Cloud Functions.
//
// Covered: doc/collection/collectionGroup refs; get/set (merge)/update/
// create/delete; where/orderBy/limit queries; getAll; runTransaction with
// tx.get(ref|query)/getAll/set/update/create/delete and ABORTED retries;
// batch(); FieldValue.serverTimestamp/increment/arrayUnion/arrayRemove/
// delete; Timestamp. Values round-trip the way the admin SDK writes them
// (safe integers → integerValue, other numbers → doubleValue).
//
// createFirestore({ projectId, baseUrl, getToken, beforeWrite })
//   baseUrl   'https://firestore.googleapis.com/v1' (production) or the
//             emulator's 'http://127.0.0.1:PORT/v1'
//   getToken  async () => OAuth access token ('owner' for the emulator)
//   beforeWrite(path, kind, data) optional hook to add fields to writes

class Timestamp {
  constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static fromMillis(ms) { const s = Math.floor(ms / 1000); return new Timestamp(s, Math.round((ms - s * 1000) * 1e6)); }
  static fromDate(d) { return Timestamp.fromMillis(d.getTime()); }
  static now() { return Timestamp.fromMillis(Date.now()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  isEqual(o) { return o instanceof Timestamp && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
  valueOf() { return `${String(this.seconds + 1e12).padStart(13, '0')}.${String(this.nanoseconds).padStart(9, '0')}`; }
  toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
  get _seconds() { return this.seconds; }
  get _nanoseconds() { return this.nanoseconds; }
}

class Sentinel { constructor(kind, value) { this.kind = kind; this.value = value; } }
const FieldValue = {
  serverTimestamp: () => new Sentinel('serverTimestamp'),
  increment: (n) => new Sentinel('increment', n),
  arrayUnion: (...v) => new Sentinel('arrayUnion', v),
  arrayRemove: (...v) => new Sentinel('arrayRemove', v),
  delete: () => new Sentinel('delete'),
};

class GeoPoint { constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; } }

class FirestoreError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

// ── value encoding ───────────────────────────────────────────────────────
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !(v instanceof Timestamp) && !(v instanceof Date) &&
    !(v instanceof Sentinel) && !(v instanceof GeoPoint) && !(v instanceof DocumentReference) && !Array.isArray(v);
}
function encode(v, db) {
  if (v === null) return { nullValue: null };
  if (v === undefined) throw new FirestoreError('Cannot use "undefined" as a Firestore value.', 'invalid-argument');
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'bigint') return { integerValue: v.toString() };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Timestamp) return { timestampValue: tsString(v) };
  if (v instanceof Date) return { timestampValue: tsString(Timestamp.fromDate(v)) };
  if (v instanceof GeoPoint) return { geoPointValue: { latitude: v.latitude, longitude: v.longitude } };
  if (v instanceof DocumentReference) return { referenceValue: v._name };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => encode(x, db)) } };
  if (v instanceof Sentinel) throw new FirestoreError(`FieldValue.${v.kind}() can't be used here.`, 'invalid-argument');
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, x] of Object.entries(v)) fields[k] = encode(x, db);
    return { mapValue: { fields } };
  }
  throw new FirestoreError(`Unsupported value type ${typeof v}`, 'invalid-argument');
}
function tsString(t) {
  const d = new Date(t.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  return `${d}.${String(t.nanoseconds).padStart(9, '0')}Z`;
}
function parseTs(s) {
  const m = /^(.*?)(?:\.(\d+))?Z$/.exec(s);
  const seconds = Math.floor(Date.parse(`${m[1]}Z`) / 1000);
  const nanos = m[2] ? Number(m[2].padEnd(9, '0').slice(0, 9)) : 0;
  return new Timestamp(seconds, nanos);
}
function decode(v, db) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return parseTs(v.timestampValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {}, db);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map((x) => decode(x, db));
  if ('geoPointValue' in v) return new GeoPoint(v.geoPointValue.latitude || 0, v.geoPointValue.longitude || 0);
  if ('referenceValue' in v) return db._refFromName(v.referenceValue);
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}
function decodeFields(fields, db) {
  const out = {};
  for (const [k, x] of Object.entries(fields)) out[k] = decode(x, db);
  return out;
}

const SIMPLE = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const quoteSeg = (s) => (SIMPLE.test(s) ? s : `\`${s.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``);
const fieldPathOf = (segments) => segments.map(quoteSeg).join('.');

// Split a write into fields, a mask (for merges/updates) and transforms.
function buildWrite(data, { mode, db }) {
  const fields = {};
  const mask = [];
  const transforms = [];
  function put(target, segs, value) {
    let node = target;
    for (let i = 0; i < segs.length - 1; i++) {
      node[segs[i]] = node[segs[i]] || { mapValue: { fields: {} } };
      node = node[segs[i]].mapValue.fields;
    }
    node[segs[segs.length - 1]] = encode(value, db);
  }
  function transform(segs, s) {
    const fieldPath = fieldPathOf(segs);
    if (s.kind === 'serverTimestamp') transforms.push({ fieldPath, setToServerValue: 'REQUEST_TIME' });
    else if (s.kind === 'increment') transforms.push({ fieldPath, increment: encode(s.value, db) });
    else if (s.kind === 'arrayUnion') transforms.push({ fieldPath, appendMissingElements: { values: s.value.map((x) => encode(x, db)) } });
    else if (s.kind === 'arrayRemove') transforms.push({ fieldPath, removeAllFromArray: { values: s.value.map((x) => encode(x, db)) } });
  }
  // Pull FieldValue sentinels out of a map value (any depth) into
  // transforms; return the map without them.
  function strip(v, segs) {
    if (!isPlainObject(v)) return v;
    const clean = {};
    for (const [k, x] of Object.entries(v)) {
      if (x instanceof Sentinel) { if (x.kind !== 'delete') transform([...segs, k], x); continue; }
      clean[k] = strip(x, [...segs, k]);
    }
    return clean;
  }
  // walk: for set (no merge) nested objects are values; for merge, leaves.
  function walk(obj, prefix, deep) {
    for (const [k, v] of Object.entries(obj)) {
      const segs = [...prefix, k];
      if (v instanceof Sentinel) {
        if (v.kind === 'delete') { if (mode !== 'set') mask.push(fieldPathOf(segs)); continue; }
        transform(segs, v);
        continue;
      }
      if (deep && isPlainObject(v) && Object.keys(v).length) { walk(v, segs, true); continue; }
      put(fields, segs, strip(v, segs));
      if (mode !== 'set') mask.push(fieldPathOf(segs));
    }
  }
  if (mode === 'update') {
    for (const [k, v] of Object.entries(data)) {
      const segs = k.split('.');
      if (v instanceof Sentinel) {
        if (v.kind === 'delete') mask.push(fieldPathOf(segs)); else transform(segs, v);
        continue;
      }
      put(fields, segs, strip(v, segs));
      mask.push(fieldPathOf(segs));
    }
  } else walk(data, [], mode === 'merge');
  return { fields, mask, transforms };
}

// ── refs and snapshots ───────────────────────────────────────────────────
class DocumentSnapshot {
  constructor(ref, fields, meta = {}) {
    this.ref = ref; this.id = ref.id; this._fields = fields;
    this.exists = fields !== null;
    this.createTime = meta.createTime ? parseTs(meta.createTime) : undefined;
    this.updateTime = meta.updateTime ? parseTs(meta.updateTime) : undefined;
  }
  data() { return this._fields === null ? undefined : decodeFields(this._fields, this.ref.firestore); }
  get(path) {
    let v = this.data();
    for (const seg of String(path).split('.')) { if (v == null) return undefined; v = v[seg]; }
    return v;
  }
}
class QuerySnapshot {
  constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = docs.length === 0; }
  forEach(fn) { this.docs.forEach(fn); }
}

class DocumentReference {
  constructor(db, path) { this.firestore = db; this.path = path; this.id = path.split('/').pop(); }
  get _name() { return `${this.firestore._root}/${this.path}`; }
  get parent() { return new CollectionReference(this.firestore, this.path.split('/').slice(0, -1).join('/')); }
  collection(id) { return new CollectionReference(this.firestore, `${this.path}/${id}`); }
  isEqual(o) { return o instanceof DocumentReference && o.path === this.path; }
  get(opts) { return this.firestore._getDoc(this, opts?.transaction); }
  set(data, opts) { return this.firestore._commit([this.firestore._writeFor(this, opts?.merge ? 'merge' : 'set', data)]); }
  update(data) { return this.firestore._commit([this.firestore._writeFor(this, 'update', data)]); }
  create(data) { return this.firestore._commit([this.firestore._writeFor(this, 'create', data)]); }
  delete() { return this.firestore._commit([{ delete: this._name }]); }
}

class Query {
  constructor(db, { parentPath, collectionId, allDescendants = false, filters = [], orders = [], limit = null }) {
    Object.assign(this, { firestore: db, _parentPath: parentPath, _collectionId: collectionId, _all: allDescendants,
      _filters: filters, _orders: orders, _limit: limit });
  }
  _with(patch) {
    return new Query(this.firestore, { parentPath: this._parentPath, collectionId: this._collectionId, allDescendants: this._all,
      filters: this._filters, orders: this._orders, limit: this._limit, ...patch });
  }
  where(field, op, value) { return this._with({ filters: [...this._filters, { field: String(field), op, value }] }); }
  orderBy(field, dir = 'asc') { return this._with({ orders: [...this._orders, { field: String(field), dir }] }); }
  limit(n) { return this._with({ limit: n }); }
  get(opts) { return this.firestore._runQuery(this, opts?.transaction); }
  _structured() {
    const OPS = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN',
      '>=': 'GREATER_THAN_OR_EQUAL', in: 'IN', 'not-in': 'NOT_IN', 'array-contains': 'ARRAY_CONTAINS', 'array-contains-any': 'ARRAY_CONTAINS_ANY' };
    const filters = this._filters.map(({ field, op, value }) => {
      const fieldRef = { fieldPath: fieldPathOf(field.split('.')) };
      if ((op === '==' || op === '!=') && (value === null || Number.isNaN(value))) {
        return { unaryFilter: { field: fieldRef, op: `${op === '!=' ? 'IS_NOT_' : 'IS_'}${value === null ? 'NULL' : 'NAN'}` } };
      }
      if (!OPS[op]) throw new FirestoreError(`Unsupported operator ${op}`, 'invalid-argument');
      return { fieldFilter: { field: fieldRef, op: OPS[op], value: encode(value, this.firestore) } };
    });
    const q = { from: [{ collectionId: this._collectionId, allDescendants: this._all }] };
    if (filters.length === 1) q.where = filters[0];
    else if (filters.length > 1) q.where = { compositeFilter: { op: 'AND', filters } };
    if (this._orders.length) q.orderBy = this._orders.map((o) => ({ field: { fieldPath: fieldPathOf(o.field.split('.')) }, direction: o.dir === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
    if (this._limit != null) q.limit = this._limit;
    return q;
  }
}

class CollectionReference extends Query {
  constructor(db, path) {
    const parts = path.split('/');
    super(db, { parentPath: parts.slice(0, -1).join('/'), collectionId: parts[parts.length - 1] });
    this.path = path; this.id = parts[parts.length - 1];
  }
  get parent() { return this._parentPath ? new DocumentReference(this.firestore, this._parentPath) : null; }
  doc(id) { return new DocumentReference(this.firestore, `${this.path}/${id || autoId()}`); }
  async add(data) { const ref = this.doc(); await ref.create(data); return ref; }
}

function autoId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// ── transactions and batches ─────────────────────────────────────────────
// Reads inside one transaction run one at a time: concurrent requests
// carrying the same transaction id can deadlock (seen on the emulator).
class Transaction {
  constructor(db, id) { this._db = db; this._id = id; this._writes = []; this._queue = Promise.resolve(); }
  _serial(fn) { const next = this._queue.then(fn, fn); this._queue = next.catch(() => {}); return next; }
  get(target) {
    return this._serial(() => (target instanceof DocumentReference ? this._db._getDoc(target, this._id) : this._db._runQuery(target, this._id)));
  }
  getAll(...refs) { return this._serial(() => this._db._batchGet(refs.filter((r) => r instanceof DocumentReference), this._id)); }
  set(ref, data, opts) { this._writes.push(this._db._writeFor(ref, opts?.merge ? 'merge' : 'set', data)); return this; }
  update(ref, data) { this._writes.push(this._db._writeFor(ref, 'update', data)); return this; }
  create(ref, data) { this._writes.push(this._db._writeFor(ref, 'create', data)); return this; }
  delete(ref) { this._writes.push({ delete: ref._name }); return this; }
}
class WriteBatch {
  constructor(db) { this._db = db; this._writes = []; }
  set(ref, data, opts) { this._writes.push(this._db._writeFor(ref, opts?.merge ? 'merge' : 'set', data)); return this; }
  update(ref, data) { this._writes.push(this._db._writeFor(ref, 'update', data)); return this; }
  create(ref, data) { this._writes.push(this._db._writeFor(ref, 'create', data)); return this; }
  delete(ref) { this._writes.push({ delete: ref._name }); return this; }
  commit() { return this._db._commit(this._writes); }
}

class Firestore {
  constructor({ projectId, baseUrl = 'https://firestore.googleapis.com/v1', getToken, beforeWrite = null, fetchImpl = fetch }) {
    this.projectId = projectId;
    this._base = baseUrl.replace(/\/$/, '');
    this._root = `projects/${projectId}/databases/(default)/documents`;
    this._getToken = getToken;
    this._beforeWrite = beforeWrite;
    // Called plainly: invoking fetch as a method throws 'Illegal invocation' on Workers.
    this._fetch = (...args) => fetchImpl(...args);
  }
  doc(path) { return new DocumentReference(this, path.replace(/^\/+/, '')); }
  collection(path) { return new CollectionReference(this, path.replace(/^\/+/, '')); }
  collectionGroup(id) { return new Query(this, { parentPath: '', collectionId: id, allDescendants: true }); }
  batch() { return new WriteBatch(this); }
  getAll(...refs) { return this._batchGet(refs.filter((r) => r instanceof DocumentReference)); }
  _refFromName(name) { return this.doc(name.slice(name.indexOf('/documents/') + '/documents/'.length)); }

  async _call(method, url, body) {
    const token = await this._getToken();
    if (globalThis.process?.env?.SHIM_DEBUG) console.error('[shim]', method, url.replace(this._root, '~').slice(0, 140), body?.transaction ? 'tx' : '');
    const res = await this._fetch(`${this._base}/${url}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 && method === 'GET') return null;
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = Array.isArray(json) ? json[0]?.error : json.error;
      const status = err?.status || String(res.status);
      const code = { ABORTED: 'aborted', ALREADY_EXISTS: 'already-exists', NOT_FOUND: 'not-found', FAILED_PRECONDITION: 'failed-precondition',
        PERMISSION_DENIED: 'permission-denied', INVALID_ARGUMENT: 'invalid-argument', UNAUTHENTICATED: 'unauthenticated',
        RESOURCE_EXHAUSTED: 'resource-exhausted', UNAVAILABLE: 'unavailable' }[status] || 'unknown';
      throw new FirestoreError(err?.message || `Firestore ${res.status}`, code, status);
    }
    return json;
  }
  async _getDoc(ref, transaction) {
    // Transactional single reads go through batchGet (GET ?transaction=
    // hangs on the emulator; batchGet behaves the same in production).
    if (transaction) return (await this._batchGet([ref], transaction))[0];
    const json = await this._call('GET', ref._name);
    return new DocumentSnapshot(ref, json ? (json.fields || {}) : null, json || {});
  }
  async _batchGet(refs, transaction) {
    if (!refs.length) return [];
    const json = await this._call('POST', `${this._root}:batchGet`, { documents: refs.map((r) => r._name), ...(transaction ? { transaction } : {}) });
    const byName = new Map();
    for (const item of json) {
      if (item.found) byName.set(item.found.name, item.found);
      else if (item.missing) byName.set(item.missing, null);
    }
    return refs.map((r) => {
      const found = byName.get(r._name);
      return new DocumentSnapshot(r, found ? (found.fields || {}) : null, found || {});
    });
  }
  async _runQuery(query, transaction) {
    const parent = query._parentPath ? `${this._root}/${query._parentPath}` : this._root;
    const json = await this._call('POST', `${parent}:runQuery`, { structuredQuery: query._structured(), ...(transaction ? { transaction } : {}) });
    const docs = json.filter((r) => r.document).map((r) => new DocumentSnapshot(this._refFromName(r.document.name), r.document.fields || {}, r.document));
    return new QuerySnapshot(docs);
  }
  _writeFor(ref, mode, data) {
    const payload = this._beforeWrite ? this._beforeWrite(ref.path, mode, data) || data : data;
    const { fields, mask, transforms } = buildWrite(payload, { mode, db: this });
    const write = { update: { name: ref._name, fields } };
    if (mode === 'merge' || mode === 'update') write.updateMask = { fieldPaths: mask };
    if (transforms.length) write.updateTransforms = transforms;
    if (mode === 'update') write.currentDocument = { exists: true };
    if (mode === 'create') write.currentDocument = { exists: false };
    return write;
  }
  async _commit(writes, transaction) {
    if (!writes.length && !transaction) return [];
    const json = await this._call('POST', `${this._root}:commit`, { writes, ...(transaction ? { transaction } : {}) });
    return json.writeResults || [];
  }
  async runTransaction(fn, { maxAttempts = 5 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { transaction } = await this._call('POST', `${this._root}:beginTransaction`, {});
      const tx = new Transaction(this, transaction);
      let result;
      try {
        result = await fn(tx);
      } catch (e) {
        await this._call('POST', `${this._root}:rollback`, { transaction }).catch(() => {});
        throw e;
      }
      try {
        await this._commit(tx._writes, transaction);
        return result;
      } catch (e) {
        lastErr = e;
        if (e.code !== 'aborted' && e.status !== 'ABORTED') throw e;
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt + Math.random() * 50));
      }
    }
    throw lastErr;
  }
}

function createFirestore(opts) { return new Firestore(opts); }

module.exports = { createFirestore, Firestore, Timestamp, FieldValue, GeoPoint, FirestoreError,
  DocumentReference, CollectionReference, Query, DocumentSnapshot, QuerySnapshot, _internals: { buildWrite, encode, decode } };
