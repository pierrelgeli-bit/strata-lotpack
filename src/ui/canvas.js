/* Finger / stylus drawing: signature pads (and, later, the site diagram) */
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

  SL.canvas = { signaturePad };
})(window.SL = window.SL || {});
