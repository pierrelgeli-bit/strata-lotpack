/* Step 8 acceptance test: JSON export / import — round trip without loss between two devices,
   merge by id (most recent wins), conflict report, device settings untouched, invalid files refused.
   Two Chromium profiles play the two tablets.
   Run: node build/build.js && node test/step8.test.js   (files written to $OUT_DIR, default test/out) */
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
const errors = [];

async function device(name) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `lotpack-${name}-`));
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1180, height: 950 }, acceptDownloads: true });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  await page.waitForSelector('html[data-ready="1"]');
  return { ctx, page, profile };
}

async function settings(page) {
  await page.goto(url + '#/settings');
  await page.getByRole('heading', { name: 'Data' }).waitFor();
}

async function exportAll(page, file) {
  await settings(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all data (JSON)' }).click()]);
  const p = path.join(outDir, file);
  await dl.saveAs(p);
  return { path: p, name: dl.suggestedFilename() };
}

async function importFile(page, file, applyIt = true) {
  await settings(page);
  await page.locator('input[type=file]').setInputFiles(file);
  const rep = page.locator('.import-report');
  await rep.locator('p, strong').first().waitFor();
  const text = await rep.innerText();
  if (applyIt && await page.getByRole('button', { name: 'Apply import' }).count()) {
    await page.getByRole('button', { name: 'Apply import' }).click();
    await page.locator('.import-report.ok').waitFor();
  }
  return text;
}

const dump = (page) => page.evaluate(async () => JSON.stringify((await SL.db.getAllJobs()).sort((a, b) => a.id.localeCompare(b.id))));
const pdfText = async (page) => {
  const b64 = await page.evaluate(async () => {
    const job = (await SL.db.getAllJobs()).find((j) => j.jobNumber === 'J-24017');
    const shift = job.shifts.find((s) => s.date === '2026-11-03');
    const bytes = await SL.pdf.build(job, shift);
    let bin = ''; bytes.forEach((x) => { bin += String.fromCharCode(x); });
    return btoa(bin);
  });
  const f = path.join(outDir, `step8-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  // drop the creation date line of the metadata: compare what is printed
  return execFileSync('pdftotext', ['-layout', f, '-']).toString();
};

(async () => {
  const A = await device('A');
  const B = await device('B');

  // ---- Device A: a full lotpack (every sheet), contacts, its own settings ----
  await A.page.evaluate(async () => {
    const job = SL.schema.newJob();
    Object.assign(job, { client: 'Transport for NSW', projectTitle: 'Pacific Hwy resurfacing', jobNumber: 'J-24017', suburb: 'Coffs Harbour', supplyingPlant: 'Boral', haulageKm: 12 });
    const s = SL.schema.newShift(job, {});
    Object.assign(s, { date: '2026-11-03', product: 'AC14', nominatedThickness: 40, completedBy: 'Pierre L.', workType: ['supplyLay'], layer: ['wearing'], weather: 'Fine' });
    // a real PNG signature drawn in a canvas
    const c = document.createElement('canvas'); c.width = 200; c.height = 60;
    const x = c.getContext('2d'); x.strokeStyle = '#0d2a8c'; x.lineWidth = 3; x.beginPath(); x.moveTo(10, 40); x.bezierCurveTo(60, 0, 120, 70, 190, 20); x.stroke();
    const sig = c.toDataURL('image/png');
    const a = SL.forms.approval.ensure(s);
    Object.assign(a.checks, { plant: true, plantRisk: true, surface: true });
    a.comments = 'Dry, 18 °C.';
    a.colasSign = { name: 'Pierre L.', signature: sig, dateTime: '2026-11-03T06:10' };
    a.clientSign = { name: 'Sam Taylor', signature: sig, position: 'Site Engineer', dateTime: '2026-11-03T06:20' };
    const d = SL.forms.diagram.ensure(s);
    d.pages[0].strokes.push({ c: '#d11f1f', w: 0.009, p: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.4]] });
    d.pages[0].legends[0] = { key: 'A', mix: 'AC14', layer: 'Wearing', depth: '40', area: 805, tonnes: 76.5 };
    const t = SL.forms.traceability.ensure(s);
    for (let i = 1; i <= 25; i++) t.loads.push({ no: i, docket: `D-${1000 + i}`, tonnes: 12, progress: null, tipTime: `0${7 + Math.floor(i / 10)}:${String((i * 6) % 60).padStart(2, '0')}`, temp: 150, chStart: 1000 + i * 50, chEnd: 1050 + i * 50, run: 1, width: 3.5, comment: '' });
    t.envReadings.push({ time: '06:30', windKmh: 12, pavementTemp: 18 });
    t.lotSummary.m2Paved = 805;
    t.qa = { tempsRecorded: 'yes', dipsRecorded: 'yes', labDiscussed: 'no' };
    SL.forms.traceability.computeProgress(t);
    const dip = SL.forms.dip.add(s);
    Object.assign(dip, { mixType: 'AC14', lowerLimit: 40, upperLimit: 55 });
    dip.courses[0].course = 'WC';
    dip.courses[0].readings.push({ ch: 1000, l: 48, c: 50, r: 47 });
    const sv = SL.forms.survey.add(s);
    sv.surveyBy = 'client';
    const q = SL.forms.quantities.ensure(s);
    q.payItems[1].waste = 0.3;
    q.colasSign = { name: 'Pierre L.', signature: sig, date: '2026-11-03' };
    job.shifts.push(s);
    await SL.db.putJob(job);
    await SL.db.putMeta('contacts', [{ name: 'Sam Taylor', email: 'sam@client.com.au', lastUsed: '2026-11-03T08:00:00.000Z' }]);
    await SL.db.putMeta('settings', { ...SL.schema.defaultSettings(), theme: 'light', alwaysCc: 'qa@colas.com.au', defaultCompletedBy: 'Pierre L.' });
  });
  await A.page.reload(); await A.page.waitForSelector('html[data-ready="1"]');

  // ---- Device B: its own settings and contact ----
  await B.page.evaluate(async () => {
    await SL.db.putMeta('settings', { ...SL.schema.defaultSettings(), theme: 'dark', alwaysCc: 'b-team@colas.com.au', defaultCompletedBy: 'Alex' });
    await SL.db.putMeta('contacts', [{ name: 'Lab', email: 'lab@colas.com.au', lastUsed: null }]);
  });
  await B.page.reload(); await B.page.waitForSelector('html[data-ready="1"]');

  // ---- 1. Export A, import into B: everything arrives, nothing lost ----
  const expA1 = await exportAll(A.page, 'step8-A1.json');
  check(/^Strata-Lotpack_export_\d{4}-\d{2}-\d{2}\.json$/.test(expA1.name), `Export file name ${expA1.name}`);
  const dataA1 = JSON.parse(fs.readFileSync(expA1.path, 'utf8'));
  check(dataA1.schemaVersion === 1 && dataA1.app === 'strata-lotpack' && dataA1.jobs.length === 1 && dataA1.contacts.length === 1 && dataA1.settings.alwaysCc === 'qa@colas.com.au', 'Export holds jobs, contacts and settings');
  const rep1 = await importFile(B.page, expA1.path);
  check(rep1.includes('1 job(s) added, 1 shift(s) added, 0 replaced, 0 kept') && rep1.includes('1 contact(s) added'), 'Report before applying: 1 job + 1 shift + 1 contact added');
  check(await dump(A.page) === await dump(B.page), 'Round trip A → B: jobs identical byte for byte (signatures, sketch, 25 trucks, dip, survey, quantities)');
  const pdfA = await pdfText(A.page);
  const pdfB = await pdfText(B.page);
  check(pdfA === pdfB && pdfA.includes('D-1025') && pdfA.includes('Sam Taylor'), 'Same PDF text on both devices (every page)');
  const bState = await B.page.evaluate(async () => ({ s: await SL.db.getMeta('settings'), c: await SL.db.getMeta('contacts') }));
  check(bState.s.theme === 'dark' && bState.s.alwaysCc === 'b-team@colas.com.au' && bState.s.defaultCompletedBy === 'Alex', 'Settings of device B not overwritten');
  check(bState.c.map((c) => c.email).sort().join(',') === 'lab@colas.com.au,sam@client.com.au', 'Contacts merged by email');

  // Same file again: nothing to do
  const rep1b = await importFile(B.page, expA1.path, false);
  check(rep1b.includes('Nothing to apply'), 'Importing the same file again: nothing to do');

  // ---- 2. Both devices work: B edits shift 1, A adds shift 2 ----
  await B.page.evaluate(async () => {
    const job = (await SL.db.getAllJobs())[0];
    job.shifts[0].product = 'AC14 (edited on B)';
    SL.db.touch(job, job.shifts[0]);
    await SL.db.flush();
  });
  await A.page.evaluate(async () => {
    const job = (await SL.db.getAllJobs())[0];
    const s2 = SL.schema.newShift(job, {}); s2.date = '2026-11-04'; s2.product = 'AC10';
    job.shifts.push(s2); SL.db.touch(job, s2); await SL.db.flush();
  });
  const expB2 = await exportAll(B.page, 'step8-B2.json');
  const rep2 = await importFile(A.page, expB2.path);
  check(rep2.includes('Shift 03/11/2026') && rep2.includes('Replaced by the imported version (newer)'), 'B → A: shift 03/11 replaced by the newer B version (reported)');
  const a2 = JSON.parse(await dump(A.page))[0];
  check(a2.shifts.length === 2 && a2.shifts.find((s) => s.date === '2026-11-03').product === 'AC14 (edited on B)' && a2.shifts.find((s) => s.date === '2026-11-04').product === 'AC10', 'A keeps its new shift 04/11 and gets the B edit');

  const expA3 = await exportAll(A.page, 'step8-A3.json');
  const rep3 = await importFile(B.page, expA3.path);
  check(rep3.includes('1 shift(s) added') && rep3.includes('Shift 04/11/2026'), 'A → B: shift 04/11 added');
  check(await dump(A.page) === await dump(B.page), 'After both imports A and B hold the same data');

  // ---- 3. Conflict where this device is newer: an old file does not overwrite ----
  await A.page.evaluate(async () => {
    const job = (await SL.db.getAllJobs())[0];
    const s = job.shifts.find((x) => x.date === '2026-11-03');
    s.weather = 'Rain at 05:00 (edited on A, after the B export)';
    SL.db.touch(job, s); await SL.db.flush();
  });
  const rep4 = await importFile(A.page, expB2.path);
  check(rep4.includes('Kept this device version (newer)'), 'Older file: the newer version of this device is kept (reported)');
  check(/\d\d:\d\d:\d\d/.test(rep4) && rep4.includes('same or newer data'), 'Report shows times with seconds and says the device is newer');
  const a4 = JSON.parse(await dump(A.page))[0];
  check(a4.shifts.find((s) => s.date === '2026-11-03').weather.startsWith('Rain at 05:00'), 'Newer local data not overwritten');
  await A.page.screenshot({ path: path.join(outDir, 'step8-import-report.png'), fullPage: true });

  // ---- 4. Single job export (Job screen) imports too ----
  await B.page.goto(url + '#/');
  await B.page.locator('.card').first().click();
  const [dlJob] = await Promise.all([B.page.waitForEvent('download'), B.page.getByRole('button', { name: 'Export job (JSON)' }).click()]);
  const jobFile = path.join(outDir, 'step8-job.json');
  await dlJob.saveAs(jobFile);
  check(/^Strata-Lotpack_J-24017_\d{4}-\d{2}-\d{2}\.json$/.test(dlJob.suggestedFilename()), `Job export ${dlJob.suggestedFilename()}`);
  const C = await device('C');
  const rep5 = await importFile(C.page, jobFile);
  check(rep5.includes('1 job(s) added, 2 shift(s) added'), 'Job export imported on a third device');

  // ---- 5. Invalid files refused ----
  const bad = (name, content) => { const p = path.join(outDir, name); fs.writeFileSync(p, content); return p; };
  check((await importFile(C.page, bad('bad1.json', '{not json'), false)).includes('Import refused: This file is not valid JSON.'), 'Broken JSON refused');
  check((await importFile(C.page, bad('bad2.json', JSON.stringify({ app: 'other', jobs: [] })), false)).includes('not a Strata Lotpack export'), 'Other app refused');
  check((await importFile(C.page, bad('bad3.json', JSON.stringify({ app: 'strata-lotpack', schemaVersion: 99, jobs: [] })), false)).includes('newer version of the app'), 'Newer schema refused');

  // Phone width on the report
  await A.page.setViewportSize({ width: 390, height: 844 });
  check(!(await A.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'No horizontal scroll at phone width (390 px)');

  check(errors.length === 0, `No JS errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  for (const d of [A, B, C]) { await d.ctx.close(); fs.rmSync(d.profile, { recursive: true, force: true }); }
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
