/* Finish & send: mail draft (never sent by the app), shift JSON, send history.
   Two ways, as decided:
   - share(): Web Share with PDF + JSON attached (subject / body passed, To / CC copied to the clipboard)
   - mailto(): draft with To, CC, subject and body filled; PDF + JSON downloaded, attached by hand */
(function (SL) {
  'use strict';
  const { formatDate, nowIso, SCHEMA_VERSION } = SL.schema;

  const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  const isEmail = (s) => EMAIL.test(String(s || '').trim());

  const safe = (s) => String(s || '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
  const baseName = (job, shift) => `Lotpack_${safe(job.jobNumber || job.projectTitle || 'job')}_${shift.date || 'nodate'}`;
  const jsonName = (job, shift) => `${baseName(job, shift)}.json`;

  const dayNight = (shift) => (shift.shiftType === 'night' ? 'Night' : 'Day');
  const jobLabel = (job) => [job.jobNumber, job.projectTitle].filter(Boolean).join(' ');

  // Default subject: "Lotpack – <Job Number> <Project> – <date of the lotpack> (<Day/Night>)"; editable before sending
  function subject(job, shift) {
    return ['Lotpack', jobLabel(job), `${formatDate(shift.date)} (${dayNight(shift)})`].filter(Boolean).join(' – ');
  }

  // Sheets in the PDF, in pack order
  function sheetsIncluded(shift) {
    const pages = (shift.diagram && shift.diagram.pages) || [];
    const list = ['Approval to Proceed (MSF28-6)', `Site Diagram (MSF28-7)${pages.length > 1 ? ` – ${pages.length} drawing pages` : ''}`, 'Asphalt Traceability (MSF28-10)'];
    (shift.dipRecords || []).forEach((r, i) => list.push(`Pavement Measured Dip Record ${i + 1} (MSF28-9)`));
    (shift.surveys || []).forEach((r, i) => list.push(`Survey Record ${i + 1} (MSF28-12)`));
    list.push('Quantity & Placement Agreement (MSF28-11)');
    return list;
  }

  // Default body (English): job, shift, date, sheets included, attachments; editable before sending
  function body(job, shift, files) {
    const date = formatDate(shift.date);
    const what = [jobLabel(job), `${date} (${dayNight(shift)} shift)`].filter(Boolean).join(' – ');
    const lines = ['Hi,', '', `Please find attached the lot pack for ${what}.`, ''];
    lines.push('Sheets included:', ...sheetsIncluded(shift).map((n) => `- ${n}`), '');
    const names = (files || []).filter(Boolean);
    if (names.length) lines.push('Attachments:', ...names.map((n) => `- ${n}`), '');
    lines.push('Regards,');
    if (shift.completedBy) lines.push(shift.completedBy);
    return lines.join('\n');
  }

  // Local time with offset, e.g. 2026-11-04T09:00:00+11:00
  function isoLocal(d = new Date()) {
    const p = (n) => String(Math.abs(n)).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
  }

  // JSON of one shift, in the exchange format of docs/ARCHITECTURE.md (one job, one shift)
  function shiftJson(job, shift) {
    const { shifts, ...jobFields } = job;
    const data = {
      schemaVersion: SCHEMA_VERSION,
      app: 'strata-lotpack',
      exportedAt: isoLocal(),
      jobs: [{ ...jobFields, shifts: [shift] }],
    };
    return JSON.stringify(data, null, 2);
  }

  // Everything the draft needs, built before the button is pressed (sharing must start
  // right after the tap, so the PDF cannot be built at that moment)
  async function prepare(job, shift) {
    const pdfBytes = await SL.pdf.build(job, shift);
    const pdfName = SL.pdf.fileName(job, shift);
    const jName = jsonName(job, shift);
    const pdf = new File([pdfBytes], pdfName, { type: 'application/pdf' });
    const json = new File([shiftJson(job, shift)], jName, { type: 'application/json' });
    return { pdf, json, subject: subject(job, shift), body: body(job, shift, [pdfName, jName]) };
  }

  const canShareFiles = (files) => {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files })); } catch (e) { return false; }
  };

  const recipientsText = (to, cc) => [to.length ? `To: ${to.join('; ')}` : '', cc.length ? `CC: ${cc.join('; ')}` : ''].filter(Boolean).join('\n');

  // Must be called directly from the tap: clipboard and share both start at once
  function share(pack, to, cc) {
    const clip = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(recipientsText(to, cc)).then(() => true, () => false)
      : Promise.resolve(false);
    const shared = navigator.share({ files: [pack.pdf, pack.json], title: pack.subject, text: pack.body });
    return Promise.all([shared, clip]).then(([, copied]) => ({ copied }));
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function mailtoUrl(pack, to, cc) {
    const q = [];
    if (cc.length) q.push(`cc=${encodeURIComponent(cc.join(','))}`);
    q.push(`subject=${encodeURIComponent(pack.subject)}`);
    q.push(`body=${encodeURIComponent(pack.body)}`);
    return `mailto:${to.map(encodeURIComponent).join(',')}?${q.join('&')}`;
  }

  // Downloads the two files, then opens the mail app on a filled draft
  async function mailto(pack, to, cc) {
    download(pack.pdf);
    await new Promise((r) => setTimeout(r, 400));
    download(pack.json);
    await new Promise((r) => setTimeout(r, 400));
    SL.mail._open(mailtoUrl(pack, to, cc));
  }

  // Send history: who, to whom, CC, when the draft was created
  function logDraft(shift, entry) {
    shift.sendLog = (shift.sendLog || []).filter((e) => e && e.sentAt);
    shift.sendLog.push({ sentBy: entry.sentBy || '', to: entry.to, cc: entry.cc, sentAt: isoLocal(), method: entry.method, files: entry.files });
    shift.status = 'sent';
  }

  SL.mail = {
    isEmail, subject, body, sheetsIncluded, shiftJson, jsonName, prepare, canShareFiles, share, mailto, mailtoUrl,
    recipientsText, logDraft, isoLocal,
    _open: (url) => { window.location.href = url; },
  };
})(window.SL = window.SL || {});
