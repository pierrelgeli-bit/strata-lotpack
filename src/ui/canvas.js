/* Finger / stylus drawing: signature pads and the site diagram sketch */
(function (SL) {
  'use strict';
  const { h, button } = SL.ui;

  // Signature pad bound to obj[key] (PNG data URL). onChange runs after each stroke / clear.
  function signaturePad(obj, key, onChange, label = 'Signature') {
    const canvas = h('canvas', { class: 'sig-canvas', 'aria-label': label, role: 'img' });
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let last = null;
    let dirty = false;

    function size() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0d2a8c';
      ctx.lineWidth = 2.4;
      redraw();
    }

    function redraw() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      if (obj[key]) {
        const img = new Image();
        img.onload = () => {
          // Stored image is cropped to the ink: show it centred, never enlarged
          const r = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const iw = img.width / dpr, ih = img.height / dpr;
          const k = Math.min(1, r.width / iw, r.height / ih);
          ctx.drawImage(img, (r.width - iw * k) / 2, (r.height - ih * k) / 2, iw * k, ih * k);
        };
        img.src = obj[key];
      }
    }

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      last = pos(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      dirty = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      events.forEach((ev) => {
        const p = pos(ev);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
      });
    });
    const end = () => {
      if (!drawing) return;
      drawing = false;
      if (dirty) {
        obj[key] = trimmedPng(canvas);
        dirty = false;
        onChange();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    const clear = button('Clear', () => {
      obj[key] = '';
      redraw();
      onChange();
    });

    // Size once the canvas is in the page, and again when the screen turns
    requestAnimationFrame(size);
    new ResizeObserver(() => size()).observe(canvas);

    return h('div', { class: 'sig' }, h('div', { class: 'sig-box' }, canvas, h('span', { class: 'sig-hint' }, 'Sign here')), h('div', { class: 'sig-actions' }, clear));
  }

  // PNG cropped to the ink (+ small margin), so the PDF can fit the signature into its box
  function trimmedPng(canvas) {
    const { width: w, height: hgt } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, w, hgt).data;
    let x0 = w, y0 = hgt, x1 = -1, y1 = -1;
    for (let y = 0; y < hgt; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return '';
    const m = 6;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(w - 1, x1 + m); y1 = Math.min(hgt - 1, y1 + m);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  // ---------------------------------------------------------------------
  // Sketch pad for the site diagram. Strokes are vectors in grid-relative units
  // (x, y from 0 to 1 of the printed grid area), so the PDF redraws them exactly.
  // stroke = { c: '#rrggbb', w: width as a fraction of the grid width, p: [[x, y], ...] }
  // ---------------------------------------------------------------------
  const COLORS = [['#111111', 'Black'], ['#1f4fd1', 'Blue'], ['#d11f1f', 'Red'], ['#16893a', 'Green'], ['#e07b00', 'Orange']];
  const WIDTHS = [[0.0022, 'Thin'], [0.0045, 'Medium'], [0.009, 'Thick']];
  const tool = { mode: 'pen', color: COLORS[0][0], width: WIDTHS[1][0] }; // shared between pages

  // page.strokes is edited in place; aspect = grid width / height; cells = grid squares across
  function sketchPad(page, aspect, cells, onChange) {
    page.strokes = page.strokes || [];
    const undo = [];
    const redo = [];
    const bg = h('canvas', { class: 'sk-layer', 'aria-hidden': 'true' });
    const fg = h('canvas', { class: 'sk-layer sk-draw', role: 'img', 'aria-label': 'Site diagram drawing area' });
    const box = h('div', { class: 'sk-box', style: `aspect-ratio: ${aspect}; --ar: ${aspect}` }, bg, fg);
    const bctx = bg.getContext('2d');
    const ctx = fg.getContext('2d');
    let W = 0, H = 0;

    function resize() {
      const r = box.getBoundingClientRect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      W = r.width; H = r.height;
      [bg, fg].forEach((c) => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGrid();
      redraw();
    }

    // Paper-like grid, same squares as the printed sheet
    function drawGrid() {
      bctx.fillStyle = '#ffffff';
      bctx.fillRect(0, 0, W, H);
      const step = W / cells;
      bctx.strokeStyle = '#c9ced6';
      bctx.lineWidth = 1;
      bctx.setLineDash([3, 2]);
      bctx.beginPath();
      for (let x = step; x < W - 1; x += step) { bctx.moveTo(Math.round(x) + 0.5, 0); bctx.lineTo(Math.round(x) + 0.5, H); }
      for (let y = step; y < H - 1; y += step) { bctx.moveTo(0, Math.round(y) + 0.5); bctx.lineTo(W, Math.round(y) + 0.5); }
      bctx.stroke();
      bctx.setLineDash([]);
    }

    function drawStroke(c, s) {
      const lw = Math.max(1, s.w * W);
      c.strokeStyle = s.c; c.fillStyle = s.c; c.lineWidth = lw;
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (s.p.length === 1) {
        c.beginPath(); c.arc(s.p[0][0] * W, s.p[0][1] * H, lw / 2, 0, Math.PI * 2); c.fill();
        return;
      }
      c.beginPath();
      c.moveTo(s.p[0][0] * W, s.p[0][1] * H);
      for (let i = 1; i < s.p.length; i++) c.lineTo(s.p[i][0] * W, s.p[i][1] * H);
      c.stroke();
    }

    function redraw() {
      ctx.clearRect(0, 0, W, H);
      page.strokes.forEach((s) => drawStroke(ctx, s));
      syncButtons();
    }

    const pos = (e) => {
      const r = fg.getBoundingClientRect();
      const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
      return [q((e.clientX - r.left) / r.width), q((e.clientY - r.top) / r.height)];
    };

    // Stroke eraser: removes every stroke passing near the pointer
    function hits(s, [x, y]) {
      const rad = 0.012 + s.w / 2;
      const ar = aspect; // compare distances in grid-width units
      const near = (a, b) => {
        const dx = (b[0] - a[0]), dy = (b[1] - a[1]) / ar;
        const px = (x - a[0]), py = (y - a[1]) / ar;
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
        const ex = px - t * dx, ey = py - t * dy;
        return ex * ex + ey * ey <= rad * rad;
      };
      if (s.p.length === 1) return near(s.p[0], s.p[0]);
      for (let i = 1; i < s.p.length; i++) if (near(s.p[i - 1], s.p[i])) return true;
      return false;
    }

    let current = null; // stroke being drawn
    let erased = null;  // [[index, stroke]] removed by this eraser drag

    function eraseAt(pt) {
      for (let i = page.strokes.length - 1; i >= 0; i--) {
        if (hits(page.strokes[i], pt)) {
          erased.push([i, page.strokes[i]]);
          page.strokes.splice(i, 1);
        }
      }
    }

    fg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fg.setPointerCapture(e.pointerId);
      const pt = pos(e);
      if (tool.mode === 'eraser') {
        erased = [];
        eraseAt(pt);
        redraw();
        return;
      }
      current = { c: tool.color, w: tool.width, p: [pt] };
      drawStroke(ctx, current);
    });
    fg.addEventListener('pointermove', (e) => {
      if (!current && !erased) return;
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (erased) {
        const before = erased.length;
        events.forEach((ev) => eraseAt(pos(ev)));
        if (erased.length !== before) redraw();
        return;
      }
      events.forEach((ev) => {
        const pt = pos(ev);
        const last = current.p[current.p.length - 1];
        if (Math.abs(pt[0] - last[0]) + Math.abs(pt[1] - last[1]) < 0.0015) return;
        current.p.push(pt);
        ctx.strokeStyle = current.c; ctx.lineWidth = Math.max(1, current.w * W);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(last[0] * W, last[1] * H); ctx.lineTo(pt[0] * W, pt[1] * H); ctx.stroke();
      });
    });
    const end = () => {
      if (current) {
        page.strokes.push(current);
        undo.push({ type: 'add', stroke: current });
        redo.length = 0;
        current = null;
        syncButtons();
        onChange();
      } else if (erased) {
        if (erased.length) { undo.push({ type: 'erase', removed: erased }); redo.length = 0; onChange(); }
        erased = null;
        syncButtons();
      }
    };
    fg.addEventListener('pointerup', end);
    fg.addEventListener('pointercancel', end);

    function apply(op, back) {
      if (op.type === 'add') {
        if (back) page.strokes.splice(page.strokes.lastIndexOf(op.stroke), 1);
        else page.strokes.push(op.stroke);
      } else if (op.type === 'erase') {
        if (back) op.removed.slice().reverse().forEach(([i, s]) => page.strokes.splice(i, 0, s));
        else op.removed.forEach(([i]) => page.strokes.splice(i, 1));
      } else if (op.type === 'clear') {
        if (back) page.strokes.push(...op.strokes);
        else page.strokes.length = 0;
      }
    }
    const doUndo = () => { const op = undo.pop(); if (!op) return; apply(op, true); redo.push(op); redraw(); onChange(); };
    const doRedo = () => { const op = redo.pop(); if (!op) return; apply(op, false); undo.push(op); redraw(); onChange(); };
    const doClear = () => {
      if (!page.strokes.length || !confirm('Clear the whole drawing of this page? (Undo can bring it back)')) return;
      undo.push({ type: 'clear', strokes: page.strokes.slice() });
      redo.length = 0;
      page.strokes.length = 0;
      redraw();
      onChange();
    };

    // Toolbar
    const tb = {};
    const toggle = (btn, on) => { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    const sync = () => {
      toggle(tb.pen, tool.mode === 'pen');
      toggle(tb.eraser, tool.mode === 'eraser');
      tb.colors.forEach((b) => toggle(b, tool.mode === 'pen' && b.dataset.color === tool.color));
      tb.widths.forEach((b) => toggle(b, Number(b.dataset.width) === tool.width));
    };
    function syncButtons() {
      if (!tb.undo) return;
      tb.undo.disabled = !undo.length;
      tb.redo.disabled = !redo.length;
      tb.clear.disabled = !page.strokes.length;
    }
    tb.pen = h('button', { type: 'button', class: 'tool', onclick: () => { tool.mode = 'pen'; sync(); } }, 'Pen');
    tb.eraser = h('button', { type: 'button', class: 'tool', onclick: () => { tool.mode = 'eraser'; sync(); } }, 'Eraser');
    tb.colors = COLORS.map(([c, name]) => h('button', {
      type: 'button', class: 'tool swatch', title: name, 'aria-label': name, dataset: { color: c },
      style: `--sw:${c}`, onclick: () => { tool.color = c; tool.mode = 'pen'; sync(); },
    }));
    tb.widths = WIDTHS.map(([w, name]) => h('button', {
      type: 'button', class: 'tool', title: `${name} line`, dataset: { width: String(w) },
      onclick: () => { tool.width = w; sync(); },
    }, h('i', { class: 'wdot', style: `--wd:${Math.round(w * 900)}px` }), name));
    tb.undo = h('button', { type: 'button', class: 'tool', onclick: doUndo }, 'Undo');
    tb.redo = h('button', { type: 'button', class: 'tool', onclick: doRedo }, 'Redo');
    tb.clear = h('button', { type: 'button', class: 'tool danger', onclick: doClear }, 'Clear');
    sync();
    syncButtons();

    requestAnimationFrame(resize);
    new ResizeObserver(() => resize()).observe(box);

    return h('div', { class: 'sk' },
      h('div', { class: 'sk-tools', role: 'toolbar', 'aria-label': 'Drawing tools' },
        h('div', { class: 'tgroup' }, tb.pen, tb.eraser),
        h('div', { class: 'tgroup' }, tb.colors),
        h('div', { class: 'tgroup' }, tb.widths),
        h('div', { class: 'tgroup' }, tb.undo, tb.redo, tb.clear)),
      box);
  }

  SL.canvas = { signaturePad, sketchPad };
})(window.SL = window.SL || {});
