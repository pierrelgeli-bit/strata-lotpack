/* IndexedDB storage: CRUD + debounced autosave */
(function (SL) {
  'use strict';

  const DB_NAME = 'strata-lotpack';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available in this browser.')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database blocked by another open tab.'));
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s);
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    }));
  }

  const getAllJobs = () => tx('jobs', 'readonly', (s) => s.getAll())
    .then((jobs) => (jobs || []).map(SL.schema.migrateJob));
  const getJob = (id) => tx('jobs', 'readonly', (s) => s.get(id))
    .then((j) => (j ? SL.schema.migrateJob(j) : null));
  const putJob = (job) => tx('jobs', 'readwrite', (s) => s.put(job));
  const deleteJob = (id) => tx('jobs', 'readwrite', (s) => s.delete(id));
  const getMeta = (key) => tx('meta', 'readonly', (s) => s.get(key)).then((r) => (r ? r.value : undefined));
  const putMeta = (key, value) => tx('meta', 'readwrite', (s) => s.put({ key, value }));

  // ---- Autosave -------------------------------------------------------
  const pending = new Map(); // id -> job
  let timer = null;
  const listeners = new Set();
  const emit = (state) => listeners.forEach((fn) => fn(state));

  function flush() {
    clearTimeout(timer); timer = null;
    if (!pending.size) return Promise.resolve();
    const jobs = Array.from(pending.values());
    pending.clear();
    return Promise.all(jobs.map(putJob))
      .then(() => emit('saved'))
      .catch((e) => { console.error(e); emit('error'); });
  }

  // Mark a job changed; written to IndexedDB after a short pause
  function touch(job, shift) {
    const t = SL.schema.nowIso();
    job.updatedAt = t;
    if (shift) shift.updatedAt = t;
    pending.set(job.id, job);
    emit('saving');
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  // Settings / contacts: written at once, shown in the save indicator
  function saveMeta(key, value) {
    emit('saving');
    return putMeta(key, value)
      .then(() => emit('saved'))
      .catch((e) => { console.error(e); emit('error'); });
  }

  // Do not lose the last keystrokes when the tab is hidden or closed
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);

  SL.db = {
    open, getAllJobs, getJob, putJob, deleteJob, getMeta, putMeta, saveMeta,
    touch, flush, onSaveState: (fn) => listeners.add(fn),
  };
})(window.SL = window.SL || {});
