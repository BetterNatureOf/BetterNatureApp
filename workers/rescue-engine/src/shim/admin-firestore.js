// Stand-in for require('firebase-admin/firestore').
const { Timestamp, FieldValue, GeoPoint } = require('./firestore');
const engine = require('./engine');
function getFirestore(app) { return engine.dbFor(app || engine.appFor()); }
module.exports = { Timestamp, FieldValue, GeoPoint, getFirestore };
