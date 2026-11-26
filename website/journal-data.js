// Only explicit, published editorial records become articles. No fabricated stories.
export function publishedPosts(input = []) {
  if (!Array.isArray(input)) return [];
  return input.filter(p => p && p.published === true && /^[a-z0-9][a-z0-9-]{0,79}$/.test(p.slug || '') && typeof p.title === 'string' && p.title.trim())
    .map(p => ({...p, paragraphs: Array.isArray(p.paragraphs) ? p.paragraphs.filter(text=>typeof text==='string') : []}));
}
export function filterPosts(posts, query, topic) {
  const q = query.trim().toLowerCase();
  return posts.filter(post => (!topic || post.project === topic) && (!q || `${post.title} ${post.excerpt || ''} ${post.project || ''}`.toLowerCase().includes(q)));
}
