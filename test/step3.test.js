/* Step 3 acceptance test: Asphalt Traceability — truck rows, running total, 2 h readings, PDF pages.
   Run: node build/build.js && node test/step3.test.js   (PDF written to $OUT_DIR, default test/out) */
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
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-'));
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  // Fixed clock (today 14:00) so the 2 h reminder is tested whatever the real time
  const fixed = new Date(); fixed.setHours(14, 0, 0, 0);
  await page.clock.setFixedTime(fixed);
  await page.goto(url);
  await page.waitForSelector('html[data-ready="1"]');

  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Client').fill('Transport for NSW');
  await page.getByLabel('Project Title').fill('Pacific Hwy resurfacing');
  await page.getByLabel('Job Number').fill('J-24017');
  await page.getByLabel('Suburb').fill('Coffs Harbour');
  await page.getByRole('button', { name: 'New shift' }).click();
  const today = await page.evaluate(() => SL.schema.todayIso());
  await page.locator('.shift-details').getByLabel('Product').fill('AC14');
  await page.locator('.shift-details').getByLabel('Nominated thickness (mm)').fill('40');
  await page.getByRole('tab', { name: /Asphalt Traceability/ }).click();
  const sheet = page.locator('.sheet');

  // Header extras
  await sheet.getByLabel('Weather Conditions').fill('Fine, dry');
  await sheet.getByLabel('Tack Coat Application Rate — Litres').fill('0.3');
  await sheet.getByLabel('Tack Coat Application Rate — m²').fill('1');
  await sheet.locator('.field', { hasText: 'Tack Coat Broken' }).getByText('Yes').click();
  await sheet.locator('.field', { hasText: 'Existing Surface Clean' }).getByText('Yes').click();
  await sheet.getByText('Supply & Lay').click();
  await sheet.getByText('Wearing', { exact: true }).click();

  // 3 trucks through the UI
  const loadsData = [['D-1001', '12.5', '06:58', '155', '1000', '1080'], ['D-1002', '11.8', '07:10', '152', '1080', '1155'], ['D-1003', '12.1', '07:24', '135', '1155', '1230']];
  for (const [docket, t, tip, temp, a, b] of loadsData) {
    await sheet.getByRole('button', { name: 'Add row' }).click();
    const row = sheet.locator('.rows').first().locator('.trow:not(.thead)').last();
    await row.locator('input[data-key=docket]').fill(docket);
    await row.locator('input[data-key=tonnes]').fill(t);
    await row.locator('input[data-key=tipTime]').fill(tip);
    await row.locator('input[data-key=temp]').fill(temp);
    await row.locator('input[data-key=chStart]').fill(a);
    await row.locator('input[data-key=chEnd]').fill(b);
    await row.locator('input[data-key=run]').fill('1');
    await row.locator('input[data-key=width]').fill('3.5');
  }
  const progress = await sheet.locator('output.calc').allInnerTexts();
  check(JSON.stringify(progress) === JSON.stringify(['12.5', '24.3', '36.4']), `Progress tonnes cumulative (${progress.join(', ')})`);
  check(await sheet.locator('.rows').first().locator('input[data-key=no]').last().inputValue() === '3', 'Load No auto-increments');
  check(await page.locator('.warn').innerText().then((t) => t.includes('no wind / pavement temperature reading yet')), 'Warning: no reading before start');

  // Readings: before start + every 2 h
  for (const [time, wind, pav] of [['06:30', '12', '18'], ['08:40', '15', '24']]) {
    await sheet.getByRole('button', { name: 'Add reading' }).click();
    const row = sheet.locator('.rows').nth(1).locator('.trow:not(.thead)').last();
    await row.locator('input[data-key=time]').fill(time);
    await row.locator('input[data-key=windKmh]').fill(wind);
    await row.locator('input[data-key=pavementTemp]').fill(pav);
  }
  check(!(await page.locator('.warn').innerText().catch(() => '')).includes('no wind'), 'Warning gone once a reading exists');

  // Limits: one truck below min temp, one reading above max wind
  await sheet.getByLabel('Min load temp (°C)').fill('140');
  await sheet.getByLabel('Max wind (km/h)').fill('14');
  const warn = await page.locator('.warn').innerText();
  check(warn.includes('load temp below 140 °C on load 3'), 'Warning: load below min temp (limit typed in the sheet)');
  check(warn.includes('wind above 14 km/h at 08:40'), 'Warning: wind above max');

  // 2-hour reminder (shift is today): last reading 2 h 30 ago
  const nowMin = await page.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  if (nowMin >= 160) {
    await sheet.getByRole('button', { name: 'Add reading' }).click();
    const row = sheet.locator('.rows').nth(1).locator('.trow:not(.thead)').last();
    await row.locator('input[data-key=time]').fill(hhmm(nowMin - 150));
    await row.locator('input[data-key=windKmh]').fill('10');
    await page.locator('.shift-details').getByLabel('Date').fill(today);
    await sheet.getByLabel('Min load temp (°C)').fill('140'); // triggers a warning refresh
    // reorder: the test reading is the latest one
    check((await page.locator('.warn').innerText()).includes('last wind / pavement reading 2 h 30 ago'), 'Reminder after 2 h without reading');
    await row.getByRole('button', { name: /Delete reading/ }).click();
  } else {
    console.log('SKIP  2 h reminder (too close to midnight)');
  }

  // Lot summary prefilled, QA
  check(await sheet.locator('input[data-key=qtyDelivered]').inputValue() === '36.4', 'QTY Delivered prefilled from trucks');
  await sheet.getByLabel('m² paved').fill('805');
  await sheet.locator('.field', { hasText: 'Temps recorded' }).getByText('Yes').click();
  await sheet.locator('.field', { hasText: 'Dips Recorded' }).getByText('No').click();
  await sheet.locator('.field', { hasText: 'Lot discussed' }).getByText('Yes').click();
  await page.getByText('Saved').waitFor();
  check(await page.locator('.tab.active .dot.st-complete').count() === 1, 'Traceability tab marked complete');
  await page.screenshot({ path: path.join(outDir, 'step3-trace-tablet.png'), fullPage: true });

  // 27 more trucks straight into the database (30 in total -> continuation page)
  await page.evaluate(async () => {
    const jobs = await SL.db.getAllJobs();
    const job = jobs[0];
    const t = job.shifts[0].traceability;
    for (let i = 4; i <= 30; i++) {
      const m = 7 * 60 + 24 + (i - 3) * 9;
      t.loads.push({ no: i, docket: `D-${1000 + i}`, tonnes: 12, progress: null, tipTime: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, temp: 150, chStart: 1230 + (i - 4) * 70, chEnd: 1300 + (i - 4) * 70, run: 2, width: 3.5, comment: i === 30 ? 'Last truck' : '' });
    }
    t.envReadings.push({ time: '10:50', windKmh: 11, pavementTemp: 28 });
    await SL.db.putJob(job);
  });
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.getByRole('tab', { name: /Asphalt Traceability/ }).click();
  await page.locator('.sheet .rows').first().locator('.trow:not(.thead)').first().waitFor();
  const nRows = await page.locator('.sheet .rows').first().locator('.trow:not(.thead)').count();
  check(nRows === 30, `30 truck rows after reload (${nRows})`);
  check(await page.locator('.sheet input[data-key=qtyDelivered]').inputValue() === '360.4', 'QTY Delivered = 360.4 T');

  // PDF
  await page.getByRole('button', { name: 'Preview PDF' }).first().click();
  await page.waitForSelector('.modal[data-ready="1"]', { timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const pdfPath = path.join(outDir, 'step3-lotpack.pdf');
  await dl.saveAs(pdfPath);
  await page.getByRole('button', { name: 'Close' }).click();

  const info = execFileSync('pdfinfo', [pdfPath]).toString();
  // Pack order 6, 7, 10: traceability pages are found by their MSF28-10 code, not a fixed number
  const n = Number((info.match(/Pages:\s+(\d+)/) || [])[1]);
  const pg = (k) => execFileSync('pdftotext', ['-f', String(k), '-l', String(k), '-layout', pdfPath, '-']).toString();
  const texts = Array.from({ length: n }, (_, k) => pg(k + 1));
  const tr = texts.map((t, k) => (t.includes('MSF28-10') ? k + 1 : 0)).filter(Boolean);
  check(n === 5 && tr.length === 2 && tr[0] === 3 && texts[n - 1].includes('MSF28-11'), `PDF has 5 pages: approval, site diagram, traceability + continuation, quantities (${n} pages, MSF28-10 on ${tr.join(', ')})`);
  const [a, b] = tr;
  const p2 = texts[a - 1] || '', p3 = texts[b - 1] || '';
  for (const s of ['Transport for NSW', 'Pacific Hwy resurfacing', 'J-24017', 'Fine, dry', 'AC14', '40 mm', 'D-1001', '36.4', '360.4', '805', 'MSF28-10 V1R5']) {
    check(p2.includes(s), `Traceability page contains “${s}”`);
  }
  check(new RegExp(`Page\\s+${a}\\s+of\\s+${n}`).test(p2), `Traceability footer “Page ${a} of ${n}”`);
  check(new RegExp(`Page\\s+${b}\\s+of\\s+${n}`).test(p3), `Continuation footer “Page ${b} of ${n}”`);
  check(p3.includes('D-1024') && p3.includes('D-1030') && p3.includes('Last truck') && !p3.includes('D-1023'), 'Rows 24–30 on the continuation page');
  check(p2.includes('D-1023') && !p2.includes('D-1024'), 'Rows 1–23 on the first page');
  check(/06:30\s+12/.test(p2) && /08:40\s+15/.test(p2), 'Readings printed with their time in the yellow columns');
  check(new RegExp(`Page\\s+1\\s+of\\s+${n}`).test(texts[0]) && texts[0].includes('MSF28-6'), `Approval footer “Page 1 of ${n}”`);
  for (const p of [a, b]) execFileSync('pdftoppm', ['-r', '110', '-png', '-singlefile', '-f', String(p), '-l', String(p), pdfPath, path.join(outDir, `step3-page${p}`)]);

  // Phone: truck rows become cards, no horizontal scroll
  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'No horizontal scroll at phone width (390 px)');
  await page.locator('.sheet .rows').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'step3-trace-phone.png') });

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
