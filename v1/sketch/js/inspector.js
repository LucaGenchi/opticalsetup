// Right-hand inspector: edit properties of the selected element or manual beam.

import { state, changed, pushUndo, findSelected } from './state.js';
import {
  registry, newShaperLayer, MAX_SHAPER_LAYERS, getElementMeta, getDirectManipulation, resolveDisplaySensor,
  newSampleChannel, MAX_SAMPLE_CHANNELS, MIXING_KINDS, EPI_CAPABLE_KINDS, sampleChannels,
  signalKindsFor, specimenTypeOf, channelWarning, defaultEmissionWl, drivingExcitationWl,
  EMISSION_ORDER, RAMAN_MATERIALS, MODIFIER_KINDS, TWO_BEAM_KINDS,
  FLUOROPHORES, fluorophoreSpec,
} from './elements.js';
import { detectorReading, specimenIncidentWls, specimenIncidentBeams, signalHitsFromLastTrace } from './raytrace.js';
import { pulseTransmissionAt } from './pulses.js';
import { transformLimitedBandwidthNm } from './spectrum.js';
import { buildTwoPhotonHandoffUrl, twoPhotonHandoffCandidates } from './two-photon-handoff.js';
import {
  OBJECTIVE_MEDIA, normalizeObjectiveParams, objectiveMediumKey, objectiveWorkingDistance,
} from './objective.js';
import { immersionCouplingStatus } from './immersion.js';
import { esc } from './util.js';
import { WIKI_TYPES } from './wiki-types.js';

let panel;
let undoArmed = false; // push one undo snapshot per editing session
let controlSerial = 0;
const sectionState = new Map();

// Round a computed transform-limited value to a sane display precision —
// the raw TBP formulas return long floats that read as noise in a text field.
function roundSig(value, sig = 4) {
  if (!Number.isFinite(value) || value === 0) return value;
  const magnitude = Math.pow(10, sig - Math.ceil(Math.log10(Math.abs(value))));
  return Math.round(value * magnitude) / magnitude;
}

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

function resolvedParam(param, params) {
  const resolve = value => typeof value === 'function' ? value(params) : value;
  return { ...param, min: resolve(param.min), max: resolve(param.max) };
}

// Standard-optic size control: the common ½″/1″/2″ picks plus a custom box.
function optsizeField(p, v) {
  const STD = [[12.7, '\u00bd\u2033 (12.7 mm)'], [25.4, '1\u2033 (25.4 mm)'], [50.8, '2\u2033 (50.8 mm)']];
  const isStd = STD.some(([size]) => size === v);
  let out = field(p.label, `<select data-p="${p.key}" data-optsize="1">` +
    STD.map(([size, label]) => `<option value="${size}" ${v === size ? 'selected' : ''}>${label}</option>`).join('') +
    `<option value="custom" ${!isStd ? 'selected' : ''}>Custom\u2026</option></select>`);
  if (!isStd) out += field('\u21b3 size (mm)', `<input type="number" data-p="${p.key}" min="1" max="500" step="0.5" value="${v}">`);
  return out;
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

// Specimen signal channels — the same stacked-overlay editor idea as the
// wavefront shapers' layers, but each row is one emission the specimen adds.
// The wavelengths actually reaching a specimen right now, read back from
// the live trace so emission defaults and warnings track the real bench.
function incidentWlsAt(sel) {
  return specimenIncidentWls(sel.id);
}

// The full incident records, so a warning can also judge arrival timing.
function incidentBeamsAt(sel) {
  return specimenIncidentBeams(sel.id);
}

// Specimen signal channels — the same stacked-overlay editor idea as the
// wavefront shapers' layers, but each row is one signal the specimen adds,
// and the menu offered depends on whether it is a linear or nonlinear
// specimen (a linear process and a nonlinear one are never alternatives for
// the same physical sample).
function signalsHTML(sel) {
  const channels = sampleChannels(sel.params);
  const kinds = signalKindsFor(specimenTypeOf(sel.params));
  const incident = incidentWlsAt(sel);
  const excitation = drivingExcitationWl(incident);
  let h = `<div class="lsechead">Signals generated — stack up to ${MAX_SAMPLE_CHANNELS}</div>`;
  channels.forEach((c, i) => {
    h += `<div class="layer"><div class="layerrow">
      <select data-ci="${i}" data-ck="kind" aria-label="Signal ${i + 1} type">` +
      kinds.map(([v, l]) => `<option value="${v}" ${v === c.kind ? 'selected' : ''}>${l}</option>`).join('') +
      `</select><button type="button" class="layerdel" data-cdel="${i}" title="Remove this signal" aria-label="Remove signal ${i + 1}">✕</button></div>`;

    const order = EMISSION_ORDER[c.kind];
    if (order) {
      h += field('Fluorophore', `<select data-ci="${i}" data-ck="fluorophore">` +
        FLUOROPHORES.map(([id, label]) => `<option value="${id}" ${id === c.fluorophore ? 'selected' : ''}>${esc(label)}</option>`).join('') +
        `</select>`);
      const dye = fluorophoreSpec(c.fluorophore);
      if (dye) {
        h += `<div class="hint">Absorbs around ${dye.absPeak} nm${order > 1 ? ` (${order} photons of ${Math.round(dye.absPeak * order)} nm)` : ''}, emits a ${dye.emFwhm} nm band at ${dye.emPeak} nm.</div>`;
      }
    }
    if (order && !fluorophoreSpec(c.fluorophore)) {
      // Fluorescence and its multiphoton cousins emit one longer-wavelength
      // photon per absorbed group. The default tracks the bench; typing a
      // wavelength pins it and is checked against the photon-energy floor.
      const auto = defaultEmissionWl(c.kind, excitation);
      h += field('Emission λ', `<select data-ci="${i}" data-ck="autoWl">
        <option value="auto" ${c.autoWl !== false ? 'selected' : ''}>From the excitation${auto ? ` (${auto} nm)` : ''}</option>
        <option value="manual" ${c.autoWl === false ? 'selected' : ''}>Set manually</option>
      </select>`);
      if (c.autoWl === false) {
        h += field('Emission λ (nm)', `<input type="number" data-ci="${i}" data-ck="wl" min="200" max="1600" step="5" value="${c.wl}">`);
      }
    } else if (c.kind === 'raman') {
      h += field('Material', `<select data-ci="${i}" data-ck="material">` +
        RAMAN_MATERIALS.map(([id, label]) => `<option value="${id}" ${id === c.material ? 'selected' : ''}>${esc(label)}</option>`).join('') +
        `</select>`);
      h += `<div class="hint">Stokes-shifted lines from the material's own fingerprint — a spectrometer downstream reconstructs it.</div>`;
    } else if (c.kind === 'phase') {
      h += numberField('Retardance (°)', `data-ci="${i}" data-ck="retardance"`, c.retardance ?? 90, { min: 0, max: 360, step: 5 });
      h += numberField('Fast axis (°)', `data-ci="${i}" data-ck="axis"`, c.axis ?? 45, { min: 0, max: 180, step: 5 });
      h += `<div class="hint">Retards the transmitted excitation without adding light of its own — read it with a waveplate and analyzer.</div>`;
    } else if (c.kind === 'srs') {
      h += numberField('Modulation transfer (%)', `data-ci="${i}" data-ck="transferEff"`, Math.round((c.transferEff ?? 0.1) * 100), { min: 1, max: 50, step: 1 });
      h += `<div class="hint">Copies one beam's intensity modulation onto the other. No new wavelength — detect the receiving beam on a photodiode and read it on the screen.</div>`;
    } else if (MIXING_KINDS.has(c.kind)) {
      h += field('Wavelength', `<select data-ci="${i}" data-ck="autoWl">
        <option value="auto" ${c.autoWl !== false ? 'selected' : ''}>From the two beams present</option>
        ${c.kind === 'cars' ? `<option value="manual" ${c.autoWl === false ? 'selected' : ''}>Set manually</option>` : ''}
      </select>`);
      if (c.kind === 'cars' && c.autoWl === false) {
        h += field('CARS λ (nm)', `<input type="number" data-ci="${i}" data-ck="wl" min="200" max="1200" step="5" value="${c.wl}">`);
      }
    }

    // Phase contrast and SRS shape the beam that is already there rather
    // than emitting light of their own, so an emission efficiency would be
    // meaningless for them.
    if (!MODIFIER_KINDS.has(c.kind)) {
      h += numberField('Efficiency', `data-ci="${i}" data-ck="eff"`, c.eff, { min: 0, max: 1, step: 0.05 });
      h += field('Color from λ', `<input type="checkbox" data-ci="${i}" data-ck="autoColor" ${c.autoColor !== false ? 'checked' : ''}>`);
      if (c.autoColor === false) {
        h += field('Signal color', `<input type="color" data-ci="${i}" data-ck="color" value="${esc(c.color || '#22c55e')}">`);
      }
    }
    if (TWO_BEAM_KINDS.has(c.kind) && !(c.kind === 'cars' && c.autoWl === false)) {
      h += field('Needs pulse overlap', `<input type="checkbox" data-ci="${i}" data-ck="requireOverlap" ${c.requireOverlap !== false ? 'checked' : ''}>`);
    }
    if (EPI_CAPABLE_KINDS.has(c.kind)) {
      h += field('Epi (backward) signal', `<input type="checkbox" data-ci="${i}" data-ck="epi" ${c.epi ? 'checked' : ''}>`);
      if (c.epi) h += numberField('Epi / forward ratio', `data-ci="${i}" data-ck="epiRatio"`, c.epiRatio ?? 0.15, { min: 0, max: 1, step: 0.05 });
    }
    const warning = channelWarning(c, incidentBeamsAt(sel));
    if (warning) h += `<div class="signal-warning" role="alert">⚠ ${esc(warning)}</div>`;
    h += `</div>`;
  });
  if (!channels.length) h += `<div class="hint">No signals yet — this specimen only attenuates the excitation. Add one to make it emit.</div>`;
  if (channels.length < MAX_SAMPLE_CHANNELS) h += `<button type="button" id="signalAdd" class="layeradd">＋ Add signal</button>`;
  return h;
}

// Renders one param's control. Used by both the section loop and the
// Label & appearance block, so a checkbox is a checkbox wherever it sits —
// the appearance block previously assumed everything routed to it was
// numeric and drew "Show excitation spot" as a number box.
function paramField(p, sel) {
  const v = sel.params[p.key];
  if (p.type === 'number') return numberField(p.label, `data-p="${p.key}"`, v, resolvedParam(p, sel.params));
  if (p.type === 'optsize') return optsizeField(p, v);
  if (p.type === 'text') return field(p.label, `<input type="text" data-p="${p.key}" ${p.key === 'orders' ? 'maxlength="200"' : ''} value="${esc(v)}">`);
  if (p.type === 'checkbox') return field(p.label, `<input type="checkbox" data-p="${p.key}" ${v ? 'checked' : ''}>`);
  if (p.type === 'color') return field(p.label, `<input type="color" data-p="${p.key}" value="${v}">`);
  if (p.type === 'select') {
    const options = [
      ...(p.options || []).map(([ov, ol]) => [ov, ol, false]),
      ...(p.legacyOptions || []).filter(([ov]) => ov === v).map(([ov, ol]) => [ov, ol, true]),
    ];
    return field(p.label, `<select data-p="${p.key}">`
      + options.map(([ov, ol, disabled]) => `<option value="${ov}" ${ov === v ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${esc(ol)}</option>`).join('')
      + `</select>`);
  }
  if (p.type === 'sensor') {
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
    return field(p.label, `<select data-p="${p.key}">${options.join('')}</select>`)
      + (sensors.length ? '' : `<div class="hint">Add a detector, PMT, camera, or human eye, then return here to connect it.</div>`);
  }
  if (p.type === 'layers') return layersHTML(Array.isArray(v) ? v : []);
  if (p.type === 'signals') return signalsHTML(sel);
  // A derived quantity, shown in the same box shape as an editable field so
  // it reads as part of the source's settings, but computed from the other
  // params on every render and never stored or saved.
  if (p.type === 'readout') {
    return field(p.label, `<output class="readout" data-p="${p.key}">${esc(p.readout(sel.params, sel))}</output>`);
  }
  // Editable, but backed by another param instead of its own storage:
  // displayed value comes from `get`, and a commit writes through `set`
  // rather than into sel.params[p.key] — see applyInput() below.
  if (p.type === 'derived') {
    return numberField(p.label, `data-p="${p.key}" data-derived="1"`, p.get(sel.params), resolvedParam(p, sel.params));
  }
  return '';
}

// Keep computed values causally live without rebuilding the inspector and
// stealing focus from the field being edited. A full rebuild still happens
// on committed structural changes (for example selecting Custom index), but
// NA/EFL/theta-style readouts can follow every input event in place.
function refreshReadouts(sel) {
  if (!panel?.querySelectorAll) return;
  const specs = registry[sel.type]?.params || [];
  const readouts = new Map(specs.filter(spec => spec.type === 'readout').map(spec => [spec.key, spec]));
  panel.querySelectorAll('output.readout[data-p]').forEach(output => {
    const spec = readouts.get(output.dataset.p);
    if (spec?.readout) output.textContent = String(spec.readout(sel.params, sel));
  });
}

function objectiveCouplingHint(sel) {
  const medium = objectiveMediumKey(sel.params);
  if (medium === 'air') {
    return `<div class="hint" data-objective-coupling-status="dry">Dry / air objective: NA is capped at 0.85, the practical ceiling for real dry designs. No liquid meniscus is drawn.</div>`;
  }
  if (medium === 'legacy') {
    return `<div class="signal-warning" role="alert" data-objective-coupling-status="legacy">⚠ Choose the objective's designed front medium. This older high-NA sketch did not record one.</div>`;
  }

  const couplingStatus = immersionCouplingStatus(sel, state.elements, state.beams);
  if (couplingStatus.state === 'ambiguous') {
    return `<div class="signal-warning" role="status" data-objective-coupling-status="ambiguous">⚠ Two contacts are equally near this objective. Move one clear of the axis so the coupling target is unambiguous.</div>`;
  }
  const coupling = couplingStatus.coupling;
  if (!coupling) {
    return `<div class="signal-warning" role="status" data-objective-coupling-status="open">⚠ No compatible immersion contact is in front of the objective. The NA guide ends at its nominal ${objectiveWorkingDistance(sel.params).toFixed(1)} mm working-distance focus.</div>`;
  }

  const target = coupling.targetKind === 'element'
    ? (String(coupling.target?.label || '').trim() || registry[coupling.targetType]?.label || 'sample')
    : `${coupling.target?.bare ? 'Bare fiber' : 'Fiber'} end ${coupling.targetEnd === 0 ? 'A' : 'B'}`;
  const index = Number.isFinite(coupling.refractiveIndex) ? ` · n ${coupling.refractiveIndex.toFixed(3)}` : '';
  const workingDistance = objectiveWorkingDistance(sel.params);
  const focusError = coupling.distance - workingDistance;
  const focus = Math.abs(focusError) <= 0.1
    ? 'at the nominal focus'
    : `focus offset ${focusError > 0 ? '+' : '−'}${Math.abs(focusError).toFixed(1)} mm`;
  return `<div class="hint" data-objective-coupling-status="connected"><b>Immersion bridge:</b> ${esc(OBJECTIVE_MEDIA[medium].label)}${index} to ${esc(target)} · actual gap ${coupling.distance.toFixed(1)} mm · WD ${workingDistance.toFixed(1)} mm (${focus}). Medium changes n and θ, not WD. The meniscus remains schematic.</div>`;
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
        if (sel.type !== 'stage' || specimenTypeOf(sel.params) !== 'resin') return;
        if (sel.params.voxelPreview) {
          sectionFields += `<div class="hint">Each visible pulsed arrival deposits a bounded square marker at the traced hit. The marker follows the moving sample and broadens/fades with X (depth) offset from focus; it is a 2D writing preview, not a dose, threshold, curing, or true 3D-volume calculation.</div>`;
          sectionFields += `<button type="button" id="inspClearVoxels">Clear voxel preview</button>`;
        }

        const candidates = twoPhotonHandoffCandidates(
          state.elements,
          signalHitsFromLastTrace(sel.id),
          sel.id,
        );
        sectionFields += `<div class="two-photon-handoff"><div class="lsechead">Continue the 2PP workflow</div>`;
        if (!candidates.length) {
          sectionFields += `<div class="hint">Aim a compatible ordinary pulsed Laser at this resin sample (500–1064 nm, up to 1 W source power, 10–100 MHz, 50–400 fs) to open the dedicated lithography lab with its settings.</div>`;
        } else {
          const multiple = candidates.length > 1;
          sectionFields += candidates.map(({ laser, numericalAperture }, index) => {
            const configuredName = String(laser.label || '').trim();
            const name = configuredName || (multiple ? `Laser ${index + 1}` : 'this laser');
            const url = buildTwoPhotonHandoffUrl(laser, undefined, { numericalAperture });
            return `<a class="two-photon-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open Two-Photon Lab with ${esc(name)} <span aria-hidden="true">↗</span></a>`;
          }).join('');
          sectionFields += `<div class="hint">Transfers wavelength, configured source power, repetition rate, pulse duration, and the traced objective NA when one compatible objective is unambiguous. Confirm specimen-plane power and pulse broadening in the destination lab; bandwidth, polarization, scan, and material settings keep that lab's defaults.</div>`;
        }
        sectionFields += `</div>`;
      };
      const flushSection = () => {
        if (!sectionFields) return;
        h += inspectorSection(sectionKey, sectionTitle, sectionFields, {
          meta: `${sectionCount} ${sectionCount === 1 ? 'setting' : 'settings'}`,
        });
      };
      for (const p of def.params || []) {
        if (p.hidden) continue;
        // Physical-size fields that read as presentation rather than physics
        // are rendered down in Label & appearance instead (see below).
        if (p.appearance) continue;
        if (p.show && !p.show(sel.params)) continue;
        if (p.type === 'section') {
          flushSection();
          sectionKey = p.key; sectionTitle = p.label; sectionFields = ''; sectionCount = 0;
          continue;
        }
        sectionCount++;
        if (p.type === 'heading') { sectionFields += `<div class="lsechead">${esc(p.label)}</div>`; continue; }
        sectionFields += paramField(p, sel);
      }
      if (sel.type === 'objective') sectionFields += objectiveCouplingHint(sel);
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
        let appearanceFields = '';
        for (const p of def.params || []) {
          if (!p.appearance || p.hidden) continue;
          if (p.show && !p.show(sel.params)) continue;
          appearanceFields += paramField(p, sel);
        }
        appearanceFields += field('Label', `<input type="text" data-k="label" value="${esc(sel.label || '')}">`);
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
      if (WIKI_TYPES.has(sel.type)) {
        h += `<a class="wiki-link" href="../wiki/${sel.type}/">Explore this element on the Wiki →</a>`;
      }
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
      <div class="inspector-title-row"><h3>${isFiber ? (b.bare ? 'Bare fiber' : 'Optical fiber') : 'Manual beam'}</h3><span class="cap-badge ${tier}">${status}</span></div>
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
  // specimen signal-channel add/remove
  const addSignal = panel.querySelector('#signalAdd');
  if (addSignal) addSignal.addEventListener('click', () => {
    const s = findSelected();
    if (!s) return;
    pushUndo();
    materializeChannels(s);
    // Default to the first signal this specimen type actually offers.
    const kinds = signalKindsFor(specimenTypeOf(s.params));
    s.params.channels.push(seededChannel(kinds[0]?.[0] || 'fluor', s));
    changed();
    renderInspector();
  });
  panel.querySelectorAll('[data-cdel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = findSelected();
      if (!s) return;
      pushUndo();
      materializeChannels(s);
      s.params.channels.splice(+btn.dataset.cdel, 1);
      changed();
      renderInspector();
    });
  });
}

// A pre-channels sketch shows its legacy single `mode` as one derived row.
// The first edit writes that row into params.channels for real and retires
// the legacy field, so the two can never disagree afterwards.
// Surface an unphysical or under-specified channel as a toast the moment it
// is configured, on top of the inline warning the row already carries — a
// setting that silently emits nothing is worse than one that says why.
function warnAboutChannel(channel, sel) {
  const message = channelWarning(channel, incidentBeamsAt(sel));
  if (message) document.dispatchEvent(new CustomEvent('optics:toast', { detail: { message } }));
}

function materializeChannels(sel) {
  if (!Array.isArray(sel.params.channels) || !sel.params.channels.length) {
    sel.params.channels = sampleChannels(sel.params).map(c => ({ ...c }));
  }
  if (sel.params.mode !== undefined) sel.params.mode = 'none';
}

// Switching specimen type swaps in that type's own defaults. Channels are
// cleared because the two signal menus share no entries — a linear
// specimen's fluorescence is not a nonlinear specimen's 2PEF — and keeping
// stale rows would leave the list showing signals the type cannot produce.
function applySpecimenTypePreset(sel) {
  const p = sel.params;
  const type = specimenTypeOf(p);
  p.channels = [];
  if (type === 'absorbing') {
    Object.assign(p, { transmitExc: true, transmission: 0.8, voxelPreview: false });
  } else if (type === 'resin') {
    Object.assign(p, { transmitExc: true, transmission: 0.85, voxelPreview: true });
  } else if (type === 'linear') {
    Object.assign(p, { transmitExc: true, transmission: 0.8, voxelPreview: false });
    p.channels = [seededChannel('fluor', sel)];
  } else if (type === 'nonlinear') {
    Object.assign(p, { transmitExc: true, transmission: 0.8, voxelPreview: false });
    p.channels = [seededChannel('shg', sel)];
  }
  // The legacy per-material field is what pre-type sketches were read from;
  // once a type is chosen explicitly it must stop competing with it.
  if (p.sampleKind !== undefined) p.sampleKind = 'generic';
  p.mode = 'none';
}

// A new channel starts at whatever the bench currently implies, so adding
// fluorescence to a 900 nm bench offers 920 nm rather than a fixed 520 nm.
function seededChannel(kind, sel) {
  const c = newSampleChannel(kind);
  const seeded = defaultEmissionWl(kind, drivingExcitationWl(incidentWlsAt(sel)));
  if (seeded) c.wl = seeded;
  return c;
}

export function applyInput(inp, rebuild = false) {
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

  // A `derived` field has no storage of its own — commit through its
  // declared setter instead of the
  // generic sel.params[pkey] assignment below, so it stays impossible for
  // it to hold a value that disagrees with the param it derives from.
  if (inp.dataset.derived) {
    const spec = (registry[sel.type]?.params || []).find(p => p.key === pkey);
    if (spec?.set) spec.set(sel.params, val);
    changed();
    refreshReadouts(sel);
    if (rebuild) renderInspector();
    return;
  }

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

  // specimen signal-channel fields
  if (inp.dataset.ci !== undefined) {
    materializeChannels(sel);
    const c = sel.params.channels[+inp.dataset.ci];
    if (!c) return;
    const ckey = inp.dataset.ck;
    if (ckey === 'autoWl') {
      // A two-option enum standing in for a boolean. Pinning the wavelength
      // seeds the box with whatever the bench currently implies, so the user
      // edits a sensible number instead of a stale one.
      c.autoWl = val === 'auto';
      if (!c.autoWl) {
        const seeded = defaultEmissionWl(c.kind, drivingExcitationWl(incidentWlsAt(sel)));
        if (seeded) c.wl = seeded;
      }
    } else if (ckey === 'transferEff') {
      c.transferEff = Math.min(0.5, Math.max(0.01, val / 100)); // shown as a percentage
    } else {
      c[ckey] = val;
    }
    changed();
    warnAboutChannel(c, sel);
    // Switching kind changes which fields apply at all, so rebuild the rows.
    // 'wl' redraws so the inline warning tracks the value just committed.
    if (rebuild && ['kind', 'autoWl', 'epi', 'autoColor', 'material', 'wl', 'requireOverlap', 'fluorophore'].includes(ckey)) renderInspector();
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
    if (pkey === 'specimenType') applySpecimenTypePreset(sel);
    if (sel.type === 'objective') Object.assign(sel.params, normalizeObjectiveParams(sel.params));
  }
  changed();
  if (pkey) refreshReadouts(sel);
  // While a pulsed laser is transform-limited its bandwidth is derived from
  // the pulse duration, so the field is hidden and nothing needs syncing.
  // Switching TL off reveals it — seed it from the width the pulse actually
  // had a moment ago, so the spectrum stays continuous across the toggle
  // instead of jumping to an unrelated stored default.
  if (rebuild && sel.type === 'pulsedlaser' && pkey === 'transformLimited' && val === false) {
    sel.params.bandwidth = roundSig(transformLimitedBandwidthNm(
      sel.params.pulseWidthFs, sel.params.wavelength, sel.params.pulseShape || 'gauss'));
    changed();
    renderInspector();
    return;
  }
  if (rebuild && (key === 'propagate' || key === 'outMode' || key === 'showLabel')) { renderInspector(); return; }
  // The objective's coupling status is derived from its placed pose. Keep the
  // hint in step with committed coordinate/rotation edits just as the canvas
  // layer already is; otherwise the panel can describe the previous target.
  if (rebuild && sel.type === 'objective' && ['x', 'y', 'rot'].includes(key)) { renderInspector(); return; }
  // conditional params (show/hide) need a panel rebuild — only on 'change' to not steal focus
  if (rebuild && ['dtype', 'ftype', 'beamMode', 'autoColor', 'convert', 'bwMode', 'temporalMode', 'raysMode', 'zeroOrder', 'modulate', 'mode', 'scanMode', 'transmitExc', 'specimenType', 'voxelPreview', 'pzMode', 'showSignalSpot', 'sensorId', 'refl', 'transformLimited', 'rangeMode', 'driveMode', 'switchMode', 'extension', 'immersion'].includes(pkey)) { renderInspector(); return; }
  // A readout is derived from the other params, so any committed edit can
  // change it. Rebuilding on commit (never mid-keystroke) is what keeps a
  // peak power or a transform-limited bandwidth from going stale on screen.
  if (rebuild && pkey && (registry[sel.type]?.params || []).some(p => p.type === 'readout' || p.type === 'derived')) renderInspector();
}
