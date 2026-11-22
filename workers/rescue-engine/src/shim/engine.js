// Holds the active Firestore/Auth/Storage clients for the shims below.
// The Worker sets them per request from its env; Node tests set them from
// the emulator settings.
const state = { apps: new Map(), factory: null, auth: null, storage: null };

function configure({ factory, auth = null, storage = null }) {
  state.factory = factory; state.auth = auth; state.storage = storage; state.apps.clear();
}
function appFor(name = '[DEFAULT]', options = {}) {
  if (!state.apps.has(name)) {
    if (!state.factory) throw new Error('rescue-engine shim is not configured');
    const app = { name, options, _db: null };
    app.delete = async () => { state.apps.delete(name); };
    state.apps.set(name, app);
  }
  return state.apps.get(name);
}
function dbFor(app) {
  if (!app._db) app._db = state.factory(app.options || {});
  return app._db;
}
module.exports = { state, configure, appFor, dbFor };
