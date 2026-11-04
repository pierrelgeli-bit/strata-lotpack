/* PDF generation: the official COLAS lotpack, cleaned of its printed page numbers by
   tools/make-template.py (src/assets/lotpack-template.pdf), is used as the background; values, ticks and signatures are written on top with pdf-lib.
   Coordinates below are in PDF points measured from the TOP of the template page. */
(function (SL) {
  'use strict';

  // Replaced by build/build.js with the base64 of src/assets/lotpack-template.pdf
  const TEMPLATE_B64 = '__TEMPLATE_PDF_BASE64__';

  const INK = [0.05, 0.15, 0.55]; // blue pen, like a hand-filled form

  // Template pages (0-based index in Lot_Package_PL.pdf) and where their printed page number sits
  const TEMPLATES = {
    approval: { index: 0, pageNo: { cx: 291, baselineTop: 838.1, size: 9 } },
    traceability: { index: 1, pageNo: { cx: 409.2, baselineTop: 584.7, size: 10 } },
    traceabilityCont: { index: 2, pageNo: { cx: 409.2, baselineTop: 584.7, size: 10 } },
  };

  // ---------------------------------------------------------------------
  // Field layout of each sheet
  // text:   [key, x0, x1, baselineTop, size]
  // tick:   [key, cx, cy]
  // ---------------------------------------------------------------------
  const APPROVAL = {
    header: [
      ['client', 228, 348, 72.5, 10],
      ['date', 488, 557, 72.5, 10],
      ['projectTitle', 228, 348, 92.5, 10],
      ['jobNumber', 488, 557, 92.5, 10],
      ['suburb', 228, 557, 112.5, 10],
      ['product', 127, 348, 166, 10],
      ['nominatedThickness', 456, 557, 166, 10],
    ],
    workType: [
      ['supplyLay', 64.9, 128.6], ['profileFill', 154.6, 128.6], ['keyOverlay', 255.4, 128.6],
      ['profilePatch', 61.9, 142.0], ['repairWorks', 152.0, 142.0], ['other', 254.4, 142.0],
    ],
    layer: [
      ['base', 365.6, 128.6], ['intermediate', 427.5, 128.6], ['wearing', 508.4, 128.6],
      ['correction', 366.9, 142.0], ['other', 509.1, 142.0],
    ],
    checks: [
      ['plant', 42.6, 234.7], ['plantRisk', 335.0, 233.3], ['plantService', 426.8, 233.3], ['plantRegistration', 500.6, 233.3],
      ['materials', 42.6, 251.5],
      ['surface', 42.6, 274.1], ['surfaceSwept', 334.6, 272.7], ['surfaceTack', 479.0, 272.7],
      ['base', 42.6, 290.9], ['baseSoft', 334.6, 289.4], ['baseSealDamage', 411.4, 289.4], ['baseWet', 501.9, 289.4],
      ['thickness', 42.6, 307.7], ['thicknessNominated', 335.2, 306.2], ['thicknessSurveyed', 412.2, 306.2],
      ['wind', 42.6, 324.5],
      ['underlying', 42.6, 341.3],
      ['pavementTemp', 42.6, 358.1],
    ],
    // 14 ruled lines between y=404.8 and y=588.8
    commentRows: [404.8, 418.0, 431.0, 444.2, 457.4, 470.5, 483.7, 496.8, 510.0, 523.1, 536.3, 549.5, 562.6, 575.8, 588.8],
    colas: { name: [40, 226, 662.5, 10], sign: { x0: 246, x1: 418, top: 631, bottom: 665 }, dateTime: [437, 558, 662.5, 10] },
    clientComments: [[100, 557, 707.5], [40, 557, 720.5], [40, 557, 733.6]],
    client: {
      name: [38, 221, 760.5, 10], sign: { x0: 240, x1: 349, top: 737.5, bottom: 763 },
      position: [368, 482, 760.5, 10], dateTime: [498, 561, 760.5, 9],
    },
  };

  // MSF28-10: [x0, x1] of each column; tipTime also has the x of its printed ':'
  const TRACE_COLS_1 = {
    no: [24.4, 53.2], docket: [53.2, 151.7], tonnes: [151.7, 208.4], progress: [208.4, 258], tip: [258, 321.8, 289.8],
    temp: [321.8, 367.1], chStart: [367.1, 412.2], chEnd: [412.2, 461.6], run: [461.6, 496.7], width: [496.7, 532],
    wind: [532, 588.1], pav: [588.1, 644.5], comment: [644.5, 817.4],
  };
  const TRACE_COLS_2 = {
    no: [24.4, 53.0], docket: [53.0, 151.7], tonnes: [151.7, 201.4], progress: [201.4, 250.9], tip: [250.9, 307.7, 279.0],
    temp: [307.7, 357.2], chStart: [357.2, 406.9], chEnd: [406.9, 456.5], run: [456.5, 491.9], width: [491.9, 527.3],
    wind: [527.3, 584.0], pav: [584.0, 640.7], comment: [640.7, 817.4],
  };
  const TRACE = {
    rowH: 13.93,
    first: { top0: 191.9, rows: 23, cols: TRACE_COLS_1 },
    cont: { top0: 99.7, rows: 31, cols: TRACE_COLS_2, pageNo: { num: [386, 442, 541.6], total: [452, 524, 541.6] } },
    header: [
      ['client', 62, 294, 73.8, 9.5],
      ['date', 330, 440, 73.8, 9.5],
      ['projectTitle', 88, 294, 87.3, 9.5],
      ['jobNumber', 362, 440, 87.3, 9.5],
      ['suburb', 68, 294, 100.6, 9.5],
      ['product', 70, 440, 123.6, 9.5],
      ['nominatedThickness', 578, 808, 123.6, 9.5],
    ],
    weather: [395, 500, 100.6, 9],
    tackLitres: [663, 697, 73.0, 9],
    tackM2: [712, 750, 73.0, 9],
    // words to circle: [x0, x1, top, bottom]
    tackBroken: { yes: [682.6, 698.9, 78.8, 88.8], no: [729.4, 742.3, 78.8, 88.8] },
    surfaceClean: { yes: [772.2, 788.4, 93.4, 103.3], no: [796.8, 809.5, 93.4, 103.3] },
    workType: [
      ['supplyLay', 36.6, 134.2], ['profileFill', 154.2, 134.2], ['keyOverlay', 274.5, 134.2],
      ['profilePatch', 36.6, 147.5], ['repairWorks', 153.0, 147.5], ['other', 274.8, 147.5],
    ],
    layer: [
      ['base', 455.1, 134.2], ['intermediate', 581.0, 134.2], ['wearing', 703.5, 134.2],
      ['correction', 455.1, 147.5], ['other', 582.1, 147.5],
    ],
    lot: {
      qtyDelivered: [92, 150, 536.4, 8.5, 'center'], qtyPaved: [208, 256, 536.4, 8.5, 'center'],
      m2Paved: [352, 420, 536.4, 8.5, 'center'], completedBy: [92, 420, 550.2, 8.5, 'left'],
    },
    qa: {
      tempsRecorded: { yes: [546.8, 533.9], no: [589.1, 533.9] },
      dipsRecorded: { yes: [730.4, 533.9], no: [772.7, 533.9] },
      labDiscussed: { yes: [679.8, 547.9], no: [721.9, 547.9] },
    },
  };

  // ---------------------------------------------------------------------
  let templateBytes = null;
  function template() {
    if (!templateBytes) {
      const bin = atob(TEMPLATE_B64);
      templateBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) templateBytes[i] = bin.charCodeAt(i);
    }
    return templateBytes;
  }

  const fmtDateTime = (v) => {
    if (!v) return '';
    const [d, t] = String(v).split('T');
    return `${SL.schema.formatDate(d)}${t ? ' ' + t.slice(0, 5) : ''}`;
  };

  // Writer bound to one output page; all coordinates measured from the top
  function writer(page, fonts) {
    const H = page.getHeight();
    const { rgb } = PDFLib;
    const ink = rgb(...INK);

    // Keep only characters the standard font can encode
    const clean = (s, font) => Array.from(String(s ?? '')).map((ch) => {
      try { font.encodeText(ch); return ch; } catch (e) { return '?'; }
    }).join('').replace(/\s+/g, ' ').trim();

    // Single line, shrunk (down to 6 pt) then cut to fit the box
    function text(value, x0, x1, baselineTop, size = 10, opts = {}) {
      const font = opts.bold ? fonts.bold : fonts.regular;
      let s = clean(value, font);
      if (!s) return;
      const w = x1 - x0;
      let sz = size;
      while (sz > 6 && font.widthOfTextAtSize(s, sz) > w) sz -= 0.5;
      while (s.length > 1 && font.widthOfTextAtSize(s, sz) > w) s = s.slice(0, -2) + '…';
      let x = x0;
      if (opts.align === 'center') x = x0 + (w - font.widthOfTextAtSize(s, sz)) / 2;
      if (opts.align === 'right') x = x1 - font.widthOfTextAtSize(s, sz);
      page.drawText(s, { x, y: H - baselineTop, size: sz, font, color: opts.color || ink });
    }

    // Wrap a paragraph over several lines [[x0, x1, baselineTop], ...]; returns overflow text
    function lines(value, rows, size = 9) {
      const font = fonts.regular;
      const words = String(value ?? '').split(/\s+/).filter(Boolean);
      let i = 0;
      for (const [x0, x1, top] of rows) {
        let line = '';
        while (i < words.length) {
          const next = line ? `${line} ${words[i]}` : words[i];
          if (font.widthOfTextAtSize(clean(next, font), size) > x1 - x0 && line) break;
          line = next; i++;
        }
        if (line) text(line, x0, x1, top, size);
      }
      return words.slice(i).join(' ');
    }

    // Hand-drawn style tick (cross) centred on the printed box
    function tick(cx, cy, half = 3.1) {
      const y = H - cy;
      page.drawLine({ start: { x: cx - half, y: y - half }, end: { x: cx + half, y: y + half }, thickness: 1.3, color: ink });
      page.drawLine({ start: { x: cx - half, y: y + half }, end: { x: cx + half, y: y - half }, thickness: 1.3, color: ink });
    }

    // PNG image fitted (keeping proportions) in a box, centred
    function image(img, box) {
      const bw = box.x1 - box.x0, bh = box.bottom - box.top;
      const k = Math.min(bw / img.width, bh / img.height);
      const w = img.width * k, hgt = img.height * k;
      page.drawImage(img, { x: box.x0 + (bw - w) / 2, y: H - box.bottom + (bh - hgt) / 2, width: w, height: hgt });
    }

    // Circle a printed word (Yes / No answers without boxes)
    function circle([x0, x1, top, bottom]) {
      page.drawEllipse({
        x: (x0 + x1) / 2, y: H - (top + bottom) / 2 - 0.6,
        xScale: (x1 - x0) / 2 + 3.5, yScale: (bottom - top) / 2 + 1.2,
        borderColor: ink, borderWidth: 1.1,
      });
    }

    return { text, lines, tick, image, circle };
  }

  async function embedSignature(doc, dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image/png')) return null;
    try { return await doc.embedPng(dataUrl); } catch (e) { console.error(e); return null; }
  }

  // Header values: the sheet's local override, else the job / shift common value
  function headerValues(job, shift, sheet) {
    const o = (sheet && sheet.header) || {};
    const pick = (k, v) => (o[k] !== undefined && o[k] !== null && o[k] !== '' ? o[k] : v);
    const thick = pick('nominatedThickness', shift.nominatedThickness);
    return {
      client: pick('client', job.client),
      projectTitle: pick('projectTitle', job.projectTitle),
      jobNumber: pick('jobNumber', job.jobNumber),
      suburb: pick('suburb', job.suburb),
      date: SL.schema.formatDate(pick('date', shift.date)),
      product: pick('product', shift.product),
      nominatedThickness: thick === null || thick === undefined || thick === '' ? '' : `${thick} mm`,
    };
  }

  // ---------------------------------------------------------------------
  async function drawApproval(doc, page, fonts, job, shift) {
    const w = writer(page, fonts);
    const a = shift.approval || {};
    const hv = headerValues(job, shift, a);
    APPROVAL.header.forEach(([k, x0, x1, top, size]) => w.text(hv[k], x0, x1, top, size));

    const wt = new Set(shift.workType || []);
    APPROVAL.workType.forEach(([k, cx, cy]) => wt.has(k) && w.tick(cx, cy));
    const ly = new Set(shift.layer || []);
    APPROVAL.layer.forEach(([k, cx, cy]) => ly.has(k) && w.tick(cx, cy));

    const checks = a.checks || {};
    APPROVAL.checks.forEach(([k, cx, cy]) => checks[k] && w.tick(cx, cy));

    const rows = APPROVAL.commentRows.slice(1).map((bottom) => [40, 557, bottom - 3.4]);
    w.lines(a.comments, rows, 9);

    const cs = a.colasSign || {};
    w.text(cs.name, ...APPROVAL.colas.name);
    const csImg = await embedSignature(doc, cs.signature);
    if (csImg) w.image(csImg, APPROVAL.colas.sign);
    w.text(fmtDateTime(cs.dateTime), ...APPROVAL.colas.dateTime);

    w.lines(a.clientComments, APPROVAL.clientComments, 9);
    const cl = a.clientSign || {};
    w.text(cl.name, ...APPROVAL.client.name);
    const clImg = await embedSignature(doc, cl.signature);
    if (clImg) w.image(clImg, APPROVAL.client.sign);
    w.text(cl.position, ...APPROVAL.client.position);
    w.text(fmtDateTime(cl.dateTime), ...APPROVAL.client.dateTime);
  }

  const fmtNum = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

  // One table row of MSF28-10 (truck and / or reading)
  function traceRow(w, cols, top, row) {
    const base = top + 9.9;
    const c = (k, v, align = 'center', size = 8) => w.text(fmtNum(v), cols[k][0] + 2, cols[k][1] - 2, base, size, { align });
    const l = row.load;
    if (l) {
      c('no', l.no); c('docket', l.docket, 'left'); c('tonnes', l.tonnes); c('progress', l.progress);
      if (/^\d{1,2}:\d{2}$/.test(l.tipTime || '')) {
        const [hh, mm] = l.tipTime.split(':');
        const colon = cols.tip[2];
        w.text(hh.padStart(2, '0'), cols.tip[0] + 2, colon - 2, base, 8, { align: 'right' });
        w.text(mm, colon + 2.5, cols.tip[1] - 2, base, 8);
      }
      c('temp', l.temp); c('chStart', l.chStart); c('chEnd', l.chEnd); c('run', l.run); c('width', l.width);
      c('comment', l.comment, 'left', 7.5);
    }
    const r = row.reading;
    if (r) {
      // reading time in small, value on the right of the wind cell
      w.text(r.time || '', cols.wind[0] + 1.5, cols.wind[0] + 24, base - 0.5, 5.5);
      w.text(fmtNum(r.windKmh), cols.wind[0] + 24, cols.wind[1] - 3, base, 8, { align: 'right' });
      c('pav', r.pavementTemp);
    }
  }

  async function drawTraceability(doc, page, fonts, job, shift, entry) {
    const w = writer(page, fonts);
    const t = SL.forms.traceability.ensure(shift);
    const hv = headerValues(job, shift, t);
    TRACE.header.forEach(([k, x0, x1, top, size]) => w.text(hv[k], x0, x1, top, size));
    w.text(shift.weather, ...TRACE.weather);
    w.text(fmtNum(t.tackRate.litres), ...TRACE.tackLitres, { align: 'center' });
    w.text(fmtNum(t.tackRate.m2), ...TRACE.tackM2, { align: 'center' });
    if (TRACE.tackBroken[t.tackBroken]) w.circle(TRACE.tackBroken[t.tackBroken]);
    if (TRACE.surfaceClean[t.surfaceClean]) w.circle(TRACE.surfaceClean[t.surfaceClean]);
    const wt = new Set(shift.workType || []);
    TRACE.workType.forEach(([k, cx, cy]) => wt.has(k) && w.tick(cx, cy));
    const ly = new Set(shift.layer || []);
    TRACE.layer.forEach(([k, cx, cy]) => ly.has(k) && w.tick(cx, cy));

    entry.rows.forEach((row, i) => traceRow(w, TRACE.first.cols, TRACE.first.top0 + i * TRACE.rowH, row));

    const lv = SL.forms.traceability.lotValues(job, shift);
    Object.entries(TRACE.lot).forEach(([k, [x0, x1, top, size, align]]) => w.text(fmtNum(lv[k]), x0, x1, top, size, { align }));
    Object.entries(TRACE.qa).forEach(([k, pos]) => { const p = pos[t.qa[k]]; if (p) w.tick(p[0], p[1]); });
  }

  async function drawTraceabilityCont(doc, page, fonts, job, shift, entry, i, n) {
    const w = writer(page, fonts);
    entry.rows.forEach((row, k) => traceRow(w, TRACE.cont.cols, TRACE.cont.top0 + k * TRACE.rowH, row));
    // "Page Number : __ of __" printed in the table: same numbering as the footer
    w.text(String(i + 1), ...TRACE.cont.pageNo.num, 10, { align: 'center' });
    w.text(String(n), ...TRACE.cont.pageNo.total, 10, { align: 'center' });
  }

  // MSF28-10 pages: 23 rows on the first page, 31 on each continuation page
  function tracePages(shift) {
    const rows = SL.forms.traceability.tableRows(shift);
    const pages = [{ template: 'traceability', draw: drawTraceability, rows: rows.slice(0, TRACE.first.rows) }];
    for (let k = TRACE.first.rows; k < rows.length; k += TRACE.cont.rows) {
      pages.push({ template: 'traceabilityCont', draw: drawTraceabilityCont, rows: rows.slice(k, k + TRACE.cont.rows) });
    }
    return pages;
  }

  // Sheets of a shift, in pack order: [{ template, draw, ...data }]
  function packPlan(job, shift) {
    return [
      { template: 'approval', draw: drawApproval },
      ...tracePages(shift),
    ];
  }

  // Continuous "Page X of Y" where the paper printed its own (removed from the template)
  function paginate(pages, plan, fonts) {
    const n = pages.length;
    pages.forEach((page, i) => {
      const t = TEMPLATES[plan[i].template].pageNo;
      if (!t) return;
      const black = PDFLib.rgb(0, 0, 0);
      const sz = t.size || 9;
      const parts = [['Page ', fonts.regular], [String(i + 1), fonts.bold], [' of ', fonts.regular], [String(n), fonts.bold]];
      const total = parts.reduce((s, [txt, f]) => s + f.widthOfTextAtSize(txt, sz), 0);
      let x = t.cx - total / 2;
      const y = page.getHeight() - t.baselineTop;
      parts.forEach(([txt, f]) => { page.drawText(txt, { x, y, size: sz, font: f, color: black }); x += f.widthOfTextAtSize(txt, sz); });
    });
  }

  // Build the lotpack PDF of one shift; returns Uint8Array
  async function build(job, shift) {
    const { PDFDocument, StandardFonts } = PDFLib;
    const src = await PDFDocument.load(template());
    const doc = await PDFDocument.create();
    const fonts = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    const plan = packPlan(job, shift);
    const copied = await doc.copyPages(src, plan.map((p) => TEMPLATES[p.template].index));
    const pages = [];
    for (let i = 0; i < plan.length; i++) {
      const page = doc.addPage(copied[i]);
      await plan[i].draw(doc, page, fonts, job, shift, plan[i], i, plan.length);
      pages.push(page);
    }
    paginate(pages, plan, fonts);
    const title = `Lotpack – ${job.projectTitle || job.jobNumber || 'Job'} – ${SL.schema.formatDate(shift.date)}`;
    doc.setTitle(title);
    doc.setCreator('Strata Lotpack');
    doc.setProducer('Strata Lotpack');
    return doc.save();
  }

  function fileName(job, shift) {
    const safe = (s) => String(s || '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
    return `Lotpack_${safe(job.jobNumber || job.projectTitle || 'job')}_${shift.date || 'nodate'}.pdf`;
  }

  SL.pdf = { build, fileName, headerValues, _layout: { APPROVAL, TEMPLATES } };
})(window.SL = window.SL || {});
