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
    approval: { index: 0, pageNo: { cx: 291, baselineTop: 838.1 } },
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

    return { text, lines, tick, image };
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

  // Sheets of a shift, in pack order: [{ template, draw }]
  function packPlan(job, shift) {
    return [
      { template: 'approval', draw: drawApproval },
    ];
  }

  // Continuous "Page X of Y" where the paper printed its own (removed from the template)
  function paginate(pages, plan, fonts) {
    const n = pages.length;
    pages.forEach((page, i) => {
      const t = TEMPLATES[plan[i].template].pageNo;
      if (!t) return;
      const black = PDFLib.rgb(0, 0, 0);
      const parts = [['Page ', fonts.regular], [String(i + 1), fonts.bold], [' of ', fonts.regular], [String(n), fonts.bold]];
      const total = parts.reduce((s, [txt, f]) => s + f.widthOfTextAtSize(txt, 9), 0);
      let x = t.cx - total / 2;
      const y = page.getHeight() - t.baselineTop;
      parts.forEach(([txt, f]) => { page.drawText(txt, { x, y, size: 9, font: f, color: black }); x += f.widthOfTextAtSize(txt, 9); });
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
      await plan[i].draw(doc, page, fonts, job, shift);
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
