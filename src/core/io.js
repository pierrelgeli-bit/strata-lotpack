/* JSON export / import with merge.
   Merge by id, shift by shift: the version with the most recent updatedAt wins; the report lists
   what was added, replaced and kept, so the user sees every conflict before applying.
   Device settings (theme, default name, always CC) are never overwritten; contacts are merged by email. */
(function (SL) {
  'use strict';
  const { SCHEMA_VERSION, migrateJob, formatDate } = SL.schema;

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const newer = (a, b) => String(a || '') > String(b || '');
  const jobLabel = (j) => [j.jobNumber, j.projectTitle].filter(Boolean).join(' – ') || 'Untitled job';

  async function exportAll() {
    const [jobs, contacts, settings] = await Promise.all([SL.db.getAllJobs(), SL.db.getMeta('contacts'), SL.db.getMeta('settings')]);
    return {
      schemaVersion: SCHEMA_VERSION,
      app: 'strata-lotpack',
      exportedAt: SL.mail.isoLocal(),
      contacts: contacts || [],
      settings: Object.assign(SL.schema.defaultSettings(), settings || {}),
      jobs,
    };
  }

  function exportJob(job) {
    return { schemaVersion: SCHEMA_VERSION, app: 'strata-lotpack', exportedAt: SL.mail.isoLocal(), jobs: [job] };
  }

  // Throws a readable error when the file is not a Strata Lotpack export
  function parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('This file is not valid JSON.'); }
    if (!data || data.app !== 'strata-lotpack' || !Array.isArray(data.jobs)) throw new Error('This file is not a Strata Lotpack export.');
    const v = Number(data.schemaVersion || 1);
    if (v > SCHEMA_VERSION) throw new Error(`This file comes from a newer version of the app (schema ${v}); update the app first.`);
    data.jobs = data.jobs.map((j) => {
      if (!j || !j.id || !Array.isArray(j.shifts)) throw new Error('A job in this file is incomplete.');
      // keep the object exactly as exported (key order included) so a round trip is lossless
      const o = clone(j);
      if (!o.schemaVersion) o.schemaVersion = v;
      return migrateJob(o);
    });
    data.contacts = Array.isArray(data.contacts) ? data.contacts.filter((c) => c && c.email) : [];
    return data;
  }

  // Compare local data with an imported file; nothing is written here
  function plan(localJobs, localContacts, incoming) {
    const byId = new Map(localJobs.map((j) => [j.id, j]));
    const rows = [];        // report lines
    const changed = [];     // jobs to write
    const n = { jobsAdded: 0, shiftsAdded: 0, replaced: 0, kept: 0, unchanged: 0 };

    incoming.jobs.forEach((inc) => {
      const loc = byId.get(inc.id);
      if (!loc) {
        changed.push(clone(inc));
        n.jobsAdded++; n.shiftsAdded += inc.shifts.length;
        rows.push({ job: jobLabel(inc), what: `Job (${inc.shifts.length} shift${inc.shifts.length === 1 ? '' : 's'})`, action: 'added' });
        return;
      }
      const merged = clone(loc);
      let touched = false;
      // Job details (everything but the shifts)
      const { shifts: s1, ...locFields } = loc;
      const { shifts: s2, ...incFields } = inc;
      const strip = (o) => { const { updatedAt, schemaVersion, ...r } = o; return r; };
      if (!same(strip(locFields), strip(incFields))) {
        if (newer(inc.updatedAt, loc.updatedAt)) {
          Object.assign(merged, clone(incFields), { shifts: merged.shifts });
          touched = true; n.replaced++;
          rows.push({ job: jobLabel(inc), what: 'Job details', action: 'replaced', local: loc.updatedAt, imported: inc.updatedAt });
        } else {
          n.kept++;
          rows.push({ job: jobLabel(loc), what: 'Job details', action: 'kept', local: loc.updatedAt, imported: inc.updatedAt });
        }
      }
      // Shifts, one by one
      inc.shifts.forEach((is) => {
        const k = merged.shifts.findIndex((x) => x.id === is.id);
        const what = `Shift ${formatDate(is.date) || '(no date)'}`;
        if (k < 0) {
          merged.shifts.push(clone(is));
          touched = true; n.shiftsAdded++;
          rows.push({ job: jobLabel(merged), what, action: 'added' });
          return;
        }
        const ls = merged.shifts[k];
        if (same(ls, is)) { n.unchanged++; return; }
        if (newer(is.updatedAt, ls.updatedAt)) {
          merged.shifts[k] = clone(is);
          touched = true; n.replaced++;
          rows.push({ job: jobLabel(merged), what, action: 'replaced', local: ls.updatedAt, imported: is.updatedAt });
        } else {
          n.kept++;
          rows.push({ job: jobLabel(merged), what, action: 'kept', local: ls.updatedAt, imported: is.updatedAt });
        }
      });
      if (touched) {
        if (newer(inc.updatedAt, merged.updatedAt)) merged.updatedAt = inc.updatedAt;
        changed.push(merged);
      }
    });

    // Contacts: union by email, most recent use kept
    const contacts = clone(localContacts || []);
    let contactsAdded = 0;
    (incoming.contacts || []).forEach((c) => {
      const mine = contacts.find((x) => x.email.toLowerCase() === c.email.toLowerCase());
      if (!mine) { contacts.push(clone(c)); contactsAdded++; } else {
        if (!mine.name && c.name) mine.name = c.name;
        if (newer(c.lastUsed, mine.lastUsed)) mine.lastUsed = c.lastUsed;
      }
    });

    return { rows, changed, contacts, counts: { ...n, contactsAdded }, nothingToDo: !changed.length && !contactsAdded };
  }

  async function apply(p) {
    for (const job of p.changed) await SL.db.putJob(job);
    await SL.db.putMeta('contacts', p.contacts);
  }

  function download(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  SL.io = { exportAll, exportJob, parse, plan, apply, download, jobLabel };
})(window.SL = window.SL || {});
