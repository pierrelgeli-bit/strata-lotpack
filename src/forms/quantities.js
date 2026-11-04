/* MSF28-11 — Quantity & Placement Agreement Sheet */
(function (SL) {
  'use strict';
  const { h, field, headerField, computed, textarea, nowLocal } = SL.ui;

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const typed = (v) => v !== null && v !== undefined && v !== '';

  // Printed rows of the sheet. text: fixed wording; detail: what goes in its brackets.
  // A row without text is a free row (description typed).
  const PAY_ROWS = [
    { text: 'Establishment', estab: true },
    { text: 'Supply, Deliver, Lay', detail: true, prefill: true },
    { text: 'Supply, Deliver, Lay', detail: true },
    { text: 'Supply, Deliver, Lay', detail: true },
    { text: 'Tack Coat', detail: true },
    {}, {}, {}, {},
  ];
  const CONTRACTOR_ROWS = [
    { text: 'm Profiler Hire', detail: true, detailFirst: true },
    { text: 'Profile Truck/s Hire', detail: true },
    { text: 'Profiler- Cutting Teeth' },
    { text: 'Traffic Control' },
    { text: 'Establishment- Light Towers', detail: true },
    { text: 'Establishment - VMS Boards', detail: true },
    { text: 'Waiting Time' },
    {}, {}, {},
  ];
  const ESTAB = [['crew', 'Crew'], ['mtv', 'MTV'], ['profiler', 'Profiler']];
  const NUM_COLS = [['qtyDelivered', 'QTY Delivered'], ['waste', 'Waste'], ['qtyUsed', 'Qty Used/ Invoiced'], ['m2Paved', 'm² Paved'], ['profiledM2', 'Profiled (m²)']];

  const blankItem = () => ({ no: '', description: '', detail: '', estab: [], unit: '', qtyDelivered: null, waste: null, qtyUsed: null, m2Paved: null, profiledM2: null });

  function ensure(shift) {
    const q = shift.quantities = shift.quantities || {};
    q.header = q.header || {};
    const fill = (list, n) => { list = list || []; while (list.length < n) list.push(blankItem()); return list.slice(0, n); };
    q.payItems = fill(q.payItems, PAY_ROWS.length);
    q.contractorItems = fill(q.contractorItems, CONTRACTOR_ROWS.length);
    q.payItems.concat(q.contractorItems).forEach((it) => { it.estab = it.estab || []; });
    if (q.workDescription === undefined) q.workDescription = null;
    if (q.variations === undefined) q.variations = '';
    if (q.comments === undefined) q.comments = '';
    q.colasSign = q.colasSign || { name: '', signature: '', date: '' };
    q.clientSign = q.clientSign || { name: '', signature: '', position: '', date: '' };
    return q;
  }

  // Values shown when nothing is typed: first "Supply, Deliver, Lay" from the traceability,
  // Qty Used = QTY Delivered − Waste
  function effective(job, shift, list, i) {
    const q = ensure(shift);
    const items = list === 'pay' ? q.payItems : q.contractorItems;
    const rows = list === 'pay' ? PAY_ROWS : CONTRACTOR_ROWS;
    const it = items[i];
    const def = {};
    if (rows[i].prefill && SL.forms.traceability) {
      const lv = SL.forms.traceability.lotValues(job, shift);
      def.detail = shift.product || '';
      def.unit = 't';
      def.qtyDelivered = num(lv.qtyDelivered);
      def.m2Paved = num(lv.m2Paved);
    }
    const v = {};
    ['no', 'description', 'detail', 'unit', 'qtyDelivered', 'waste', 'm2Paved', 'profiledM2'].forEach((k) => {
      v[k] = typed(it[k]) ? it[k] : (def[k] ?? (k === 'description' || k === 'detail' || k === 'unit' || k === 'no' ? '' : null));
    });
    const d = num(v.qtyDelivered), w = num(v.waste);
    v.qtyUsed = typed(it.qtyUsed) ? it.qtyUsed : (d !== null && w !== null ? round3(d - w) : null);
    v.estab = it.estab || [];
    return v;
  }

  const WT_LABEL = { supplyLay: 'Supply & Lay', profileFill: 'Profile & Fill', keyOverlay: 'Key & Overlay', profilePatch: 'Profile & Patch', repairWorks: 'Repair Works', other: 'Other' };
  const LY_LABEL = { base: 'Base', intermediate: 'Intermediate', wearing: 'Wearing', correction: 'Correction', other: 'Other' };
  function workDescription(shift) {
    const q = ensure(shift);
    if (typed(q.workDescription)) return q.workDescription;
    const wt = (shift.workType || []).map((k) => WT_LABEL[k]).filter(Boolean).join(', ');
    const ly = (shift.layer || []).map((k) => LY_LABEL[k]).filter(Boolean).join(', ');
    return [wt, ly].filter(Boolean).join(' – ');
  }

  function status(job, shift) {
    const q = shift.quantities;
    if (!q) return 'empty';
    if (q.colasSign && q.colasSign.signature && q.clientSign && q.clientSign.signature) return 'complete';
    const items = (q.payItems || []).concat(q.contractorItems || []);
    const any = items.some((it) => ['no', 'description', 'detail', 'unit', 'qtyDelivered', 'waste', 'qtyUsed', 'm2Paved', 'profiledM2'].some((k) => typed(it[k])) || (it.estab || []).length)
      || q.variations || q.comments || (q.colasSign && (q.colasSign.name || q.colasSign.signature)) || (q.clientSign && (q.clientSign.name || q.clientSign.signature));
    return any ? 'progress' : 'empty';
  }

  function itemRow(job, shift, list, i, row, it, save, refreshAll) {
    const cell = (el, w) => { el.className = `cell ${w}`; el.querySelector('label').className = 'cell-label'; return el; };
    const eff = () => effective(job, shift, list, i);
    const calc = (label, key, w, number = true) => {
      const el = cell(computed(label, it, key, () => eff()[key], () => { save(); refreshAll(); }, { number }), w);
      return el;
    };
    let desc;
    if (row.text) {
      const parts = [];
      if (row.detail && row.detailFirst) parts.push(calc('Detail', 'detail', 'w-xs', false));
      parts.push(h('span', { class: 'fixed' }, row.text));
      if (row.detail && !row.detailFirst) parts.push(calc('Detail (in brackets)', 'detail', 'w-s', false));
      if (row.estab) {
        parts.push(h('div', { class: 'choice mini' }, ESTAB.map(([v, l]) => {
          const input = h('input', { type: 'checkbox', checked: it.estab.includes(v) });
          input.addEventListener('change', () => {
            const s = new Set(it.estab);
            if (input.checked) s.add(v); else s.delete(v);
            it.estab = Array.from(s);
            save();
          });
          return h('label', { class: 'chk' }, input, h('span', {}, l));
        })));
      }
      desc = h('div', { class: 'cell w-xl desc' }, h('span', { class: 'cell-label' }, 'Description'), ...parts);
    } else {
      desc = cell(field('Description', it, 'description', save), 'w-xl');
    }
    return h('div', { class: 'trow' },
      cell(field('Pay Item No', it, 'no', save), 'w-xs'),
      desc,
      calc('Unit', 'unit', 'w-xs', false),
      ...NUM_COLS.map(([k, l]) => calc(l, k, 'w-s')));
  }

  function itemsTable(job, shift, list, title, save) {
    const q = ensure(shift);
    const items = list === 'pay' ? q.payItems : q.contractorItems;
    const rows = list === 'pay' ? PAY_ROWS : CONTRACTOR_ROWS;
    const box = h('div', { class: 'rows items' });
    // Computed cells (class 'cell') recalculate when a value of the row changes
    const refreshAll = () => box.querySelectorAll('.cell').forEach((f) => f.refresh && f.refresh());
    box.append(
      h('div', { class: 'trow thead', 'aria-hidden': 'true' },
        h('div', { class: 'cell w-xs' }, 'Pay Item No'), h('div', { class: 'cell w-xl' }, title), h('div', { class: 'cell w-xs' }, 'Unit'),
        NUM_COLS.map(([, l]) => h('div', { class: 'cell w-s' }, l))),
      ...rows.map((row, i) => itemRow(job, shift, list, i, row, items[i], save, refreshAll)));
    return box;
  }

  function signBlock(who, s, save, withPosition) {
    const dt = field('Date', s, 'date', save, { type: 'date' });
    const onSign = () => {
      if (s.signature && !s.date) { s.date = nowLocal().slice(0, 10); dt.querySelector('input').value = s.date; }
      save();
    };
    return h('div', { class: 'grid' },
      field(`${who} Representative`, s, 'name', save),
      withPosition ? field('Position', s, 'position', save) : null,
      dt,
      h('div', { class: 'field span-all' }, h('label', {}, 'Signature'), SL.canvas.signaturePad(s, 'signature', onSign, `${who} signature`)));
  }

  function render(job, shift, save) {
    const q = ensure(shift);
    return h('div', { class: 'sheet' },
      h('section', { class: 'block' },
        h('h3', {}, 'Header'),
        h('p', { class: 'muted small' }, 'Filled from the job and shift. A change here applies to this sheet only.'),
        h('div', { class: 'grid' },
          headerField('Client', q, 'client', job.client, save),
          headerField('Date', q, 'date', shift.date, save, { type: 'date' }),
          headerField('Project Title', q, 'projectTitle', job.projectTitle, save),
          headerField('Job Number', q, 'jobNumber', job.jobNumber, save),
          headerField('Suburb', q, 'suburb', job.suburb, save),
          computed('Work Description', q, 'workDescription', () => workDescription(shift), save),
          headerField('Supplying Plant', q, 'supplyingPlant', job.supplyingPlant, save),
          headerField('Haulage Distance (kms)', q, 'haulageKm', job.haulageKm, save, { inputmode: 'decimal', number: true }))),
      h('section', { class: 'block' },
        h('h3', {}, 'Pay items'),
        h('p', { class: 'muted small' }, 'Grey values come from the traceability (first “Supply, Deliver, Lay”) or are calculated (Qty Used = QTY Delivered − Waste). Typing replaces them.'),
        itemsTable(job, shift, 'pay', 'Pay Item Description', save)),
      h('section', { class: 'block' },
        h('h3', {}, 'Contractors items'),
        itemsTable(job, shift, 'contractor', 'Contractors Item Description', save)),
      h('section', { class: 'block' },
        textarea('Variations (e.g. Handwork, Change in depth)', q, 'variations', save, 2),
        textarea('Additional Comments', q, 'comments', save, 2)),
      h('section', { class: 'block' },
        h('h3', {}, 'COLAS Representative'),
        h('p', { class: 'muted small' }, 'The below representatives agree & accept the measured quantities in the Quantity & Placement Agreement Sheet. Signing includes the acceptance of above products and services placed by COLAS.'),
        signBlock('COLAS', q.colasSign, save, false)),
      h('section', { class: 'block' },
        h('h3', {}, 'Client Representative'),
        signBlock('Client', q.clientSign, save, true)),
    );
  }

  SL.forms = SL.forms || {};
  SL.forms.quantities = { render, status, ensure, effective, workDescription, PAY_ROWS, CONTRACTOR_ROWS };
})(window.SL = window.SL || {});
