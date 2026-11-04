/* MSF28-7 — Site Diagram.
   No header / type of work / Completed by on the sheet: they come from Job and Shift details.
   Each drawing page has its sketch and a list of legends (Legend 1 at first, + adds more).
   A legend's Key is a colour, also the pen colour of that legend. */
(function (SL) {
  'use strict';
  const { h, field, computed, button } = SL.ui;
  const { PALETTE } = SL.schema;

  // Printed grid areas (pt) of the two templates: first page and added page
  const GRID = {
    first: { w: 545.0, h: 612.9 },
    more: { w: 545.0, h: 681.9 },
    cell: 13.93,
  };
  const LAYERS = [['base', 'Base'], ['intermediate', 'Intermediate'], ['wearing', 'Wearing'], ['correction', 'Correction'], ['other', 'Other']];

  const typed = (v) => v !== null && v !== undefined && v !== '';

  function newLegend(used) {
    const color = PALETTE.find((c) => !used.includes(c)) || PALETTE[used.length % PALETTE.length];
    return { color, mix: null, layer: null, depth: null, area: null, tonnes: null };
  }
  const newPage = () => ({ strokes: [], legends: [newLegend([])] });

  function ensure(shift) {
    const d = shift.diagram = shift.diagram || {};
    d.pages = d.pages || [];
    if (!d.pages.length) d.pages.push(newPage());
    d.pages.forEach((p) => {
      p.strokes = p.strokes || [];
      p.legends = Array.isArray(p.legends) ? p.legends : [];
      if (!p.legends.length) p.legends.push(newLegend([]));
    });
    return d;
  }

  const legendFilled = (l) => typed(l.mix) || typed(l.area) || typed(l.tonnes) || typed(l.depth) || Array.isArray(l.layer);

  function status(job, shift) {
    const pages = (shift.diagram && shift.diagram.pages) || [];
    const used = pages.filter((p) => (p.strokes || []).length || (p.legends || []).some(legendFilled));
    if (!used.length) return 'empty';
    const done = pages.every((p) => (p.strokes || []).length && (p.legends || []).some((l) => typed(l.area) || typed(l.tonnes)));
    return done ? 'complete' : 'progress';
  }

  const current = {}; // shift id -> open page index

  function render(job, shift, save) {
    const d = ensure(shift);
    const root = h('div', { class: 'sheet' });

    function legendBlock(page, lg, i, redraw, setPen) {
      // Key: colour of the legend, tap a colour to change it; "Draw" takes it as pen colour
      const keyRow = h('div', { class: 'key-row' }, PALETTE.map((c) => h('button', {
        type: 'button', class: `tool swatch${lg.color === c ? ' on' : ''}`, style: `--sw:${c}`,
        'aria-label': `Legend ${i + 1} colour ${c}`, 'aria-pressed': lg.color === c ? 'true' : 'false',
        onclick: () => { lg.color = c; save(); setPen(c); redraw(); },
      })), button('Draw with this colour', () => setPen(lg.color)));

      // Layer: ticked like the Approval (shift layer) until changed here
      const layerNow = () => (Array.isArray(lg.layer) ? lg.layer : (shift.layer || []));
      const layerBox = h('div', { class: 'choice' }, LAYERS.map(([k, l]) => {
        const input = h('input', { type: 'checkbox', checked: layerNow().includes(k) });
        input.addEventListener('change', () => {
          const set = new Set(layerNow());
          if (input.checked) set.add(k); else set.delete(k);
          lg.layer = Array.from(set);
          save();
        });
        return h('label', { class: 'chk' }, input, h('span', {}, l));
      }));

      const del = i > 0 ? button('Remove', () => {
        if (!confirm(`Remove legend ${i + 1}?`)) return;
        page.legends.splice(i, 1);
        save();
        redraw();
      }, 'danger') : null;

      return h('fieldset', { class: 'legend', style: `--lg:${lg.color}` },
        h('legend', {}, h('i', { class: 'lg-dot' }), `Legend ${i + 1}`),
        h('div', { class: 'field' }, h('label', {}, 'Key (colour)'), keyRow),
        h('div', { class: 'grid' },
          computed('Mix', lg, 'mix', () => shift.product, save),
          computed('Depth (mm)', lg, 'depth', () => shift.nominatedThickness, save, { number: true }),
          field('Area (m²)', lg, 'area', save, { type: 'number' }),
          field('Tonnes', lg, 'tonnes', save, { type: 'number' })),
        h('div', { class: 'field' }, h('label', {}, 'Layer'), layerBox),
        del ? h('div', { class: 'actions' }, del) : null);
    }

    function draw() {
      const i = Math.min(current[shift.id] || 0, d.pages.length - 1);
      current[shift.id] = i;
      const page = d.pages[i];
      const g = i === 0 ? GRID.first : GRID.more;

      const pageTabs = h('div', { class: 'tabs page-tabs', role: 'tablist', 'aria-label': 'Drawing pages' },
        d.pages.map((p, k) => h('button', {
          type: 'button', role: 'tab', class: `tab${k === i ? ' active' : ''}`, 'aria-selected': k === i ? 'true' : 'false',
          onclick: () => { current[shift.id] = k; draw(); },
        }, `Page ${k + 1}`, h('small', {}, k === 0 ? 'first page' : 'added'))),
        button('+ Add drawing page', () => {
          d.pages.push(newPage());
          current[shift.id] = d.pages.length - 1;
          save();
          draw();
        }));

      const delPage = i > 0 ? button('Delete this page', () => {
        if (!confirm(`Delete drawing page ${i + 1} with its legends?`)) return;
        d.pages.splice(i, 1);
        current[shift.id] = i - 1;
        save();
        draw();
      }, 'danger') : null;

      const pad = SL.canvas.sketchPad(page, g.w / g.h, g.w / GRID.cell, save, { palette: PALETTE });
      const legendsBox = h('div', { class: 'legends' });
      const drawLegends = () => legendsBox.replaceChildren(...page.legends.map((lg, k) => legendBlock(page, lg, k, drawLegends, pad.setColor)));
      drawLegends();

      root.replaceChildren(
        h('section', { class: 'block' },
          h('div', { class: 'row-head' }, h('h3', {}, `Drawing — page ${i + 1} of ${d.pages.length}`), delPage),
          pageTabs,
          pad),
        h('section', { class: 'block' },
          h('div', { class: 'row-head' }, h('h3', {}, `Legends — page ${i + 1}`),
            button('+ Legend', () => {
              page.legends.push(newLegend(page.legends.map((l) => l.color)));
              save();
              drawLegends();
              pad.setColor(page.legends[page.legends.length - 1].color);
            })),
          h('p', { class: 'muted small' }, 'Mix, Depth and Layer come from the shift until you change them. Legends 1 and 2 print in the sheet; more legends print on an extra page.'),
          legendsBox),
      );
    }

    draw();
    return root;
  }

  SL.forms = SL.forms || {};
  SL.forms.diagram = { render, status, ensure, GRID, newLegend };
})(window.SL = window.SL || {});
