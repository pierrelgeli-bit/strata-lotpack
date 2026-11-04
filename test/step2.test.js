/* Step 2 acceptance test: Approval to Proceed filled and signed, faithful PDF.
   Run: node build/build.js && node test/step2.test.js
   Writes the generated PDF to $OUT_DIR (default: test/out) for inspection. */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'dist', 'strata-lotpack.html');
const outDir = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

async function sign(page, nth) {
  const c = page.locator('.sig-canvas').nth(nth);
  await c.scrollIntoViewIfNeeded();
  const b = await c.boundingBox();
  await page.mouse.move(b.x + 30, b.y + b.height * 0.7);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++) {
    const x = b.x + 30 + i * 9;
    const y = b.y + b.height * (0.5 + 0.25 * Math.sin(i / 2.5));
    await page.mouse.move(x, y, { steps: 2 });
  }
  await page.mouse.up();
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-'));
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1180, height: 900 }, acceptDownloads: true });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForSelector('html[data-ready="1"]');

  // Job + shift
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Client').fill('Transport for NSW');
  await page.getByLabel('Project Title').fill('Pacific Hwy resurfacing');
  await page.getByLabel('Job Number').fill('J-24017');
  await page.getByLabel('Suburb').fill('Coffs Harbour');
  await page.getByRole('button', { name: 'New shift' }).click();
  await page.locator('.shift-details').getByLabel('Date').fill('2026-11-04');
  await page.locator('.shift-details').getByLabel('Product').fill('AC14 Class 320');
  await page.getByLabel('Nominated thickness (mm)').fill('40');
  await page.getByText('Saved').waitFor();

  // The approval tab rebuilds with the new common values
  await page.getByRole('tab', { name: /Site Diagram/ }).click();
  await page.getByRole('tab', { name: /Approval to Proceed/ }).click();
  check(await page.locator('.warn').innerText().then((t) => t.includes('not signed by COLAS and client')), 'Warning shown while not signed');
  check(await page.locator('.tab.active .dot.st-empty').count() === 1, 'Approval tab marked empty');

  // Header: common values shown, local override kept on this sheet only
  const sheet = page.locator('.sheet');
  check(await sheet.locator('input[data-key=client]').inputValue() === 'Transport for NSW', 'Header prefilled from job');
  check(await sheet.locator('input[data-key=product]').inputValue() === 'AC14 Class 320', 'Header prefilled from shift');
  await sheet.locator('input[data-key=suburb]').fill('Coffs Harbour North');
  check(await page.locator('.local-tag:not([hidden])').count() === 1, 'Local header edit flagged (Suburb only)');

  // Work type, layer, checks
  await sheet.getByText('Supply & Lay').click();
  await sheet.getByText('Wearing').click();
  for (const l of ['Plant and Equipment', 'Risk Assessments', 'Service History', 'Registration', 'Materials/ Mix Design Details',
    'Preparation of Existing Surface', 'Swept & free if any loose material', 'Tack coat applied', 'Underlying layers conform to specification']) {
    await sheet.getByText(l, { exact: true }).click();
  }
  check(await page.locator('.tab.active .dot.st-progress').count() === 1, 'Approval tab marked in progress');
  await sheet.getByLabel('Comments/ Site Conditions').fill('Dry, 18 °C, light wind from the south. Surface swept and tack coat applied at 0.3 L/m² before paving. Works area fully closed to traffic with TGS-04 in place. Night shift crew of 9.');

  // Signatures
  await sheet.getByLabel('COLAS Representative Name').fill('Pierre L.');
  await sign(page, 0);
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(await sheet.getByLabel('Date & Time').nth(0).inputValue()), 'Signing fills date & time');
  await sheet.getByLabel('Comments', { exact: true }).fill('Hold point released, proceed.');
  await sheet.getByLabel('Client Representative Name').fill('Sam Taylor');
  await sheet.getByLabel('Position').fill('Site Engineer');
  await sign(page, 1);
  await page.getByText('Saved').waitFor();
  check(await page.locator('.warn').isHidden(), 'Warning gone once both signatures are in');
  check(await page.locator('.tab.active .dot.st-complete').count() === 1, 'Approval tab marked complete');
  await page.screenshot({ path: path.join(outDir, 'step2-approval-tablet.png'), fullPage: true });

  // Reload: everything kept
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.getByRole('tab', { name: /Approval to Proceed/ }).click();
  check(await page.locator('.tab.active .dot.st-complete').count() === 1, 'Signatures kept after reload');
  check(await page.locator('.sheet input[data-key=suburb]').inputValue() === 'Coffs Harbour North', 'Local header edit kept after reload');

  // PDF preview opens
  await page.getByRole('button', { name: 'Preview PDF' }).first().click();
  await page.waitForSelector('.modal[data-ready="1"]', { timeout: 20000 });
  check(await page.locator('.pdf-frame').count() === 1, 'PDF preview shown');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const pdfPath = path.join(outDir, 'step2-approval.pdf');
  await dl.saveAs(pdfPath);
  check(/^Lotpack_J-24017_2026-11-04\.pdf$/.test(dl.suggestedFilename()), `Download name ${dl.suggestedFilename()}`);
  await page.getByRole('button', { name: 'Close' }).click();

  // PDF content
  const info = execFileSync('pdfinfo', [pdfPath]).toString();
  check(/Pages:\s+1\b/.test(info), 'PDF has 1 page (approval only at this step)');
  const txt = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString();
  for (const s of ['Transport for NSW', 'Pacific Hwy resurfacing', 'J-24017', 'Coffs Harbour North', '04/11/2026', 'AC14 Class 320', '40 mm',
    'Pierre L.', 'Sam Taylor', 'Site Engineer', 'Hold point released, proceed.', 'Night shift crew of 9.', 'MSF28-6 V3R2']) {
    check(txt.includes(s), `PDF contains “${s}”`);
  }
  check(/Page\s+1\s+of\s+1/.test(txt) && !/Page\s+1\s+of\s+8/.test(txt), 'Footer reads “Page 1 of 1” (paper “of 8” removed)');
  const imgs = execFileSync('pdfimages', ['-list', pdfPath]).toString().split('\n').filter((l) => /\bimage\b/.test(l));
  check(imgs.length >= 3, `PDF holds logo + 2 signatures (${imgs.length} images)`);
  execFileSync('pdftoppm', ['-r', '110', '-png', '-singlefile', pdfPath, path.join(outDir, 'step2-approval')]);

  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'No horizontal scroll at phone width (390 px)');
  await page.screenshot({ path: path.join(outDir, 'step2-approval-phone.png'), fullPage: false });

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
