// Right-hand inspector: edit properties of the selected element or manual beam.

import { state, changed, pushUndo, findSelected } from './state.js';
import {
  registry, newShaperLayer, MAX_SHAPER_LAYERS, getElementMeta, getDirectManipulation, resolveDisplaySensor,
} from './elements.js';
import { detectorReading } from './raytrace.js';
import { pulseTransmissionAt } from './pulses.js';
import { esc } from './util.js';

let panel;
let undoArmed = false; // push one undo snapshot per editing session
let controlSerial = 0;
const sectionState = new Map();

export function initInspector(el) { panel = el; }

function field(labelText, inputHTML) {
  return `<label class="field"><span>${esc(labelText)}</span>${inputHTML}</label>`;
}

function splitFieldLabel(labelText) {
  const match = String(labelText).match(/^(.*?)\s*\(([^()]*)\)$/);
  return match ? { label: match[1], unit: match[2] } : { label: labelText, unit: '' };
}

export function shouldUseSlider(param = {}) {
  if (param.slider === false) return false;
  const min = Number(param.min), max = Number(param.max), step = Number(param.step);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || max <= min || step <= 0) return false;
  if (param.slider === true) return true;
  return (max - min) / step <= 200;
}

function sliderProgress(value, min, max) {
  return Math.max(0, Math.min(100, (Number(value) - min) / (max - min) * 100));
}

function numberField(labelText, attrs, value, param = {}) {
  const min = Number(param.min), max = Number(param.max), step = Number(param.step);
  const negative = Boolean(param.negative);
  const displayValue = negative ? Math.abs(value) : value;
  const limits = `min="${min}" max="${max}" step="${step}"`;
  const negAttr = negative ? ' data-neg="1"' : '';
  if (!shouldUseSlider(param)) {
    return field(labelText, `${negative ? '<span class="negsign">−</span>' : ''}<input type="number" ${attrs}${negAttr} ${limits} value="${displayValue}">`);
  }

  const id = `control-${controlSerial++}`;
  const parts = splitFieldLabel(labelText);
  const progress = sliderProgress(displayValue, min, max).toFixed(2);
  return `<div class="field slider-field" role="group" aria-labelledby="${id}-label">
    <div class="field-heading"><span id="${id}-label">${esc(parts.label)}</span>${parts.unit ? `<span class="field-unit">${esc(parts.unit)}</span>` : ''}</div>
    <div class="slider-inputs">
      <input type="range" ${attrs}${negAttr} data-control-id="${id}" data-control-role="range" ${limits} value="${displayValue}" aria-labelledby="${id}-label" style="--range-progress:${progress}%">
      <span class="number-wrap">${negative ? '<span class="negsign">−</span>' : ''}<input type="number" ${attrs}${negAttr} data-control-id="${id}" data-control-role="number" ${limits} value="${displayValue}" aria-label="${esc(labelText)} exact value"></span>
    </div>
  </div>`;
}

function inspectorSection(key, title, content, { open = true, meta = '' } = {}) {
  const isOpen = sectionState.has(key) ? sectionState.get(key) : open;
  return `<details class="insp-section" data-section="${key}" ${isOpen ? 'open' : ''}>
    <summary><span class="insp-section-title">${esc(title)}</span>${meta ? `<span class="insp-section-meta">${esc(meta)}</span>` : ''}</summary>
    <div class="insp-section-content">${content}</div>
  </details>`;
}

const LAYER_TYPES = [['lensarray', 'Lens array'], ['grating', 'Grating'], ['steer', 'Beam steer'], ['speckle', 'Speckle / diffuser']];

const positiveMod = (value, modulus) => ((value % modulus) + modulus) % modulus;

function shortTime(ns) {
  if (ns >= 1000) return `${(ns / 1000).toFixed(ns >= 10000 ? 0 : 2)} µs`;
  if (ns >= 1) return `${ns.toFixed(ns >= 100 ? 0 : 2)} ns`;
  return `${(ns * 1000).toFixed(2)} ps`;
}

// A detector timing plot derived from the actual trains. Horizontal position
// uses repetition rate, emission phase, and path delay; the pulse glyph widens
// with configured duration and multipath spread, with a visible minimum only
// when the physical width would be sub-pixel.
export function pulseTimelineHTML(pulse, color = '#2469e8') {
  if (!pulse) return '';
  const fallback = Number.isFinite(pulse.repRateMHz) ? [{
    repRateMHz: pulse.repRateMHz,
    pulseWidthFs: pulse.pulseWidthFs,
    phaseNs: pulse.phaseNs,
    gates: pulse.gates,
  }] : [];
  const trains = (Array.isArray(pulse.trains) && pulse.trains.length ? pulse.trains : fallback)
    .filter(t => Number.isFinite(t.repRateMHz) && t.repRateMHz > 0)
    .slice(0, 3);
  if (!trains.length) return '';
  const periods = trains.map(t => 1000 / t.repRateMHz);
  const minPeriod = Math.min(...periods), maxPeriod = Math.max(...periods);
  const windowNs = Math.max(minPeriod, Math.min(3 * maxPeriod, 12 * minPeriod));
  const width = 240, rowHeight = 24, height = 6 + rowHeight * trains.length;
  const stroke = /^#[0-9a-f]{6}$/i.test(color) ? color : '#2469e8';
  const delayNs = Number.isFinite(pulse.earliestPathDelayNs) ? pulse.earliestPathDelayNs : 0;
  const spreadNs = Number.isFinite(pulse.arrivalSpreadPs) ? pulse.arrivalSpreadPs / 1000 : 0;
  let content = '';
  trains.forEach((train, row) => {
    const periodNs = periods[row];
    const base = 18 + row * rowHeight;
    const phaseNs = Number.isFinite(train.phaseNs) ? train.phaseNs : 0;
    const offsetNs = positiveMod(phaseNs + delayNs, periodNs);
    const physicalWidthNs = Math.max(0, (train.pulseWidthFs || 0) * 1e-6 + spreadNs);
    const halfWidth = Math.min(8, Math.max(1.2, physicalWidthNs / windowNs * width / 2));
    const firstK = Math.floor(-offsetNs / periodNs) - 1;
    const lastK = Math.ceil((windowNs - offsetNs) / periodNs) + 1;
    const stride = Math.max(1, Math.ceil((lastK - firstK + 1) / 60));
    let pulses = '';
    for (let k = firstK; k <= lastK; k += stride) {
      const timeNs = offsetNs + k * periodNs;
      if (timeNs < 0 || timeNs > windowNs) continue;
      const emissionTimeNs = timeNs - (Number.isFinite(train.pathDelayNs) ? train.pathDelayNs : delayNs);
      const transmission = pulseTransmissionAt(train, emissionTimeNs);
      if (transmission <= 0) continue;
      const x = timeNs / windowNs * width;
      const peak = base - 14 * transmission;
      pulses += `M ${(x - halfWidth).toFixed(2)},${base} Q ${x.toFixed(2)},${peak.toFixed(2)} ${(x + halfWidth).toFixed(2)},${base}`;
    }
    content += `<line x1="0" y1="${base}" x2="${width}" y2="${base}" stroke="#b8c6d8" stroke-width="1"/>` +
      `<path d="${pulses}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
  });
  const extra = Array.isArray(pulse.trains) && pulse.trains.length > trains.length
    ? ` · first ${trains.length} of ${pulse.trains.length} trains` : '';
  return `<div class="pulse-timeline" aria-label="Detector pulse arrival timeline">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${content}</svg>
    <span>${shortTime(windowNs)} arrival window · widths enlarged when sub-pixel${extra}</span>
  </div>`;
}

function inspectorHead(def, meta, element = null) {
  const noteClass = meta.tier === 'diagram' ? ' diagram' : '';
  const title = element && def.labelFor ? def.labelFor(element) : def.label;
  return `<div class="inspector-head">
    <div class="inspector-kicker">Selected element</div>
    <div class="inspector-title-row"><h3>${esc(title)}</h3><span class="cap-badge ${meta.tier}">${esc(meta.status)}</span></div>
    <div class="inspector-desc">${esc(meta.description)}</div>
    ${meta.note ? `<div class="inspector-note${noteClass}">${esc(meta.note)}</div>` : ''}
  </div>`;
}

function sensorName(el) {
  const name = el?.label || registry[el?.type]?.label || 'Sensor';
  return String(name).trim() || 'Sensor';
}

function measurementHTML(el) {
  const viaDisplay = el.type === 'display';
  const source = viaDisplay ? resolveDisplaySensor(el, state.elements) : el;
  if (viaDisplay && !source) {
    const missing = Boolean(el.params.sensorId);
    return `<div class="measurement-card no-signal" data-measurements>
      <div class="measurement-status"><span class="signal-light"></span>${missing ? 'Sensor link unavailable' : 'No sensor connected'}</div>
      <div class="measurement-foot">${missing ? 'The linked sensor is no longer in this sketch. Choose another sensor input below.' : 'Choose a photodetector, PMT, camera, or retina from the sensor input below.'}</div>
    </div>`;
  }
  const readoutKind = registry[source?.type]?.readoutKind;
  if (!readoutKind) return '';
  const rd = detectorReading(source.id);
  if (!rd) {
    return `<div class="measurement-card no-signal" data-measurements>
      <div class="measurement-status"><span class="signal-light"></span>${viaDisplay ? `${esc(sensorName(source))}: no signal` : 'No light on sensor'}</div>
      <div class="measurement-foot">Aim a traced beam at ${viaDisplay ? "the linked sensor's" : "the component's"} front face to see a qualitative reading.</div>
    </div>`;
  }
  const signal = rd.signal >= 1000 ? '>999 a.u.'
    : `${rd.signal >= 100 ? Math.round(rd.signal) : rd.signal >= 10 ? rd.signal.toFixed(1) : rd.signal.toFixed(2)} a.u.`;
  const spectral = rd.bandMax - rd.bandMin > 2
    ? `${Math.round(rd.bandMin)}–${Math.round(rd.bandMax)} nm`
    : `${Math.round(rd.wavelength)} nm`;
  const spot = rd.samples > 1 ? `${rd.spotSpan.toFixed(1)} mm` : 'Point hit';
  const pulseTrain = rd.pulse?.mixed
    ? `${rd.pulse.sources} source trains · mixed settings`
    : rd.pulse ? `${rd.pulse.sources > 1 ? `${rd.pulse.sources} sources · ` : ''}${rd.pulse.repRateMHz.toLocaleString()} MHz · ${rd.pulse.pulseWidthFs.toLocaleString()} fs` : '';
  const pulseRows = rd.pulse ? `
      <dt>Pulse train</dt><dd>${pulseTrain}</dd>
      ${rd.pulse.mixed ? '' : `<dt>Emission offset</dt><dd>${rd.pulse.phaseNs.toLocaleString()} ns</dd>`}
      <dt>Earliest path delay</dt><dd>${rd.pulse.earliestPathDelayNs.toFixed(3)} ns</dd>
      <dt>Path spread</dt><dd>${rd.pulse.arrivalSpreadPs < 0.001 ? '&lt;0.001' : rd.pulse.arrivalSpreadPs.toFixed(3)} ps</dd>` : '';
  const pulseTimeline = pulseTimelineHTML(rd.pulse, rd.color);
  const detectorRows = readoutKind === 'pmt' ? `
      <dt>Amplified output</dt><dd>${rd.outputSignal.toFixed(2)} a.u.</dd>
      <dt>PMT state</dt><dd>${rd.saturated ? 'Saturated' : 'Linear range'}</dd>`
    : readoutKind === 'camera' ? `
      <dt>Centroid</dt><dd>${rd.centroid === null ? '—' : `${rd.centroid.toFixed(2)} mm`}</dd>
      <dt>Sensor bins</dt><dd>${rd.profile?.length || 0}</dd>` : '';
  let cameraProfile = '';
  if (rd.profile) {
    const max = Math.max(...rd.profile, 1e-9);
    const bw = 240 / rd.profile.length;
    const bars = rd.profile.map((value, i) => {
      if (!Number.isFinite(value) || value <= 1e-12) return '';
      const height = 28 * value / max;
      const fill = rd.profileColors?.[i] || rd.color;
      return `<rect x="${(i * bw + 0.5).toFixed(2)}" y="${(32 - height).toFixed(2)}" width="${Math.max(0.5, bw - 1).toFixed(2)}" height="${height.toFixed(2)}" rx="0.7" fill="${fill}"/>`;
    }).join('');
    cameraProfile = `<div class="camera-profile"><svg viewBox="0 0 240 36" preserveAspectRatio="none" aria-label="One-dimensional sensor profile"><g>${bars}</g><line x1="0" y1="32" x2="240" y2="32" stroke="#b8c6d8"/></svg><span>1D sensor profile · color shows qualitative wavelength mix per bin</span></div>`;
  }
  return `<div class="measurement-card" data-measurements>
    <div class="measurement-status"><span class="signal-light" style="background:${rd.color}"></span>${viaDisplay ? `Displaying ${esc(sensorName(source))}` : 'Receiving light'}</div>
    <dl class="measurement-grid">
      <dt>Relative ray weight</dt><dd>${signal}</dd>
      <dt>Spectrum</dt><dd>${spectral}</dd>
      <dt>Polarization</dt><dd>${esc(rd.polarization)}</dd>
      <dt>Spot span</dt><dd>${spot}</dd>
      <dt>Ray samples</dt><dd>${rd.samples}</dd>
      ${detectorRows}
      ${pulseRows}
    </dl>
    ${cameraProfile}
    ${pulseTimeline}
    <div class="measurement-foot">Relative ray weight from the qualitative tracer—not calibrated optical power.</div>
  </div>`;
}

export function refreshMeasurements() {
  if (!panel || state.selection?.kind !== 'element') return;
  const sel = findSelected();
  if (!sel || (!registry[sel.type]?.readoutKind && sel.type !== 'display')) return;
  const current = panel.querySelector('[data-measurements]');
  if (!current) return;
  const holder = document.createElement('div');
  holder.innerHTML = measurementHTML(sel);
  current.replaceWith(holder.firstElementChild);
}

function layersHTML(layers) {
  let h = `<div class="lsechead">Optical function — overlay up to ${MAX_SHAPER_LAYERS} structures</div>`;
  layers.forEach((ly, i) => {
    h += `<div class="layer"><div class="layerrow">
      <select data-li="${i}" data-lk="type" aria-label="Structure ${i + 1} type">` +
      LAYER_TYPES.map(([v, l]) => `<option value="${v}" ${v === ly.type ? 'selected' : ''}>${l}</option>`).join('') +
      `</select><button type="button" class="layerdel" data-ldel="${i}" title="Remove this structure" aria-label="Remove structure ${i + 1}">✕</button></div>`;
    if (ly.type === 'lensarray') {
      h += numberField('Nr. of lenses (1–8)', `data-li="${i}" data-lk="n"`, ly.n, { min: 1, max: 8, step: 1 });
      h += field('Focal length (mm)', `<input type="number" data-li="${i}" data-lk="f" min="-3000" max="3000" step="5" value="${ly.f}">`);
    } else if (ly.type === 'grating') {
      h += field('Lines / mm', `<input type="number" data-li="${i}" data-lk="lines" min="10" max="3600" step="10" value="${ly.lines}">`);
      h += field('Orders', `<input type="text" data-li="${i}" data-lk="orders" maxlength="200" value="${esc(ly.orders)}">`);
    } else if (ly.type === 'speckle') {
      h += numberField('Divergence (°)', `data-li="${i}" data-lk="div"`, ly.div ?? 8, { min: 0.5, max: 40, step: 0.5 });
    } else {
      h += field('Steer angle (°)', `<input type="number" data-li="${i}" data-lk="angle" min="-360" max="360" step="0.5" value="${ly.angle}">`);
    }
    h += `</div>`;
  });
  if (!layers.length) h += `<div class="hint">Flat surface (plain reflection). Add a structure to shape the wavefront.</div>`;
  if (layers.length < MAX_SHAPER_LAYERS) h += `<button type="button" id="layerAdd" class="layeradd">＋ Add structure</button>`;
  return h;
}

export function renderInspector() {
  const sel = findSelected();
  undoArmed = false;
  controlSerial = 0;
  if (state.selection?.kind === 'multi') {
    const n = state.selection.els.length + state.selection.beams.length;
    panel.innerHTML = `<div class="inspector-head"><div class="inspector-kicker">Selection</div><div class="inspector-title-row"><h3>${n} objects selected</h3><span class="cap-badge simulated">Group</span></div>
      <div class="inspector-desc">Move, duplicate, or remove this selection as one unit.</div></div>
      <div class="hint">Drag any selected object to move the group.<br>
      Shift-click adds or removes objects.<br>⌫ deletes all · ⌘D duplicates all.</div>
      <div class="btnrow"><button type="button" id="inspDup">Duplicate</button><button type="button" id="inspDel" class="danger">Delete</button></div>`;
    panel.querySelector('#inspDel').addEventListener('click', () => document.dispatchEvent(new CustomEvent('optics:delete')));
    panel.querySelector('#inspDup').addEventListener('click', () => document.dispatchEvent(new CustomEvent('optics:duplicate')));
    return;
  }
  if (!sel) {
    panel.innerHTML = `<div class="empty-inspector">
      <div class="empty-kicker">Inspector</div><h3>Build a light path</h3>
      <p class="empty-intro">Select any object to adjust its setup with precise values and quick controls.</p>
      <ol class="quick-steps"><li>Choose a source from the library.</li><li>Place optics in the beam.</li><li>Add a detector and select it to read the signal.</li></ol>
      ${inspectorSection('quick-controls', 'Useful controls', '<div class="hint"><b>/</b> search components<br><b>R / ⇧R</b> rotate ±45°<br><b>⌘D</b> duplicate · <b>⌫</b> delete<br><b>Arrows</b> nudge · <b>Space-drag</b> pan<br><b>⌘/ctrl-scroll</b> zoom</div>', { open: false })}
      </div>`;
    return;
  }

  if (state.selection.kind === 'element') {
    const def = registry[sel.type];
    const meta = getElementMeta(sel.type, sel.params, { element: sel, elements: state.elements });
    let h = inspectorHead(def, meta, sel) + measurementHTML(sel);
    const direct = getDirectManipulation(sel);
    if (direct || def.editPoints) {
      const actions = [direct?.resize ? 'blue handles resize the physical component' : '',
        def.editPoints ? (def.editPoints.hint || 'round blue points reshape the boundary') : '',
        direct?.tune ? `purple knob tunes ${direct.tune.short || direct.tune.param.label}` : ''].filter(Boolean).join(' · ');
      h += `<div class="direct-hint"><b>On-canvas controls</b><span>${esc(def.directHint || actions)}</span></div>`;
    }

    // Most element types render exactly one "Optical behavior" section (or
    // `def.paramsTitle`, e.g. the sensor display's "Signal connection").
    // The stage element instead splits its params into multiple titled
    // sections via `type: 'section'` markers (e.g. "Piezo movement" before
    // "Optical behavior") — each flush emits one collapsible section.
    {
      let sectionKey = 'optical';
      let sectionTitle = def.paramsTitle || 'Optical behavior';
      let sectionFields = '';
      let sectionCount = 0;
      let voxelHintInserted = false;
      const insertVoxelHint = () => {
        if (voxelHintInserted) return;
        voxelHintInserted = true;
        if (sel.type === 'stage' && sel.params.sampleKind === 'resin' && sel.params.voxelPreview) {
          sectionFields += `<div class="hint">Each visible pulsed arrival deposits a bounded square marker at the traced hit. The marker follows the moving sample and broadens/fades with X (depth) offset from focus; it is a 2D writing preview, not a dose, threshold, curing, or true 3D-volume calculation.</div>`;
          sectionFields += `<button type="button" id="inspClearVoxels">Clear voxel preview</button>`;
        }
      };
      const flushSection = () => {
        if (!sectionFields) return;
        h += inspectorSection(sectionKey, sectionTitle, sectionFields, {
          meta: `${sectionCount} ${sectionCount === 1 ? 'setting' : 'settings'}`,
        });
      };
      for (const p of def.params || []) {
        if (p.hidden) continue;
        if (p.show && !p.show(sel.params)) continue;
        if (p.type === 'section') {
          flushSection();
          sectionKey = p.key; sectionTitle = p.label; sectionFields = ''; sectionCount = 0;
          continue;
        }
        sectionCount++;
        if (p.type === 'heading') { sectionFields += `<div class="lsechead">${esc(p.label)}</div>`; continue; }
        const v = sel.params[p.key];
        if (p.type === 'number') {
          sectionFields += numberField(p.label, `data-p="${p.key}"`, v, p);
        }
        else if (p.type === 'text') sectionFields += field(p.label, `<input type="text" data-p="${p.key}" ${p.key === 'orders' ? 'maxlength="200"' : ''} value="${esc(v)}">`);
        else if (p.type === 'checkbox') sectionFields += field(p.label, `<input type="checkbox" data-p="${p.key}" ${v ? 'checked' : ''}>`);
        else if (p.type === 'color') sectionFields += field(p.label, `<input type="color" data-p="${p.key}" value="${v}">`);
        else if (p.type === 'select') {
          sectionFields += field(p.label, `<select data-p="${p.key}">` + p.options.map(([ov, ol]) => `<option value="${ov}" ${ov === v ? 'selected' : ''}>${esc(ol)}</option>`).join('') + `</select>`);
        }
        else if (p.type === 'sensor') {
          const sensors = state.elements.filter(candidate => candidate.id !== sel.id && registry[candidate.type]?.readoutKind);
          const hasCurrent = sensors.some(candidate => candidate.id === v);
          const options = [
            `<option value="" ${v ? '' : 'selected'}>Not connected</option>`,
            ...(!hasCurrent && v ? [`<option value="${esc(v)}" selected>Missing sensor</option>`] : []),
            ...sensors.map(sensor => {
              const name = sensorName(sensor);
              const position = `${Math.round(sensor.x)}, ${Math.round(sensor.y)} mm`;
              return `<option value="${esc(sensor.id)}" ${sensor.id === v ? 'selected' : ''}>${esc(`${name} · ${position}`)}</option>`;
            }),
          ];
          sectionFields += field(p.label, `<select data-p="${p.key}">${options.join('')}</select>`);
          if (!sensors.length) sectionFields += `<div class="hint">Add a detector, PMT, camera, or human eye, then return here to connect it.</div>`;
        }
        else if (p.type === 'layers') sectionFields += layersHTML(Array.isArray(sel.params[p.key]) ? sel.params[p.key] : []);
        else if (p.type === 'optsize') {
          const STD = [[12.7, '½″ (12.7 mm)'], [25.4, '1″ (25.4 mm)'], [50.8, '2″ (50.8 mm)']];
          const isStd = STD.some(([s]) => s === v);
          sectionFields += field(p.label, `<select data-p="${p.key}" data-optsize="1">` +
            STD.map(([s, l]) => `<option value="${s}" ${v === s ? 'selected' : ''}>${l}</option>`).join('') +
            `<option value="custom" ${!isStd ? 'selected' : ''}>Custom…</option></select>`);
          if (!isStd) sectionFields += field('↳ size (mm)', `<input type="number" data-p="${p.key}" min="1" max="500" step="0.5" value="${v}">`);
        }
      }
      insertVoxelHint();
      flushSection();
    }

    if (!state.demoMode) {
      let positionFields = '';
      positionFields += field('X (mm)', `<input type="number" step="1" data-k="x" value="${Math.round(sel.x * 10) / 10}">`);
      positionFields += field('Y (mm)', `<input type="number" step="1" data-k="y" value="${Math.round(sel.y * 10) / 10}">`);
      if (def.rotatable !== false) {
        positionFields += numberField('Angle (°)', 'data-k="rot"', Math.round((sel.rot || 0) * 10) / 10, {
          min: 0, max: 359, step: 1, slider: true,
        });
      }
      h += inspectorSection('position', 'Position & rotation', positionFields, { open: false });
      if (!def.noLabel) {
        let appearanceFields = field('Label', `<input type="text" data-k="label" value="${esc(sel.label || '')}">`);
        appearanceFields += field('Show label', `<input type="checkbox" data-k="showLabel" ${sel.showLabel ? 'checked' : ''}>`);
        if (sel.showLabel) {
          const lp = sel.labelPos || 'b';
          appearanceFields += field('Label position', `<select data-k="labelPos">` +
            [['b', 'Below'], ['t', 'Above'], ['l', 'Left'], ['r', 'Right']].map(([v, l]) => `<option value="${v}" ${v === lp ? 'selected' : ''}>${l}</option>`).join('') + `</select>`);
        }
        h += inspectorSection('appearance', 'Label & appearance', appearanceFields, { open: false });
      }
    }
    if (!state.demoMode) {
      h += `<div class="btnrow">${def.singleton ? '' : '<button type="button" id="inspDup">Duplicate</button>'}<button type="button" id="inspDel" class="danger">Delete</button></div>`;
      h += `<a class="wiki-link" href="../wiki/${sel.type}/">Explore this element on the Wiki →</a>`;
    }
    panel.innerHTML = h;
  } else {
    const b = sel;
    const isFiber = b.kind === 'fiber';
    const tier = isFiber ? (b.propagate ? 'simulated' : 'configurable') : 'diagram';
    const status = isFiber ? (b.propagate ? 'Simulated' : 'Needs setup') : 'Diagram only';
    const description = isFiber
      ? (b.propagate ? 'Routes incoming light between its two configured ends.' : 'Enable propagation to route light through this fiber path.')
      : 'A visual beam path for explanatory diagrams; it does not affect traced rays.';
    let h = `<div class="inspector-head"><div class="inspector-kicker">Selected path</div>
      <div class="inspector-title-row"><h3>${isFiber ? 'Optical fiber' : 'Manual beam'}</h3><span class="cap-badge ${tier}">${status}</span></div>
      <div class="inspector-desc">${description}</div></div>`;
    let appearanceFields = field('Color', `<input type="color" data-k="color" value="${b.color}">`);
    appearanceFields += numberField('Width (px)', 'data-k="width"', b.width, { min: 0.5, max: 20, step: 0.5 });
    if (!isFiber) {
      appearanceFields += field('Dashed', `<input type="checkbox" data-k="dash" ${b.dash ? 'checked' : ''}>`);
      appearanceFields += field('Arrowhead', `<input type="checkbox" data-k="arrow" ${b.arrow ? 'checked' : ''}>`);
      h += inspectorSection('path-appearance', 'Appearance', appearanceFields);
    } else {
      h += inspectorSection('path-appearance', 'Appearance', appearanceFields);
      let propagationFields = field('Beam propagates', `<input type="checkbox" data-k="propagate" ${b.propagate ? 'checked' : ''}>`);
      if (b.propagate) {
        propagationFields += numberField('Input NA', 'data-k="inputNA"', b.inputNA ?? 0.22, { min: 0.01, max: 0.95, step: 0.01 });
        propagationFields += field('Group index', `<input type="number" data-k="groupIndex" min="1" max="2.2" step="0.001" value="${b.groupIndex ?? 1.468}">`);
        propagationFields += field('Loss (dB/m)', `<input type="number" data-k="lossDbPerM" min="0" max="100" step="0.1" value="${b.lossDbPerM ?? 0.2}">`);
        // one output spec per fiber end; migrate legacy single-spec fibers
        for (const end of [0, 1]) {
          if (!b['out' + end]) b['out' + end] = { mode: b.outMode || 'diverge', na: b.na ?? 0.12, focal: b.focal ?? 20, dia: b.outDia ?? 6 };
        }
        for (const end of [0, 1]) {
          const o = b['out' + end];
          propagationFields += `<div class="lsechead">Output at end ${end === 0 ? 'A' : 'B'}</div>`;
          propagationFields += field('Style', `<select data-fend="${end}" data-fk="mode">
            <option value="diverge" ${o.mode !== 'focus' ? 'selected' : ''}>Diverging (NA)</option>
            <option value="focus" ${o.mode === 'focus' ? 'selected' : ''}>Lensed (focus)</option></select>`);
          if (o.mode !== 'focus') {
            propagationFields += numberField('NA', `data-fend="${end}" data-fk="na"`, o.na ?? 0.12, { min: 0.01, max: 0.95, step: 0.01 });
          } else {
            propagationFields += field('Focal length (mm)', `<input type="number" data-fend="${end}" data-fk="focal" min="2" max="500" step="1" value="${o.focal ?? 20}">`);
            propagationFields += numberField('Output beam Ø (mm)', `data-fend="${end}" data-fk="dia"`, o.dia ?? 6, { min: 1, max: 30, step: 0.5 });
          }
        }
        propagationFields += `<div class="hint">Ends A and B are marked on the canvas while the fiber is selected. Light entering one end exits the other with that end's output spec.</div>`;
      } else {
        propagationFields += `<div class="hint">Connectors block incoming beams. Enable propagation to relaunch the beam from the other end.</div>`;
      }
      h += inspectorSection('fiber-propagation', 'Propagation', propagationFields);
    }
    h += `<div class="hint">Drag the round handles on the canvas to reshape ${isFiber ? 'the fiber' : 'the beam'}.</div>`;
    h += `<div class="btnrow"><button type="button" id="inspDup">Duplicate</button><button type="button" id="inspDel" class="danger">Delete</button></div>`;
    panel.innerHTML = h;
  }

  panel.querySelectorAll('input,select').forEach(inp => {
    inp.addEventListener('input', () => applyInput(inp));
    inp.addEventListener('change', () => applyInput(inp, true));
  });
  panel.querySelectorAll('[data-section]').forEach(section => {
    section.addEventListener('toggle', () => sectionState.set(section.dataset.section, section.open));
  });
  const del = panel.querySelector('#inspDel');
  if (del) del.addEventListener('click', () => document.dispatchEvent(new CustomEvent('optics:delete')));
  const dup = panel.querySelector('#inspDup');
  if (dup) dup.addEventListener('click', () => document.dispatchEvent(new CustomEvent('optics:duplicate')));
  const clearVoxels = panel.querySelector('#inspClearVoxels');
  if (clearVoxels) clearVoxels.addEventListener('click', () => {
    const s = findSelected();
    if (s?.type === 'stage') document.dispatchEvent(new CustomEvent('optics:clearvoxels', { detail: { stageId: s.id } }));
  });
  // wavefront-shaper layer add/remove
  const addBtn = panel.querySelector('#layerAdd');
  if (addBtn) addBtn.addEventListener('click', () => {
    const s = findSelected();
    if (!s) return;
    pushUndo();
    if (!Array.isArray(s.params.layers)) s.params.layers = [];
    s.params.layers.push(newShaperLayer());
    changed();
    renderInspector();
  });
  panel.querySelectorAll('[data-ldel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = findSelected();
      if (!s) return;
      pushUndo();
      s.params.layers.splice(+btn.dataset.ldel, 1);
      changed();
      renderInspector();
    });
  });
}

function applyStageSamplePreset(sel) {
  if (sel.type !== 'stage') return;
  const p = sel.params;
  if (p.sampleKind === 'fluorescent') {
    Object.assign(p, { mode: 'fluor', fluorWl: 520, transmitExc: true, transmission: 0.8, signalEff: 0.1, voxelPreview: false });
  } else if (p.sampleKind === 'resin') {
    Object.assign(p, { mode: 'none', transmitExc: true, transmission: 0.85, voxelPreview: true });
  } else if (p.sampleKind === 'nonlinear') {
    Object.assign(p, { mode: 'shg', transmitExc: true, transmission: 0.8, signalEff: 0.1, voxelPreview: false });
  } else if (p.sampleKind === 'opaque') {
    Object.assign(p, { mode: 'none', transmitExc: false, voxelPreview: false });
  } else if (p.sampleKind === 'generic') {
    Object.assign(p, { mode: 'none', transmitExc: true, transmission: 0.8, voxelPreview: false });
  }
}

function applyInput(inp, rebuild = false) {
  const sel = findSelected();
  if (!sel) return;
  const key = inp.dataset.k, pkey = inp.dataset.p;
  let val;
  if (inp.type === 'checkbox') val = inp.checked;
  else if (inp.type === 'number' || inp.type === 'range') {
    val = parseFloat(inp.value);
    if (!Number.isFinite(val)) return;
    // Only clamp (and rewrite the visible text) on commit (blur/change), not
    // on every keystroke — otherwise clearing a field and typing a new
    // value gets overwritten mid-edit the moment a leading digit sequence
    // is momentarily below min (e.g. clearing "532" and typing "9" of a
    // new "920" snaps to the min wavelength, corrupting the rest of the typed text).
    if (rebuild) {
      const min = parseFloat(inp.min), max = parseFloat(inp.max);
      if (Number.isFinite(min)) val = Math.max(min, val);
      if (Number.isFinite(max)) val = Math.min(max, val);
      if (parseFloat(inp.value) !== val) inp.value = String(val);
    }
  }
  else val = inp.value;
  if (inp.dataset.controlId) {
    panel.querySelectorAll('[data-control-id]').forEach(peer => {
      if (peer !== inp && peer.dataset.controlId === inp.dataset.controlId) peer.value = String(val);
    });
    const range = inp.dataset.controlRole === 'range'
      ? inp
      : [...panel.querySelectorAll('[data-control-id]')].find(peer =>
        peer.dataset.controlId === inp.dataset.controlId && peer.dataset.controlRole === 'range');
    if (range) range.style.setProperty('--range-progress', `${sliderProgress(val, Number(range.min), Number(range.max))}%`);
  }
  if (inp.maxLength > 0 && typeof val === 'string' && val.length > inp.maxLength) {
    val = val.slice(0, inp.maxLength);
    inp.value = val;
  }
  if (inp.dataset.neg) val = -Math.abs(val); // − sign lives outside the box
  if (!undoArmed) { pushUndo(); undoArmed = true; }

  // per-end fiber output fields
  if (inp.dataset.fend !== undefined) {
    const o = sel['out' + inp.dataset.fend];
    if (!o) return;
    o[inp.dataset.fk] = val;
    changed();
    if (rebuild && inp.dataset.fk === 'mode') renderInspector();
    return;
  }

  // standard optic size dropdown (½″ / 1″ / 2″ / custom)
  if (inp.dataset.optsize) {
    if (inp.value === 'custom') {
      // nudge off the standard value so the custom field appears
      const cur = sel.params[pkey];
      if (cur === 12.7 || cur === 25.4 || cur === 50.8) sel.params[pkey] = Math.round(cur);
    } else {
      sel.params[pkey] = parseFloat(inp.value);
    }
    changed();
    if (rebuild) renderInspector();
    return;
  }

  // wavefront-shaper layer fields
  if (inp.dataset.li !== undefined) {
    const layers = sel.params.layers;
    const ly = layers && layers[+inp.dataset.li];
    if (!ly) return;
    ly[inp.dataset.lk] = val;
    changed();
    if (rebuild && inp.dataset.lk === 'type') renderInspector();
    return;
  }

  if (key) sel[key] = key === 'rot' ? ((val % 360) + 360) % 360 : val;
  else if (pkey) {
    sel.params[pkey] = val;
    if (pkey === 'sampleKind') applyStageSamplePreset(sel);
  }
  changed();
  if (rebuild && (key === 'propagate' || key === 'outMode' || key === 'showLabel')) { renderInspector(); return; }
  // conditional params (show/hide) need a panel rebuild — only on 'change' to not steal focus
  if (rebuild && ['dtype', 'ftype', 'beamMode', 'autoColor', 'convert', 'bwMode', 'temporalMode', 'raysMode', 'zeroOrder', 'modulate', 'mode', 'scanMode', 'transmitExc', 'containsSample', 'sampleKind', 'voxelPreview', 'pzMode', 'showSignalSpot', 'showMaterialLabel', 'sensorId', 'refl'].includes(pkey)) renderInspector();
}
