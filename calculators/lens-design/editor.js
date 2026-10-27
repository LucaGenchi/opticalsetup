// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The lens designer's editor: the system settings above, the lens data table
// below, one row per surface between the object and image rows. It edits a
// copy of the system and hands each change to `onChange`, which normalizes
// it (system.js is the only schema boundary). Typing never rebuilds the row
// being typed in; structural edits (adding a row, changing a type) rebuild
// the table. Text from files goes in through textContent and value only.

import { ASPHERE_ORDERS, LIMITS, DIFFRACTION_GRIDS, DIFFRACTION_PADDING, defaultSurface } from './engine/system.js';
import { MATERIAL_OPTIONS, AIR, CONSTANT, glassShortName } from './engine/materials.js';
import { formatNumber } from '../assets/calculator-kit.js';

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('aria-') || key.startsWith('data-') || key === 'role' || key === 'for') node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.filter(c => c != null));
  return node;
};

// One number as typed: a decimal comma is accepted, ∞/inf means flat for a
// radius (stored as 0). Returns NaN for anything else.
export function parseNumber(text, { infinity = false } = {}) {
  const t = String(text).trim().replace(',', '.').toLowerCase();
  if (infinity && (t === '' || t === '∞' || t === 'inf' || t === 'infinity')) return 0;
  if (t === '') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// A list typed as "0, 14, 20" or "480 550 650": separators are commas,
// semicolons and spaces, so decimals take a point here.
export function parseList(text) {
  const parts = String(text).split(/[\s,;]+/).filter(Boolean);
  const values = parts.map(Number);
  return parts.length && values.every(Number.isFinite) ? values : null;
}

const listText = values => values.map(v => String(Number(v.toPrecision(10)))).join(', ');
const radiusText = r => (r === 0 ? '∞' : String(r));

// "N-BK7 crown (nd 1.517 / V 64.2)" -> "N-BK7 1.517/64.2"
function shortMaterial([id, label]) {
  if (id === AIR) return 'Air';
  if (id === CONSTANT) return 'Constant n';
  const m = label.match(/nd ([\d.]+) \/ V ([\d.]+)/);
  return m ? `${glassShortName(label)} ${m[1]}/${m[2]}` : label;
}

export function createEditor(host, { presets, onChange, onPreset, onImport, onExport }) {
  let system = null;
  let result = null;
  const openAspheres = new Set();

  // ---------------- toolbar ----------------
  const presetSelect = el('select', { id: 'lens-preset' },
    el('option', { value: '', text: 'Choose a preset…' }),
    ...presets.map(p => el('option', { value: p.id, text: p.label })));
  presetSelect.addEventListener('change', () => { if (presetSelect.value) onPreset(presetSelect.value); });
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'lens-import-file' });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) onImport(fileInput.files[0]); fileInput.value = ''; });
  const importButton = el('button', { type: 'button', class: 'bench-button', text: 'Import JSON' });
  importButton.addEventListener('click', () => fileInput.click());
  const exportButton = el('button', { type: 'button', class: 'bench-button', text: 'Export JSON' });
  exportButton.addEventListener('click', () => onExport());
  const openLink = el('a', { class: 'bench-button primary', text: 'Open in OpticalSetup', target: '_blank', rel: 'noopener', id: 'lens-open' });
  const presetNote = el('p', { class: 'bench-note', id: 'lens-preset-note' });
  const openNote = el('p', { class: 'bench-note', id: 'lens-open-note' });
  host.append(
    el('div', { class: 'bench-bar' },
      el('label', { class: 'bench-preset', for: 'lens-preset' }, el('span', { text: 'Preset' }), presetSelect),
      el('div', { class: 'bench-actions' }, importButton, exportButton, openLink, fileInput)),
    presetNote,
  );

  // ---------------- system settings ----------------
  const form = el('form', { class: 'calc-inputs bench-system', id: 'lens-system', autocomplete: 'off', novalidate: true });
  form.addEventListener('submit', e => e.preventDefault());
  host.append(form);

  const field = (id, label, control, { unit = '', help = '' } = {}) => {
    control.id = `sys-${id}`;
    if (help) control.setAttribute('aria-describedby', `sys-${id}-help`);
    const row = el('div', { class: `calc-field${control.tagName === 'SELECT' ? ' choice' : ''}`, 'data-field': id },
      el('label', { for: `sys-${id}`, text: label }),
      control.tagName === 'SELECT' ? control : el('span', { class: 'control' }, control, unit ? el('span', { class: 'unit', text: unit }) : null));
    if (help) row.append(el('div', { class: 'help', id: `sys-${id}-help`, text: help }));
    return row;
  };
  const select = options => el('select', {}, ...options.map(([v, t]) => el('option', { value: v, text: t })));
  const text = () => el('input', { type: 'text', inputMode: 'decimal', spellcheck: false });

  const c = {
    object: select([['infinity', 'At infinity'], ['finite', 'At a finite distance']]),
    distance: text(),
    apertureType: select([['epd', 'Entrance pupil diameter'], ['fno', 'F-number (f / D)'], ['na', 'Object-space NA']]),
    apertureValue: text(),
    fields: el('input', { type: 'text', spellcheck: false }),
    wavelengths: el('input', { type: 'text', spellcheck: false }),
    primary: select([]),
    focus: select([['paraxial', 'Paraxial focus'], ['best-rms', 'Best RMS focus'], ['fixed', 'Last row’s thickness']]),
    offset: text(),
    aiming: select([['paraxial', 'Paraxial (fast)'], ['real', 'Real, to the stop']]),
    samples: select([16, 24, 32, 48, 64, 96, 128].map(n => [String(n), `${n} × ${n} grid`])),
    weights: el('input', { type: 'text', spellcheck: false }),
    grid: select(DIFFRACTION_GRIDS.map(n => [String(n), `${n} across the pupil`])),
    padding: select(DIFFRACTION_PADDING.map(q => [String(q), `${q}× (FFT ${q} N)`])),
    illumination: select([['uniform', 'Uniform'], ['gaussian', 'Gaussian beam']]),
    beamRatio: text(),
    vignetting: select([['on', 'Cut the beam (vignetting)'], ['off', 'Ignored']]),
  };
  const rows = {
    object: field('object', 'Object', c.object),
    distance: field('distance', 'Object distance', c.distance, { unit: 'mm', help: 'From the object to the first surface.' }),
    apertureType: field('aperture-type', 'Aperture set by', c.apertureType),
    apertureValue: field('aperture-value', 'Aperture', c.apertureValue, { unit: 'mm' }),
    fields: field('fields', 'Fields', c.fields, { unit: '°', help: `Up to ${LIMITS.fields}, separated by commas.` }),
    wavelengths: field('wavelengths', 'Wavelengths', c.wavelengths, { unit: 'nm', help: `Up to ${LIMITS.wavelengths}, separated by commas.` }),
    primary: field('primary', 'Primary wavelength', c.primary),
    focus: field('focus', 'Image plane at', c.focus),
    offset: field('offset', 'Image plane offset', c.offset, { unit: 'mm', help: 'Added to the chosen focus; + moves away from the lens.' }),
    aiming: field('aiming', 'Ray aiming', c.aiming, { help: 'Real aiming makes each ray cross the stop where its pupil coordinate says; use it at wide fields or apertures.' }),
    samples: field('samples', 'Pupil sampling', c.samples),
    weights: field('weights', 'Wavelength weights', c.weights, { help: 'Relative power of each wavelength in the polychromatic PSF and MTF.' }),
    grid: field('grid', 'Pupil grid N', c.grid, { help: 'Samples across the pupil for the wavefront and PSF, at the wavelength that needs the finest sampling; finer grids follow stronger aberrations.' }),
    padding: field('padding', 'Zero padding Q', c.padding, { help: 'The PSF is sampled every λN/Q; 2 is the Nyquist minimum.' }),
    illumination: field('illumination', 'Pupil illumination', c.illumination),
    beamRatio: field('beam-ratio', 'Beam radius', c.beamRatio, { unit: '× pupil', help: '1/e² intensity radius of the Gaussian beam, in entrance-pupil radii.' }),
    vignetting: field('vignetting', 'Clear apertures', c.vignetting),
  };
  const group = (title, ...children) => el('fieldset', { class: 'calc-group' }, el('legend', { text: title }), ...children);
  form.append(
    group('Object and aperture', rows.object, rows.distance, rows.apertureType, rows.apertureValue),
    group('Fields and wavelengths', rows.fields, rows.wavelengths, rows.primary, rows.weights),
    group('Image and rays', rows.focus, rows.offset, rows.aiming, rows.samples),
    group('Diffraction', rows.grid, rows.padding, rows.illumination, rows.beamRatio, rows.vignetting),
  );

  const commit = mutate => {
    const next = structuredClone(system);
    mutate(next);
    onChange(next);
  };
  const invalid = (input, bad) => input.setAttribute('aria-invalid', bad ? 'true' : 'false');
  const numberInput = (input, apply, opts) => {
    input.addEventListener('input', () => {
      const v = parseNumber(input.value, opts);
      invalid(input, Number.isNaN(v));
      if (!Number.isNaN(v)) commit(s => apply(s, v));
    });
    // On leaving the field it shows the value actually used (clamped).
    input.addEventListener('change', () => syncSystem());
  };

  c.object.addEventListener('change', () => commit(s => {
    s.object.atInfinity = c.object.value === 'infinity';
    // Angles and heights are different quantities: start the fields afresh.
    s.fields = { type: s.object.atInfinity ? 'angle' : 'height', values: [0] };
  }));
  numberInput(c.distance, (s, v) => { s.object.distanceMm = v; });
  c.apertureType.addEventListener('change', () => commit(s => {
    s.aperture = { type: c.apertureType.value, value: { epd: 10, fno: 5, na: 0.1 }[c.apertureType.value] };
  }));
  numberInput(c.apertureValue, (s, v) => { s.aperture.value = v; });
  for (const [input, apply] of [
    [c.fields, (s, v) => { s.fields.values = v; }],
    [c.wavelengths, (s, v) => { s.wavelengthsNm = v; s.primaryWavelength = Math.min(s.primaryWavelength, v.length - 1); }],
    [c.weights, (s, v) => { s.wavelengthWeights = v; }],
  ]) {
    input.addEventListener('input', () => {
      const v = parseList(input.value);
      invalid(input, !v);
      if (v) commit(s => apply(s, v));
    });
    input.addEventListener('change', () => syncSystem());
  }
  c.primary.addEventListener('change', () => commit(s => { s.primaryWavelength = Number(c.primary.value); }));
  c.focus.addEventListener('change', () => commit(s => { s.image.focus = c.focus.value; }));
  numberInput(c.offset, (s, v) => { s.image.offsetMm = v; });
  c.aiming.addEventListener('change', () => commit(s => { s.rayAiming = c.aiming.value; }));
  c.samples.addEventListener('change', () => commit(s => { s.pupilSamples = Number(c.samples.value); }));
  c.grid.addEventListener('change', () => commit(s => { s.diffraction.grid = Number(c.grid.value); }));
  c.padding.addEventListener('change', () => commit(s => { s.diffraction.padding = Number(c.padding.value); }));
  c.illumination.addEventListener('change', () => commit(s => { s.diffraction.illumination = c.illumination.value; }));
  numberInput(c.beamRatio, (s, v) => { s.diffraction.beamRatio = v; });
  c.vignetting.addEventListener('change', () => commit(s => { s.diffraction.vignetting = c.vignetting.value === 'on'; }));

  // ---------------- lens data table ----------------
  const table = el('table', { class: 'bench-table', id: 'lens-table', 'aria-label': 'Lens data: one row per surface' });
  const tableWrap = el('div', { class: 'bench-table-wrap' }, table);
  const addLast = el('button', { type: 'button', class: 'bench-button', text: '+ Add a surface' });
  addLast.addEventListener('click', () => commit(s => { s.surfaces.push({ ...defaultSurface(), thickness: 10 }); }));
  host.append(el('h2', { class: 'bench-heading', text: 'Lens data' }), tableWrap,
    el('div', { class: 'bench-table-actions' }, addLast), openNote);

  const MATERIALS = MATERIAL_OPTIONS.map(o => [o[0], shortMaterial(o)]);
  const cellInput = (label, value, apply, opts = {}) => {
    const input = el('input', { type: 'text', inputMode: 'decimal', spellcheck: false, value, 'aria-label': label, class: 'bench-cell' });
    if (opts.placeholder) input.placeholder = opts.placeholder;
    numberInput(input, apply, opts);
    return input;
  };
  const iconButton = (textContent, label, onClick, extra = {}) => {
    const b = el('button', { type: 'button', class: 'bench-icon', text: textContent, title: label, 'aria-label': label, ...extra });
    b.addEventListener('click', onClick);
    return b;
  };

  function surfaceRow(s, j) {
    const n = j + 1;
    const ideal = s.type === 'paraxial';
    const tr = el('tr', { 'data-row': String(j) });
    if (s.stop) tr.classList.add('is-stop');
    const type = el('select', { 'aria-label': `Surface ${n} type`, class: 'bench-cell' },
      el('option', { value: 'standard', text: 'Standard' }), el('option', { value: 'paraxial', text: 'Ideal' }));
    type.value = s.type;
    type.addEventListener('change', () => commit(x => {
      x.surfaces[j] = { ...x.surfaces[j], type: type.value };
      if (type.value === 'paraxial') { x.surfaces[j].material = AIR; x.surfaces[j].thickness = x.surfaces[j].focal ?? 100; }
    }));
    const shape = ideal
      ? cellInput(`Surface ${n} focal length (mm)`, String(s.focal), (x, v) => { x.surfaces[j].focal = v; })
      : cellInput(`Surface ${n} radius (mm), ∞ for flat`, radiusText(s.radius), (x, v) => { x.surfaces[j].radius = v; }, { infinity: true });
    shape.classList.add('is-wide');
    const thickness = cellInput(`Thickness after surface ${n} (mm)`, String(s.thickness), (x, v) => { x.surfaces[j].thickness = v; });
    thickness.classList.add('is-wide');
    const isLast = j === system.surfaces.length - 1;
    if (isLast && system.image.focus !== 'fixed') {
      thickness.classList.add('is-unused');
      thickness.title = 'Not used: the image plane is placed by the “Image plane at” setting.';
    }
    let material;
    if (ideal) material = el('span', { class: 'bench-fixed', text: 'air' });
    else {
      const sel = el('select', { 'aria-label': `Material after surface ${n}`, class: 'bench-cell bench-material' },
        ...MATERIALS.map(([v, t]) => el('option', { value: v, text: t })));
      sel.value = s.material;
      sel.addEventListener('change', () => commit(x => { x.surfaces[j].material = sel.value; }));
      material = el('span', { class: 'bench-material-cell' }, sel,
        s.material === CONSTANT ? cellInput(`Surface ${n} constant index`, String(s.index), (x, v) => { x.surfaces[j].index = v; }) : null);
    }
    const conic = ideal ? el('span', { class: 'bench-fixed', text: '—' })
      : cellInput(`Surface ${n} conic constant`, String(s.conic), (x, v) => { x.surfaces[j].conic = v; });
    conic.classList.add('is-conic');
    const auto = result?.ok ? result.surfaces[j]?.auto : null;
    const semi = s.stop ? el('span', { class: 'bench-fixed', title: 'Set by the aperture', text: result?.ok ? formatNumber(result.firstOrder.stopRadius, 4) : '' })
      : cellInput(`Surface ${n} clear semi-diameter (mm), empty for automatic`, s.semiDiameter ? String(s.semiDiameter) : '',
        (x, v) => { x.surfaces[j].semiDiameter = v; }, { placeholder: auto != null ? formatNumber(auto, 3) : 'auto' });
    if (!s.stop) {
      semi.addEventListener('input', () => {
        if (semi.value.trim() === '') { invalid(semi, false); commit(x => { x.surfaces[j].semiDiameter = 0; }); }
      });
      semi.dataset.semi = String(j);
    }
    const stop = el('input', { type: 'radio', name: 'lens-stop', checked: s.stop, 'aria-label': `Surface ${n} is the aperture stop` });
    stop.addEventListener('change', () => commit(x => x.surfaces.forEach((r, i) => { r.stop = i === j; })));
    const hasAsphere = s.asphere.some(Boolean);
    const open = openAspheres.has(j);
    const actions = el('span', { class: 'bench-row-actions' },
      ideal ? null : iconButton(hasAsphere ? 'A•' : 'A', `Aspheric terms of surface ${n}`, () => {
        if (openAspheres.has(j)) openAspheres.delete(j); else openAspheres.add(j);
        renderTable();
      }, { 'aria-expanded': String(open), class: `bench-icon${hasAsphere ? ' is-set' : ''}` }),
      iconButton('+', `Insert a surface after surface ${n}`, () => commit(x => {
        x.surfaces.splice(j + 1, 0, { ...defaultSurface(), thickness: 5 });
      })),
      iconButton('×', `Delete surface ${n}`, () => commit(x => {
        x.surfaces.splice(j, 1);
        if (!x.surfaces.some(r => r.stop) && x.surfaces.length) x.surfaces[0].stop = true;
      }), { disabled: system.surfaces.length <= 1 }));
    tr.append(
      el('th', { scope: 'row', text: String(n) }),
      el('td', {}, type), el('td', {}, shape), el('td', {}, thickness), el('td', {}, material),
      el('td', {}, conic), el('td', {}, semi), el('td', { class: 'center' }, stop), el('td', {}, actions));
    const out = [tr];
    if (open && !ideal) {
      const cells = ASPHERE_ORDERS.map((order, i) => el('label', { class: 'bench-asphere-term' },
        el('span', { text: `A${order}` }),
        cellInput(`Surface ${n} A${order} (mm^${1 - order})`, String(s.asphere[i]), (x, v) => { x.surfaces[j].asphere[i] = v; })));
      out.push(el('tr', { class: 'bench-asphere-row' }, el('td', {}),
        el('td', { colSpan: 8 }, el('div', { class: 'bench-asphere' },
          el('span', { class: 'bench-asphere-title', text: `Surface ${n}: z += A4 r⁴ + A6 r⁶ + … (r in mm)` }), ...cells))));
    }
    return out;
  }

  const objectText = () => (system.object.atInfinity ? '∞' : formatNumber(system.object.distanceMm, 6));
  const imageCell = el('td', { colSpan: 7, class: 'bench-image-text' });

  function renderTable() {
    table.textContent = '';
    table.append(el('thead', {}, el('tr', {},
      ...['#', 'Type', 'Radius', 'Thickness', 'Material', 'Conic', 'Semi-Ø', 'Stop', ''].map((t, i) =>
        el('th', { scope: 'col', text: t, title: ['Surface number', '', 'Radius of curvature (mm); + centre of curvature to the right', 'Axial distance to the next surface (mm)', 'Medium after the surface', 'Conic constant k', 'Clear semi-diameter (mm); empty = just large enough', 'Aperture stop', ''][i] })))));
    const body = el('tbody');
    body.append(el('tr', { class: 'bench-end' },
      el('th', { scope: 'row', text: 'Obj' }), el('td', { text: 'Object' }), el('td', { text: '∞' }),
      el('td', { text: objectText() }), el('td', { text: 'Air' }), el('td', { colSpan: 4 })));
    system.surfaces.forEach((s, j) => body.append(...surfaceRow(s, j)));
    body.append(el('tr', { class: 'bench-end' }, el('th', { scope: 'row', text: 'Img' }), el('td', { text: 'Image' }), imageCell));
    table.append(body);
    updateImageText();
  }

  function updateImageText() {
    if (!result?.ok) { imageCell.textContent = ''; return; }
    const how = { paraxial: 'paraxial focus', 'best-rms': 'best RMS focus', fixed: 'last row’s thickness' }[result.image.mode];
    const off = result.image.offset ? ` ${result.image.offset > 0 ? '+' : '−'} ${formatNumber(Math.abs(result.image.offset), 4)} mm` : '';
    imageCell.textContent = `${formatNumber(result.image.fromLast, 6)} mm after the last surface (${how}${off})`;
  }

  function syncSystem() {
    const s = system;
    c.object.value = s.object.atInfinity ? 'infinity' : 'finite';
    rows.distance.hidden = s.object.atInfinity;
    c.distance.value = String(s.object.distanceMm);
    // NA is only offered for a near object.
    c.apertureType.querySelector('option[value="na"]').disabled = s.object.atInfinity;
    c.apertureType.value = s.aperture.type;
    c.apertureValue.value = String(s.aperture.value);
    rows.apertureValue.querySelector('.unit').textContent = s.aperture.type === 'epd' ? 'mm' : '';
    c.fields.value = listText(s.fields.values);
    rows.fields.querySelector('.unit').textContent = s.fields.type === 'angle' ? '°' : 'mm';
    rows.fields.querySelector('label').textContent = s.fields.type === 'angle' ? 'Field angles' : 'Object heights';
    c.wavelengths.value = listText(s.wavelengthsNm);
    c.primary.textContent = '';
    s.wavelengthsNm.forEach((nm, i) => c.primary.append(el('option', { value: String(i), text: `${formatNumber(nm, 6)} nm` })));
    c.primary.value = String(s.primaryWavelength);
    c.focus.value = s.image.focus;
    c.offset.value = String(s.image.offsetMm);
    c.aiming.value = s.rayAiming;
    c.samples.value = String(s.pupilSamples);
    if (![...c.samples.options].some(o => o.value === c.samples.value)) {
      c.samples.append(el('option', { value: c.samples.value, text: `${c.samples.value} × ${c.samples.value} grid` }));
      c.samples.value = String(s.pupilSamples);
    }
    c.weights.value = listText(s.wavelengthWeights);
    rows.weights.hidden = s.wavelengthsNm.length < 2;
    c.grid.value = String(s.diffraction.grid);
    c.padding.value = String(s.diffraction.padding);
    c.illumination.value = s.diffraction.illumination;
    c.beamRatio.value = String(s.diffraction.beamRatio);
    rows.beamRatio.hidden = s.diffraction.illumination !== 'gaussian';
    c.vignetting.value = s.diffraction.vignetting ? 'on' : 'off';
    for (const input of form.querySelectorAll('input')) invalid(input, false);
  }

  return {
    // A new system from outside (a preset, a file, the first load): redraw.
    setSystem(next, { presetId = '', note = '' } = {}) {
      system = next;
      openAspheres.clear();
      next.surfaces.forEach((s, j) => { if (s.asphere.some(Boolean)) openAspheres.add(j); });
      presetSelect.value = presetId;
      presetNote.textContent = note;
      syncSystem();
      renderTable();
    },
    // The normalized result of the user's own edit: keep what is being typed.
    update(next, { structural }) {
      const focus = document.activeElement;
      const typing = focus && host.contains(focus) && focus.tagName === 'INPUT' && focus.type === 'text';
      system = next;
      presetSelect.value = '';
      presetNote.textContent = '';
      if (structural) renderTable();
      if (!typing) syncSystem();
      else {
        // Keep the typed text; refresh only what depends on other fields.
        c.primary.textContent = '';
        next.wavelengthsNm.forEach((nm, i) => c.primary.append(el('option', { value: String(i), text: `${formatNumber(nm, 6)} nm` })));
        c.primary.value = String(next.primaryWavelength);
      }
    },
    setResult(r) {
      result = r;
      updateImageText();
      for (const input of table.querySelectorAll('input[data-semi]')) {
        const auto = r?.ok ? r.surfaces[Number(input.dataset.semi)]?.auto : null;
        input.placeholder = auto != null ? formatNumber(auto, 3) : 'auto';
      }
      table.querySelectorAll('tr.is-stop .bench-fixed[title="Set by the aperture"]').forEach(span => {
        span.textContent = r?.ok ? formatNumber(r.firstOrder.stopRadius, 4) : '';
      });
    },
    setOpenLink(href, reasons, note = '') {
      if (href) {
        openLink.href = href;
        openLink.removeAttribute('aria-disabled');
        openNote.textContent = `Opens this lens in the canvas as a Lens group, lit by a laser at the primary wavelength. The canvas traces in 2D with its own conventions.${note ? ` ${note}` : ''}`;
      } else {
        openLink.removeAttribute('href');
        openLink.setAttribute('aria-disabled', 'true');
        openNote.textContent = reasons.length ? `Cannot open in the canvas: ${reasons.join('; ')}.` : '';
      }
    },
  };
}
