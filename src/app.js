/* Entry point: router and screens (Jobs, Job, Shift, Settings) */
(function (SL) {
  'use strict';

  const { h, field, button } = SL.ui;
  const { formatDate } = SL.schema;
  const app = document.getElementById('app');

  const state = { settings: SL.schema.defaultSettings(), shiftTab: {} };

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
            h('div', { class: 'meta' }, s.status === 'sent' ? 'Sent' : 'Draft'))))
          : h('p', { class: 'empty' }, 'No shifts yet. One shift = one lotpack.')),
      h('div', { class: 'actions' }, button('Delete job', delJob, 'danger')),
    );
  }

  async function renderShift(jobId, shiftId) {
    const job = await SL.db.getJob(jobId);
    const shift = job && job.shifts.find((s) => s.id === shiftId);
    if (!shift) return notFound('This shift no longer exists.');
    const save = () => { SL.db.touch(job, shift); dateCrumb.textContent = formatDate(shift.date) || 'No date'; };
    const dateCrumb = h('span', {}, formatDate(shift.date) || 'No date');

    const tab = state.shiftTab[shift.id] || SHEETS[0].key;
    const sheet = SHEETS.find((s) => s.key === tab) || SHEETS[0];
    const form = SL.forms && SL.forms[sheet.key];

    // Completeness dot on each tab, refreshed as the sheet is filled
    const STATUS_LABEL = { empty: 'Empty', progress: 'In progress', complete: 'Complete' };
    const statusOf = (s) => (SL.forms && SL.forms[s.key] ? SL.forms[s.key].status(job, shift) : 'empty');
    const tabEls = SHEETS.map((s) => {
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
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, tabEls);

    // Non-blocking warnings (e.g. approval not signed)
    const warnEl = h('div', { class: 'warn', role: 'status' });
    const refreshWarnings = () => {
      const msgs = Object.values(SL.forms || {}).map((f) => (f.warning ? f.warning(job, shift) : '')).filter(Boolean);
      warnEl.replaceChildren(...msgs.map((m) => h('div', {}, '⚠ ', m)));
      warnEl.hidden = !msgs.length;
    };
    refreshWarnings();

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
        form ? form.render(job, shift, saveSheet) : h('p', { class: 'muted' }, 'This sheet is not built yet.')),
      h('div', { class: 'actions' },
        button('Preview PDF', () => previewPdf(job, shift), 'primary'),
        button('Delete shift', delShift, 'danger')),
    );
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
    );
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
