/* Data model, schema version and migrations */
(function (SL) {
  'use strict';

  const SCHEMA_VERSION = 1;

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
      client: '', projectTitle: '', jobNumber: '', suburb: '',
      supplyingPlant: '', haulageKm: null,
      shifts: [],
      createdAt: t, updatedAt: t,
    };
  }

  // Common fields (product, completed by) carry over from the job's latest shift
  function newShift(job, settings) {
    const t = nowIso();
    const prev = job && job.shifts.length ? job.shifts[job.shifts.length - 1] : null;
    return {
      id: uuid(),
      date: todayIso(),
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

  // Each step i -> i+1 lives here; none yet (schema v1)
  const MIGRATIONS = {};

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
    SCHEMA_VERSION, uuid, nowIso, todayIso, formatDate,
    defaultSettings, newJob, newShift, migrateJob,
  };
})(window.SL = window.SL || {});
