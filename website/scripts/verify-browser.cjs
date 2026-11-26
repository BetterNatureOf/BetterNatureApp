const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = process.env.BN_REVIEW_DIR || '/tmp/bn-website-review';
fs.mkdirSync(output, { recursive: true });
const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => { if (err) {res.writeHead(404).end();return;} res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROME_PATH || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const report = { scenarios: [], accessibility: [], errors: [] };
  async function chooseTheme(page, value) {
    const select = page.locator('[data-appearance]');
    const opened = !(await select.isVisible());
    if (opened) await page.locator('#burger').click();
    await select.selectOption(value);
    if (opened) await page.locator('#burger').click();
  }
  try {
    for (const width of [390, 768, 1440]) {
      for (const scheme of ['light','dark']) {
        console.log('Checking', width, scheme);
        const context = await browser.newContext({ viewport: {width, height: width === 390 ? 844 : 1000}, colorScheme: scheme, reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(url);
        await page.waitForFunction(() => window.BN_CHAPTER_DIRECTORY, {timeout:20000});
        assert.equal(await page.locator('html').getAttribute('data-theme'), scheme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}/${scheme}`);
        await page.screenshot({path: path.join(output, `${width}-${scheme}-hero.png`)});
        await page.locator('#chapterInsights').scrollIntoViewIfNeeded();
        await page.locator('#networkChart svg').waitFor({timeout:10000});
        await page.locator('#networkMetric').selectOption('members');
        assert.match(await page.locator('#networkSummary').innerText(), /no member count/);
        await page.locator('#networkMetric').selectOption('chapters');
        const region = await page.locator('#networkRegions button').first().innerText();
        await page.locator('#chapterFilters button').filter({hasText:region}).first().click();
        assert.equal(await page.locator('#chapterFilters [aria-pressed="true"]').getAttribute('data-region'), region);
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#networkExport').click();
        const download = await downloadPromise;
        await download.saveAs(path.join(output, `${width}-${scheme}.csv`));
        await page.locator('#chapterInsights').scrollIntoViewIfNeeded();
        await page.screenshot({path: path.join(output, `${width}-${scheme}-network.png`)});
        const axe = await new AxeBuilder({page}).include('#chapterInsights').include('.appearance').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
        report.accessibility.push({width,scheme,violations:axe.violations.map(v => ({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
        // Default follows OS changes; explicit override survives OS changes and reload.
        await page.emulateMedia({colorScheme: scheme === 'dark' ? 'light' : 'dark'});
        await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, scheme === 'dark' ? 'light' : 'dark');
        await chooseTheme(page, 'dark');
        await page.emulateMedia({colorScheme:'light'});
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await chooseTheme(page, 'system');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
        report.scenarios.push(`${width}/${scheme}: layout, chart, filters, export, reduced motion and theme preferences passed`);
        await context.close();
      }
    }
    const fallback = await browser.newPage({viewport:{width:390,height:844}});
    await fallback.route('**/firebase-chapters.js*', route => route.fulfill({contentType:'text/javascript',body:'export async function listChapters() { throw new Error("test offline directory"); }'}));
    await fallback.route('**/vendor/chapter-chart.js', route => route.abort());
    await fallback.goto(url);
    await fallback.locator('#chapterInsights').scrollIntoViewIfNeeded();
    await fallback.waitForFunction(()=>document.querySelector('#networkSource').textContent.includes('Chart unavailable'));
    assert.match(await fallback.locator('#networkSource').innerText(), /published featured chapters/i);
    assert.equal(await fallback.locator('.network__table').getAttribute('open'), '');
    assert.ok(await fallback.locator('#networkRows tr').count() > 0);
    report.scenarios.push('Failed live directory and blocked chart retain labeled published data and an open table');
    await fallback.close();
    fs.writeFileSync(path.join(output,'report.json'), JSON.stringify(report,null,2));
    assert.deepEqual(report.errors, []);
    assert.equal(report.accessibility.reduce((n,r)=>n+r.violations.length,0),0, 'Accessibility issues in new surfaces; inspect report.json');
    console.log(JSON.stringify(report,null,2));
    console.log('Review files:',output);
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
