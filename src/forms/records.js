/* MSF28-9 — Pavement Measured Dip Record, and MSF28-12 — Survey Record.
   Optional sheets, added on demand (one or several per shift). Same structure:
   header + 3 blocks (course, length, depth, offsets, direction, run, width) + CH readings L / C / R. */
(function (SL) {
  'use strict';
  const { h, field, headerField, button } = SL.ui;

  const SURFACES = [['asphalt', 'Asphalt'], ['granular', 'Granular'], ['seal', 'Seal']];
  const COURSES = ['CC', 'IC', 'WC'];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  const KINDS = {
    dip: {
      list: 'dipRecords', code: 'MSF28-9', name: 'Dip Record', title: 'Pavement Measured Dip Record',
      rows: 38, // reading rows per block on the printed sheet
    },
    survey: {
      list: 'surveys', code: 'MSF28-12', name: 'Survey Record', title: 'Survey Record',
      rows: 40,
    },
  };

  const blankBlock = () => ({
    course: '', length: null, depth: null, offsets: { l: null, c: null, r: null },
    direction: '', level: '', layer: '', run: null, width: null, readings: [],
  });

  function newRecord(kind) {
    const r = {
      id: SL.schema.uuid(), header: {}, mixType: '', frequency: '', existingSurface: '', sealSize: '',
      courses: [blankBlock(), blankBlock(), blankBlock()], completedBy: '',
    };
    if (kind === 'dip') Object.assign(r, { compactionFactor: null, upperLimit: null, lowerLimit: null });
    else r.surveyBy = '';
    return r;
  }

  function ensure(rec) {
    rec.header = rec.header || {};
    if (!rec.date && rec.header.date) rec.date = rec.header.date; // older data: date was a header override
    rec.courses = rec.courses && rec.courses.length === 3 ? rec.courses : [blankBlock(), blankBlock(), blankBlock()];
    rec.courses.forEach((b) => {
      b.offsets = b.offsets || { l: null, c: null, r: null };
      b.readings = b.readings || [];
    });
    return rec;
  }

  // Raw readings outside [lowerLimit, upperLimit] (dip records only)
  function outOfLimits(rec) {
    const lo = num(rec.lowerLimit), hi = num(rec.upperLimit);
    if (lo === null && hi === null) return [];
    const out = [];
    rec.courses.forEach((b, bi) => b.readings.forEach((rd) => {
      [['l', 'Left'], ['c', 'Centre'], ['r', 'Right']].forEach(([k, label]) => {
        const v = num(rd[k]);
        if (v === null) return;
        if ((lo !== null && v < lo) || (hi !== null && v > hi)) out.push({ block: bi, rd, k, label, v });
      });
    }));
    return out;
  }

  function make(kind) {
    const K = KINDS[kind];
    const isDip = kind === 'dip';

    const records = (shift) => (shift[K.list] = shift[K.list] || []);
    const label = (shift, rec) => `${K.name} ${records(shift).indexOf(rec) + 1}`;

    function add(shift) {
      const rec = newRecord(kind);
      records(shift).push(rec);
      return rec;
    }

    function remove(shift, rec) {
      const list = records(shift);
      const i = list.indexOf(rec);
      if (i >= 0) list.splice(i, 1);
    }

    function status(job, shift, rec) {
      if (!rec) return 'empty';
      const used = rec.courses.some((b) => b.course || b.readings.length || num(b.length) !== null)
        || rec.mixType || rec.frequency || rec.existingSurface;
      if (!used) return 'empty';
      const done = rec.courses.some((b) => b.course && b.readings.some((rd) => rd.ch !== '' && rd.ch !== null && rd.ch !== undefined));
      return done ? 'complete' : 'progress';
    }

    function warning(job, shift) {
      const out = [];
      records(shift).forEach((rec) => {
        ensure(rec);
        rec.courses.forEach((b, bi) => {
          if (b.readings.length > K.rows) out.push(`${label(shift, rec)}: block ${bi + 1} has ${b.readings.length} readings, the sheet holds ${K.rows} — add another ${K.name}.`);
        });
        if (!isDip) return;
        const bad = outOfLimits(rec);
        if (bad.length) {
          const lim = `${num(rec.lowerLimit) ?? '–'} to ${num(rec.upperLimit) ?? '–'}`;
          const list = bad.slice(0, 5).map((x) => `CH ${x.rd.ch ?? '?'} ${x.label} ${x.v}`).join(', ');
          out.push(`${label(shift, rec)}: ${bad.length} reading(s) outside the dip limits (${lim}): ${list}${bad.length > 5 ? '…' : ''}.`);
        }
      });
      return out;
    }

    // Single choice chips stored as a string; tap again to clear
    function oneOf(title, obj, key, options, onChange) {
      const name = `o${Math.random().toString(36).slice(2)}`;
      return h('div', { class: 'field' }, h('label', {}, title),
        h('div', { class: 'choice' }, options.map(([v, l]) => {
          const input = h('input', { type: 'radio', name, value: v, checked: obj[key] === v });
          input.addEventListener('click', () => {
            obj[key] = obj[key] === v ? '' : v;
            input.checked = obj[key] === v;
            onChange();
          });
          return h('label', { class: 'chk' }, input, h('span', {}, l));
        })));
    }

    function blockView(rec, b, bi, save) {
      const box = h('div', { class: 'rows' });
      const markOut = () => {
        if (!isDip) return;
        const bad = new Set(outOfLimits(rec).filter((x) => x.block === bi).map((x) => `${b.readings.indexOf(x.rd)}:${x.k}`));
        box.querySelectorAll('input[data-cell]').forEach((el) => el.classList.toggle('out', bad.has(el.dataset.cell)));
      };
      const changed = () => { markOut(); save(); };

      function draw() {
        const rows = b.readings.map((rd, i) => {
          const f = (lab, k) => {
            const el = field(lab, rd, k, changed, { type: 'number' });
            el.className = 'cell w-s';
            el.querySelector('label').className = 'cell-label';
            el.querySelector('input').dataset.cell = `${i}:${k}`;
            return el;
          };
          const del = h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': `Delete reading CH ${rd.ch ?? i + 1}`, title: 'Delete reading',
            onclick: () => { b.readings.splice(i, 1); draw(); changed(); },
          }, '×');
          // Survey: the printed Centre column has two cells -> Centre 1 / Centre 2
          const centre = isDip ? [f('Centre', 'c')] : [f('Centre 1', 'c'), f('Centre 2', 'c2')];
          return h('div', { class: 'trow' }, f('CH', 'ch'), f('Left', 'l'), ...centre, f('Right', 'r'), del);
        });
        const full = b.readings.length >= K.rows;
        box.replaceChildren(
          h('div', { class: 'trow thead', 'aria-hidden': 'true' },
            (isDip ? ['CH', 'Left', 'Centre', 'Right'] : ['CH', 'Left', 'Centre 1', 'Centre 2', 'Right']).map((t) => h('div', { class: 'cell w-s' }, t)), h('span', { class: 'icon-btn ghost' })),
          ...(rows.length ? rows : [h('p', { class: 'empty' }, 'No reading yet.')]),
          h('div', { class: 'actions' },
            h('button', {
              type: 'button', class: 'btn', disabled: full,
              onclick: () => {
                b.readings.push(isDip ? { ch: null, l: null, c: null, r: null } : { ch: null, l: null, c: null, c2: null, r: null });
                draw();
                changed();
                const inputs = box.querySelectorAll('input[data-key=ch]');
                inputs[inputs.length - 1].focus();
              },
            }, 'Add reading'),
            h('span', { class: 'muted small' }, full ? `Sheet full (${K.rows} rows): add another ${K.name}.` : `${b.readings.length} / ${K.rows} rows`)));
        markOut();
      }
      draw();

      const off = b.offsets;
      return h('fieldset', { class: 'legend block-set' }, h('legend', {}, `Block ${bi + 1}`),
        oneOf('Course', b, 'course', COURSES.map((c) => [c, c]), save),
        h('div', { class: 'grid' },
          field('Length (m)', b, 'length', save, { type: 'number' }),
          field('Depth (mm)', b, 'depth', save, { type: 'number' }),
          field('Offset (m) — Left', off, 'l', save, { type: 'number' }),
          field('Offset (m) — Centre', off, 'c', save, { type: 'number' }),
          field('Offset (m) — Right', off, 'r', save, { type: 'number' }),
          field('Direction', b, 'direction', save),
          field('Run', b, 'run', save, { type: 'number' }),
          field('Width', b, 'width', save, { type: 'number' })),
        isDip
          ? oneOf('Level', b, 'level', [['survey', 'Survey'], ['nominal', 'Nominal']], save)
          : oneOf('Layer', b, 'layer', [['1', '1'], ['2', '2'], ['3', '3']], save),
        h('h4', {}, 'Readings'),
        box);
    }

    function render(job, shift, save, rec, onRemove) {
      ensure(rec);
      return h('div', { class: 'sheet' },
        h('section', { class: 'block' },
          h('h3', {}, 'Header'),
          h('p', { class: 'muted small' }, 'Client, project, job number and suburb come from Job and Shift details. Date and Mix type are prefilled from the shift and can be changed for this sheet only.'),
          h('div', { class: 'grid' },
            // Date and Mix type prefilled from the shift; changing them here does not change the shift
            headerField('Date', rec, 'date', shift.date, save, { type: 'date', direct: true }),
            SL.ui.computed('Mix Type', rec, 'mixType', () => shift.product, save),
            field('Frequency of Testing', rec, 'frequency', save)),
          h('div', { class: 'grid' },
            oneOf('Existing Surface', rec, 'existingSurface', SURFACES, save),
            field('Seal size', rec, 'sealSize', save)),
          isDip
            ? h('div', { class: 'grid' },
              field('Compaction Factor', rec, 'compactionFactor', save, { type: 'number' }),
              field('Lower Dip Limit', rec, 'lowerLimit', save, { type: 'number' }),
              field('Upper Dip Limit', rec, 'upperLimit', save, { type: 'number' }))
            : h('div', { class: 'grid' }, oneOf('Survey completed by', rec, 'surveyBy', [['colas', 'COLAS'], ['client', 'Client']], save))),
        h('section', { class: 'block' },
          h('div', { class: 'blocks' }, rec.courses.map((b, bi) => blockView(rec, b, bi, save)))),
        h('section', { class: 'block' },
          h('div', { class: 'grid' }, headerField('Completed By', rec, 'completedBy', shift.completedBy, save, { direct: true }))),
        h('div', { class: 'actions' }, button(`Remove this ${K.name}`, () => {
          if (!confirm(`Remove ${label(shift, rec)} and all its readings?`)) return;
          remove(shift, rec);
          save();
          onRemove();
        }, 'danger')),
      );
    }

    return { kind, ...K, records, label, add, remove, status, warning, render, ensure, outOfLimits };
  }

  SL.forms = SL.forms || {};
  SL.forms.dip = make('dip');
  SL.forms.survey = make('survey');
})(window.SL = window.SL || {});
