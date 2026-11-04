/* Step 4 acceptance test: Site Diagram — freehand sketch, legends, added drawing pages, PDF.
   Run: node build/build.js && node test/step4.test.js   (PDF written to $OUT_DIR, default test/out) */
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

// Draw a polyline given in fractions of the drawing area
async function stroke(page, pts) {
  const area = page.locator('.sk-draw');
  await area.scrollIntoViewIfNeeded();
  const b = await area.boundingBox();
  const at = ([x, y]) => [b.x + x * b.width, b.y + y * b.height];
  await page.mouse.move(...at(pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...at(p), { steps: 8 });
  await page.mouse.up();
}
const strokesOf = (page, i) => page.evaluate(async (k) => (await SL.db.getAllJobs())[0].shifts[0].diagram.pages[k].strokes.length, i);

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-'));
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1180, height: 1000 }, acceptDownloads: true });
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
  const sd = page.locator('.shift-details');
  await sd.getByLabel('Suburb').fill('Coffs Harbour');
  await sd.getByLabel('Product').fill('AC14');
  await sd.getByLabel('Nominated thickness (mm)').fill('40');
  await sd.getByLabel('Completed by').fill('Pierre L.');
  // type of work / layer set in the Approval
  await page.locator('.sheet').getByText('Supply & Lay').click();
  await page.locator('.sheet').getByText('Wearing', { exact: true }).click();
  await page.getByRole('tab', { name: /Site Diagram/ }).click();
  const sheet = page.locator('.sheet');
  await sheet.locator('.sk-draw').waitFor();
  check(await page.locator('.tab.active .dot.st-empty').count() === 1, 'Site Diagram tab marked empty');
  check(await sheet.getByText('Supply & Lay').count() === 0 && await sheet.getByLabel(/Completed By/i).count() === 0, 'No header, type of work or Completed By in the sheet');
  check(await sheet.locator('fieldset.legend').count() === 1, 'Only Legend 1 at first');

  // Black medium: road edges
  await sheet.getByRole('button', { name: 'Colour #111111', exact: true }).click();
  await sheet.getByRole('button', { name: /Medium/ }).click();
  await stroke(page, [[0.08, 0.15], [0.08, 0.85]]);
  await stroke(page, [[0.45, 0.15], [0.45, 0.85]]);
  // Red thick: patch outline
  await sheet.getByRole('button', { name: 'Colour #d11f1f', exact: true }).click();
  await sheet.getByRole('button', { name: /Thick/ }).click();
  await stroke(page, [[0.15, 0.3], [0.38, 0.3], [0.38, 0.5], [0.15, 0.5], [0.15, 0.3]]);
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 3, '3 strokes saved');

  // Undo / redo
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 2, 'Undo removes the last stroke');
  await sheet.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 3, 'Redo brings it back');

  // Eraser across the second black line, then undo the erase
  await sheet.getByRole('button', { name: 'Eraser', exact: true }).click();
  await stroke(page, [[0.42, 0.6], [0.48, 0.6]]);
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 2, 'Eraser removes the stroke it crosses');
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 3, 'Undo restores the erased stroke');
  await sheet.getByRole('button', { name: 'Pen', exact: true }).click();

  // Full screen from the corner button, draw there, come back
  const normal = await sheet.locator('.sk-box').boundingBox();
  await sheet.getByRole('button', { name: 'Full screen drawing' }).click();
  check(await page.locator('.sk.full').count() === 1, 'Corner button opens the drawing full screen');
  const full = await page.locator('.sk.full .sk-box').boundingBox();
  const vp = page.viewportSize();
  check(full.height > normal.height + 50 && full.y + full.height <= vp.height + 1 && full.x >= 0 && full.x + full.width <= vp.width + 1, `Full screen area larger and inside the screen (${Math.round(normal.width)}×${Math.round(normal.height)} → ${Math.round(full.width)}×${Math.round(full.height)})`);
  check(Math.abs(full.width / full.height - normal.width / normal.height) < 0.01, 'Same proportions as the printed grid');
  await page.screenshot({ path: path.join(outDir, 'step4-fullscreen.png') });
  await stroke(page, [[0.6, 0.6], [0.9, 0.9]]);
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 4, 'Stroke drawn full screen saved');
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  check(await page.locator('.sk.full').count() === 0 && Math.abs((await sheet.locator('.sk-box').boundingBox()).width - normal.width) < 2, 'Same button exits full screen');
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 3, 'Undo works across the full screen switch');

  // Zoom: + twice (×2.25), the line drawn there is thinner in grid units (same thickness on screen)
  await sheet.getByRole('button', { name: /Thin/ }).click();
  await sheet.getByRole('button', { name: 'Zoom in' }).click();
  await sheet.getByRole('button', { name: 'Zoom in' }).click();
  check(await sheet.locator('.zoom-label').innerText() === '225 %', 'Zoom buttons (225 %)');
  await stroke(page, [[0.4, 0.4], [0.6, 0.6]]);
  await page.getByText('Saved').waitFor();
  const zw = await page.evaluate(async () => { const p = (await SL.db.getAllJobs())[0].shifts[0].diagram.pages[0]; return p.strokes[p.strokes.length - 1].w; });
  check(Math.abs(zw - 0.0022 / 2.25) < 1e-6, `Line drawn zoomed keeps its screen thickness (w = ${zw})`);
  await sheet.getByRole('button', { name: 'Fit', exact: true }).click();
  check(await sheet.locator('.zoom-label').innerText() === '100 %', 'Fit returns to 100 %');
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByText('Saved').waitFor();
  check(await strokesOf(page, 0) === 3, 'Zoomed test line undone');

  // Legends page 1: Mix / Depth / Layer from the shift, colour key
  const lg1 = sheet.locator('fieldset.legend').nth(0);
  check(await lg1.locator('input[data-key=mix]').inputValue() === 'AC14' && await lg1.locator('input[data-key=depth]').inputValue() === '40', 'Legend Mix and Depth prefilled from the shift');
  check(await lg1.getByRole('checkbox', { name: 'Wearing' }).isChecked(), 'Legend Layer pre-ticked like the Approval');
  await lg1.getByLabel('Area (m²)').fill('805');
  await lg1.getByLabel('Tonnes').fill('76.5');
  await sheet.getByRole('button', { name: '+ Legend' }).click();
  const lg2 = sheet.locator('fieldset.legend').nth(1);
  check(await lg2.locator('.tool.swatch.on').getAttribute('aria-label') === 'Legend 2 colour #1f4fd1', 'New legend gets a new colour');
  check(await sheet.locator('.sk-tools .tool.swatch.on').getAttribute('data-color') === '#1f4fd1', 'Pen takes the new legend colour');
  await lg2.locator('input[data-key=mix]').fill('AC10');
  await sheet.getByRole('button', { name: '+ Legend' }).click();
  const lg3 = sheet.locator('fieldset.legend').nth(2);
  await lg3.locator('input[data-key=mix]').fill('AC7 patch');
  await lg3.getByLabel('Tonnes').fill('5.5');
  await page.screenshot({ path: path.join(outDir, 'step4-diagram-tablet.png') });
  await page.getByText('Saved').waitFor();
  check(await page.locator('.tab.active .dot.st-complete').count() === 1, 'Site Diagram tab marked complete (1 page drawn + legend)');

  // Added drawing page with its own legends
  await sheet.getByRole('button', { name: '+ Add drawing page' }).click();
  check(await sheet.getByRole('tab', { name: /Page 2/ }).getAttribute('aria-selected') === 'true', 'Page 2 added and open');
  check(await page.locator('.tab.active .dot.st-progress').count() === 1, 'Tab back to in progress (page 2 empty)');
  await sheet.getByRole('button', { name: 'Colour #1f4fd1', exact: true }).click();
  await stroke(page, [[0.1, 0.2], [0.9, 0.2], [0.9, 0.7]]);
  await sheet.locator('fieldset.legend').nth(0).locator('input[data-key=mix]').fill('AC20');
  await sheet.locator('fieldset.legend').nth(0).getByLabel('Tonnes').fill('120');
  await page.getByText('Saved').waitFor();

  // A third page, then delete it
  await sheet.getByRole('button', { name: '+ Add drawing page' }).click();
  await sheet.getByRole('button', { name: 'Delete this page' }).click();
  await page.getByText('Saved').waitFor();
  check(await sheet.getByRole('tab', { name: /Page \d/ }).count() === 2, 'Added page can be deleted');

  // Reload: all kept
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.getByRole('tab', { name: /Site Diagram/ }).click();
  await page.locator('.sheet .sk-draw').waitFor();
  check(await strokesOf(page, 0) === 3 && await strokesOf(page, 1) === 1, 'Strokes of both pages kept after reload');
  check(await page.locator('.sheet fieldset.legend').count() === 3 && await page.locator('.sheet fieldset.legend').nth(1).locator('input[data-key=mix]').inputValue() === 'AC10', 'Legends kept after reload');

  // PDF: approval, diagram x2, traceability
  await page.getByRole('button', { name: 'Preview PDF' }).first().click();
  await page.waitForSelector('.modal[data-ready="1"]', { timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const pdfPath = path.join(outDir, 'step4-lotpack.pdf');
  await dl.saveAs(pdfPath);
  await page.getByRole('button', { name: 'Close' }).click();
  const info = execFileSync('pdfinfo', [pdfPath]).toString();
  check(/Pages:\s+6\b/.test(info), 'PDF has 6 pages (approval, 2 diagram pages, extra legends, traceability, quantities)');
  const pg = (n) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', pdfPath, '-']).toString();
  const p2 = pg(2), p3 = pg(3), p4 = pg(4);
  for (const s of ['Transport for NSW', 'Pacific Hwy resurfacing', 'J-24017', 'Coffs Harbour', 'AC14', 'Wearing', '805', '76.5', 'AC10', '40 mm', 'Pierre L.', 'MSF28-7 V2R3']) {
    check(p2.includes(s), `Diagram page 1 contains “${s}”`);
  }
  check(!p2.includes('AC7 patch'), 'Legend 3 not squeezed into the 2 printed legend cells');
  check(p3.includes('AC20') && p3.includes('Pierre L.') && p3.includes('MSF28-7 V2R3'), 'Added page: its own legend, Completed By from the shift, code MSF28-7');
  check(p4.includes('Legends (continued)') && p4.includes('AC7 patch') && p4.includes('5.5') && p4.includes('Wearing'), 'Legend 3 printed on the extra legends page');
  check(/Page\s+2\s+of\s+6/.test(p2) && /Page\s+3\s+of\s+6/.test(p3) && /Page\s+4\s+of\s+6/.test(p4) && pg(5).includes('MSF28-10') && pg(6).includes('MSF28-11'), 'Order 6, 7, 7, legends, 10, 11 and footers Page X of 6');
  execFileSync('pdftoppm', ['-r', '110', '-png', '-singlefile', '-f', '4', '-l', '4', pdfPath, path.join(outDir, 'step4-page4')]);

  // Strokes really drawn: coloured pixels inside the grid
  const ppm = path.join(outDir, 'step4-page2');
  execFileSync('pdftoppm', ['-r', '80', '-png', '-singlefile', '-f', '2', '-l', '2', pdfPath, ppm]);
  execFileSync('pdftoppm', ['-r', '110', '-png', '-singlefile', '-f', '3', '-l', '3', pdfPath, path.join(outDir, 'step4-page3')]);
  execFileSync('pdftoppm', ['-r', '110', '-png', '-singlefile', '-f', '2', '-l', '2', pdfPath, path.join(outDir, 'step4-page2-hd')]);
  const counts = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let red = 0, black = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 180 && d[i + 1] < 80 && d[i + 2] < 80) red++;
      if (d[i] < 50 && d[i + 1] < 50 && d[i + 2] < 50) black++;
    }
    return { red, black };
  }, fs.readFileSync(ppm + '.png').toString('base64'));
  check(counts.red > 300, `Red sketch drawn in the PDF (${counts.red} px)`);

  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'No horizontal scroll at phone width (390 px)');
  await page.locator('.sheet .sk-tools').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'step4-diagram-phone.png') });

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
