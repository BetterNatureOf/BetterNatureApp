import { publishedPosts, filterPosts } from './journal-data.js';
const $ = id => document.getElementById(id);
let posts = [];
const node = (tag, text, className) => {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
function paint() {
  const slug = new URLSearchParams(location.search).get('post');
  if (slug) {
    $('journalList').hidden = true; $('journalArticle').hidden = false;
    const post = posts.find(post=>post.slug===slug);
    $('articleTitle').textContent = post ? post.title : 'Story not found';
    $('articleCategory').textContent = post?.project || 'Journal';
    $('articleMeta').textContent = post?.author || '';
    $('articleBody').replaceChildren(...(post?.paragraphs || ['This story is not available. Return to the journal to see published updates.']).map(p=>node('p',p)));
    document.title = `${post?.title || 'Story not found'} · Better Nature`;
    return;
  }
  const filtered = filterPosts(posts, $('journalSearch').value, $('journalTopic').value);
  $('journalStatus').textContent = `${filtered.length} published ${filtered.length===1?'story':'stories'}`;
  const grid=$('journalPosts');grid.replaceChildren();
  if (!filtered.length) {
    const empty=node('div','','journal-empty');empty.append(node('h2',posts.length?'No stories match your search.':'Our first field notes are on their way.'),node('p',posts.length?'Try a different topic or clear your search.':'This is where we’ll share updates and practical guides from our food rescue, forest and waterway programs. Explore the programs while we prepare our first stories.'));
    const link=node('a','Explore our programs ↗');link.href='index.html#programs';empty.append(link);grid.append(empty);return;
  }
  filtered.forEach(post=>{const article=node('article','','journal-card');article.append(node('small',post.project||'Community'),node('h2',post.title),node('p',post.excerpt||''));const link=node('a','Read story ↗');link.href=`blog.html?post=${encodeURIComponent(post.slug)}`;article.append(link);grid.append(article);});
}
$('journalSearch').addEventListener('input',paint);$('journalTopic').addEventListener('change',paint);
paint();
try {const {applyLiveContent}=await import('./firebase-site-content.js');await applyLiveContent();posts=publishedPosts(window.CONTENT?.blog?.posts);paint();} catch { $('journalStatus').textContent += ' · Live updates unavailable.'; }
