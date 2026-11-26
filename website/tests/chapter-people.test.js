import test from 'node:test';
import assert from 'node:assert/strict';
import {chapterPeople,renderChapterPeople,safeLink} from '../chapter-people.js';
test('leadership is ordered by position, duplicates inherit their published portrait',()=>{
 const rows=chapterPeople({city:'Memphis',officers:{president:{name:'Ava Reed',id:'a'},treasurer:{name:'Zoe Wong',id:'z'},vice_president:{name:'Lee Park',id:'l'}},roster:[{name:'Ava Reed',id:'a',role:'Member',photo_url:'https://example.org/ava.jpg'},{name:'Pat Hill',role:'Member'}]});
 assert.deepEqual(rows.map(p=>p.role),['President','Vice President','Treasurer','Member']);assert.equal(rows.length,4);assert.equal(rows[0].image,'https://example.org/ava.jpg');
});
test('a published team takes precedence over legacy static membership',()=>{
 const rows=chapterPeople({officers:{president:{name:'New President'}}},[{name:'Old President'}]);assert.deepEqual(rows.map(p=>p.name),['New President']);
});
test('public roster displays named people without exposing email-only records',()=>{
 const html=renderChapterPeople({roster:[{email:'private@example.org'},{name:'<script>person</script>',role:'Member',photo:'javascript:alert(1)',linkedin:'javascript:alert(1)'}]});
 assert.ok(!html.includes('private@example.org'));assert.ok(!html.includes('javascript:'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
test('headshot aliases, empty directories and safe profile links work',()=>{
 const people=chapterPeople({city:'Memphis',roster:[{name:'Satvik Koya',role:'President'},{name:'Other Person',avatar_url:'https://example.org/portrait.jpg'}]});
 assert.equal(people[0].image,'images/team/satvik-koya.jpg');assert.equal(people[1].image,'https://example.org/portrait.jpg');assert.equal(safeLink('javascript:alert(1)'),'');assert.match(renderChapterPeople({},[]),/hasn’t published/);
});
test('the named president is promoted and distinct people sharing a name remain distinct',()=>{
 const rows=chapterPeople({president_name:'Ava Reed',roster:[{id:'a',name:'Ava Reed',role:'Member'},{id:'b',name:'Sam Taylor',role:'Member'},{id:'c',name:'Sam Taylor',role:'Member'}]});
 assert.equal(rows[0].role,'President');assert.equal(rows.length,3);
});
