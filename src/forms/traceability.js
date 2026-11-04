/* MSF28-10 — Asphalt Traceability */
(function (SL) {
  'use strict';
  const { h, field, headerField, multi, nowLocal } = SL.ui;

  const WORK_TYPES = [
    ['supplyLay', 'Supply & Lay'], ['profileFill', 'Profile & Fill'], ['keyOverlay', 'Key & Overlay'],
    ['profilePatch', 'Profile & Patch'], ['repairWorks', 'Repair Works'], ['other', 'OTHER'],
  ];
  const LAYERS = [
    ['base', 'Base'], ['intermediate', 'Intermediate'], ['wearing', 'Wearing'],
    ['correction', 'Correction'], ['other', 'OTHER'],
  ];
  // Truck row columns: [key, label, type, css width class]
  const LOAD_COLS = [
    ['no', 'Load No', 'number', 'w-xs'],
    ['docket', 'Docket No', 'text', 'w-m'],
    ['tonnes', 'Load Tonnes (T)', 'number', 'w-s'],
    ['progress', 'Progress Tonnes (T)', 'calc', 'w-s'],
    ['tipTime', 'Tip Time', 'time', 'w-s'],
    ['temp', 'Load Temp (°C)', 'number', 'w-s'],
    ['chStart', 'Start Chainage', 'number', 'w-s'],
    ['chEnd', 'Finish Chainage', 'number', 'w-s'],
    ['run', 'Run No', 'number', 'w-xs'],
    ['width', 'Run Width', 'number', 'w-xs'],
    ['comment', 'Comments', 'text', 'w-l'],
  ];

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const round2 = (n) => Math.round(n * 100) / 100;
  const hhmm = () => nowLocal().slice(11, 16);

  function ensure(shift) {
    const t = shift.traceability = shift.traceability || {};
    t.header = t.header || {};
    t.loads = t.loads || [];
    t.envReadings = t.envReadings || [];
    t.tackRate = t.tackRate || { litres: null, m2: null };
    if (t.tackBroken === undefined) t.tackBroken = '';
    if (t.surfaceClean === undefined) t.surfaceClean = '';
    t.lotSummary = t.lotSummary || { qtyDelivered: null, qtyPaved: null, m2Paved: null, completedBy: '' };
    t.qa = t.qa || { tempsRecorded: '', dipsRecorded: '', labDiscussed: '' };
    t.limits = t.limits || { minLoadTemp: null, maxWind: null, minPavementTemp: null };
    return t;
  }

  // Cumulative tonnes, written back on each row (kept in the JSON export)
  function computeProgress(t) {
    let sum = 0;
    t.loads.forEach((l) => {
      if (num(l.tonnes) !== null) sum += l.tonnes;
      l.progress = num(l.tonnes) !== null || sum ? round2(sum) : null;
    });
    return round2(sum);
  }

  // Lot summary: typed value, else prefilled from the truck rows
  function lotValues(job, shift) {
    const t = ensure(shift);
    const total = computeProgress(t);
    const ls = t.lotSummary;
    const pick = (v, d) => (v !== null && v !== undefined && v !== '' ? v : d);
    return {
      qtyDelivered: pick(ls.qtyDelivered, total || null),
      qtyPaved: pick(ls.qtyPaved, total || null),
      m2Paved: ls.m2Paved,
      completedBy: pick(ls.completedBy, shift.completedBy),
    };
  }

  // "HH:MM" -> minutes, with times after midnight kept after the shift start
  function timeline(times) {
    const mins = times.map((s) => (/^\d{1,2}:\d{2}$/.test(s || '') ? Number(s.split(':')[0]) * 60 + Number(s.split(':')[1]) : null));
    const first = mins.find((m) => m !== null);
    return mins.map((m) => (m === null ? null : (first !== undefined && m < first - 360 ? m + 1440 : m)));
  }

  // Rows of the PDF table: each reading goes on the truck row closest in time
  // (in order, one reading per row; a reading before the first truck goes on row 1)
  function tableRows(shift) {
    const t = ensure(shift);
    const loads = t.loads;
    const readings = t.envReadings.slice();
    const all = timeline([...loads.map((l) => l.tipTime), ...readings.map((r) => r.time)]);
    const loadMin = all.slice(0, loads.length);
    const readMin = all.slice(loads.length);
    const order = readings.map((r, i) => ({ r, m: readMin[i] }))
      .sort((a, b) => (a.m ?? 1e9) - (b.m ?? 1e9));
    const rows = loads.map((l) => ({ load: l, reading: null }));
    let next = 0;
    order.forEach(({ r, m }) => {
      let best = next;
      if (m !== null) {
        let bestD = Infinity;
        for (let i = next; i < loads.length; i++) {
          if (loadMin[i] === null) continue;
          const d = Math.abs(loadMin[i] - m);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      while (rows.length <= best) rows.push({ load: null, reading: null });
      rows[best].reading = r;
      next = best + 1;
    });
    return rows;
  }

  function status(job, shift) {
    const t = shift.traceability || {};
    const loads = t.loads || [];
    const anyHeader = (t.tackRate && (t.tackRate.litres || t.tackRate.m2)) || t.tackBroken || t.surfaceClean;
    if (!loads.length && !(t.envReadings || []).length && !anyHeader) return 'empty';
    const qa = t.qa || {};
    return loads.length && qa.tempsRecorded && qa.dipsRecorded && qa.labDiscussed ? 'complete' : 'progress';
  }

  // Non-blocking warnings
  function warning(job, shift) {
    const t = shift.traceability || {};
    const loads = t.loads || [];
    const readings = t.envReadings || [];
    const lim = t.limits || {};
    const out = [];
    if ((shift.layer || []).length > 1) out.push('Traceability: only 1 layer / mix type per page, or identify it in the comments.');
    if (loads.length && !readings.length) out.push('Traceability: no wind / pavement temperature reading yet (required before start).');
    // Reminder every 2 h, only while the shift is today
    if (readings.length && shift.date === SL.schema.todayIso()) {
      const mins = timeline(readings.map((r) => r.time)).filter((m) => m !== null);
      if (mins.length) {
        const last = Math.max(...mins);
        const now = timeline([readings.find((r) => r.time).time, hhmm()])[1];
        const ago = now - last;
        if (ago >= 120) out.push(`Traceability: last wind / pavement reading ${Math.floor(ago / 60)} h ${String(ago % 60).padStart(2, '0')} ago — record a new one.`);
      }
    }
    if (num(lim.minLoadTemp) !== null) {
      const low = loads.filter((l) => num(l.temp) !== null && l.temp < lim.minLoadTemp);
      if (low.length) out.push(`Traceability: load temp below ${lim.minLoadTemp} °C on load ${low.map((l) => l.no ?? '?').join(', ')}.`);
    }
    if (num(lim.maxWind) !== null) {
      const hi = readings.filter((r) => num(r.windKmh) !== null && r.windKmh > lim.maxWind);
      if (hi.length) out.push(`Traceability: wind above ${lim.maxWind} km/h at ${hi.map((r) => r.time || '?').join(', ')}.`);
    }
    if (num(lim.minPavementTemp) !== null) {
      const low = readings.filter((r) => num(r.pavementTemp) !== null && r.pavementTemp < lim.minPavementTemp);
      if (low.length) out.push(`Traceability: pavement temp below ${lim.minPavementTemp} °C at ${low.map((r) => r.time || '?').join(', ')}.`);
    }
    return out;
  }

  // Yes / No toggle stored as 'yes' | 'no' | ''
  function yesNo(label, obj, key, onChange) {
    const name = `yn${Math.random().toString(36).slice(2)}`;
    const opt = (v, l) => {
      const input = h('input', { type: 'radio', name, value: v, checked: obj[key] === v });
      input.addEventListener('click', () => {
        obj[key] = obj[key] === v ? '' : v; // tap again to clear
        input.checked = obj[key] === v;
        onChange();
      });
      return h('label', { class: 'chk' }, input, h('span', {}, l));
    };
    return h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'choice' }, opt('yes', 'Yes'), opt('no', 'No')));
  }

  // Number field that shows a computed value until something is typed
  function prefilled(label, obj, key, compute, onChange) {
    const id = `pf${Math.random().toString(36).slice(2)}`;
    const typed = () => obj[key] !== null && obj[key] !== undefined && obj[key] !== '';
    const input = h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', dataset: { key } });
    const tag = h('span', { class: 'local-tag' }, 'typed');
    const show = () => {
      if (!typed()) { const c = compute(); input.value = c === null || c === undefined ? '' : String(c); }
      tag.hidden = !typed();
    };
    input.value = typed() ? String(obj[key]) : '';
    input.addEventListener('input', () => {
      const raw = input.value.trim().replace(',', '.');
      obj[key] = raw === '' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : raw);
      tag.hidden = !typed();
      onChange();
    });
    input.addEventListener('blur', show);
    show();
    const el = h('div', { class: 'field' }, h('label', { for: id }, label, ' ', tag), input);
    el.refresh = () => { if (document.activeElement !== input) show(); };
    return el;
  }

  function render(job, shift, save) {
    const t = ensure(shift);
    computeProgress(t);

    const loadsBox = h('div', { class: 'rows' });
    const readingsBox = h('div', { class: 'rows' });
    let lotFields = [];
    const changed = () => {
      computeProgress(t);
      loadsBox.querySelectorAll('[data-progress]').forEach((el) => {
        const l = t.loads[Number(el.dataset.progress)];
        el.textContent = l && l.progress !== null ? String(l.progress) : '';
      });
      lotFields.forEach((f) => f.refresh());
      save();
    };

    function loadRow(l, i) {
      const cells = LOAD_COLS.map(([k, label, type, w]) => {
        if (type === 'calc') {
          return h('div', { class: `cell ${w}` }, h('span', { class: 'cell-label' }, label),
            h('output', { class: 'calc', dataset: { progress: String(i) } }, l.progress ?? ''));
        }
        const f = field(label, l, k, changed, { type: type === 'time' ? 'time' : type });
        f.className = `cell ${w}`;
        f.querySelector('label').className = 'cell-label';
        return f;
      });
      const del = h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Delete load ${l.no ?? i + 1}`, title: 'Delete row',
        onclick: () => { if (confirm(`Delete load ${l.no ?? i + 1}?`)) { t.loads.splice(i, 1); drawLoads(); changed(); } },
      }, '×');
      return h('div', { class: 'trow' }, cells, del);
    }

    function drawLoads() {
      loadsBox.replaceChildren(
        h('div', { class: 'trow thead', 'aria-hidden': 'true' }, LOAD_COLS.map(([, label, , w]) => h('div', { class: `cell ${w}` }, label)), h('span', { class: 'icon-btn ghost' })),
        ...(t.loads.length ? t.loads.map(loadRow) : [h('p', { class: 'empty' }, 'No truck yet.')]));
    }

    function readingRow(r, i) {
      const f = (label, k, type) => {
        const el = field(label, r, k, save, { type });
        el.className = 'cell w-s';
        el.querySelector('label').className = 'cell-label';
        return el;
      };
      const del = h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Delete reading ${r.time || i + 1}`, title: 'Delete reading',
        onclick: () => { t.envReadings.splice(i, 1); drawReadings(); save(); },
      }, '×');
      return h('div', { class: 'trow' }, f('Time', 'time', 'time'), f('Wind Velocity (km/h)', 'windKmh', 'number'), f('Pavement Temp (°C)', 'pavementTemp', 'number'), del);
    }

    function drawReadings() {
      readingsBox.replaceChildren(
        h('div', { class: 'trow thead', 'aria-hidden': 'true' },
          h('div', { class: 'cell w-s' }, 'Time'), h('div', { class: 'cell w-s' }, 'Wind Velocity (km/h)'), h('div', { class: 'cell w-s' }, 'Pavement Temp (°C)'), h('span', { class: 'icon-btn ghost' })),
        ...(t.envReadings.length ? t.envReadings.map(readingRow) : [h('p', { class: 'empty' }, 'No reading yet.')]));
    }

    const addLoad = () => {
      const last = t.loads[t.loads.length - 1];
      t.loads.push({
        no: last && num(last.no) !== null ? last.no + 1 : t.loads.length + 1,
        docket: '', tonnes: null, progress: null, tipTime: hhmm(), temp: null,
        chStart: null, chEnd: null, run: last ? last.run : null, width: last ? last.width : null, comment: '',
      });
      drawLoads();
      changed();
      const rows = loadsBox.querySelectorAll('.trow:not(.thead)');
      const row = rows[rows.length - 1];
      row.scrollIntoView({ block: 'center' });
      row.querySelector('input[data-key=docket]').focus();
    };
    const addReading = () => {
      t.envReadings.push({ time: hhmm(), windKmh: null, pavementTemp: null });
      drawReadings();
      save();
      const rows = readingsBox.querySelectorAll('.trow:not(.thead)');
      rows[rows.length - 1].querySelector('input[data-key=windKmh]').focus();
    };

    drawLoads();
    drawReadings();

    const ls = t.lotSummary;
    lotFields = [
      prefilled('QTY Delivered (T)', ls, 'qtyDelivered', () => lotValues(job, shift).qtyDelivered, save),
      prefilled('QTY Paved (T)', ls, 'qtyPaved', () => lotValues(job, shift).qtyPaved, save),
    ];

    return h('div', { class: 'sheet' },
      h('section', { class: 'block' },
        h('h3', {}, 'Header'),
        h('p', { class: 'muted small' }, 'Filled from the job and shift. A change here applies to this sheet only.'),
        h('div', { class: 'grid' },
          headerField('Client', t, 'client', job.client, save),
          headerField('Date', t, 'date', shift.date, save, { type: 'date' }),
          headerField('Project Title', t, 'projectTitle', job.projectTitle, save),
          headerField('Job Number', t, 'jobNumber', job.jobNumber, save),
          headerField('Suburb', t, 'suburb', job.suburb, save),
          field('Weather Conditions', shift, 'weather', save),
          headerField('Product', t, 'product', shift.product, save),
          headerField('Nominated Layer Thickness (mm)', t, 'nominatedThickness', shift.nominatedThickness, save, { inputmode: 'decimal', number: true }))),

      h('section', { class: 'block' },
        h('h3', {}, 'Tack coat & surface'),
        h('div', { class: 'grid' },
          field('Tack Coat Application Rate — Litres', t.tackRate, 'litres', save, { type: 'number' }),
          field('Tack Coat Application Rate — m²', t.tackRate, 'm2', save, { type: 'number' }),
          yesNo('Tack Coat Broken Before Paving?', t, 'tackBroken', save),
          yesNo('Existing Surface Clean, dry and free from loose material?', t, 'surfaceClean', save))),

      h('section', { class: 'block' },
        h('h3', {}, 'Type of work'),
        h('div', { class: 'choice' }, WORK_TYPES.map(([k, l]) => multi(l, shift, 'workType', k, save))),
        h('h3', {}, 'Layer'),
        h('div', { class: 'choice' }, LAYERS.map(([k, l]) => multi(l, shift, 'layer', k, save))),
        h('p', { class: 'muted small' }, 'Paving should not commence without a signed Approval to Proceed/ Hold Point. Only 1 layer/ mix type per page or identify in comments.')),

      h('section', { class: 'block' },
        h('div', { class: 'row-head' }, h('h3', {}, 'Trucks'), SL.ui.button('Add row', addLoad, 'primary')),
        loadsBox),

      h('section', { class: 'block' },
        h('div', { class: 'row-head' }, h('h3', {}, 'Wind & pavement temperature — every 2 hrs, including before start'), SL.ui.button('Add reading', addReading, 'primary')),
        readingsBox),

      h('section', { class: 'block' },
        h('h3', {}, 'Lot Summary'),
        h('div', { class: 'grid' },
          ...lotFields,
          field('m² paved', ls, 'm2Paved', save, { type: 'number' }),
          headerField('Completed by', ls, 'completedBy', shift.completedBy, save, { direct: true }))),

      h('section', { class: 'block' },
        h('h3', {}, 'QA Checklist'),
        h('div', { class: 'grid' },
          yesNo('Temps recorded', t.qa, 'tempsRecorded', save),
          yesNo('Dips Recorded', t.qa, 'dipsRecorded', save),
          yesNo('Lot discussed with Lab Technician (Diagram + Defects)', t.qa, 'labDiscussed', save))),

      h('section', { class: 'block' },
        h('h3', {}, 'Limits (not printed)'),
        h('p', { class: 'muted small' }, 'Values from the specification of this job. Out-of-limit values show a warning; nothing is blocked.'),
        h('div', { class: 'grid' },
          field('Min load temp (°C)', t.limits, 'minLoadTemp', save, { type: 'number' }),
          field('Max wind (km/h)', t.limits, 'maxWind', save, { type: 'number' }),
          field('Min pavement temp (°C)', t.limits, 'minPavementTemp', save, { type: 'number' }))),
    );
  }

  SL.forms = SL.forms || {};
  SL.forms.traceability = { render, status, warning, ensure, tableRows, lotValues, computeProgress };
})(window.SL = window.SL || {});
