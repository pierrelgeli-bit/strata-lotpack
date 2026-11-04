/* Step 7 acceptance test: Finish & send — summary, files, recipient tickets, always CC,
   mail draft through Web Share (stubbed) and through mailto, JSON, send history.
   Run: node build/build.js && node test/step7.test.js   (files written to $OUT_DIR, default test/out) */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'dist', 'strata-lotpack.html');
const outDir = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const EXPECTED_BODY = [
  'Hi,', '',
  'Please find attached the lot pack for Pacific Hwy resurfacing – 03/11/2026.', '',
  'Attachments:', '- Lotpack_J-24017_2026-11-03.pdf', '- Lotpack_J-24017_2026-11-03.json', '',
  'Regards,', 'Pierre L.',
].join('\n');

async function open(ctx) {
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  await page.waitForSelector('html[data-ready="1"]');
  return { page, errors };
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lotpack-'));
  let ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1180, height: 950 }, acceptDownloads: true });
  let { page, errors } = await open(ctx);

  // ---- Settings: always CC + address book ----
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel(/Always in CC/).fill('qa@colas.com.au');
  await page.getByRole('button', { name: 'Add contact' }).click();
  let row = page.locator('.rows .trow:not(.thead)').last();
  await row.locator('input[data-key=name]').fill('Sam Taylor');
  await row.locator('input[data-key=email]').fill('sam.taylor@client.com.au');
  await page.getByRole('button', { name: 'Add contact' }).click();
  row = page.locator('.rows .trow:not(.thead)').last();
  await row.locator('input[data-key=name]').fill('Lab');
  await row.locator('input[data-key=email]').fill('lab@colas.com.au');
  await page.getByText('Saved').waitFor();
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.goto(url + '#/settings');
  await page.locator('.rows .trow:not(.thead)').first().waitFor();
  check(await page.locator('.rows .trow:not(.thead)').count() === 2 && await page.getByLabel(/Always in CC/).inputValue() === 'qa@colas.com.au', 'Address book and always CC kept after reload');

  // ---- Job + shift (date different from today: the subject uses the lotpack date) ----
  await page.getByRole('link', { name: 'Jobs' }).click();
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Client').fill('Transport for NSW');
  await page.getByLabel('Project Title').fill('Pacific Hwy resurfacing');
  await page.getByLabel('Job Number').fill('J-24017');
  await page.getByRole('button', { name: 'New shift' }).click();
  await page.locator('.shift-details').getByLabel('Date').fill('2026-11-03');
  await page.locator('.shift-details').getByLabel('Product').fill('AC14');
  await page.locator('.shift-details').getByLabel('Completed by').fill('Pierre L.');
  await page.getByText('Saved').waitFor();

  // ---- Finish & send screen ----
  await page.getByRole('button', { name: 'Finish & send' }).click();
  await page.waitForSelector('main[data-send-ready="1"]', { timeout: 30000 });
  const sum = await page.locator('.checklist-sum').innerText();
  check(['Approval to Proceed — MSF28-6', 'Site Diagram — MSF28-7', 'Asphalt Traceability — MSF28-10', 'Quantity & Placement — MSF28-11'].every((t) => sum.includes(t)) && sum.includes('Empty'), 'Summary lists every sheet with its state');
  check((await page.locator('.warn').innerText()).includes('Approval to Proceed not signed'), 'Warnings shown, nothing blocked');
  const files = await page.locator('.file-list').innerText();
  check(files.includes('Lotpack_J-24017_2026-11-03.pdf') && files.includes('Lotpack_J-24017_2026-11-03.json'), 'PDF and JSON prepared');
  check(await page.getByRole('button', { name: 'Share to Outlook' }).isHidden(), 'No file sharing on this browser: Share hidden, email draft offered');

  // Tickets: contacts + typed address
  check(await page.locator('.ticket').count() === 2, 'Address book contacts shown as tickets');
  await page.locator('.ticket', { hasText: 'Sam Taylor' }).click();
  check(await page.locator('.ticket.on').count() === 1, 'Tap selects a ticket');
  await page.getByLabel('Add an email address').fill('not-an-email');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  check(await page.getByText('Not a valid email address.').isVisible(), 'Invalid address refused');
  await page.getByLabel('Add an email address').fill('pm@client.com.au');
  await page.getByLabel('Add an email address').press('Enter');
  check(await page.locator('.ticket.on').count() === 2 && await page.locator('.ticket').count() === 3, 'Typed address becomes a selected ticket');
  check((await page.getByText(/Always in CC: qa@colas.com.au/).count()) === 1, 'Always CC shown');
  check(await page.locator('.mail-subject').innerText() === 'Subject: Lotpack – 03/11/2026', 'Subject = Lotpack – date of the lotpack');
  check(await page.locator('.mail-body').innerText() === EXPECTED_BODY, 'Body = generic English template');

  // mailto path: two downloads then the draft URL
  await page.evaluate(() => { window.__opened = []; SL.mail._open = (u) => window.__opened.push(u); });
  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.getByRole('button', { name: 'Email draft (attach manually)' }).click();
  await page.locator('.result.ok').waitFor();
  const opened = await page.evaluate(() => window.__opened);
  check(opened.length === 1 && opened[0].startsWith('mailto:'), 'Mail app opened with a mailto draft');
  const m = new URL(opened[0]);
  check(decodeURIComponent(m.pathname) === 'sam.taylor@client.com.au,pm@client.com.au', `To: ${decodeURIComponent(m.pathname)}`);
  check(m.searchParams.get('cc') === 'qa@colas.com.au', 'CC: always CC address');
  check(m.searchParams.get('subject') === 'Lotpack – 03/11/2026' && m.searchParams.get('body') === EXPECTED_BODY, 'Subject and body passed to the draft');
  await page.waitForTimeout(300);
  check(downloads.length === 2 && downloads.map((d) => d.suggestedFilename()).sort().join(',') === 'Lotpack_J-24017_2026-11-03.json,Lotpack_J-24017_2026-11-03.pdf', 'PDF and JSON downloaded to attach');
  const jsonPath = path.join(outDir, 'step7.json');
  await downloads.find((d) => d.suggestedFilename().endsWith('.json')).saveAs(jsonPath);
  await downloads.find((d) => d.suggestedFilename().endsWith('.pdf')).saveAs(path.join(outDir, 'step7.pdf'));
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  check(data.schemaVersion === 1 && data.app === 'strata-lotpack' && /T\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(data.exportedAt)
    && data.jobs.length === 1 && data.jobs[0].jobNumber === 'J-24017' && data.jobs[0].shifts.length === 1 && data.jobs[0].shifts[0].product === 'AC14', 'JSON: schema 1, one job, this shift');
  check((await page.locator('table.hist tbody tr').count()) === 1 && (await page.locator('table.hist').innerText()).includes('pm@client.com.au'), 'Send history entry (to, CC, time)');
  check((await page.locator('.ticket').first().innerText()).includes('Sam Taylor') || (await page.locator('.ticket').first().innerText()).includes('pm@client'), 'Recent recipients listed first');
  await page.screenshot({ path: path.join(outDir, 'step7-send-tablet.png'), fullPage: true });

  // Job screen: history + shift card
  await page.getByRole('link', { name: 'Pacific Hwy resurfacing' }).click();
  await page.getByRole('heading', { name: 'Job details' }).waitFor();
  await page.locator('table.hist').waitFor();
  check((await page.locator('table.hist').innerText()).includes('03/11/2026') && (await page.locator('.card').first().innerText()).includes('Draft emailed'), 'Job screen shows the send history');
  check(errors.length === 0, `No JS errors (mailto run)${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();

  // ---- Share path, with Web Share + clipboard stubbed as on a tablet ----
  ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1180, height: 950 } });
  await ctx.addInitScript(() => {
    window.__shareCalls = [];
    window.__clip = [];
    window.__shareMode = 'ok';
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => {
      if (window.__shareMode === 'cancel') throw new DOMException('cancelled', 'AbortError');
      window.__shareCalls.push({ title: d.title, text: d.text, files: d.files.map((f) => `${f.name}|${f.type}|${f.size}`) });
    };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip.push(t); } }, configurable: true });
  });
  ({ page, errors } = await open(ctx));
  await page.locator('.card').first().click();
  await page.locator('.card').first().click();
  await page.getByRole('button', { name: 'Finish & send' }).click();
  await page.waitForSelector('main[data-send-ready="1"]', { timeout: 30000 });
  check(await page.getByRole('button', { name: 'Share to Outlook' }).isVisible(), 'File sharing available: Share to Outlook shown');
  await page.locator('.ticket', { hasText: 'Lab' }).click();

  // Cancelled share: no draft logged
  await page.evaluate(() => { window.__shareMode = 'cancel'; });
  await page.getByRole('button', { name: 'Share to Outlook' }).click();
  await page.getByText('Sharing cancelled: no draft created.').waitFor();
  check(await page.locator('table.hist tbody tr').count() === 1, 'Cancelled share: nothing added to the history');

  await page.evaluate(() => { window.__shareMode = 'ok'; });
  await page.getByRole('button', { name: 'Share to Outlook' }).click();
  await page.locator('.result.ok').waitFor();
  const calls = await page.evaluate(() => window.__shareCalls);
  const clip = await page.evaluate(() => window.__clip);
  check(calls.length === 1 && calls[0].files.length === 2 && calls[0].files[0].startsWith('Lotpack_J-24017_2026-11-03.pdf|application/pdf|') && calls[0].files[1].startsWith('Lotpack_J-24017_2026-11-03.json|application/json|'), `Shared files: ${calls[0] && calls[0].files.join(', ')}`);
  check(calls[0].title === 'Lotpack – 03/11/2026' && calls[0].text === EXPECTED_BODY, 'Shared subject and body');
  check(clip[clip.length - 1] === 'To: lab@colas.com.au\nCC: qa@colas.com.au', `To / CC copied to the clipboard (${JSON.stringify(clip[clip.length - 1])})`);
  check((await page.locator('.result.ok').innerText()).includes('paste them in the draft'), 'User told to paste the addresses');
  check(await page.locator('table.hist tbody tr').count() === 2 && (await page.locator('table.hist tbody tr').first().innerText()).includes('Shared'), 'History: 2 drafts, latest by sharing');

  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'No horizontal scroll at phone width (390 px)');
  await page.screenshot({ path: path.join(outDir, 'step7-send-phone.png'), fullPage: true });

  check(errors.length === 0, `No JS errors (share run)${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
