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
  // Zoom: pinch with two fingers (or + / − / Fit); one finger, the stylus or the mouse draws.
  // The line keeps the same thickness on screen whatever the zoom (stored width = width / zoom).
  // ---------------------------------------------------------------------
  const WIDTHS = [[0.0022, 'Thin'], [0.0045, 'Medium'], [0.009, 'Thick']];
  const tool = { mode: 'pen', color: '#d11f1f', width: WIDTHS[0][0] }; // shared between pages
  const ZMAX = 8;

  function sketchPad(page, aspect, cells, onChange, opts = {}) {
    page.strokes = page.strokes || [];
    const palette = opts.palette || ['#111111', '#1f4fd1', '#d11f1f', '#16893a', '#e07b00'];
    const undo = [];
    const redo = [];
    const bg = h('canvas', { class: 'sk-layer', 'aria-hidden': 'true' });
    const fg = h('canvas', { class: 'sk-layer sk-draw', role: 'img', 'aria-label': 'Site diagram drawing area' });
    const box = h('div', { class: 'sk-box', style: `aspect-ratio: ${aspect}; --ar: ${aspect}` }, bg, fg);
    const bctx = bg.getContext('2d');
    const ctx = fg.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const view = { z: 1, tx: 0, ty: 0 }; // screen = grid * (W*z, H*z) + (tx, ty)

    function clampView() {
      view.z = Math.min(ZMAX, Math.max(1, view.z));
      view.tx = Math.min(0, Math.max(W - W * view.z, view.tx));
      view.ty = Math.min(0, Math.max(H - H * view.z, view.ty));
    }

    function resize() {
      const r = box.getBoundingClientRect();
      if (!r.width) return;
      // keep the same part of the drawing in view when the size changes
      const cx = W ? (W / 2 - view.tx) / (W * view.z) : 0.5, cy = H ? (H / 2 - view.ty) / (H * view.z) : 0.5;
      dpr = window.devicePixelRatio || 1;
      W = r.width; H = r.height;
      [bg, fg].forEach((c) => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
      view.tx = W / 2 - cx * W * view.z; view.ty = H / 2 - cy * H * view.z;
      clampView();
      redraw();
    }

    const setT = (c) => c.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.tx, dpr * view.ty);

    // Paper-like grid, same squares as the printed sheet
    function drawGrid() {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.fillStyle = '#ffffff';
      bctx.fillRect(0, 0, bg.width, bg.height);
      setT(bctx);
      const step = W / cells;
      bctx.strokeStyle = '#c9ced6';
      bctx.lineWidth = 1 / view.z;
      bctx.setLineDash([3 / view.z, 2 / view.z]);
      bctx.beginPath();
      for (let x = step; x < W - 0.5; x += step) { bctx.moveTo(x, 0); bctx.lineTo(x, H); }
      for (let y = step; y < H - 0.5; y += step) { bctx.moveTo(0, y); bctx.lineTo(W, y); }
      bctx.stroke();
      bctx.setLineDash([]);
    }

    function drawStroke(c, s) {
      const lw = Math.max(1 / view.z, s.w * W);
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
      drawGrid();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, fg.width, fg.height);
      setT(ctx);
      page.strokes.forEach((s) => drawStroke(ctx, s));
      syncButtons();
    }

    // Screen point -> grid-relative point (0..1)
    const pos = (e) => {
      const r = fg.getBoundingClientRect();
      const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 100000) / 100000;
      return [q((e.clientX - r.left - view.tx) / (W * view.z)), q((e.clientY - r.top - view.ty) / (H * view.z))];
    };

    // Stroke eraser: removes every stroke passing near the pointer (radius constant on screen)
    function hits(s, [x, y]) {
      const rad = 0.012 / view.z + s.w / 2;
      const near = (a, b) => {
        const dx = (b[0] - a[0]), dy = (b[1] - a[1]) / aspect;
        const px = (x - a[0]), py = (y - a[1]) / aspect;
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
    const touches = new Map(); // pointerId -> {x, y} for pinch
    let pinch = null;

    function eraseAt(pt) {
      for (let i = page.strokes.length - 1; i >= 0; i--) {
        if (hits(page.strokes[i], pt)) { erased.push([i, page.strokes[i]]); page.strokes.splice(i, 1); }
      }
    }

    function startPinch() {
      const [a, b] = Array.from(touches.values());
      const r = fg.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, gx: (mx - view.tx) / (W * view.z), gy: (my - view.ty) / (H * view.z) };
    }
    function movePinch() {
      const [a, b] = Array.from(touches.values());
      const r = fg.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      view.z = pinch.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0);
      view.z = Math.min(ZMAX, Math.max(1, view.z));
      view.tx = mx - pinch.gx * W * view.z;
      view.ty = my - pinch.gy * H * view.z;
      clampView();
      redraw();
      syncZoom();
    }

    fg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fg.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          // second finger: this is a pinch, not a stroke
          current = null; erased = null;
          redraw();
          startPinch();
          return;
        }
        if (touches.size > 2) return;
      }
      const pt = pos(e);
      if (tool.mode === 'eraser') {
        erased = [];
        eraseAt(pt);
        redraw();
        return;
      }
      current = { c: tool.color, w: Math.round((tool.width / view.z) * 1e6) / 1e6, p: [pt] };
      drawStroke(ctx, current);
    });
    fg.addEventListener('pointermove', (e) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) { if (touches.size >= 2) movePinch(); return; }
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
        if (Math.abs(pt[0] - last[0]) + Math.abs(pt[1] - last[1]) < 0.0015 / view.z) return;
        current.p.push(pt);
        ctx.strokeStyle = current.c; ctx.lineWidth = Math.max(1 / view.z, current.w * W);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(last[0] * W, last[1] * H); ctx.lineTo(pt[0] * W, pt[1] * H); ctx.stroke();
      });
    });
    const end = (e) => {
      touches.delete(e.pointerId);
      if (pinch) { if (touches.size < 2) pinch = null; return; }
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
    // Zoom buttons: around the centre of the view
    const zoomBy = (k) => {
      const gx = (W / 2 - view.tx) / (W * view.z), gy = (H / 2 - view.ty) / (H * view.z);
      view.z = Math.min(ZMAX, Math.max(1, view.z * k));
      view.tx = W / 2 - gx * W * view.z; view.ty = H / 2 - gy * H * view.z;
      clampView(); redraw(); syncZoom();
    };
    const fit = () => { view.z = 1; view.tx = 0; view.ty = 0; redraw(); syncZoom(); };

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
    function syncZoom() {
      if (!tb.zoom) return;
      tb.zoom.textContent = `${Math.round(view.z * 100)} %`;
      tb.zout.disabled = view.z <= 1;
      tb.zin.disabled = view.z >= ZMAX;
    }
    tb.pen = h('button', { type: 'button', class: 'tool', onclick: () => { tool.mode = 'pen'; sync(); } }, 'Pen');
    tb.eraser = h('button', { type: 'button', class: 'tool', onclick: () => { tool.mode = 'eraser'; sync(); } }, 'Eraser');
    tb.colors = palette.map((c) => h('button', {
      type: 'button', class: 'tool swatch', title: c, 'aria-label': `Colour ${c}`, dataset: { color: c },
      style: `--sw:${c}`, onclick: () => { tool.color = c; tool.mode = 'pen'; sync(); },
    }));
    tb.widths = WIDTHS.map(([w, name]) => h('button', {
      type: 'button', class: 'tool', title: `${name} line`, dataset: { width: String(w) },
      onclick: () => { tool.width = w; sync(); },
    }, h('i', { class: 'wdot', style: `--wd:${Math.round(w * 900)}px` }), name));
    tb.undo = h('button', { type: 'button', class: 'tool', onclick: doUndo }, 'Undo');
    tb.redo = h('button', { type: 'button', class: 'tool', onclick: doRedo }, 'Redo');
    tb.clear = h('button', { type: 'button', class: 'tool danger', onclick: doClear }, 'Clear');
    tb.zout = h('button', { type: 'button', class: 'tool', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.5) }, '−');
    tb.zin = h('button', { type: 'button', class: 'tool', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.5) }, '+');
    tb.fit = h('button', { type: 'button', class: 'tool', onclick: fit }, 'Fit');
    tb.zoom = h('span', { class: 'zoom-label', 'aria-live': 'polite' });
    if (!palette.includes(tool.color)) tool.color = palette[0];
    sync();
    syncButtons();
    syncZoom();

    requestAnimationFrame(resize);
    new ResizeObserver(() => resize()).observe(box);

    const tools = h('div', { class: 'sk-tools', role: 'toolbar', 'aria-label': 'Drawing tools' },
      h('div', { class: 'tgroup' }, tb.pen, tb.eraser),
      h('div', { class: 'tgroup' }, tb.colors),
      h('div', { class: 'tgroup' }, tb.widths),
      h('div', { class: 'tgroup' }, tb.undo, tb.redo, tb.clear),
      h('div', { class: 'tgroup' }, tb.zout, tb.zoom, tb.zin, tb.fit));
    const root = h('div', { class: 'sk' }, tools, box);

    // Full screen: button in the top-right corner of the drawing area; same button (or Esc) to come back.
    const expand = h('button', { type: 'button', class: 'sk-expand' });
    const setExpandLabel = (full) => {
      expand.textContent = full ? '⤡' : '⤢';
      expand.setAttribute('aria-label', full ? 'Exit full screen' : 'Full screen drawing');
      expand.title = full ? 'Exit full screen' : 'Full screen drawing';
    };
    function fitBox() {
      if (!root.classList.contains('full')) { box.style.width = ''; return; }
      const cs = getComputedStyle(root);
      const availW = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = window.innerHeight - tools.offsetHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.rowGap || 0) - 2;
      box.style.width = `${Math.floor(Math.max(120, Math.min(availW, availH * aspect)))}px`;
    }
    const onKey = (e) => { if (e.key === 'Escape') toggleFull(false); };
    function toggleFull(on = !root.classList.contains('full')) {
      root.classList.toggle('full', on);
      document.documentElement.classList.toggle('sk-lock', on);
      setExpandLabel(on);
      if (on) { document.addEventListener('keydown', onKey); window.addEventListener('resize', fitBox); }
      else { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', fitBox); }
      fitBox();
      if (!on) box.scrollIntoView({ block: 'nearest' });
    }
    expand.addEventListener('click', () => toggleFull());
    setExpandLabel(false);
    box.appendChild(expand);

    // Pen colour set from outside (legend key)
    root.setColor = (c) => { tool.color = c; tool.mode = 'pen'; sync(); };
    root.view = view;
    return root;
  }

  SL.canvas = { signaturePad, sketchPad };
})(window.SL = window.SL || {});
