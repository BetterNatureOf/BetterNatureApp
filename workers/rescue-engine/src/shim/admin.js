// Stand-in for require('firebase-admin') (default namespace).
const engine = require('./engine');
const fs = require('./admin-firestore');
function firestore(app) { return engine.dbFor(app || engine.appFor()); }
Object.assign(firestore, { Timestamp: fs.Timestamp, FieldValue: fs.FieldValue, GeoPoint: fs.GeoPoint });
module.exports = {
  initializeApp: (options = {}, name) => engine.appFor(name, options),
  get apps() { return [...engine.state.apps.values()]; },
  app: (name) => engine.appFor(name),
  firestore,
  auth: () => { if (!engine.state.auth) throw new Error('Auth client not configured'); return engine.state.auth; },
  storage: () => { if (!engine.state.storage) throw new Error('Storage client not configured'); return engine.state.storage; },
};
