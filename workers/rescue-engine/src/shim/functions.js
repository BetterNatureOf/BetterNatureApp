// Stand-in for require('firebase-functions') and 'firebase-functions/v1/https'.
// Callables and triggers become plain handler functions; the Worker routes
// HTTP requests and its schedule to them.
class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code; this.details = details;
    this.httpErrorCode = { status: { 'invalid-argument': 400, 'failed-precondition': 400, 'out-of-range': 400,
      unauthenticated: 401, 'permission-denied': 403, 'not-found': 404, 'already-exists': 409, aborted: 409,
      'resource-exhausted': 429, cancelled: 499, unimplemented: 501, unavailable: 503, 'deadline-exceeded': 504 }[code] || 500 };
  }
  toJSON() { return { status: this.code.toUpperCase().replace(/-/g, '_'), message: this.message, details: this.details }; }
}
const passthrough = (fn) => fn;
const triggerBuilder = () => ({ onCreate: passthrough, onUpdate: passthrough, onWrite: passthrough, onDelete: passthrough });
const functions = {
  https: { HttpsError, onCall: (fn) => Object.assign(fn, { __callable: true }), onRequest: passthrough },
  firestore: { document: triggerBuilder },
  pubsub: { schedule: () => ({ timeZone() { return this; }, onRun: passthrough }) },
  logger: { log: console.log, info: console.log, warn: console.warn, error: console.error },
  config: () => ({}),
};
functions.runWith = () => functions;
functions.region = () => functions;
module.exports = functions;
module.exports.HttpsError = HttpsError;
