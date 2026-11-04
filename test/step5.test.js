/* Step 5 acceptance test: Dip Record + Survey Record — added on demand, 3 blocks, readings, limit check, PDF.
   Run: node build/build.js && node test/step5.test.js   (PDF written to $OUT_DIR, default test/out) */
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

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-'));
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  await page.waitForSelector('html[data-ready="1"]');

  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Client').fill('Transport for NSW');
  await page.getByLabel('Project Title').fill('Pacific Hwy resurfacing');
  await page.getByLabel('Job Number').fill('J-24017');
  await page.getByRole('button', { name: 'New shift' }).click();
  await page.locator('.shift-details').getByLabel('Completed by').fill('Pierre L.');
  await page.getByText('Saved').waitFor();

  check(await page.getByRole('tab', { name: /Dip Record/ }).count() === 0, 'No Dip / Survey Record by default');

  // ---- Dip Record ----
  await page.getByRole('button', { name: /\+ Dip Record/ }).click();
  check(await page.getByRole('tab', { name: /Dip Record 1/ }).getAttribute('aria-selected') === 'true', 'Dip Record 1 added and open');
  const sheet = page.locator('.sheet');
  await sheet.waitFor();
  check(await sheet.locator('input[data-key=client]').inputValue() === 'Transport for NSW', 'Header prefilled from job');
  await sheet.getByLabel('Mix Type').fill('AC14 Class 320');
  await sheet.getByLabel('Frequency of Testing').fill('Every 20 m');
  await sheet.locator('.field', { hasText: 'Existing Surface' }).getByText('Seal', { exact: true }).click();
  await sheet.getByLabel('Seal size').fill('10');
  await sheet.getByLabel('Compaction Factor').fill('1.2');
  await sheet.getByLabel('Lower Dip Limit').fill('40');
  await sheet.getByLabel('Upper Dip Limit').fill('55');

  const b1 = sheet.locator('fieldset.block-set').nth(0);
  await b1.locator('.field', { hasText: 'Course' }).getByText('WC', { exact: true }).click();
  await b1.getByLabel('Length (m)').fill('200');
  await b1.getByLabel('Depth (mm)').fill('50');
  await b1.getByLabel('Offset (m) — Left').fill('0.5');
  await b1.getByLabel('Offset (m) — Centre').fill('1.75');
  await b1.getByLabel('Offset (m) — Right').fill('3');
  await b1.getByLabel('Direction').fill('North');
  await b1.locator('.field', { hasText: 'Level' }).getByText('Survey', { exact: true }).click();
  await b1.getByLabel('Run', { exact: true }).fill('1');
  await b1.getByLabel('Width', { exact: true }).fill('3.5');
  const readings = [['1000', '48', '50', '47'], ['1020', '45', '58', '46'], ['1040', '42', '44', '39']];
  for (const r of readings) {
    await b1.getByRole('button', { name: 'Add reading' }).click();
    const row = b1.locator('.trow:not(.thead)').last();
    for (const [k, v] of [['ch', r[0]], ['l', r[1]], ['c', r[2]], ['r', r[3]]]) await row.locator(`input[data-key=${k}]`).fill(v);
  }
  await page.getByText('Saved').waitFor();
  const warn = await page.locator('.warn').innerText();
  check(warn.includes('Dip Record 1: 2 reading(s) outside the dip limits (40 to 55): CH 1020 Centre 58, CH 1040 Right 39'), 'Warning lists the readings outside the limits (raw values)');
  check(await b1.locator('input.out').count() === 2, 'Out-of-limit cells highlighted (2)');
  check(await page.locator('.tab.active .dot.st-complete').count() === 1, 'Dip Record tab marked complete');
  await page.screenshot({ path: path.join(outDir, 'step5-dip-tablet.png') });

  // Block 2 full: 38 rows max on the sheet
  await page.evaluate(async () => {
    const job = (await SL.db.getAllJobs())[0];
    const b = job.shifts[0].dipRecords[0].courses[1];
    b.course = 'IC';
    for (let i = 0; i < 38; i++) b.readings.push({ ch: 2000 + i * 10, l: 50, c: 51, r: i === 37 ? 52.5 : 50 });
    await SL.db.putJob(job);
  });
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.getByRole('tab', { name: /Dip Record 1/ }).click();
  const b2 = page.locator('.sheet fieldset.block-set').nth(1);
  await b2.locator('.trow:not(.thead)').first().waitFor();
  check(await b2.getByRole('button', { name: 'Add reading' }).isDisabled(), 'Add reading disabled when the 38 rows are used');
  check(await b2.getByText('Sheet full (38 rows)').isVisible(), 'Full sheet message shown');
  check(await page.locator('.sheet input[data-key=mixType]').inputValue() === 'AC14 Class 320', 'Dip Record kept after reload');

  // ---- Survey Record ----
  await page.getByRole('button', { name: /\+ Survey Record/ }).click();
  const sv = page.locator('.sheet');
  await sv.getByLabel('Mix Type').waitFor();
  check(await page.getByRole('tab', { name: /Survey Record 1/ }).getAttribute('aria-selected') === 'true', 'Survey Record 1 added and open');
  check(await sv.getByLabel('Compaction Factor').count() === 0, 'Survey Record has no dip limits');
  await sv.getByLabel('Mix Type').fill('AC20');
  await sv.locator('.field', { hasText: 'Existing Surface' }).getByText('Granular', { exact: true }).click();
  await sv.locator('.field', { hasText: 'Survey completed by' }).getByText('Client', { exact: true }).click();
  const s2 = sv.locator('fieldset.block-set').nth(1);
  await s2.locator('.field', { hasText: 'Course' }).getByText('IC', { exact: true }).click();
  await s2.locator('.field', { hasText: 'Layer' }).getByText('2', { exact: true }).click();
  await s2.getByLabel('Direction').fill('South');
  check((await s2.locator('.trow.thead').innerText()).replace(/\s+/g, ' ').includes('Centre 1 Centre 2'), 'Survey: two Centre cells (Centre 1 / Centre 2)');
  for (const r of [['3000', '61', '62', '60', '71'], ['3020', '63', '64', '62', '73']]) {
    await s2.getByRole('button', { name: 'Add reading' }).click();
    const row = s2.locator('.trow:not(.thead)').last();
    for (const [k, v] of [['ch', r[0]], ['l', r[1]], ['c', r[2]], ['c2', r[4]], ['r', r[3]]]) await row.locator(`input[data-key=${k}]`).fill(v);
  }
  await page.getByText('Saved').waitFor();

  // A second survey, then remove it
  await page.getByRole('button', { name: /\+ Survey Record/ }).click();
  await page.getByRole('tab', { name: /Survey Record 2/ }).waitFor();
  await page.getByRole('button', { name: 'Remove this Survey Record' }).click();
  await page.getByText('Saved').waitFor();
  check(await page.getByRole('tab', { name: /Survey Record/ }).count() === 1, 'An added record can be removed');

  // ---- PDF: 6, 7, 10, 9, 12 ----
  await page.getByRole('button', { name: 'Preview PDF' }).last().click();
  await page.waitForSelector('.modal[data-ready="1"]', { timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const pdfPath = path.join(outDir, 'step5-lotpack.pdf');
  await dl.saveAs(pdfPath);
  await page.getByRole('button', { name: 'Close' }).click();
  const info = execFileSync('pdfinfo', [pdfPath]).toString();
  const n = Number((info.match(/Pages:\s+(\d+)/) || [])[1]);
  const texts = Array.from({ length: n }, (_, k) => execFileSync('pdftotext', ['-f', String(k + 1), '-l', String(k + 1), '-layout', pdfPath, '-']).toString());
  const codes = texts.map((t) => (t.match(/MSF28-\d+/) || ['?'])[0]);
  check(n === 6 && codes.join(',') === 'MSF28-6,MSF28-7,MSF28-10,MSF28-9,MSF28-12,MSF28-11', `PDF order ${codes.join(', ')}`);
  const dip = texts[3], sur = texts[4];
  for (const s of ['Transport for NSW', 'Pacific Hwy resurfacing', 'J-24017', 'AC14 Class 320', 'Every 20 m', '1.2', '55', '40', '200', '50', '1.75', 'North', '3.5', '1000', '1020', '58', '2370', '52.5', 'Pierre L.']) {
    check(dip.includes(s), `Dip Record page contains “${s}”`);
  }
  check(/Page\s+4\s+of\s+6/.test(dip) && /Page\s+5\s+of\s+6/.test(sur), 'Footers “Page 4 of 6” and “Page 5 of 6” (no number on the paper)');
  for (const s of ['AC20', 'South', '3000', '64', 'Pierre L.']) check(sur.includes(s), `Survey Record page contains “${s}”`);
  check(/61\s+62\s+71\s+60/.test(sur) && /63\s+64\s+73\s+62/.test(sur), 'Survey PDF: Left, Centre 1, Centre 2, Right in their cells'); 
  for (const p of [4, 5]) execFileSync('pdftoppm', ['-r', '110', '-png', '-singlefile', '-f', String(p), '-l', String(p), pdfPath, path.join(outDir, `step5-page${p}`)]);

  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'No horizontal scroll at phone width (390 px)');
  await page.getByRole('tab', { name: /Survey Record 1/ }).click();
  await page.locator('.sheet fieldset.block-set').nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'step5-survey-phone.png') });

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
