const assert = require('node:assert/strict');
const fs = require('node:fs');
const admin = require('firebase-admin');
const F = require('firebase/firestore');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const projectId = process.env.GCLOUD_PROJECT || 'demo-a2';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST) throw Error('Demo emulator required');
admin.initializeApp({ projectId });
const db = admin.firestore(), { _record: record } = require('../functions/recordPickupRelease');
const T = admin.firestore.Timestamp;
let env, count=0;
const change = (seconds=100, beforeExtra={}, afterExtra={}) => ({
  before:{data:()=>({status:'claimed',claimed_by:'alice',...beforeExtra})},
  after:{data:()=>({status:'available',claimed_by:null,released_by:'alice',released_at:new T(seconds,0),...afterExtra})}
});
const run=(c=change(), database=db)=>record(c,{params:{pickupId:'p'}},database);
const read=async(path)=>(await db.doc(path).get()).data();
async function test(name,fn){await env.clearFirestore();await db.doc('users/alice').set({role:'member',points:30,leaderboard_score:30});await db.doc('users/eve').set({role:'executive'});await fn();console.log(`PASS ${++count}: ${name}`);}
(async()=>{
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:fs.readFileSync(require.resolve('../firestore.rules'),'utf8')}});
 try {
 await test('release transaction applies totals, ledger, activity and audit once',async()=>{const out=await run();const u=await read('users/alice');assert.equal(u.points,25);assert.equal(u.leaderboard_score,25);assert.equal(u.pickups_dropped,1);assert.equal((await read(`member_activity/pickup_release_${out.key}`)).points,-5);assert.equal((await read(`audit_events/pickup_release_${out.key}`)).actor_uid,'alice');});
 await test('concurrent retries cannot double debit',async()=>{await Promise.all(Array.from({length:8},()=>run()));assert.equal((await read('users/alice')).pickups_dropped,1);assert.equal((await db.collection('pickup_releases').get()).size,1);});
 await test('separate release cycles both counted',async()=>{await run();await run(change(101));assert.equal((await read('users/alice')).pickups_dropped,2);});
 await test('scores floor at zero and activity reports actual delta',async()=>{await db.doc('users/alice').update({points:2,leaderboard_score:3});const out=await run();assert.equal((await read('users/alice')).points,0);assert.equal((await read(`member_activity/pickup_release_${out.key}`)).points,-2);assert.equal((await read(`pickup_releases/${out.key}`)).leaderboard_delta,-3);});
 await test('handoff retaining old release timestamp ignored',async()=>{assert.equal((await run(change(100,{released_at:new T(100,0)},{handoff_at:new T(101,0)}))).ignored,true);assert.equal((await db.collection('pickup_releases').get()).size,0);});
 await test('unrelated transitions and forged actor ignored',async()=>{assert.equal((await run(change(100,{}, {released_by:'bob'}))).ignored,true);assert.equal((await run(change(100,{}, {status:'completed'}))).ignored,true);});
 await test('out of order events preserve latest drop time',async()=>{await run(change(200));await run(change(100));assert.equal((await read('users/alice')).last_drop_at.seconds,200);assert.equal((await read('users/alice')).pickups_dropped,2);});
 for(const state of ['missing','deleted','merged'])await test(`${state} profile never recreated or debited`,async()=>{if(state==='missing')await db.doc('users/alice').delete();else await db.doc('users/alice').update(state==='deleted'?{deleted:true}:{merged_into:'bob'});const out=await run();assert.equal((await read(`pickup_releases/${out.key}`)).counter_applied,false);if(state==='missing')assert.equal((await db.doc('users/alice').get()).exists,false);else assert.equal((await read('users/alice')).points,30);});
 await test('failed transaction leaves no partial accounting; retry succeeds',async()=>{const failing={doc:p=>db.doc(p),runTransaction:fn=>db.runTransaction(async tx=>{await fn(tx);throw Error('injected rollback');})};await assert.rejects(run(change(),failing),/injected/);assert.equal((await read('users/alice')).points,30);assert.equal((await db.collection('pickup_releases').get()).size,0);await run();assert.equal((await read('users/alice')).points,25);});
 for(const uid of ['alice','eve'])await test(`${uid} cannot change server owned totals`,async()=>{const client=env.authenticatedContext(uid,{email_verified:true}).firestore();for(const field of ['points','leaderboard_score','pickups_dropped','last_drop_at'])await assertFails(F.updateDoc(F.doc(client,'users/alice'),{[field]:99}));await assertFails(F.setDoc(F.doc(client,'pickup_releases/forged'),{actor_uid:uid}));});
 await test('signup rejects seeded totals but accepts zero defaults',async()=>{const client=env.authenticatedContext('new',{email:'new@example.test',email_verified:true}).firestore();await assertFails(F.setDoc(F.doc(client,'users/new'),{role:'member',points:99}));await assertSucceeds(F.setDoc(F.doc(client,'users/new'),{role:'member',points:0,leaderboard_score:0,pickups_dropped:0}));});
 await test('cutover lock blocks release until operator unlocks',async()=>{await db.doc('pickups/p').set({status:'claimed',claimed_by:'alice',restaurant_id:'r'});await db.doc('migration_locks/pickup_release_cutover').set({owner_id:'operator'});const client=env.authenticatedContext('alice',{email_verified:true}).firestore();const write=()=>F.updateDoc(F.doc(client,'pickups/p'),{status:'available',claimed_by:null,released_by:'alice',released_at:F.serverTimestamp(),claimant_name:null,claimant_phone:null});await assertFails(write());await db.doc('migration_locks/pickup_release_cutover').delete();await assertSucceeds(write());});
 console.log(`Release accounting: all ${count} emulator cases passed`);
 } finally {await env.cleanup();await admin.app().delete();}
})().catch(e=>{console.error(e);process.exitCode=1;});
