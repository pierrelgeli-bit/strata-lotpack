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
  await page.getByLabel('Suburb').fill('Coffs Harbour');
  await page.getByLabel('Haulage (km)').fill('12,5');

  // Create a shift
  await page.getByRole('button', { name: 'New shift' }).click();
  await page.getByLabel('Product').fill('AC14');
  await page.getByLabel('Completed by').fill('PL');
  await page.getByLabel('Date').fill('2026-11-04');
  await page.getByText('Saved').waitFor();
  check(await page.locator('.tab').count() === 4, '4 base sheet tabs in a shift');
  if (shots) await page.screenshot({ path: path.join(shots, 'step1-shift-tablet.png') });

  // Second shift inherits product and completed by
  await page.getByRole('link', { name: 'Pacific Hwy resurfacing' }).click();
  await page.getByRole('button', { name: 'New shift' }).click();
  check(await page.getByLabel('Product').inputValue() === 'AC14', 'New shift carries over product');
  check(await page.getByLabel('Completed by').inputValue() === 'PL', 'New shift carries over “Completed by”');

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
  check(await page.getByText('2 shifts').isVisible(), 'Both shifts found after reload');
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Theme kept after reload');

  // Browser restart: data still there
  await ctx.close();
  ({ ctx, page, errors: errors, external } = await openApp(profile, { width: 390, height: 844 }));
  await page.waitForSelector('.card');
  check(await page.getByText('Pacific Hwy resurfacing').isVisible(), 'Job found after browser restart');
  await page.getByText('Pacific Hwy resurfacing').click();
  check(await page.getByLabel('Haulage (km)').inputValue() === '12.5', 'Decimal comma stored as number (12,5 → 12.5)');
  check(await page.getByText('04/11/2026').first().isVisible(), 'Shift date shown as DD/MM/YYYY');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'No horizontal scroll at phone width (390 px)');
  if (shots) await page.screenshot({ path: path.join(shots, 'step1-job-phone.png'), fullPage: true });

  // Delete a shift then the job
  await page.locator('.card').first().click();
  await page.getByRole('button', { name: 'Delete shift' }).click();
  await page.waitForSelector('text=1 shift', { state: 'detached' }).catch(() => {});
  await page.waitForURL(/#\/job\/[^/]+$/);
  check(await page.locator('.card').count() === 1, 'Shift deleted');
  await page.getByRole('button', { name: 'Delete job' }).click();
  await page.getByText('No jobs yet').waitFor();
  check(true, 'Job deleted');

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  check(external.length === 0, `No network request${external.length ? ': ' + external.join(', ') : ''}`);

  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
