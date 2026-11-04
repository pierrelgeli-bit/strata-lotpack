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
    diagram: { index: 3, pageNo: { cx: 319.6, baselineTop: 826.6, size: 9 } },
    diagramMore: { index: 4, pageNo: { cx: 319.6, baselineTop: 840.0, size: 9 } },
    dip: { index: 6, pageNo: { cx: 320, baselineTop: 829.6, size: 9 } },
    survey: { index: 7, pageNo: { cx: 320, baselineTop: 832.5, size: 9 } },
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

  // MSF28-7: grid area, header, legends ([x0, x1] per field; rows = baselines of the 3 legend lines)
  const DIAG = {
    first: {
      grid: { x0: 28.6, x1: 573.6, top: 143.0, bottom: 755.9 },
      header: [
        ['client', 110, 292, 85.5, 10], ['date', 370, 571, 85.5, 10],
        ['projectTitle', 110, 292, 104.5, 10], ['jobNumber', 370, 571, 104.5, 10],
        ['suburb', 110, 292, 124.8, 10],
      ],
      workType: [
        ['supplyLay', 67.2, 137.3], ['profileFill', 150.8, 137.3], ['keyOverlay', 228.0, 137.3],
        ['profilePatch', 317.0, 137.3], ['repairWorks', 408.5, 137.3], ['other', 493.3, 137.3],
      ],
      rows: [764.5, 775.3, 786.2],
      legends: [
        { key: [54, 90], mix: [145.5, 193], area: [249, 297] },
        { key: [324, 350], mix: [405.5, 468], area: [524, 572] },
      ],
      completedBy: [146, 571, 799.6],
    },
    more: {
      grid: { x0: 28.6, x1: 573.6, top: 76.0, bottom: 757.9 },
      rows: [766.5, 777.3, 788.2],
      legends: [
        { key: [54, 92], mix: [146, 192], area: [250, 295] },
        { key: [323, 352], mix: [407, 469], area: [527, 572] },
      ],
      completedBy: [147, 571, 801.6],
    },
  };

  // MSF28-9 and MSF28-12: header, 3 blocks, reading rows. Words to circle: [x0, x1]; ticks: [cx, cy]
  const REC = {
    dip: {
      header: [
        ['client', 116, 311, 102.6], ['date', 464, 573, 102.6],
        ['projectTitle', 116, 311, 115.8], ['jobNumber', 464, 573, 115.8],
        ['mixType', 116, 311, 129.0], ['frequency', 464, 573, 129.0],
      ],
      surface: { asphalt: [124.0, 138.5], granular: [168.0, 138.5], seal: [217.7, 138.5] },
      sealSize: [267, 289, 142.6],
      extra: [['compactionFactor', 375, 403, 148.5], ['upperLimit', 464, 492, 148.5], ['lowerLimit', 545, 573, 148.5]],
      courseRow: [159.9, 170.9], // word box raised 2.2 pt: capitals sit above the box centre
      base: { len: 185.5, off: 211.0, dir: 223.5, rw: 263.2 },
      blocks: [
        {
          course: { CC: [95.9, 111.8], IC: [144.4, 155.5], WC: [186.1, 204.5] }, length: [88, 120], depth: [180, 210],
          off: { l: [87, 121], c: [122, 177], r: [179, 211] }, direction: [88, 210],
          level: { survey: [92.1, 235.8], nominal: [152.6, 235.8] }, run: [74, 113], width: [172, 210],
          cols: { ch: [29.6, 71.9], l: [72.4, 114.4], c: [114.8, 170.0], r: [170.5, 212.0] },
        },
        {
          course: { CC: [283.0, 298.8], IC: [318.4, 329.5], WC: [358.9, 377.3] }, length: [279, 311], depth: [355, 393],
          off: { l: [278, 312], c: [314, 354], r: [356, 393] }, direction: [279, 393],
          level: { survey: [307.5, 235.8], nominal: [365.1, 235.8] }, run: [279, 311], width: [357, 393],
          cols: { ch: [225.6, 277.3], l: [277.8, 312.7], c: [313.2, 355.3], r: [355.8, 394.8] },
        },
        {
          course: { CC: [467.3, 483.2], IC: [495.6, 506.7], WC: [545.2, 563.6] }, length: [463, 489], depth: [541, 573],
          off: { l: [463, 489], c: [491, 538], r: [541, 573] }, direction: [464, 573],
          level: { survey: [489.7, 235.8], nominal: [547.4, 235.8] }, run: [463, 490], width: [541, 573],
          cols: { ch: [407.0, 461.6], l: [462.1, 491.9], c: [492.4, 539.5], r: [540.0, 575.0] },
        },
      ],
      rowTop0: 279.7, rowH: 13.155, rows: 38,
      completedBy: [116, 573, 789.5],
    },
    survey: {
      header: [
        ['client', 109, 297, 80.8], ['date', 420, 573, 80.8],
        ['projectTitle', 109, 297, 94.0], ['jobNumber', 420, 573, 94.0],
        ['mixType', 109, 297, 107.2], ['frequency', 420, 573, 107.2],
      ],
      surface: { asphalt: [120.8, 123.5], granular: [164.8, 123.5], seal: [214.5, 123.5] },
      sealSize: [262, 286, 127.8],
      surveyBy: { colas: [444.5, 124.1], client: [520.3, 124.1] },
      courseRow: [138.2, 149.2],
      layerRow: [187.3, 198.3],
      base: { len: 160.5, off: 183.3, dir: 210.0, rw: 224.8 },
      blocks: [
        {
          course: { CC: [94.2, 110.1], IC: [140.0, 151.1], WC: [178.3, 196.7] }, length: [86, 118], depth: [173, 202],
          off: { l: [86, 118], c: [121, 170], r: [173, 202] }, direction: [86, 202],
          layer: { 1: [99.1, 105.3], 2: [142.6, 148.7], 3: [184.4, 190.6] }, run: [79, 105], width: [157, 202],
          cols: { ch: [29.6, 77.0], l: [77.5, 106.9], c: [107.4, 129.7], r: [155.6, 203.2] },
        },
        {
          course: { CC: [281.0, 296.9], IC: [330.4, 341.5], WC: [369.4, 387.8] }, length: [270, 308], depth: [364, 393],
          off: { l: [270, 308], c: [310, 361], r: [364, 393] }, direction: [270, 393],
          layer: { 1: [286.0, 292.1], 2: [332.8, 338.9], 3: [375.5, 381.6] }, run: [271, 298], width: [347, 393],
          cols: { ch: [214.8, 269.3], l: [269.8, 299.2], c: [299.6, 321.6], r: [346.0, 394.4] },
        },
        {
          course: { CC: [469.7, 485.6], IC: [512.0, 523.1], WC: [550.2, 568.6] }, length: [465, 490], depth: [545, 573],
          off: { l: [465, 490], c: [493, 542], r: [545, 573] }, direction: [465, 573],
          layer: { 1: [474.5, 480.6], 2: [514.6, 520.7], 3: [556.3, 562.5] }, run: [456, 480], width: [527, 573],
          cols: { ch: [406.7, 451.4], l: [451.9, 481.1], c: [481.6, 505.0], r: [529.8, 575.0] },
        },
      ],
      rowTop0: 240.8, rowH: 13.16, rows: 40,
      completedBy: [109, 573, 776.0],
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

  const hexRgb = (hex) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? PDFLib.rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : PDFLib.rgb(0, 0, 0);
  };

  // Sketch strokes (grid-relative 0..1) redrawn as vectors in the printed grid
  function drawStrokes(page, strokes, grid) {
    const H = page.getHeight();
    const gw = grid.x1 - grid.x0, gh = grid.bottom - grid.top;
    (strokes || []).forEach((st) => {
      if (!st.p || !st.p.length) return;
      const color = hexRgb(st.c);
      const lw = Math.max(0.5, st.w * gw);
      if (st.p.length === 1) {
        page.drawCircle({ x: grid.x0 + st.p[0][0] * gw, y: H - grid.top - st.p[0][1] * gh, size: lw / 2, color });
        return;
      }
      const path = st.p.map(([x, y], k) => `${k ? 'L' : 'M'}${(x * gw).toFixed(2)} ${(y * gh).toFixed(2)}`).join(' ');
      page.drawSvgPath(path, {
        x: grid.x0, y: H - grid.top, borderColor: color, borderWidth: lw,
        borderLineCap: PDFLib.LineCapStyle.Round,
      });
    });
  }

  function drawLegends(w, L, dp, completedBy) {
    dp.legends.forEach((lg, k) => {
      const c = L.legends[k];
      const t = (v, [x0, x1], row) => w.text(fmtNum(v), x0, x1, L.rows[row], 8.5);
      t(lg.key, c.key, 0); t(lg.mix, c.mix, 0); t(lg.area, c.area, 0);
      t(lg.layer, c.mix, 1); t(lg.tonnes, c.area, 1);
      t(lg.depth, c.mix, 2);
    });
    w.text(completedBy, ...L.completedBy, 10);
  }

  async function drawDiagram(doc, page, fonts, job, shift, entry) {
    const w = writer(page, fonts);
    const d = SL.forms.diagram.ensure(shift);
    const dp = d.pages[entry.pageIndex];
    const L = entry.pageIndex === 0 ? DIAG.first : DIAG.more;
    if (entry.pageIndex === 0) {
      const hv = headerValues(job, shift, d);
      L.header.forEach(([k, x0, x1, top, size]) => w.text(hv[k], x0, x1, top, size));
      const wt = new Set(shift.workType || []);
      L.workType.forEach(([k, cx, cy]) => wt.has(k) && w.tick(cx, cy));
    }
    drawStrokes(page, dp.strokes, L.grid);
    drawLegends(w, L, dp, dp.completedBy || shift.completedBy);
  }

  async function drawRecord(doc, page, fonts, job, shift, entry) {
    const w = writer(page, fonts);
    const L = REC[entry.kind];
    const rec = SL.forms[entry.kind].ensure(entry.rec);
    const hv = headerValues(job, shift, rec);
    const vals = { ...hv, mixType: rec.mixType, frequency: rec.frequency };
    L.header.forEach(([k, x0, x1, top]) => w.text(vals[k], x0, x1, top, 9.5));
    const sf = L.surface[rec.existingSurface];
    if (sf) w.tick(sf[0], sf[1], 2.6);
    w.text(rec.sealSize, ...L.sealSize, 8, { align: 'center' });
    if (L.extra) L.extra.forEach(([k, x0, x1, top]) => w.text(fmtNum(rec[k]), x0, x1, top, 9, { align: 'center' }));
    if (L.surveyBy && L.surveyBy[rec.surveyBy]) w.tick(...L.surveyBy[rec.surveyBy]);

    const t = (v, [x0, x1], base, size = 8.5) => w.text(fmtNum(v), x0 + 1, x1 - 1, base, size, { align: 'center' });
    rec.courses.forEach((b, bi) => {
      const B = L.blocks[bi];
      if (B.course[b.course]) w.circle([...B.course[b.course], ...L.courseRow]);
      t(b.length, B.length, L.base.len); t(b.depth, B.depth, L.base.len);
      t(b.offsets.l, B.off.l, L.base.off); t(b.offsets.c, B.off.c, L.base.off); t(b.offsets.r, B.off.r, L.base.off);
      w.text(b.direction, B.direction[0], B.direction[1], L.base.dir, 8.5);
      if (B.level && B.level[b.level]) w.tick(...B.level[b.level]);
      if (B.layer && B.layer[b.layer]) w.circle([...B.layer[b.layer], ...L.layerRow]);
      t(b.run, B.run, L.base.rw); t(b.width, B.width, L.base.rw);
      b.readings.slice(0, L.rows).forEach((rd, i) => {
        const base = L.rowTop0 + i * L.rowH + 9.5;
        ['ch', 'l', 'c', 'r'].forEach((k) => t(rd[k], B.cols[k], base, 8));
      });
    });
    w.text(rec.completedBy || shift.completedBy, ...L.completedBy, 10);
  }

  const recordPages = (shift, kind) => SL.forms[kind].records(shift)
    .map((rec) => ({ template: kind, draw: drawRecord, kind, rec }));

  function diagramPages(shift) {
    const d = SL.forms.diagram.ensure(shift);
    return d.pages.map((p, k) => ({ template: k === 0 ? 'diagram' : 'diagramMore', draw: drawDiagram, pageIndex: k }));
  }

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
      ...diagramPages(shift),
      ...tracePages(shift),
      ...recordPages(shift, 'dip'),
      ...recordPages(shift, 'survey'),
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

  SL.pdf = { build, fileName, headerValues, _layout: { APPROVAL, TRACE, DIAG, REC, TEMPLATES } };
})(window.SL = window.SL || {});
