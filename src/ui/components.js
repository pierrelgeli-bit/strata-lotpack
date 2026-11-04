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

  SL.ui = { h, field, button };
})(window.SL = window.SL || {});
