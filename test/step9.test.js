/* Step 9 acceptance test: installable app (PWA) as published on GitHub Pages.
   Serves dist/ over http://127.0.0.1 (same behaviour as https for service workers), then checks:
   manifest + icons, service worker, 100 % offline after the first visit, data kept,
   "Update available – Reload" when a new version is published, and nothing registered as a local file.
   Run: node build/build.js && node test/step9.test.js */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { chromium } = require('playwright');

const dist = path.resolve(__dirname, '..', 'dist');
const outDir = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// copy of dist/ under /strata-lotpack/ (same path as GitHub Pages), so a "new version" can be published
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-site-'));
fs.cpSync(dist, site, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/strata-lotpack/')) { res.writeHead(404); return res.end(); }
  let p = path.join(site, decodeURIComponent(u.pathname.slice('/strata-lotpack/'.length)) || 'index.html');
  if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
  if (!p.startsWith(site) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/strata-lotpack/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-'));
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 900 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());

  // ---- Manifest and icons ----
  const mf = await (await page.request.get(base + 'manifest.webmanifest')).json();
  check(mf.name === 'Strata Lotpack' && mf.start_url === './' && ['fullscreen', 'standalone'].includes(mf.display), `Manifest: ${mf.name}, start_url ${mf.start_url}, display ${mf.display}`);
  const sizes = [];
  for (const ic of mf.icons) {
    const r = await page.request.get(base + ic.src);
    if (r.ok() && r.headers()['content-type'] === 'image/png') sizes.push(ic.sizes + (ic.purpose ? ` ${ic.purpose}` : ''));
  }
  check(sizes.length === mf.icons.length && sizes.some((s) => s.startsWith('192x192')) && sizes.some((s) => s.startsWith('512x512')), `Icons served: ${sizes.join(', ')}`);

  // ---- First visit: service worker installed ----
  await page.goto(base);
  await page.waitForSelector('html[data-ready="1"]');
  check(await page.locator('link[rel=manifest]').getAttribute('href') === 'manifest.webmanifest', 'Page links the manifest');
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  check(await page.evaluate(() => performance.getEntriesByType('navigation')[0].type) === 'navigate', 'First install does not reload the page');
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check(controlled, 'Service worker controls the page');
  const cached = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('strata-lotpack-')));
  check(cached.length === 1, `One app cache: ${cached.join(', ')}`);

  // ---- Offline ----
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Project Title').fill('Pacific Hwy resurfacing');
  await page.getByLabel('Job Number').fill('J-24017');
  await page.getByText('Saved').waitFor();
  await ctx.setOffline(true);
  await page.goto(base + '#/');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 15000 });
  check(await page.locator('.card', { hasText: 'J-24017' }).count() === 1, 'Offline: app opens from the cache and shows the saved job');
  await page.locator('.card', { hasText: 'J-24017' }).dblclick();
  await page.getByRole('button', { name: 'New shift' }).click();
  await page.locator('.shift-details').getByLabel('Product').fill('AC14');
  await page.getByText('Saved').waitFor();
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  check(await page.evaluate(async () => (await SL.db.getAllJobs())[0].shifts[0].product === 'AC14'), 'Offline: shift created and kept after reload');
  const pdfOk = await page.evaluate(async () => {
    const job = (await SL.db.getAllJobs())[0];
    const bytes = await SL.pdf.build(job, job.shifts[0]);
    return bytes.length > 10000;
  }).catch((e) => 'error: ' + e.message);
  check(pdfOk === true, `Offline: PDF built (${pdfOk})`);
  await ctx.setOffline(false);
  check(await page.locator('.update-bar').count() === 0, 'No update banner while the version is unchanged');

  // ---- A new version is published ----
  const sw = fs.readFileSync(path.join(site, 'sw.js'), 'utf8');
  fs.writeFileSync(path.join(site, 'sw.js'), sw.replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-next'"));
  fs.writeFileSync(path.join(site, 'index.html'), fs.readFileSync(path.join(site, 'index.html'), 'utf8').replace('</body>', '<meta name="test-version" content="next"></body>'));
  await page.evaluate(() => SL.pwa.state.registration.update());
  await page.locator('.update-bar').waitFor({ timeout: 15000 });
  check((await page.locator('.update-bar').innerText()).replace(/\s+/g, ' ').trim() === 'Update available Reload', 'Banner “Update available – Reload” shown');
  await page.screenshot({ path: path.join(outDir, 'step9-update.png') });
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Reload' }).click()]);
  await page.waitForSelector('html[data-ready="1"]');
  check(await page.locator('meta[name=test-version]').count() === 1, 'Reload: the new version is running');
  check(await page.evaluate(async () => (await SL.db.getAllJobs())[0].shifts[0].product === 'AC14'), 'Data kept across the update');
  const after = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('strata-lotpack-')));
  check(after.length === 1 && after[0].endsWith('-next'), `Old cache removed: ${after.join(', ')}`);

  // ---- Opened as a local file: no service worker ----
  const p2 = await ctx.newPage();
  await p2.goto('file://' + path.join(dist, 'strata-lotpack.html'));
  await p2.waitForSelector('html[data-ready="1"]');
  check(await p2.evaluate(() => SL.pwa.served === false && !navigator.serviceWorker?.controller), 'Local file: no service worker');

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(site, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
