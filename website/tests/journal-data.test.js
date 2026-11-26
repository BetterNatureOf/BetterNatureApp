import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedPosts,filterPosts} from '../journal-data.js';
test('drafts, invalid slugs and empty titles never become public posts',()=>{assert.deepEqual(publishedPosts([{published:false,slug:'draft',title:'Draft'},{published:true,slug:'../private',title:'Bad'},{published:true,slug:'empty',title:' '}]),[])});
test('only string paragraphs render and filtering combines topic with search',()=>{const posts=publishedPosts([{published:true,slug:'food-rescue',title:'Food rescue',project:'IRIS',paragraphs:['Hello',null,{html:'unsafe'}]},{published:true,slug:'trees',title:'Native trees',project:'Evergreen'}]);assert.deepEqual(posts[0].paragraphs,['Hello']);assert.equal(filterPosts(posts,'food','IRIS').length,1);assert.equal(filterPosts(posts,'food','Hydro').length,0)});
