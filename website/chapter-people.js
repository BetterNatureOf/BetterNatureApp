// Render only the named people already published in the chapter's public document.
export const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
const normalize = value => String(value || '').trim().toLowerCase();
const initials = name => name.trim().split(/\s+/).filter((_, i, all) => !i || i === all.length - 1).map(word => word[0]).join('');
function rank(role) {
  const r = normalize(role).replace(/[_-]/g, ' ');
  if (/vice.*president|co.?president/.test(r)) return 1;
  if (/president|chapter lead|chapter director/.test(r)) return 0;
  if (/treasurer/.test(r)) return 2;
  if (/secretary/.test(r)) return 3;
  if (/coordinator/.test(r)) return 4;
  return !r || /^(member|volunteer|general member)$/.test(r) ? 100 : 50;
}
function photo(person, chapter) {
  const supplied = person.headshot_url || person.photo_url || person.avatar_url || person.photo || '';
  if (/^images\/[\w/.-]+$/.test(supplied) || safeLink(supplied)) return supplied;
  // User-supplied photo belongs to this exact named founder, in this chapter.
  return normalize(person.name) === 'satvik koya' && normalize(chapter.city) === 'memphis' ? 'images/team/satvik-koya.jpg' : '';
}
export function chapterPeople(chapter, fallback = []) {
  const positions = [['president','President'],['vice_president','Vice President'],['treasurer','Treasurer'],['secretary','Secretary'],['volunteer_coordinator','Volunteer Coordinator']];
  const officers = positions.flatMap(([key, role]) => chapter.officers?.[key]?.name ? [{...chapter.officers[key], role}] : []);
  const published = Array.isArray(chapter.roster) ? chapter.roster.filter(p => p?.name) : [];
  const source = [...officers, ...(published.length ? published : officers.length ? [] : fallback)];
  if (typeof chapter.president_name === 'string' && chapter.president_name.trim()) source.unshift({name:chapter.president_name, role:'President'});
  const people = [];
  for (const p of source) {
    if (typeof p?.name !== 'string' || !p.name.trim()) continue;
    const keys = [p.id, p.user_id, p.email, p.name].map(normalize).filter(Boolean);
    const id = normalize(p.id || p.user_id);
    const email = normalize(p.email);
    const existing = people.find(row => !(id && row.id && id !== row.id) && !(email && row.email && email !== row.email) && row.keys.some(key => keys.includes(key)));
    if (existing) {
      existing.keys = [...new Set([...existing.keys,...keys])];
      if (rank(p.role) < rank(existing.role)) existing.role = p.role;
      existing.image ||= photo(p, chapter);
      existing.linkedin ||= safeLink(p.linkedin || p.linkedin_url);
      continue;
    }
    people.push({name:p.name.trim(), role:p.role || 'Member', image:photo(p, chapter), linkedin:safeLink(p.linkedin || p.linkedin_url), bio:typeof p.bio === 'string' ? p.bio.slice(0,500) : '', id, email, keys});
  }
  return people.sort((a,b) => rank(a.role)-rank(b.role) || a.name.localeCompare(b.name));
}
export function renderChapterPeople(chapter, fallback) {
  const people = chapterPeople(chapter, fallback);
  if (!people.length) return '<p class="chapter-people__empty">This chapter hasn’t published its team yet.</p>';
  const group = (label, rows) => !rows.length ? '' : `<section class="chapter-people__group" aria-label="${label}"><h3>${label}<span>${rows.length}</span></h3><ul class="chapter-people__grid">${rows.map(p => `<li class="chapter-person" data-search="${escapeText((p.name+' '+p.role).toLowerCase())}"><div class="chapter-person__portrait"><span aria-hidden="true">${escapeText(initials(p.name))}</span>${p.image ? `<img src="${escapeText(p.image)}" alt="${escapeText(p.name)}" width="160" height="160" loading="lazy" decoding="async">` : ''}</div><div class="chapter-person__info"><h4>${escapeText(p.name)}</h4><p>${escapeText(p.role)}</p>${p.bio ? `<p class="chapter-person__bio">${escapeText(p.bio)}</p>` : ''}${p.linkedin ? `<a href="${escapeText(p.linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="See profile for ${escapeText(p.name)} (opens in a new tab)">See profile ↗</a>` : ''}</div></li>`).join('')}</ul></section>`;
  return `${people.length > 6 ? '<div class="chapter-people__search"><label for="chapterPeopleSearch">Find a person</label><input id="chapterPeopleSearch" type="search" data-people-search placeholder="Search name or position" autocomplete="off"><span data-people-status role="status"></span></div>' : ''}${group('Leadership',people.filter(p=>rank(p.role)<100))}${group('Members',people.filter(p=>rank(p.role)>=100))}`;
}
