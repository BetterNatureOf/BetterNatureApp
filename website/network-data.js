// Aggregate only the public directory. Missing member counts are not zero members.
export function aggregateDirectory(chapters, metric = 'chapters') {
  const groups = new Map();
  let missing = 0;
  for (const chapter of chapters) {
    const region = typeof chapter.region === 'string' && chapter.region ? chapter.region : 'Unspecified';
    if (!groups.has(region)) groups.set(region, { region, chapters: 0, members: 0, reported: 0 });
    const group = groups.get(region);
    group.chapters++;
    if (Number.isFinite(chapter.members) && chapter.members >= 0) { group.members += chapter.members; group.reported++; }
    else missing++;
  }
  const rows = [...groups.values()].map(group => ({ ...group, value: metric === 'members' ? (group.reported ? group.members : null) : group.chapters }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.region.localeCompare(b.region));
  return { rows, missing, total: rows.reduce((n, row) => n + (row.value ?? 0), 0) };
}
export function directoryCSV(rows, metric) {
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  return ['Region,' + (metric === 'members' ? 'Reported members,Chapters with member counts,Total chapters' : 'Chapters'),
    ...rows.map(row => [quote(row.region), row.value ?? '', ...(metric === 'members' ? [row.reported, row.chapters] : [])].join(','))].join('\r\n');
}
