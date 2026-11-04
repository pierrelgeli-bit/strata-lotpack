/* Step 1 acceptance test: a created job is found after reload (and after a browser restart).
   Run: node build/build.js && node test/step1.test.js */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'dist', 'strata-lotpack.html');
const shots = process.env.SHOTS_DIR || null;
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

async function openApp(profile, viewport) {
  const ctx = await chromium.launchPersistentContext(profile, { viewport });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith('file://')) external.push(r.url()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  await page.waitForSelector('html[data-ready="1"]');
  return { ctx, page, errors, external };
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-'));
  let { ctx, page, errors, external } = await openApp(profile, { width: 1180, height: 820 });

  check(await page.locator('h1', { hasText: 'Jobs' }).isVisible(), 'Jobs screen shown on start');
  check(await page.getByText('No jobs yet').isVisible(), 'Empty state shown');

  // Create a job and fill its details
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Client').fill('Transport for NSW');
  await page.getByLabel('Project Title').fill('Pacific Hwy resurfacing');
  await page.getByLabel('Job Number').fill('J-24017');
  check(await page.getByLabel('Suburb').count() === 0, 'Job details: client, project, job number only');

  // Create a shift: Shift details hold suburb, plant, haulage, product…
  await page.getByRole('button', { name: 'New shift' }).click();
  const sd = page.locator('.shift-details');
  check(await sd.evaluate((el) => el.open), 'Shift details open on a new shift');
  await sd.getByLabel('Suburb').fill('Coffs Harbour');
  await sd.getByLabel('Supplying Plant').fill('Boral');
  await sd.getByLabel('Haulage (km)').fill('12,5');
  await page.locator('.shift-details').getByLabel('Product').fill('AC14');
  await page.locator('.shift-details').getByLabel('Completed by').fill('PL');
  await page.locator('.shift-details').getByLabel('Date').fill('2026-11-04');
  await page.getByText('Saved').waitFor();
  check(await page.locator('.tab[role=tab]').count() === 4, '4 base sheet tabs in a shift (+ add buttons for optional sheets)');
  if (shots) await page.screenshot({ path: path.join(shots, 'step1-shift-tablet.png') });

  // Second shift (night, day before) inherits the shift details
  await page.getByRole('link', { name: 'Pacific Hwy resurfacing' }).click();
  await page.getByRole('button', { name: 'New shift' }).click();
  check(await page.locator('.shift-details').getByLabel('Product').inputValue() === 'AC14', 'New shift carries over product');
  check(await page.locator('.shift-details').getByLabel('Completed by').inputValue() === 'PL', 'New shift carries over “Completed by”');
  check(await page.locator('.shift-details').getByLabel('Suburb').inputValue() === 'Coffs Harbour' && await page.locator('.shift-details').getByLabel('Haulage (km)').inputValue() === '12.5', 'New shift carries over suburb and haulage (12,5 → 12.5)');
  await page.locator('.shift-details').getByLabel('Date').fill('2026-11-03');
  await page.locator('.shift-details').getByText('Night', { exact: true }).click();
  await page.getByText('Saved').waitFor();
  check(await page.locator('.crumbs').innerText().then((t) => t.includes('03/11/2026 · Night')), 'Shift label shows date and Night');
  // Third shift, same date, day
  await page.getByRole('link', { name: 'Pacific Hwy resurfacing' }).click();
  await page.getByRole('button', { name: 'New shift' }).click();
  await page.locator('.shift-details').getByLabel('Date').fill('2026-11-03');
  await page.getByText('Saved').waitFor();
  await page.getByRole('link', { name: 'Pacific Hwy resurfacing' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 3);
  const order = await page.locator('.card .title').allInnerTexts();
  check(order.join(' | ') === '03/11/2026 · Day | 03/11/2026 · Night | 04/11/2026 · Day', `Shifts sorted by date, day before night (${order.join(' | ')})`);
  check(await page.locator('.job-details').evaluate((el) => !el.open), 'Job details folded once filled');

  // Select a card (tap), open with the Open button
  const first = page.locator('.card').first();
  await first.click();
  check(await first.evaluate((el) => el.classList.contains('selected')), 'Tap selects a card');
  check(/#\/job\/[^/]+$/.test(page.url()), 'Tap does not open the card');
  // Context menu → Duplicate
  await first.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 4);
  check(await page.locator('.card').count() === 4, 'Context menu Duplicate adds a copy');
  check(await page.locator('.card .title').first().innerText() === '03/11/2026 · Day' && await page.locator('.card .title').nth(1).innerText() === '03/11/2026 · Day', 'Copy sorted with the same date');
  // Ctrl+C / Ctrl+V duplicates the selected card
  await page.locator('.card').last().click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 5);
  check(await page.locator('.card').count() === 5, 'Ctrl+C / Ctrl+V duplicates the selected shift');
  // Context menu → Delete (2 copies)
  for (let k = 0; k < 2; k++) {
    await page.locator('.card').nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.card').length === n, 4 - k);
  }
  check(await page.locator('.card').count() === 3, 'Context menu Delete removes a shift (after confirmation)');
  // Double-click opens
  await page.locator('.card').first().dblclick();
  await page.waitForURL(/\/shift\//);
  check(true, 'Double-click opens the shift');

  // Theme switch persists
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Night').check();
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Night theme applied');
  await page.getByText('Saved').waitFor();

  // Reload: data still there
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.goto(url + '#/');
  await page.waitForSelector('.card');
  check(await page.getByText('Pacific Hwy resurfacing').isVisible(), 'Job found after reload');
  check(await page.getByText('3 shifts').isVisible(), 'All shifts found after reload');
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Theme kept after reload');

  // Browser restart: data still there
  await ctx.close();
  ({ ctx, page, errors: errors, external } = await openApp(profile, { width: 390, height: 844 }));
  await page.waitForSelector('.card');
  check(await page.getByText('Pacific Hwy resurfacing').isVisible(), 'Job found after browser restart');
  await page.getByRole('button', { name: 'Open', exact: true }).first().click();
  await page.waitForURL(/#\/job\/[^/]+$/);
  await page.getByRole('heading', { name: 'Shifts' }).waitFor();
  check(await page.getByText('04/11/2026').first().isVisible(), 'Shift date shown as DD/MM/YYYY');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'No horizontal scroll at phone width (390 px)');
  if (shots) await page.screenshot({ path: path.join(shots, 'step1-job-phone.png'), fullPage: true });

  // Delete a shift (from its screen) then the job
  await page.locator('.card').first().dblclick();
  await page.getByRole('button', { name: 'Delete shift' }).click();
  await page.waitForURL(/#\/job\/[^/]+$/);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 2);
  check(await page.locator('.card').count() === 2, 'Shift deleted');
  await page.getByRole('button', { name: 'Delete job' }).click();
  await page.getByText('No jobs yet').waitFor();
  check(true, 'Job deleted');

  // Old data (schema 1: suburb / plant / haulage on the job) is migrated to the shifts
  const mig = await page.evaluate(async () => {
    const old = { id: 'old-1', schemaVersion: 1, client: 'C', projectTitle: 'Old', jobNumber: 'J-OLD', suburb: 'Sub', supplyingPlant: 'Plant', haulageKm: 7,
      shifts: [{ id: 's1', date: '2026-01-01', product: 'AC10', diagram: { pages: [{ strokes: [], legends: [{ key: 'A', mix: 'AC10', layer: 'Wearing', depth: '40', area: 5, tonnes: 1 }, { key: '', mix: '', layer: '', depth: '', area: '', tonnes: '' }] }] } }] };
    await SL.db.putJob(old);
    const j = await SL.db.getJob('old-1');
    const s = j.shifts[0];
    return { v: j.schemaVersion, jobHas: 'suburb' in j, s: [s.suburb, s.supplyingPlant, s.haulageKm, s.shiftType], legends: s.diagram.pages[0].legends };
  });
  check(mig.v === 2 && !mig.jobHas && mig.s.join(',') === 'Sub,Plant,7,day', `Schema 1 → 2: suburb / plant / haulage moved to the shift (${mig.s.join(',')})`);
  check(mig.legends.length === 1 && mig.legends[0].layer.join() === 'wearing' && /^#/.test(mig.legends[0].color), 'Schema 1 → 2: legends get a colour key, empty legends dropped');

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  check(external.length === 0, `No network request${external.length ? ': ' + external.join(', ') : ''}`);

  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
