import { aggregateDirectory, directoryCSV } from './network-data.js';
const root = document.querySelector('#chapterInsights');
if (root) {
  const $ = selector => root.querySelector(selector);
  const metric = $('#networkMetric');
  const summary = $('#networkSummary');
  const source = $('#networkSource');
  const exportButton = $('#networkExport');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let directory = null, aggregate = null, chart = null, visible = false, loading = false, cleanupMotion = null;
  let disposed = false, chartUnavailable = false;
  function selectRegion(region) {
    window.dispatchEvent(new CustomEvent('bn:region', { detail: region }));
    document.querySelector('#chapterSearch')?.focus({ preventScroll: true });
    document.querySelector('.chapters__tools')?.scrollIntoView({ block: 'center', behavior: motion.matches ? 'instant' : 'smooth' });
  }
  async function loadChart() {
    if (!visible || !directory || chart || loading || chartUnavailable) return;
    if (!aggregate?.rows.length) return;
    loading = true;
    try {
      const { createChart } = await import('./vendor/chapter-chart.js');
      if (disposed) return;
      chart = createChart($('#networkChart'), selectRegion);
      render();
    } catch {
      chartUnavailable = true;
      $('#networkChart').hidden = true;
      $('.network__table').open = true;
      source.textContent += ' Chart unavailable; the data table remains available.';
    } finally { loading = false; }
  }
  function render() {
    if (!directory) return;
    aggregate = aggregateDirectory(directory.chapters, metric.value);
    const { rows, missing, total } = aggregate;
    const unit = metric.value === 'members' ? 'reported members' : 'chapters';
    const members = metric.value === 'members';
    summary.textContent = !rows.length ? 'No chapters are listed yet. You can help start one.' : members
      ? `${total.toLocaleString('en-US')} reported members. ${missing} of ${directory.chapters.length} chapters have no member count. Counts may overlap and are not unique volunteers.`
      : `${total} listed chapters across ${rows.length} regions. Select a region to explore the directory.`;
    source.textContent = directory.source === 'live' ? 'Source: current public chapter directory. Snapshot from this page load.' : 'Source: published featured chapters. The live directory could not be loaded; this is not the complete network.';
    if (chartUnavailable) source.textContent += ' Chart unavailable; use the data table.';
    $('#networkCaption').textContent = `${members ? 'Reported members' : 'Listed chapters'} by region. ${directory.source === 'live' ? 'Current directory' : 'Published featured list'}.`;
    $('#networkUnit').textContent = members ? 'Reported members' : 'Chapters';
    const tbody = $('#networkRows'); tbody.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.scope = 'row'; th.textContent = row.region;
      const td = document.createElement('td'); td.textContent = row.value == null ? 'Not reported' : row.value.toLocaleString('en-US');
      tr.append(th, td); tbody.append(tr);
    }
    const regions = $('#networkRegions'); regions.replaceChildren();
    rows.forEach(row => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = row.region;
      button.addEventListener('click', () => selectRegion(row.region)); regions.append(button);
    });
    exportButton.disabled = !rows.length;
    chart?.update(rows, unit, motion.matches);
    loadChart();
  }
  function receive(event) { directory = event.detail; render(); }
  function themeChanged() { if (directory) render(); }
  const onMotion = () => { if (motion.matches) { cleanupMotion?.(); cleanupMotion = null; } themeChanged(); };
  window.addEventListener('bn:chapters', receive);
  window.addEventListener('bn:appearance', themeChanged);
  motion.addEventListener('change', onMotion);
  metric.addEventListener('change', render);
  exportButton.addEventListener('click', () => {
    if (!aggregate?.rows.length) return;
    // Include provenance with the downloaded snapshot. All labels are derived from a fixed region vocabulary.
    const csv = `Source,${directory.source === 'live' ? 'Public chapter directory' : 'Published featured chapter list'}\r\nSnapshot,${new Date().toISOString()}\r\n` + directoryCSV(aggregate.rows, metric.value);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `better-nature-${metric.value}-by-region.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const observer = new IntersectionObserver(async entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    visible = true; observer.disconnect(); loadChart();
    if (!motion.matches) {
      try { const { enterExplorer } = await import('./vendor/insight-motion.js'); if (!disposed && !motion.matches) cleanupMotion = enterExplorer(root); } catch { /* The fully visible layout is the fallback. */ }
    }
  }, { rootMargin: '150px' });
  observer.observe(root);
  function dispose() { disposed = true; observer.disconnect(); cleanupMotion?.(); chart?.dispose(); chart = null; window.removeEventListener('bn:chapters', receive); window.removeEventListener('bn:appearance', themeChanged); motion.removeEventListener('change', onMotion); }
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
  if (window.BN_CHAPTER_DIRECTORY) receive({ detail: window.BN_CHAPTER_DIRECTORY });
}
