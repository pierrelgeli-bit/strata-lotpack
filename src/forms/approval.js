/* MSF28-6 — Approval to Proceed / Hold Point Release */
(function (SL) {
  'use strict';
  const { h, field, headerField, check, multi, textarea, nowLocal } = SL.ui;

  const WORK_TYPES = [
    ['supplyLay', 'Supply & Lay'], ['profileFill', 'Profile & Fill'], ['keyOverlay', 'Key & Overlay'],
    ['profilePatch', 'Profile & Patch'], ['repairWorks', 'Repair Works'], ['other', 'OTHER'],
  ];
  const LAYERS = [
    ['base', 'Base'], ['intermediate', 'Intermediate'], ['wearing', 'Wearing'],
    ['correction', 'Correction'], ['other', 'OTHER'],
  ];
  // [main key, label, [[sub key, sub label], ...], note]
  const CHECKS = [
    ['plant', 'Plant and Equipment', [['plantRisk', 'Risk Assessments'], ['plantService', 'Service History'], ['plantRegistration', 'Registration']]],
    ['materials', 'Materials/ Mix Design Details', [], '7 working days before commencement of works'],
    ['surface', 'Preparation of Existing Surface', [['surfaceSwept', 'Swept & free if any loose material'], ['surfaceTack', 'Tack coat applied']]],
    ['base', 'Unsuitable base conditions', [['baseSoft', 'Soft Base'], ['baseSealDamage', 'Damage to Seal'], ['baseWet', 'Wet surface']]],
    ['thickness', 'Layer thickness does not comply with spec tolerances', [['thicknessNominated', 'Nominated'], ['thicknessSurveyed', 'Surveyed']]],
    ['wind', 'Wind speed exceeds required tolerances', []],
    ['underlying', 'Underlying layers conform to specification', []],
    ['pavementTemp', 'Existing pavement temperature below spec tolerances', []],
  ];

  function ensure(shift) {
    const a = shift.approval = shift.approval || {};
    a.header = a.header || {};
    a.checks = a.checks || {};
    a.colasSign = a.colasSign || { name: '', signature: '', dateTime: '' };
    a.clientSign = a.clientSign || { name: '', signature: '', position: '', dateTime: '' };
    if (a.comments === undefined) a.comments = '';
    if (a.clientComments === undefined) a.clientComments = '';
    return a;
  }

  // 'empty' | 'progress' | 'complete' (complete = signed by COLAS and client)
  function status(job, shift) {
    const a = shift.approval || {};
    const signed = (s) => !!(s && s.signature);
    if (signed(a.colasSign) && signed(a.clientSign)) return 'complete';
    const any = Object.values(a.checks || {}).some(Boolean) || a.comments || a.clientComments
      || signed(a.colasSign) || signed(a.clientSign)
      || (a.colasSign && a.colasSign.name) || (a.clientSign && a.clientSign.name);
    return any ? 'progress' : 'empty';
  }

  // Warning shown on the shift while the approval is not signed (never blocks)
  function warning(job, shift) {
    const a = shift.approval || {};
    const missing = [];
    if (!(a.colasSign && a.colasSign.signature)) missing.push('COLAS');
    if (!(a.clientSign && a.clientSign.signature)) missing.push('client');
    return missing.length ? `Approval to Proceed not signed by ${missing.join(' and ')}.` : '';
  }

  function render(job, shift, save) {
    const a = ensure(shift);

    // Signing fills the date & time if it is still empty
    const signBlock = (who, s, extra) => {
      const dt = field('Date & Time', s, 'dateTime', save, { type: 'datetime-local' });
      const onSign = () => {
        if (s.signature && !s.dateTime) {
          s.dateTime = nowLocal();
          dt.querySelector('input').value = s.dateTime;
        }
        save();
      };
      // COLAS name prefilled with the shift's Completed by (typing replaces it)
      const nameField = who === 'COLAS'
        ? SL.ui.computed('COLAS Representative Name', s, 'name', () => shift.completedBy, save)
        : field(`${who} Representative Name`, s, 'name', save);
      return h('div', { class: 'grid' },
        nameField,
        extra,
        dt,
        h('div', { class: 'field span-all' }, h('label', {}, 'Signature'), SL.canvas.signaturePad(s, 'signature', onSign, `${who} signature`)));
    };

    return h('div', { class: 'sheet' },
      h('section', { class: 'block' },
        h('h3', {}, 'Type of work'),
        h('div', { class: 'choice' }, WORK_TYPES.map(([k, l]) => multi(l, shift, 'workType', k, save))),
        h('h3', {}, 'Layer'),
        h('div', { class: 'choice' }, LAYERS.map(([k, l]) => multi(l, shift, 'layer', k, save)))),

      h('section', { class: 'block' },
        h('h3', {}, 'Verification'),
        h('p', { class: 'muted small' }, 'Approval granted to proceed with the above process and verification of the following aspects of the process meet the requirements of the contract specification and the quality plan (when required):'),
        h('div', { class: 'checklist' }, CHECKS.map(([k, l, subs, note]) => h('div', { class: 'check-row' },
          check(l, a.checks, k, save, 'main'),
          subs.length ? h('div', { class: 'choice sub' }, subs.map(([sk, sl]) => check(sl, a.checks, sk, save))) : null,
          note ? h('div', { class: 'muted small' }, `(${note})`) : null)))),

      h('section', { class: 'block' },
        textarea('Comments/ Site Conditions', a, 'comments', save, 5)),

      h('section', { class: 'block' },
        h('h3', {}, 'Signed and acknowledged by — COLAS'),
        h('p', { class: 'muted small' }, 'Approval to proceed/ Hold point release required for each working shift. Approval to proceed is valid only if weather and pavement conditions comply with specification.'),
        signBlock('COLAS', a.colasSign)),

      h('section', { class: 'block' },
        h('h3', {}, 'Approval granted to release hold point and proceed with the subject of work — Client'),
        textarea('Comments', a, 'clientComments', save, 3),
        signBlock('Client', a.clientSign, field('Position', a.clientSign, 'position', save))),
    );
  }

  SL.forms = SL.forms || {};
  SL.forms.approval = { render, status, warning, ensure };
})(window.SL = window.SL || {});
