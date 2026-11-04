/* Data model, schema version and migrations */
(function (SL) {
  'use strict';

  const SCHEMA_VERSION = 2;

  // Drawing / legend colours (a legend's Key is its colour)
  const PALETTE = ['#d11f1f', '#1f4fd1', '#16893a', '#e07b00', '#7b2fbf', '#8a5a2b', '#0f8a8a', '#111111'];

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  const nowIso = () => new Date().toISOString();

  // Local calendar date as YYYY-MM-DD (device time zone)
  function todayIso() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // YYYY-MM-DD -> DD/MM/YYYY
  function formatDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function defaultSettings() {
    return { theme: 'system', alwaysCc: '', defaultCompletedBy: '' };
  }

  function newJob() {
    const t = nowIso();
    return {
      id: uuid(),
      client: '', projectTitle: '', jobNumber: '',
      shifts: [],
      createdAt: t, updatedAt: t,
    };
  }

  // Shift order everywhere: date ascending, day before night
  const shiftOrder = (a, b) => (a.date || '').localeCompare(b.date || '')
    || (a.shiftType === 'night' ? 1 : 0) - (b.shiftType === 'night' ? 1 : 0);

  // Shift details carry over from the job's latest shift
  function newShift(job, settings) {
    const t = nowIso();
    const prev = job && job.shifts.length ? job.shifts.slice().sort(shiftOrder)[job.shifts.length - 1] : null;
    return {
      id: uuid(),
      date: todayIso(),
      shiftType: 'day',
      suburb: prev ? prev.suburb || '' : '',
      supplyingPlant: prev ? prev.supplyingPlant || '' : '',
      haulageKm: prev ? prev.haulageKm ?? null : null,
      product: prev ? prev.product : '',
      nominatedThickness: prev ? prev.nominatedThickness : null,
      workType: [], layer: [],
      weather: '',
      approval: {},
      traceability: { loads: [], envReadings: [] },
      diagram: { pages: [] },
      dipRecords: [],
      surveys: [],
      quantities: {},
      completedBy: (prev && prev.completedBy) || (settings && settings.defaultCompletedBy) || '',
      sendLog: [],
      status: 'draft',
      createdAt: t, updatedAt: t,
    };
  }

  const LAYER_KEYS = ['base', 'intermediate', 'wearing', 'correction', 'other'];

  // Each step i -> i+1
  const MIGRATIONS = {
    // v1 -> v2: suburb / plant / haulage move from the job to each shift (Shift details);
    // shift type; diagram legends become a list with a colour key, Completed by from the shift
    1: (job) => {
      const { suburb = '', supplyingPlant = '', haulageKm = null } = job;
      (job.shifts || []).forEach((s) => {
        if (s.suburb === undefined) s.suburb = suburb || '';
        if (s.supplyingPlant === undefined) s.supplyingPlant = supplyingPlant || '';
        if (s.haulageKm === undefined) s.haulageKm = haulageKm ?? null;
        if (!s.shiftType) s.shiftType = 'day';
        const pages = (s.diagram && s.diagram.pages) || [];
        pages.forEach((p) => {
          p.legends = (p.legends || []).filter((l) => l && ['key', 'mix', 'layer', 'depth', 'area', 'tonnes'].some((k) => l[k] !== '' && l[k] !== null && l[k] !== undefined))
            .map((l, i) => ({
              color: PALETTE[i % PALETTE.length],
              mix: l.mix || null,
              // null = take the shift's layer (Approval); a list = edited on the legend
              layer: ((arr) => (arr.length ? arr : null))(String(l.layer || '').toLowerCase().split(/[\s,/]+/).filter((x) => LAYER_KEYS.includes(x))),
              depth: l.depth === '' || l.depth === undefined ? null : l.depth,
              area: l.area ?? null,
              tonnes: l.tonnes ?? null,
            }));
          delete p.completedBy;
        });
      });
      delete job.suburb; delete job.supplyingPlant; delete job.haulageKm;
      return job;
    },
  };

  function migrateJob(job) {
    let v = job.schemaVersion || 1;
    while (v < SCHEMA_VERSION) {
      const step = MIGRATIONS[v];
      if (!step) throw new Error(`No migration from schema ${v}`);
      job = step(job);
      v += 1;
    }
    job.schemaVersion = SCHEMA_VERSION;
    return job;
  }

  SL.schema = {
    SCHEMA_VERSION, PALETTE, LAYER_KEYS, uuid, nowIso, todayIso, formatDate,
    defaultSettings, newJob, newShift, migrateJob, shiftOrder,
  };
})(window.SL = window.SL || {});
