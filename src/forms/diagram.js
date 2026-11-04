/* MSF28-7 — Site Diagram. Page 1 = header + grid + legends; each added page = grid + its own legends */
(function (SL) {
  'use strict';
  const { h, field, headerField, multi, button } = SL.ui;

  const WORK_TYPES = [
    ['supplyLay', 'Supply & Lay'], ['profileFill', 'Profile & Fill'], ['keyOverlay', 'Key & Overlay'],
    ['profilePatch', 'Profile & Patch'], ['repairWorks', 'Repair Works'], ['other', 'OTHER'],
  ];
  // Printed grid areas (pt) of the two templates: first page and added page
  const GRID = {
    first: { w: 545.0, h: 612.9 },
    more: { w: 545.0, h: 681.9 },
    cell: 13.93,
  };
  const LEGEND_KEYS = ['key', 'mix', 'layer', 'depth', 'area', 'tonnes'];

  const blankLegend = () => ({ key: '', mix: '', layer: '', depth: '', area: '', tonnes: '' });
  const newPage = () => ({ strokes: [], legends: [blankLegend(), blankLegend()], completedBy: '' });

  function ensure(shift) {
    const d = shift.diagram = shift.diagram || {};
    d.header = d.header || {};
    d.pages = d.pages || [];
    if (!d.pages.length) d.pages.push(newPage());
    d.pages.forEach((p) => {
      p.strokes = p.strokes || [];
      p.legends = p.legends && p.legends.length === 2 ? p.legends : [blankLegend(), blankLegend()];
      if (p.completedBy === undefined) p.completedBy = '';
    });
    return d;
  }

  const legendFilled = (l) => LEGEND_KEYS.some((k) => l[k] !== '' && l[k] !== null && l[k] !== undefined);

  function status(job, shift) {
    const pages = (shift.diagram && shift.diagram.pages) || [];
    const used = pages.filter((p) => (p.strokes || []).length || (p.legends || []).some(legendFilled));
    if (!used.length) return 'empty';
    const done = pages.every((p) => (p.strokes || []).length && (p.legends || []).some(legendFilled));
    return done ? 'complete' : 'progress';
  }

  function legendBlock(title, l, save) {
    return h('fieldset', { class: 'legend' }, h('legend', {}, title),
      h('div', { class: 'grid' },
        field('Key', l, 'key', save),
        field('Mix', l, 'mix', save),
        field('Layer', l, 'layer', save),
        field('Depth', l, 'depth', save),
        field('Area (m²)', l, 'area', save, { type: 'number' }),
        field('Tonnes', l, 'tonnes', save, { type: 'number' })));
  }

  const current = {}; // shift id -> open page index

  function render(job, shift, save) {
    const d = ensure(shift);
    const root = h('div', { class: 'sheet' });

    function draw() {
      let i = Math.min(current[shift.id] || 0, d.pages.length - 1);
      current[shift.id] = i;
      const page = d.pages[i];
      const first = i === 0;
      const g = first ? GRID.first : GRID.more;

      const pageTabs = h('div', { class: 'tabs page-tabs', role: 'tablist', 'aria-label': 'Drawing pages' },
        d.pages.map((p, k) => h('button', {
          type: 'button', role: 'tab', class: `tab${k === i ? ' active' : ''}`, 'aria-selected': k === i ? 'true' : 'false',
          onclick: () => { current[shift.id] = k; draw(); },
        }, `Page ${k + 1}`, h('small', {}, k === 0 ? 'with header' : 'added'))),
        button('+ Add drawing page', () => {
          d.pages.push(newPage());
          current[shift.id] = d.pages.length - 1;
          save();
          draw();
        }));

      const delPage = !first ? button('Delete this page', () => {
        if (!confirm(`Delete drawing page ${i + 1} with its legends?`)) return;
        d.pages.splice(i, 1);
        current[shift.id] = i - 1;
        save();
        draw();
      }, 'danger') : null;

      root.replaceChildren(
        first ? h('section', { class: 'block' },
          h('h3', {}, 'Header'),
          h('p', { class: 'muted small' }, 'Filled from the job and shift. A change here applies to this sheet only.'),
          h('div', { class: 'grid' },
            headerField('Client', d, 'client', job.client, save),
            headerField('Date', d, 'date', shift.date, save, { type: 'date' }),
            headerField('Project Title', d, 'projectTitle', job.projectTitle, save),
            headerField('Job Number', d, 'jobNumber', job.jobNumber, save),
            headerField('Suburb', d, 'suburb', job.suburb, save)),
          h('h3', {}, 'Type of work'),
          h('div', { class: 'choice' }, WORK_TYPES.map(([k, l]) => multi(l, shift, 'workType', k, save)))) : null,

        h('section', { class: 'block' },
          h('div', { class: 'row-head' }, h('h3', {}, `Drawing — page ${i + 1} of ${d.pages.length}`), delPage),
          pageTabs,
          SL.canvas.sketchPad(page, g.w / g.h, g.w / GRID.cell, save)),

        h('section', { class: 'block' },
          h('h3', {}, `Legends — page ${i + 1}`),
          h('div', { class: 'legends' }, legendBlock('Legend 1', page.legends[0], save), legendBlock('Legend 2', page.legends[1], save)),
          h('div', { class: 'grid' }, headerField('Completed By', page, 'completedBy', shift.completedBy, save, { direct: true }))),
      );
    }

    draw();
    return root;
  }

  SL.forms = SL.forms || {};
  SL.forms.diagram = { render, status, ensure, GRID };
})(window.SL = window.SL || {});
