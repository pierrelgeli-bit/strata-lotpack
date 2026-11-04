/* Entry point: router and screens (Jobs, Job, Shift, Settings) */
(function (SL) {
  'use strict';

  const { h, field, button } = SL.ui;
  const { formatDate } = SL.schema;
  const app = document.getElementById('app');

  const state = { settings: SL.schema.defaultSettings(), contacts: [], shiftTab: {} };

  // Base sheets of every shift, in PDF order. Optional sheets come in later steps.
  const SHEETS = [
    { key: 'approval', code: 'MSF28-6', name: 'Approval to Proceed' },
    { key: 'diagram', code: 'MSF28-7', name: 'Site Diagram' },
    { key: 'traceability', code: 'MSF28-10', name: 'Asphalt Traceability' },
    { key: 'quantities', code: 'MSF28-11', name: 'Quantity & Placement' },
  ];

  // ---- Theme -----------------------------------------------------------
  const THEMES = ['system', 'light', 'dark'];
  const THEME_LABEL = { system: 'Auto', light: 'Day', dark: 'Night' };

  function applyTheme() {
    const t = state.settings.theme || 'system';
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    const btn = document.getElementById('theme-btn');
    btn.textContent = THEME_LABEL[t];
    btn.title = `Theme: ${THEME_LABEL[t]} (tap to change)`;
  }

  function saveSettings() {
    return SL.db.saveMeta('settings', state.settings);
  }

  document.getElementById('theme-btn').addEventListener('click', () => {
    const i = THEMES.indexOf(state.settings.theme || 'system');
    state.settings.theme = THEMES[(i + 1) % THEMES.length];
    applyTheme();
    saveSettings();
    if (location.hash === '#/settings') render();
  });

  // ---- Save indicator --------------------------------------------------
  const saveEl = document.getElementById('save-state');
  SL.db.onSaveState((s) => {
    saveEl.textContent = s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved' : 'Not saved!';
    saveEl.style.color = s === 'error' ? 'var(--danger)' : '';
  });

  // ---- Helpers ---------------------------------------------------------
  const jobTitle = (job) => job.projectTitle || job.jobNumber || 'Untitled job';
  const crumbs = (...parts) => h('div', { class: 'crumbs' }, parts.map((p, i) => [i ? ' / ' : '', p]));
  const go = (hash) => { location.hash = hash; };

  function notFound(msg) {
    app.replaceChildren(h('p', { class: 'empty' }, msg), h('p', { class: 'empty' }, h('a', { href: '#/' }, 'Back to jobs')));
  }

  // ---- Screens ---------------------------------------------------------
  async function renderJobs() {
    const jobs = await SL.db.getAllJobs();
    jobs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    const newJob = async () => {
      const job = SL.schema.newJob();
      await SL.db.putJob(job);
      go(`#/job/${job.id}`);
    };

    app.replaceChildren(
      h('div', { class: 'row-head' }, h('h1', {}, 'Jobs'), button('New job', newJob, 'primary')),
      jobs.length
        ? h('div', { class: 'cards' }, jobs.map((job) => h('a', { class: 'card', href: `#/job/${job.id}` },
          h('div', { class: 'title' }, jobTitle(job)),
          h('div', { class: 'meta' }, [job.jobNumber, job.client, job.suburb].filter(Boolean).join(' · ') || 'No details yet'),
          h('div', { class: 'meta' }, `${job.shifts.length} shift${job.shifts.length === 1 ? '' : 's'}`))))
        : h('p', { class: 'empty' }, 'No jobs yet. Tap “New job” to start.'),
    );
  }

  async function renderJob(jobId) {
    const job = await SL.db.getJob(jobId);
    if (!job) return notFound('This job no longer exists.');
    const save = () => { SL.db.touch(job); titleEl.textContent = jobTitle(job); };
    const titleEl = h('h1', {}, jobTitle(job));

    const newShift = async () => {
      const shift = SL.schema.newShift(job, state.settings);
      job.shifts.push(shift);
      job.updatedAt = shift.createdAt;
      await SL.db.putJob(job);
      go(`#/job/${job.id}/shift/${shift.id}`);
    };

    const delJob = async () => {
      if (!confirm(`Delete job “${jobTitle(job)}” and its ${job.shifts.length} shift(s)? This cannot be undone.`)) return;
      await SL.db.flush();
      await SL.db.deleteJob(job.id);
      go('#/');
    };

    const shifts = job.shifts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    app.replaceChildren(
      crumbs(h('a', { href: '#/' }, 'Jobs'), jobTitle(job)),
      titleEl,
      h('section', { class: 'panel' },
        h('h2', {}, 'Job details'),
        h('div', { class: 'grid' },
          field('Client', job, 'client', save),
          field('Project Title', job, 'projectTitle', save),
          field('Job Number', job, 'jobNumber', save),
          field('Suburb', job, 'suburb', save),
          field('Supplying Plant', job, 'supplyingPlant', save),
          field('Haulage (km)', job, 'haulageKm', save, { type: 'number' }))),
      h('section', { class: 'panel' },
        h('div', { class: 'row-head' }, h('h2', {}, 'Shifts'), button('New shift', newShift, 'primary')),
        shifts.length
          ? h('div', { class: 'cards' }, shifts.map((s) => h('a', { class: 'card', href: `#/job/${job.id}/shift/${s.id}` },
            h('div', { class: 'title' }, formatDate(s.date) || 'No date'),
            h('div', { class: 'meta' }, [s.product, s.completedBy].filter(Boolean).join(' · ') || 'No details yet'),
            h('div', { class: 'meta' }, lastSent(s) ? `Draft emailed ${fmtStamp(lastSent(s).sentAt)}` : 'Not sent yet'))))
          : h('p', { class: 'empty' }, 'No shifts yet. One shift = one lotpack.')),
      h('section', { class: 'panel' },
        h('h2', {}, 'Send history'),
        (() => {
          const rows = job.shifts.flatMap((s) => (s.sendLog || []).filter((e) => e && e.sentAt).map((e) => ({ s, e })))
            .sort((a, b) => b.e.sentAt.localeCompare(a.e.sentAt));
          return rows.length
            ? h('table', { class: 'hist' },
              h('thead', {}, h('tr', {}, ['Shift', 'Draft created', 'By', 'To', 'CC'].map((t) => h('th', {}, t)))),
              h('tbody', {}, rows.map(({ s, e }) => h('tr', {},
                h('td', {}, formatDate(s.date)), h('td', {}, fmtStamp(e.sentAt)), h('td', {}, e.sentBy || ''),
                h('td', {}, (e.to || []).join('; ')), h('td', {}, (e.cc || []).join('; '))))))
            : h('p', { class: 'muted' }, 'No lotpack emailed yet.');
        })()),
      h('div', { class: 'actions' },
        button('Export job (JSON)', async () => {
          await SL.db.flush();
          const fresh = await SL.db.getJob(job.id);
          const safe = (x) => String(x || '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
          SL.io.download(SL.io.exportJob(fresh), `Strata-Lotpack_${safe(job.jobNumber || job.projectTitle || 'job')}_${SL.schema.todayIso()}.json`);
        }),
        button('Delete job', delJob, 'danger')),
    );
  }

  // Base sheets, then the optional Dip / Survey Records added to the shift (PDF order)
  function sheetList(shift) {
    const F = SL.forms || {};
    return [
      ...SHEETS.map((s) => ({ ...s, form: F[s.key] })),
      ...['dip', 'survey'].filter((k) => F[k]).flatMap((k) => F[k].records(shift).map((rec) => ({
        key: `${k}:${rec.id}`, code: F[k].code, name: F[k].label(shift, rec), form: F[k], rec,
      }))),
    ];
  }
  const allWarnings = (job, shift) => Object.values(SL.forms || {})
    .flatMap((f) => [].concat(f.warning ? f.warning(job, shift) : [])).filter(Boolean);
  const fmtStamp = (iso) => (iso ? `${formatDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '');
  // Local time with seconds (import report: two versions can differ by a few seconds)
  const fmtStampSec = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const lastSent = (shift) => (shift.sendLog || []).filter((e) => e && e.sentAt).slice(-1)[0];

  async function renderShift(jobId, shiftId) {
    const job = await SL.db.getJob(jobId);
    const shift = job && job.shifts.find((s) => s.id === shiftId);
    if (!shift) return notFound('This shift no longer exists.');
    const save = () => { SL.db.touch(job, shift); dateCrumb.textContent = formatDate(shift.date) || 'No date'; };
    const dateCrumb = h('span', {}, formatDate(shift.date) || 'No date');

    const F = SL.forms || {};
    const sheets = sheetList(shift);
    const tab = state.shiftTab[shift.id] || sheets[0].key;
    const sheet = sheets.find((s) => s.key === tab) || sheets[0];
    const form = sheet.form;

    // Completeness dot on each tab, refreshed as the sheet is filled
    const STATUS_LABEL = { empty: 'Empty', progress: 'In progress', complete: 'Complete' };
    const statusOf = (s) => (s.form ? s.form.status(job, shift, s.rec) : 'empty');
    const tabEls = sheets.map((s) => {
      const dot = h('i', { class: 'dot' });
      const el = h('button', {
        type: 'button', role: 'tab', class: `tab${s.key === sheet.key ? ' active' : ''}`,
        'aria-selected': s.key === sheet.key ? 'true' : 'false',
        onclick: () => { state.shiftTab[shift.id] = s.key; renderShift(jobId, shiftId); },
      }, h('span', {}, dot, s.name), h('small', {}, s.code));
      el.refresh = () => { const st = statusOf(s); dot.className = `dot st-${st}`; dot.title = STATUS_LABEL[st]; };
      el.refresh();
      return el;
    });
    // Optional sheets are added on demand
    const addRecord = (k) => {
      const rec = F[k].add(shift);
      SL.db.touch(job, shift);
      state.shiftTab[shift.id] = `${k}:${rec.id}`;
      renderShift(jobId, shiftId);
    };
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, tabEls,
      F.dip ? h('button', { type: 'button', class: 'tab add-tab', onclick: () => addRecord('dip') }, '+ Dip Record', h('small', {}, 'MSF28-9')) : null,
      F.survey ? h('button', { type: 'button', class: 'tab add-tab', onclick: () => addRecord('survey') }, '+ Survey Record', h('small', {}, 'MSF28-12')) : null);

    // Non-blocking warnings (e.g. approval not signed)
    const warnEl = h('div', { class: 'warn', role: 'status' });
    const refreshWarnings = () => {
      const msgs = allWarnings(job, shift);
      warnEl.replaceChildren(...msgs.map((m) => h('div', {}, '⚠ ', m)));
      warnEl.hidden = !msgs.length;
    };
    refreshWarnings();
    // Time-based reminders (2 h readings) refresh every minute while this screen is open
    const timer = setInterval(() => { if (!warnEl.isConnected) clearInterval(timer); else refreshWarnings(); }, 60000);

    const saveSheet = () => {
      SL.db.touch(job, shift);
      tabEls.forEach((t) => t.refresh());
      refreshWarnings();
    };

    const delShift = async () => {
      if (!confirm(`Delete the shift of ${formatDate(shift.date)}? This cannot be undone.`)) return;
      job.shifts = job.shifts.filter((s) => s.id !== shift.id);
      SL.db.touch(job);
      await SL.db.flush();
      go(`#/job/${job.id}`);
    };

    app.replaceChildren(
      crumbs(h('a', { href: '#/' }, 'Jobs'), h('a', { href: `#/job/${job.id}` }, jobTitle(job)), dateCrumb),
      h('section', { class: 'panel shift-details' },
        h('h2', {}, 'Shift'),
        h('div', { class: 'grid' },
          field('Date', shift, 'date', save, { type: 'date' }),
          field('Product', shift, 'product', save),
          field('Nominated thickness (mm)', shift, 'nominatedThickness', save, { type: 'number' }),
          field('Completed by', shift, 'completedBy', save))),
      warnEl,
      tabs,
      h('section', { class: 'panel', role: 'tabpanel' },
        h('div', { class: 'row-head' },
          h('h2', {}, `${sheet.name} — ${sheet.code}`),
          form ? button('Preview PDF', () => previewPdf(job, shift)) : null),
        form
          ? form.render(job, shift, saveSheet, sheet.rec, () => { state.shiftTab[shift.id] = 'approval'; renderShift(jobId, shiftId); })
          : h('p', { class: 'muted' }, 'This sheet is not built yet.')),
      h('div', { class: 'actions' },
        button('Finish & send', () => go(`#/job/${job.id}/shift/${shift.id}/send`), 'primary'),
        button('Preview PDF', () => previewPdf(job, shift)),
        button('Delete shift', delShift, 'danger')),
    );
  }

  // ---- Finish & send ---------------------------------------------------
  const splitEmails = (s) => String(s || '').split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
  const saveContacts = () => SL.db.saveMeta('contacts', state.contacts);

  async function renderSend(jobId, shiftId) {
    const job = await SL.db.getJob(jobId);
    const shift = job && job.shifts.find((s) => s.id === shiftId);
    if (!shift) return notFound('This shift no longer exists.');
    const STATUS_LABEL = { empty: 'Empty', progress: 'In progress', complete: 'Complete' };

    // 1. What is filled / empty (never blocks)
    const checkList = h('ul', { class: 'checklist-sum' }, sheetList(shift).map((s) => {
      const st = s.form ? s.form.status(job, shift, s.rec) : 'empty';
      return h('li', {}, h('i', { class: `dot st-${st}` }), h('span', {}, `${s.name} — ${s.code}`), h('small', { class: 'muted' }, STATUS_LABEL[st]));
    }));
    const warns = allWarnings(job, shift);

    // 2. Files, built now so sharing can start right after the tap
    let pack = null;
    const filesBox = h('div', { class: 'files' }, h('p', { class: 'muted' }, 'Building PDF…'));

    // 3. Recipients as tickets: address book (most recent first) + typed addresses
    const selected = new Set();
    const ticketsBox = h('div', { class: 'tickets', role: 'group', 'aria-label': 'Recipients' });
    const ordered = () => state.contacts.slice().sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || '') || (a.name || a.email).localeCompare(b.name || b.email));
    function drawTickets() {
      ticketsBox.replaceChildren(...(state.contacts.length ? ordered().map((c) => h('button', {
        type: 'button', class: `ticket${selected.has(c.email) ? ' on' : ''}`, 'aria-pressed': selected.has(c.email) ? 'true' : 'false',
        title: c.email,
        onclick: () => { if (selected.has(c.email)) selected.delete(c.email); else selected.add(c.email); drawTickets(); refreshMail(); },
      }, c.name ? h('span', {}, c.name, h('small', {}, c.email)) : c.email)) : [h('p', { class: 'muted small' }, 'No contact yet: type an address below, or add contacts in Settings.')]));
    }
    const addInput = h('input', { type: 'email', inputmode: 'email', placeholder: 'name@company.com', autocomplete: 'email', 'aria-label': 'Add an email address' });
    const addMsg = h('span', { class: 'small', role: 'status' });
    const addAddress = () => {
      const v = addInput.value.trim();
      if (!SL.mail.isEmail(v)) { addMsg.textContent = 'Not a valid email address.'; addMsg.style.color = 'var(--danger)'; return; }
      if (!state.contacts.some((c) => c.email.toLowerCase() === v.toLowerCase())) {
        state.contacts.push({ name: '', email: v, lastUsed: null });
        saveContacts();
      }
      const c = state.contacts.find((x) => x.email.toLowerCase() === v.toLowerCase());
      selected.add(c.email);
      addInput.value = '';
      addMsg.textContent = '';
      drawTickets();
      refreshMail();
    };
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addAddress(); } });
    const cc = splitEmails(state.settings.alwaysCc).filter(SL.mail.isEmail);

    // 4. The draft as it will be created
    const subjectEl = h('div', { class: 'mail-subject' });
    const bodyEl = h('pre', { class: 'mail-body' });
    const toEl = h('div', { class: 'small' });
    function refreshMail() {
      const to = Array.from(selected);
      toEl.textContent = `To: ${to.join('; ') || '— none selected —'}${cc.length ? `   ·   CC: ${cc.join('; ')}` : ''}`;
      subjectEl.textContent = `Subject: ${SL.mail.subject(job, shift)}`;
      bodyEl.textContent = SL.mail.body(job, shift, [SL.pdf.fileName(job, shift), SL.mail.jsonName(job, shift)]);
    }

    // 5. Buttons and result
    const result = h('div', { class: 'result', role: 'status' });
    const historyBox = h('div', {});
    const done = async (method, extra) => {
      const to = Array.from(selected);
      SL.mail.logDraft(shift, { sentBy: shift.completedBy || state.settings.defaultCompletedBy, to, cc, method, files: [pack.pdf.name, pack.json.name] });
      const now = SL.schema.nowIso();
      to.forEach((e) => { const c = state.contacts.find((x) => x.email === e); if (c) c.lastUsed = now; });
      saveContacts();
      SL.db.touch(job, shift);
      await SL.db.flush();
      result.className = 'result ok';
      result.replaceChildren(h('strong', {}, `Draft created at ${fmtStamp(lastSent(shift).sentAt).slice(11)}.`), ' ', extra);
      drawHistory();
      drawTickets();
    };
    const shareBtn = h('button', {
      type: 'button', class: 'btn primary', disabled: true,
      onclick: () => {
        const to = Array.from(selected);
        SL.mail.share(pack, to, cc)
          .then(({ copied }) => done('share', copied && (to.length || cc.length)
            ? 'The To / CC addresses are copied: paste them in the draft.'
            : `Add the recipients in the draft: ${SL.mail.recipientsText(to, cc).replace('\n', '  ') || 'none selected'}.`))
          .catch((e) => {
            if (e && e.name === 'AbortError') { result.className = 'result'; result.textContent = 'Sharing cancelled: no draft created.'; return; }
            result.className = 'result err';
            result.textContent = `Sharing failed (${e && e.message}). Use “Email draft (attach manually)”.`;
          });
      },
    }, 'Share to Outlook');
    const mailtoBtn = h('button', {
      type: 'button', class: 'btn', disabled: true,
      onclick: async () => {
        await SL.mail.mailto(pack, Array.from(selected), cc);
        done('mailto', `PDF and JSON downloaded (${pack.pdf.name}, ${pack.json.name}): attach them to the draft.`);
      },
    }, 'Email draft (attach manually)');

    function drawHistory() {
      const log = (shift.sendLog || []).filter((e) => e && e.sentAt).slice().reverse();
      historyBox.replaceChildren(log.length
        ? h('table', { class: 'hist' },
          h('thead', {}, h('tr', {}, ['Draft created', 'By', 'To', 'CC', 'Way'].map((t) => h('th', {}, t)))),
          h('tbody', {}, log.map((e) => h('tr', {},
            h('td', {}, fmtStamp(e.sentAt)), h('td', {}, e.sentBy || ''), h('td', {}, (e.to || []).join('; ')),
            h('td', {}, (e.cc || []).join('; ')), h('td', {}, e.method === 'share' ? 'Shared' : 'Email draft')))))
        : h('p', { class: 'muted' }, 'No draft created yet for this shift.'));
    }

    app.replaceChildren(
      crumbs(h('a', { href: '#/' }, 'Jobs'), h('a', { href: `#/job/${job.id}` }, jobTitle(job)),
        h('a', { href: `#/job/${job.id}/shift/${shift.id}` }, formatDate(shift.date) || 'No date'), 'Finish & send'),
      h('h1', {}, 'Finish & send'),
      h('section', { class: 'panel' },
        h('h2', {}, '1. Check'),
        checkList,
        warns.length ? h('div', { class: 'warn' }, warns.map((m) => h('div', {}, '⚠ ', m))) : h('p', { class: 'muted small' }, 'No warning.'),
        h('p', { class: 'muted small' }, 'Nothing is mandatory: you can send at any time.')),
      h('section', { class: 'panel' }, h('h2', {}, '2. Files'), filesBox),
      h('section', { class: 'panel' },
        h('h2', {}, '3. Recipients'),
        ticketsBox,
        h('div', { class: 'add-mail' }, addInput, button('Add', addAddress), addMsg),
        h('p', { class: 'small' }, cc.length ? `Always in CC: ${cc.join('; ')}` : 'No “always CC” address (Settings).', ' ', h('a', { href: '#/settings' }, 'Settings'))),
      h('section', { class: 'panel' },
        h('h2', {}, '4. Email'),
        toEl, subjectEl, bodyEl,
        h('div', { class: 'actions' }, shareBtn, mailtoBtn),
        h('p', { class: 'muted small', hidden: true, dataset: { note: 'share' } }, 'Share to Outlook attaches the PDF and JSON; the To / CC addresses are copied to paste in the draft.'),
        h('p', { class: 'muted small' }, 'Nothing is sent by the app: you check the draft and send it from your mail app.'),
        result),
      h('section', { class: 'panel' }, h('h2', {}, 'Send history'), historyBox),
    );
    drawTickets();
    refreshMail();
    drawHistory();

    try {
      pack = await SL.mail.prepare(job, shift);
      const kb = (f) => `${Math.max(1, Math.round(f.size / 1024))} KB`;
      filesBox.replaceChildren(
        h('ul', { class: 'file-list' },
          h('li', {}, '📄 ', pack.pdf.name, h('small', { class: 'muted' }, ` ${kb(pack.pdf)}`)),
          h('li', {}, '🧾 ', pack.json.name, h('small', { class: 'muted' }, ` ${kb(pack.json)}`))),
        h('div', { class: 'actions' }, button('Preview PDF', () => previewPdf(job, shift))));
      const canShare = SL.mail.canShareFiles([pack.pdf, pack.json]);
      shareBtn.disabled = !canShare;
      shareBtn.hidden = !canShare;
      app.querySelector('[data-note=share]').hidden = !canShare;
      mailtoBtn.disabled = false;
      if (!canShare) mailtoBtn.classList.add('primary');
      app.dataset.sendReady = '1';
    } catch (e) {
      console.error(e);
      filesBox.replaceChildren(h('div', { class: 'banner' }, `PDF could not be built: ${e.message}`));
    }
  }

  // ---- PDF preview -----------------------------------------------------
  let previewUrl = null;
  async function previewPdf(job, shift) {
    await SL.db.flush();
    const close = () => {
      dlg.remove();
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    };
    const body = h('div', { class: 'modal-body' }, h('p', { class: 'empty' }, 'Building PDF…'));
    const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'PDF preview' },
      h('div', { class: 'modal-card' },
        h('div', { class: 'row-head' }, h('h2', {}, 'PDF preview'), button('Close', close)),
        body));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.body.appendChild(dlg);
    try {
      const bytes = await SL.pdf.build(job, shift);
      previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const name = SL.pdf.fileName(job, shift);
      body.replaceChildren(
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary', href: previewUrl, target: '_blank', rel: 'noopener' }, 'Open full screen'),
          h('a', { class: 'btn', href: previewUrl, download: name }, 'Download')),
        h('iframe', { class: 'pdf-frame', src: previewUrl, title: name }));
      dlg.dataset.ready = '1';
    } catch (e) {
      console.error(e);
      body.replaceChildren(h('div', { class: 'banner' }, `PDF could not be built: ${e.message}`));
    }
  }

  function renderSettings() {
    const s = state.settings;
    const themeChoice = h('div', { class: 'choice', role: 'radiogroup' }, THEMES.map((t) => h('label', {},
      h('input', {
        type: 'radio', name: 'theme', value: t, checked: (s.theme || 'system') === t,
        onchange: () => { s.theme = t; applyTheme(); saveSettings(); },
      }), THEME_LABEL[t] + (t === 'system' ? ' (device setting)' : ''))));

    app.replaceChildren(
      h('h1', {}, 'Settings'),
      h('section', { class: 'panel' },
        h('h2', {}, 'Display'),
        h('div', { class: 'field' }, h('label', {}, 'Theme'), themeChoice)),
      h('section', { class: 'panel' },
        h('h2', {}, 'Defaults'),
        h('div', { class: 'grid' }, field('Default “Completed by”', s, 'defaultCompletedBy', saveSettings))),
      h('section', { class: 'panel' },
        h('h2', {}, 'Email'),
        h('div', { class: 'grid' }, field('Always in CC (one or more addresses, separated by ;)', s, 'alwaysCc', saveSettings, { inputmode: 'email' })),
        h('h3', {}, 'Address book'),
        addressBook()),
      dataSection(),
    );
  }

  // Export everything / import a file: report first, then apply
  function dataSection() {
    const out = h('div', { class: 'import-report', role: 'status' });
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    const today = SL.schema.todayIso();
    const exportAll = async () => {
      await SL.db.flush();
      SL.io.download(await SL.io.exportAll(), `Strata-Lotpack_export_${today}.json`);
    };
    const LABEL = { added: 'Added', replaced: 'Replaced by the imported version (newer)', kept: 'Kept this device version (newer)' };
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      let data, p;
      try {
        data = SL.io.parse(await f.text());
        await SL.db.flush();
        p = SL.io.plan(await SL.db.getAllJobs(), state.contacts, data);
      } catch (e) {
        out.className = 'import-report err';
        out.replaceChildren(h('strong', {}, 'Import refused: '), e.message);
        return;
      }
      const c = p.counts;
      const summary = `${c.jobsAdded} job(s) added, ${c.shiftsAdded} shift(s) added, ${c.replaced} replaced, ${c.kept} kept, ${c.unchanged} unchanged, ${c.contactsAdded} contact(s) added.`;
      out.className = 'import-report';
      out.replaceChildren(
        h('p', {}, h('strong', {}, f.name), ` — exported ${data.exportedAt ? SL.schema.formatDate(String(data.exportedAt).slice(0, 10)) + ' ' + String(data.exportedAt).slice(11, 16) : ''}`),
        h('p', { class: 'import-summary' }, summary),
        p.rows.length ? h('table', { class: 'hist' },
          h('thead', {}, h('tr', {}, ['Job', 'Item', 'Result', 'This device', 'Imported'].map((t) => h('th', {}, t)))),
          h('tbody', {}, p.rows.map((r) => h('tr', { class: `act-${r.action}` },
            h('td', {}, r.job), h('td', {}, r.what), h('td', {}, LABEL[r.action]),
            h('td', {}, fmtStampSec(r.local)), h('td', {}, fmtStampSec(r.imported)))))) : null,
        p.nothingToDo
          ? h('p', { class: 'muted' }, 'Nothing to apply: this device already has the same or newer data.')
          : h('div', { class: 'actions' },
            button('Apply import', async () => {
              await SL.io.apply(p);
              state.contacts = p.contacts;
              out.className = 'import-report ok';
              out.replaceChildren(h('strong', {}, 'Import done. '), summary);
            }, 'primary'),
            button('Cancel', () => { out.className = 'import-report'; out.replaceChildren(); })),
      );
    });
    return h('section', { class: 'panel' },
      h('h2', {}, 'Data'),
      h('p', { class: 'muted small' }, 'Export all jobs to a JSON file (backup, or to open them on another device). Import merges by id: for each shift the most recent version wins; you see the report before applying. Settings of this device are not changed by an import.'),
      h('div', { class: 'actions' }, button('Export all data (JSON)', exportAll), button('Import JSON…', () => fileInput.click())),
      fileInput,
      out);
  }

  function addressBook() {
    const box = h('div', { class: 'rows' });
    function draw() {
      box.replaceChildren(
        h('div', { class: 'trow thead', 'aria-hidden': 'true' }, h('div', { class: 'cell w-m' }, 'Name'), h('div', { class: 'cell w-l' }, 'Email'), h('span', { class: 'icon-btn ghost' })),
        ...(state.contacts.length ? state.contacts.map((c, i) => {
          const f = (label, k, w, type) => { const el = field(label, c, k, saveContacts, { type }); el.className = `cell ${w}`; el.querySelector('label').className = 'cell-label'; return el; };
          return h('div', { class: 'trow' }, f('Name', 'name', 'w-m'), f('Email', 'email', 'w-l', 'email'),
            h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': `Delete ${c.name || c.email}`, title: 'Delete contact',
              onclick: () => { if (confirm(`Delete ${c.name || c.email} from the address book?`)) { state.contacts.splice(i, 1); saveContacts(); draw(); } },
            }, '×'));
        }) : [h('p', { class: 'empty' }, 'No contact yet.')]),
        h('div', { class: 'actions' }, button('Add contact', () => { state.contacts.push({ name: '', email: '', lastUsed: null }); saveContacts(); draw(); box.querySelectorAll('input[data-key=name]')[state.contacts.length - 1].focus(); })));
    }
    draw();
    return box;
  }

  // ---- Router ----------------------------------------------------------
  async function render() {
    await SL.db.flush();
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', (parts[0] === 'settings') === (a.dataset.nav === 'settings'));
    });
    try {
      if (parts[0] === 'settings') renderSettings();
      else if (parts[0] === 'job' && parts[2] === 'shift' && parts[4] === 'send') await renderSend(parts[1], parts[3]);
      else if (parts[0] === 'job' && parts[2] === 'shift') await renderShift(parts[1], parts[3]);
      else if (parts[0] === 'job') await renderJob(parts[1]);
      else await renderJobs();
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      app.replaceChildren(h('div', { class: 'banner' }, `Something went wrong: ${e.message}`));
    }
  }

  async function start() {
    try {
      await SL.db.open();
      const saved = await SL.db.getMeta('settings');
      state.settings = Object.assign(SL.schema.defaultSettings(), saved || {});
      state.contacts = (await SL.db.getMeta('contacts')) || [];
    } catch (e) {
      app.replaceChildren(h('div', { class: 'banner' }, `Local storage unavailable: ${e.message} Data cannot be saved on this device.`));
      return;
    }
    applyTheme();
    window.addEventListener('hashchange', render);
    await render();
    document.documentElement.dataset.ready = '1';
  }

  start();
})(window.SL = window.SL || {});
