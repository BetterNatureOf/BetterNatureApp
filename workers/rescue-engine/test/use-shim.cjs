// node -r ./workers/rescue-engine/test/use-shim.cjs …
// Redirects firebase-admin / firebase-functions to the Worker shims and
// points them at the Firestore emulator, so the existing suites exercise
// the exact data layer the free Worker uses.
const Module = require('node:module');
const path = require('node:path');
const shim = (f) => path.join(__dirname, '..', 'src', 'shim', f);
const MAP = {
  'firebase-admin': shim('admin.js'), 'firebase-admin/firestore': shim('admin-firestore.js'),
  'firebase-admin/app': shim('admin-app.js'), 'firebase-functions': shim('functions.js'),
  'firebase-functions/v1': shim('functions.js'), 'firebase-functions/v1/https': shim('functions.js'),
};
const original = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  return MAP[request] ? MAP[request] : original.call(this, request, ...rest);
};
const { createFirestore } = require(shim('firestore.js'));
const engine = require(shim('engine.js'));
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw new Error('use-shim needs FIRESTORE_EMULATOR_HOST');
engine.configure({
  factory: (options) => createFirestore({ projectId: options.projectId || process.env.GCLOUD_PROJECT || 'demo-shim',
    baseUrl: `http://${host}/v1`, getToken: async () => 'owner' }),
});
