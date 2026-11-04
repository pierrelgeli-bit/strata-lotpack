/* Small DOM helpers and form components */
(function (SL) {
  'use strict';

  // h('div', {class: 'x', onclick: fn}, child1, 'text', [child2, child3])
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(add);
    return el;
  }

  let fieldSeq = 0;

  // Text / number / date input bound to obj[key]; onChange runs after each edit
  function field(label, obj, key, onChange, opts = {}) {
    const id = `f${++fieldSeq}`;
    const type = opts.type || 'text';
    const value = obj[key];
    const input = h('input', {
      id, type: type === 'number' ? 'text' : type,
      inputmode: type === 'number' ? 'decimal' : opts.inputmode,
      value: value === null || value === undefined ? '' : String(value),
      placeholder: opts.placeholder,
      autocomplete: 'off',
      dataset: { key },
    });
    input.addEventListener('input', () => {
      if (type === 'number') {
        const raw = input.value.trim().replace(',', '.');
        const n = raw === '' ? null : Number(raw);
        obj[key] = raw === '' ? null : (Number.isFinite(n) ? n : raw);
      } else {
        obj[key] = input.value;
      }
      onChange();
    });
    return h('div', { class: 'field' }, h('label', { for: id }, label), input);
  }

  function button(label, onclick, cls = '') {
    return h('button', { type: 'button', class: `btn ${cls}`.trim(), onclick }, label);
  }

  // Header field shared by all sheets: shows the job / shift value, a local edit
  // is kept on this sheet only (sheet.header[key]); clearing it returns to the common value.
  function headerField(label, sheet, key, common, onChange, opts = {}) {
    sheet.header = sheet.header || {};
    const id = `f${++fieldSeq}`;
    const has = () => sheet.header[key] !== undefined && sheet.header[key] !== null && sheet.header[key] !== '';
    const str = (v) => (v === null || v === undefined ? '' : String(v));
    const input = h('input', {
      id, type: opts.type || 'text', inputmode: opts.inputmode, autocomplete: 'off',
      value: has() ? str(sheet.header[key]) : str(common), dataset: { key },
    });
    const tag = h('span', { class: 'local-tag' }, 'edited on this sheet');
    const sync = () => { tag.hidden = !has(); };
    input.addEventListener('input', () => {
      const v = input.value;
      if (v === '' || v === str(common)) delete sheet.header[key];
      else sheet.header[key] = opts.number ? Number(v.replace(',', '.')) || v : v;
      sync();
      onChange();
    });
    sync();
    return h('div', { class: 'field' }, h('label', { for: id }, label, ' ', tag), input);
  }

  // Large checkbox chip bound to a boolean obj[key]
  function check(label, obj, key, onChange, cls = '') {
    const input = h('input', { type: 'checkbox', checked: !!obj[key] });
    input.addEventListener('change', () => { obj[key] = input.checked; onChange(); });
    return h('label', { class: `chk ${cls}`.trim() }, input, h('span', {}, label));
  }

  // Checkbox chip that adds / removes `value` in the array obj[key]
  function multi(label, obj, key, value, onChange) {
    obj[key] = obj[key] || [];
    const input = h('input', { type: 'checkbox', checked: obj[key].includes(value) });
    input.addEventListener('change', () => {
      const set = new Set(obj[key]);
      if (input.checked) set.add(value); else set.delete(value);
      obj[key] = Array.from(set);
      onChange();
    });
    return h('label', { class: 'chk' }, input, h('span', {}, label));
  }

  function textarea(label, obj, key, onChange, rows = 4) {
    const id = `f${++fieldSeq}`;
    const ta = h('textarea', { id, rows, value: obj[key] || '' });
    ta.addEventListener('input', () => { obj[key] = ta.value; onChange(); });
    return h('div', { class: 'field' }, h('label', { for: id }, label), ta);
  }

  // Local date-time "YYYY-MM-DDTHH:MM" (value of <input type="datetime-local">)
  function nowLocal() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  SL.ui = { h, field, button, headerField, check, multi, textarea, nowLocal };
})(window.SL = window.SL || {});
