/* Step 6 acceptance test: Quantity & Placement — items, prefill from traceability, Qty Used, signatures, PDF.
   Run: node build/build.js && node test/step6.test.js   (PDF written to $OUT_DIR, default test/out) */
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
  for (let i = 0; i <= 20; i++) await page.mouse.move(b.x + 30 + i * 10, b.y + b.height * (0.5 + 0.25 * Math.sin(i / 2.5)), { steps: 2 });
  await page.mouse.up();
}

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
  await page.getByLabel('Suburb').fill('Coffs Harbour');
  await page.getByLabel('Supplying Plant').fill('Boral Coffs Harbour');
  await page.getByLabel('Haulage (km)').fill('12');
  await page.getByRole('button', { name: 'New shift' }).click();
  await page.locator('.shift-details').getByLabel('Product').fill('AC14');
  await page.getByText('Saved').waitFor();

  // Traceability data: 2 trucks (24.3 t), 805 m², supply & lay / wearing
  await page.evaluate(async () => {
    const job = (await SL.db.getAllJobs())[0];
    const s = job.shifts[0];
    s.workType = ['supplyLay']; s.layer = ['wearing'];
    const t = SL.forms.traceability.ensure(s);
    t.loads.push({ no: 1, docket: 'D-1', tonnes: 12.5, tipTime: '07:00' }, { no: 2, docket: 'D-2', tonnes: 11.8, tipTime: '07:12' });
    t.lotSummary.m2Paved = 805;
    await SL.db.putJob(job);
  });
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.getByRole('tab', { name: /Quantity & Placement/ }).click();
  const sheet = page.locator('.sheet');
  await sheet.locator('.items').first().waitFor();
  check(await page.locator('.tab.active .dot.st-empty').count() === 1, 'Quantity tab marked empty (prefilled values do not count)');

  const pay = sheet.locator('.items').nth(0).locator('.trow:not(.thead)');
  const con = sheet.locator('.items').nth(1).locator('.trow:not(.thead)');
  const val = (row, key) => row.locator(`input[data-key=${key}]`).inputValue();
  check(await sheet.locator('input[data-key=workDescription]').inputValue() === 'Supply & Lay – Wearing', 'Work Description built from type of work and layer');
  check(await sheet.locator('input[data-key=supplyingPlant]').inputValue() === 'Boral Coffs Harbour', 'Supplying Plant from the job');
  const r1 = pay.nth(1);
  check(await val(r1, 'detail') === 'AC14' && await val(r1, 'unit') === 't', 'First Supply, Deliver, Lay: product and unit prefilled');
  check(await val(r1, 'qtyDelivered') === '24.3' && await val(r1, 'm2Paved') === '805', 'QTY Delivered (24.3) and m² (805) prefilled from traceability');
  check(await val(r1, 'qtyUsed') === '', 'Qty Used empty until Waste is entered');
  await r1.locator('input[data-key=waste]').fill('0.3');
  await r1.locator('input[data-key=no]').click();
  check(await val(r1, 'qtyUsed') === '24', 'Qty Used = 24.3 − 0.3 = 24');

  // Establishment: Crew + MTV
  await pay.nth(0).getByText('Crew', { exact: true }).click();
  await pay.nth(0).getByText('MTV', { exact: true }).click();
  await pay.nth(0).locator('input[data-key=no]').fill('1.1');
  // Second Supply, Deliver, Lay typed by hand
  const r2 = pay.nth(2);
  await r2.locator('input[data-key=detail]').fill('AC10');
  await r2.locator('input[data-key=unit]').fill('t');
  await r2.locator('input[data-key=qtyDelivered]').fill('5');
  await r2.locator('input[data-key=waste]').fill('0.5');
  await r2.locator('input[data-key=no]').click();
  check(await val(r2, 'qtyUsed') === '4.5', 'Qty Used = 5 − 0.5 = 4.5 on a typed row');
  // Typed Qty Used wins over the calculation
  await r2.locator('input[data-key=qtyUsed]').fill('4.4');
  await r2.locator('input[data-key=no]').click();
  check(await val(r2, 'qtyUsed') === '4.4', 'Typed Qty Used kept');
  // Tack coat + a free pay row
  await pay.nth(4).locator('input[data-key=detail]').fill('CRS60');
  await pay.nth(4).locator('input[data-key=unit]').fill('L');
  await pay.nth(4).locator('input[data-key=qtyDelivered]').fill('300');
  await pay.nth(5).locator('input[data-key=no]').fill('99');
  await pay.nth(5).locator('input[data-key=description]').fill('Line marking reinstatement');
  await pay.nth(5).locator('input[data-key=unit]').fill('m');
  await pay.nth(5).locator('input[data-key=qtyDelivered]').fill('120');
  // Contractors items
  await con.nth(0).locator('input[data-key=detail]').fill('1.0');
  await con.nth(0).locator('input[data-key=unit]').fill('hr');
  await con.nth(0).locator('input[data-key=qtyDelivered]').fill('6');
  await con.nth(3).locator('input[data-key=unit]').fill('hr');
  await con.nth(3).locator('input[data-key=qtyDelivered]').fill('8');
  await con.nth(7).locator('input[data-key=description]').fill('Sweeper hire');
  await sheet.getByLabel('Variations (e.g. Handwork, Change in depth)').fill('Handwork around 4 pits, 2 m².');
  await sheet.getByLabel('Additional Comments').fill('Night works, lane closure 21:00 – 05:00.');
  check(await page.locator('.tab.active .dot.st-progress').count() === 1, 'Quantity tab in progress');

  // Signatures
  await sheet.getByLabel('COLAS Representative').fill('Pierre L.');
  await sign(page, 0);
  check(/^\d{4}-\d{2}-\d{2}$/.test(await sheet.locator('.field', { hasText: 'Date' }).locator('input[type=date]').nth(1).inputValue()), 'Signing fills the date');
  await sheet.getByLabel('Client Representative').fill('Sam Taylor');
  await sheet.getByLabel('Position').fill('Site Engineer');
  await sign(page, 1);
  await page.getByText('Saved').waitFor();
  check(await page.locator('.tab.active .dot.st-complete').count() === 1, 'Quantity tab complete once both signed');
  await page.screenshot({ path: path.join(outDir, 'step6-qty-tablet.png') });

  // Reload
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.getByRole('tab', { name: /Quantity & Placement/ }).click();
  await page.locator('.sheet .items').first().waitFor();
  const p1 = page.locator('.sheet .items').nth(0).locator('.trow:not(.thead)');
  check(await p1.nth(1).locator('input[data-key=qtyUsed]').inputValue() === '24' && await p1.nth(2).locator('input[data-key=qtyUsed]').inputValue() === '4.4', 'Values kept after reload');

  // PDF
  await page.getByRole('button', { name: 'Preview PDF' }).last().click();
  await page.waitForSelector('.modal[data-ready="1"]', { timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const pdfPath = path.join(outDir, 'step6-lotpack.pdf');
  await dl.saveAs(pdfPath);
  await page.getByRole('button', { name: 'Close' }).click();
  const n = Number((execFileSync('pdfinfo', [pdfPath]).toString().match(/Pages:\s+(\d+)/) || [])[1]);
  const texts = Array.from({ length: n }, (_, k) => execFileSync('pdftotext', ['-f', String(k + 1), '-l', String(k + 1), '-layout', pdfPath, '-']).toString());
  const codes = texts.map((t) => (t.match(/MSF28-\d+/) || ['?'])[0]);
  check(codes.join(',') === 'MSF28-6,MSF28-7,MSF28-10,MSF28-11', `PDF order ${codes.join(', ')} (quantities last)`);
  const qt = texts[n - 1];
  for (const s of ['Transport for NSW', 'Pacific Hwy resurfacing', 'J-24017', 'Coffs Harbour', 'Supply & Lay – Wearing', 'Boral Coffs Harbour', '12',
    'AC14', '24.3', '0.3', '805', 'AC10', '4.4', 'CRS60', '300', 'Line marking reinstatement', '120', '1.0', 'Sweeper hire',
    'Handwork around 4 pits', 'lane closure', 'Pierre L.', 'Sam Taylor', 'Site Engineer', 'MSF28-11 V2R4']) {
    check(qt.includes(s), `Quantity page contains “${s}”`);
  }
  check(/\b24\b/.test(qt), 'Qty Used 24 printed');
  check(new RegExp(`Page\\s+${n}\\s+of\\s+${n}`).test(qt), `Footer “Page ${n} of ${n}”`);
  const imgs = execFileSync('pdfimages', ['-f', String(n), '-l', String(n), '-list', pdfPath]).toString().split('\n').filter((l) => /\bimage\b/.test(l));
  check(imgs.length >= 3, `Quantity page holds logo + 2 signatures (${imgs.length} images)`);
  execFileSync('pdftoppm', ['-r', '110', '-png', '-singlefile', '-f', String(n), '-l', String(n), pdfPath, path.join(outDir, 'step6-qty')]);

  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'No horizontal scroll at phone width (390 px)');
  await page.locator('.sheet .items').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'step6-qty-phone.png') });

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
