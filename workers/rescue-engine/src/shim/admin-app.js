// Stand-in for require('firebase-admin/app').
const engine = require('./engine');
function initializeApp(options = {}, name = '[DEFAULT]') { return engine.appFor(name, options); }
async function deleteApp(app) { await app.delete(); }
function getApp(name = '[DEFAULT]') { return engine.appFor(name); }
module.exports = { initializeApp, deleteApp, getApp };
