// Detector catalogue redesign and detector-aware screen panels.

import {
  OBJ_SHAPES, createElement, displayDensity, displayRenderScale, getElementMeta, registry, resolveDisplaySensor,
  resolvedDisplayView,
} from './elements.js';
import { detectorReading } from './raytrace.js';
import { enhancedReading, objectImageAtCamera, pmtVerdict } from './detector-measurements.js';
import { fwhmToSigma } from './spectrum.js';
import { scopeTrace } from './pulses.js';
import {
  autocorrelationReading, crossCorrelationReading, correlationShapeValue, crossCorrelationPair,
  crossScopeHalfSpanFs, CROSS_SCOPE_SPANS_PS, DEFAULT_SCOPE_SPAN_PS,
} from './glass.js';
import { esc, formatSignal, smoothPath, wavelengthToColor } from './util.js';

export const DETECTOR_TYPES = [
  'detector', 'camera', 'pmt', 'powermeter', 'wavefrontdetector',
  'polarimeter', 'spectrometer', 'autocorrelator', 'generaldetector',
];

const DESCRIPTIONS = {
  camera: 'Measures a pixel-integrated one-dimensional intensity profile and resolves supported interference from sized monochromatic CW lasers.',
  detector: 'Measures the relative intensity incident on its active surface.',
  pmt: 'Amplifies a faint signal \u2014 fluorescence, microscopy, single-point detection \u2014 into a readable one, and reports whether it clears the tube\u2019s own dark floor.',
  powermeter: 'Reports absolute optical power by carrying each source\u2019s configured watts through everything that attenuated it on the way here.',
  wavefrontdetector: 'Fits ray angle against position across its face to report whether the beam is collimated, converging or diverging, and its full cone angle.',
  polarimeter: 'Reports polarization state, normalized Stokes parameters, and a visual linear, circular, elliptical, or unpolarized representation.',
  spectrometer: 'Reports centre wavelength, detected spectral range, bandwidth, and a qualitative spectrum.',
  generaldetector: 'Reports intensity, power, beam size, wavefront, polarization and Stokes parameters, wavelength and bandwidth, plus pulse repetition rate and duration.',
  autocorrelator: 'Measures the intensity autocorrelation of a pulse and infers its duration by dividing out a deconvolution factor — which means it only reads correctly if the assumed pulse shape matches the real one.',
  display: 'Connects to one detector and shows only the properties that detector measures. The cable carries data and never affects rays.',
};

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// Shared with the inspector so a value never reads as "0.00" on one surface
// and "3.1e-4" on the other.
const compactNumber = formatSignal;

function flipped(el) {
  const rotation = ((el.rot || 0) % 360 + 360) % 360;
  return rotation > 90 && rotation < 270;
}

function detectorSurfaces(width, height, detectorType, data = {}) {
  const x = width / 2, y = height / 2;
  return [
    { x1: -x, y1: -y, x2: -x, y2: y, kind: 'detector', data: { aperture: height, detectorType, ...data } },
    { x1: -x, y1: -y, x2: x, y2: -y, kind: 'absorb' },
    { x1: x, y1: -y, x2: x, y2: y, kind: 'absorb' },
    { x1: x, y1: y, x2: -x, y2: y, kind: 'absorb' },
  ];
}

function lamp(el, x, y) {
  const reading = detectorReading(el.id), active = reading?.signal > 0.000001;
  return `<circle cx="${x}" cy="${y}" r="3" fill="${active ? reading.color : '#7f8a95'}" opacity="${active ? 1 : 0.45}" stroke="#fff" stroke-width="0.8"/>`;
}

function instrumentDefinition({ label, code, readoutKind, paletteOrder, width, accent, aliases }) {
  const height = element => Math.max(10, element.params.aperture || 30);
  return {
    label, category: 'Detectors', paletteOrder, readoutKind, aliases,
    description: DESCRIPTIONS[readoutKind === 'power' ? 'powermeter' : readoutKind === 'wavefront' ? 'wavefrontdetector' : readoutKind],
    sensorFaceX: -width / 2,
    size: { w: width + 2, h: 34 },
    snapPt: { x: -width / 2, y: 0 }, dataPort: { x: width / 2, y: 0 },
    size_: element => ({ w: width + 2, h: height(element) + 4 }),
    params: [{ key: 'aperture', label: 'Active height (mm)', type: 'number', min: 6, max: 150, step: 2, def: 30 }],
    direct: { resize: { y: 'aperture' } },
    svg(element) {
      const h = height(element), textTransform = flipped(element) ? 'transform="rotate(180)"' : '';
      const fontSize = Math.max(6, Math.min(9.5, (width - 10) / Math.max(2, code.length * 0.62)));
      return `<rect x="${-width / 2}" y="${-h / 2}" width="${width}" height="${h}" rx="4" fill="#44505d" stroke="#202a33" stroke-width="1.5"/>` +
        `<rect x="${-width / 2 - 1.7}" y="${-h / 2 + 4}" width="3.4" height="${Math.max(5, h - 8)}" rx="1" fill="${accent}" stroke="#26323c" stroke-width="0.8"/>` +
        `<text x="1" y="1" ${textTransform} text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="720" letter-spacing="0.4" fill="#fff">${esc(code)}</text>` +
        lamp(element, width / 2 - 8, -h / 2 + 7);
    },
    surfaces: element => detectorSurfaces(width, height(element), label),
  };
}

Object.assign(registry.camera, {
  paletteOrder: 2, sensorFaceX: -22, description: DESCRIPTIONS.camera,
  aliases: ['beam camera', 'beam profiler', 'image sensor', 'intensity profile', 'beam diameter', 'object image'],
});
Object.assign(registry.detector, {
  paletteOrder: 1, sensorFaceX: -19, description: DESCRIPTIONS.detector,
  aliases: ['photodiode', 'intensity detector', 'light intensity'],
});
Object.assign(registry.pmt, {
  label: 'Photomultiplier (PMT)', paletteOrder: 3, sensorFaceX: -26, description: DESCRIPTIONS.pmt,
  aliases: ['photomultiplier', 'low light detector', 'fluorescence detector', 'microscopy detector', 'point source detector'],
});
registry.powermeter = instrumentDefinition({
  label: 'Power meter', code: 'PWR', readoutKind: 'power', paletteOrder: 4, width: 48, accent: '#86efac',
  aliases: ['optical power', 'watt meter', 'laser power'],
});
registry.wavefrontdetector = instrumentDefinition({
  label: 'Wavefront detector', code: 'WF', readoutKind: 'wavefront', paletteOrder: 5, width: 52, accent: '#c4b5fd',
  aliases: ['wavefront sensor', 'collimation detector', 'divergence detector', 'shack hartmann'],
});
registry.polarimeter = instrumentDefinition({
  label: 'Polarimeter', code: 'POL', readoutKind: 'polarimeter', paletteOrder: 6, width: 48, accent: '#f9a8d4',
  aliases: ['stokes', 'polarization detector', 'polarisation detector'],
});
registry.spectrometer = instrumentDefinition({
  label: 'Spectrometer', code: 'SPEC', readoutKind: 'spectrometer', paletteOrder: 7, width: 54, accent: '#fde68a',
  aliases: ['spectrum', 'wavelength detector', 'bandwidth detector'],
});
// By default the displayed range tracks the live signal (padded 5 nm past
// its detected [bandMin, bandMax] on each side, like the beam probe's own
// spectrum card). Manual mode instead pins an explicit window, e.g. to
// compare readings across changing sources without the axis jumping.
registry.spectrometer.params.push(
  { key: 'rangeMode', label: 'Displayed wavelength range', type: 'select', def: 'auto', options: [['auto', 'Automatic'], ['manual', 'Manual']] },
  { key: 'rangeMin', label: 'Range min (nm)', type: 'number', min: 100, max: 12000, step: 5, def: 480, show: p => p.rangeMode === 'manual' },
  { key: 'rangeMax', label: 'Range max (nm)', type: 'number', min: 100, max: 12000, step: 5, def: 580, show: p => p.rangeMode === 'manual' },
  // A laser line concentrates its whole power into a single colour, so on a
  // spectral-density axis it dwarfs anything broadband beside it — which is
  // physically true and practically useless when the point is to see a weak
  // Raman line next to its own pump. Relative mode scales each source's
  // contribution to its own peak so every source stays readable.
  { key: 'intensityScale', label: 'Intensity axis', type: 'select', def: 'density', options: [
    ['density', 'Spectral density (per nm)'],
    ['relative', 'Relative — each source to 1'],
  ] },
  { key: 'labelPeaks', label: 'Label peaks on the axis', type: 'checkbox', def: true },
);
registry.autocorrelator = instrumentDefinition({
  label: 'Autocorrelator', code: 'AC', readoutKind: 'autocorrelator', paletteOrder: 8, width: 56, accent: '#fca5a5',
  aliases: ['pulse duration', 'pulse width', 'intensity autocorrelation', 'fwhm', 'chirp', 'pulse measurement'],
});
// A real autocorrelator cannot report a duration on its own: it measures the
// autocorrelation trace and you divide out a factor that depends on the pulse
// shape you assume. Making that assumption an explicit control is the point —
// choose the wrong shape and the number is wrong by the ratio of the factors,
// which is exactly the mistake the instrument invites in a real lab.
registry.autocorrelator.params.push({
  key: 'assumedShape', label: 'Assumed pulse shape', type: 'select', def: 'gauss',
  options: [['gauss', 'Gaussian (÷1.414)'], ['sech2', 'Sech² (÷1.543)']],
  show: p => (p.measurementMode || 'auto') === 'auto',
});
// The same box, correlating two different arms instead of one against itself.
// The trace is then no longer centred on zero: it peaks at whatever timing
// mismatch the arms actually have, which is what makes it the instrument you
// use to find time zero rather than to read a duration.
registry.autocorrelator.params.push({
  key: 'measurementMode', label: 'Measurement mode', type: 'select', def: 'auto',
  options: [['auto', 'Autocorrelation (one source)'], ['cross', 'Cross-correlation (two sources)']],
});
// The scope timebase, and a knob rather than an automatic -- in both modes. A
// window that resized itself would rescale the axis under the pulses as they
// approach, hiding the motion the display exists to show; on a real scope you
// pick a timebase and watch the traces walk across it. Switching mode picks a
// sensible setting once (see applyScopeSpanForMode in inspector.js), and from
// then on it is yours.
registry.autocorrelator.params.push({
  key: 'timeSpanPs', label: 'Time span', type: 'select', def: DEFAULT_SCOPE_SPAN_PS,
  options: CROSS_SCOPE_SPANS_PS.map(ps => [ps, `±${ps} ps`]),
});
registry.generaldetector = instrumentDefinition({
  label: 'General detector', code: 'DET', readoutKind: 'general', paletteOrder: 9, width: 54, accent: '#67e8f9',
  aliases: ['universal detector', 'all properties', 'pulse detector', 'repetition rate', 'pulse duration'],
});
registry.display.label = 'Detector screen';
registry.display.paletteOrder = 20;
registry.display.description = DESCRIPTIONS.display;
registry.display.aliases = [...new Set([...(registry.display.aliases || []), 'detector screen', 'instrument display'])];
// The eye reads light and reports a signal, so it belongs with the
// instruments. It sits after the detector screen rather than among the nine
// bench detectors: it is an observer rather than a lab instrument, and
// keeping it last leaves the general detector immediately before the screen.
if (registry.eye) registry.eye.paletteOrder = 21;

function header(name, mode, pulse) {
  const title = String(name).toUpperCase(), size = Math.max(3.7, Math.min(6, 46 / Math.max(1, title.length * 0.62)));
  const titleLine = `<text x="-36" y="-23.5" font-size="${size.toFixed(2)}" font-weight="760" letter-spacing="0.35" fill="#9eb5c3">${esc(title)}</text>`;
  // A falsy mode omits the second line entirely — used where it would only
  // restate what the readout below it already shows (e.g. the spectrometer,
  // whose one and only view is a labeled wavelength/bandwidth plot).
  if (!mode) return titleLine;
  // The mode line must shrink to fit too. Appending " · PULSE" pushed the
  // longest modes (e.g. "WAVELENGTH + BANDWIDTH") past the screen's right
  // edge at a fixed 4.5, so size it against the 72-unit usable width the
  // same way the title is sized.
  const modeText = `${mode}${pulse ? ' · PULSE' : ''}`;
  const modeSize = Math.max(3.1, Math.min(4.5, 72 / Math.max(1, modeText.length * 0.62)));
  return titleLine +
    `<text x="-36" y="-16.5" font-size="${modeSize.toFixed(2)}" font-weight="700" letter-spacing="0.35" fill="${pulse ? '#67e8f9' : '#648092'}">${esc(modeText)}</text>`;
}

function metrics(entries, columns = 2) {
  const labelSize = columns >= 3 ? 3.05 : 3.8, valueSize = columns >= 3 ? 4 : 5.1;
  const cellWidth = 78 / columns;
  // Each cell must stay inside its own column, or a long value (a pulsed
  // "80.0 MHz · 100 fs", say) runs off the right edge of the screen.
  const fit = (text, preferred) =>
    Math.max(2.7, Math.min(preferred, (cellWidth - 3) / Math.max(1, String(text).length * 0.62)));
  return entries.map(([label, value], index) => {
    const column = index % columns, row = Math.floor(index / columns), x = -35 + column * cellWidth, y = -8 + row * 13;
    return `<text x="${x}" y="${y}" font-size="${fit(label, labelSize).toFixed(2)}" font-weight="700" fill="#5f7d8e">${esc(label)}</text>` +
      `<text x="${x}" y="${y + 6}" font-size="${fit(value, valueSize).toFixed(2)}" font-weight="680" fill="#d9e8ee">${esc(value)}</text>`;
  }).join('');
}

function spectrumLabel(reading) {
  return reading.bandwidth > 0.05 ? `${Math.round(reading.bandMin)}–${Math.round(reading.bandMax)} nm` : `${Math.round(reading.wavelength)} nm`;
}

// Displayed domain: by default ±2σ of the detected FWHM bandwidth plus 5 nm
// padding on each side — wide enough to show the actual Gaussian shape (not
// just its half-max width) while staying clipped well short of the ±3σ tails
// the underlying spec is sampled over, exactly like the beam probe's own
// spectrum card — a spectrometer additionally lets the user pin an explicit
// manual range instead of tracking the live signal.
// Everything down to a thousandth of the tallest feature is worth plotting:
// deep enough into a Gaussian's tail to show its shape, shallow enough that
// numerical dust cannot stretch the axis across the whole spectrum.
const DISPLAY_FLOOR = 1e-3;

// A single laser line has no width to fill an axis with, so a window is held
// open around it -- otherwise the plot would be a single stem with no scale
// to read it against.
const MIN_SPAN_NM = 10;

function spectrumRange(reading, sensor) {
  const manual = sensor?.params?.rangeMode === 'manual';
  const rangeMin = sensor?.params?.rangeMin, rangeMax = sensor?.params?.rangeMax;
  if (manual && Number.isFinite(rangeMin) && Number.isFinite(rangeMax) && rangeMax > rangeMin) {
    return [rangeMin, rangeMax];
  }
  // Sized from the measurement itself rather than from a centroid and a
  // width. A centroid is meaningless once light arrives in several separate
  // bands -- it lands in a gap -- and treating the whole detected span as
  // though it were a single lineshape's FWHM widened the axis to nearly twice
  // the light it contained, which left every real feature small and the plot
  // mostly empty. The window is now exactly what clears the display floor,
  // so a wide envelope sampled by narrow lines keeps all of its lines and a
  // lone band fills the frame.
  const samples = reading.spectrum?.length
    ? reading.spectrum
    : [{ wavelength: reading.wavelength, power: reading.signal, continuum: false }];
  const heights = spectralHeights(samples, sensor);

  // Each measured feature -- one connected band, or one discrete line -- is
  // followed down to a thousandth of ITS OWN peak, not of the tallest thing
  // on the plot. A discrete line concentrates its whole power into the
  // nominal 0.1 nm it is drawn over, so on a density axis it stands orders
  // of magnitude above any continuum beside it; measuring every feature
  // against that one peak would drop a perfectly real broadband source off
  // the axis for the crime of sharing a detector with a laser.
  const features = new Map();
  samples.forEach((sample, index) => {
    if (!Number.isFinite(sample.wavelength)) return;
    const key = sample.continuum ? `band:${sample.bandId || sample.sourceId || ''}` : `line:${index}`;
    const feature = features.get(key) || { peak: 0, power: 0, members: [] };
    feature.members.push({ sample, height: heights[index] });
    feature.peak = Math.max(feature.peak, heights[index]);
    feature.power += Math.max(0, Number(sample.power) || 0);
    features.set(key, feature);
  });
  const totalPower = [...features.values()].reduce((sum, feature) => sum + feature.power, 0);

  let lo = Infinity, hi = -Infinity;
  for (const feature of features.values()) {
    // A feature carrying essentially none of the detected light is numerical
    // dust; letting it into the window would stretch the axis over nothing.
    if (totalPower > 0 && !(feature.power >= totalPower * DISPLAY_FLOOR)) continue;
    for (const { sample, height } of feature.members) {
      if (feature.peak > 0 && !(height >= feature.peak * DISPLAY_FLOOR)) continue;
      const half = Math.max(0, Number(sample.widthNm) || 0) / 2;
      lo = Math.min(lo, sample.wavelength - half);
      hi = Math.max(hi, sample.wavelength + half);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    const centre = Number.isFinite(reading.wavelength) ? reading.wavelength : 550;
    return [centre - MIN_SPAN_NM / 2, centre + MIN_SPAN_NM / 2];
  }
  // A little air at both ends so a peak sitting at the edge of the detected
  // range is not drawn flat against the frame.
  const pad = Math.max(0.4, (hi - lo) * 0.05);
  lo -= pad;
  hi += pad;
  if (hi - lo < MIN_SPAN_NM) {
    const centre = (lo + hi) / 2;
    return [centre - MIN_SPAN_NM / 2, centre + MIN_SPAN_NM / 2];
  }
  return [lo, hi];
}

// Path-to-time conversion, matching raytrace.js's own constant.
const C_MM_PER_NS = 299.792458;

const formatTimeNs = ns => (ns <= 0 ? '0 ns'
  : ns >= 1e6 ? `${(ns / 1e6).toFixed(ns < 1e7 ? 1 : 0)} ms`
  : ns >= 1000 ? `${(ns / 1000).toFixed(ns < 1e4 ? 1 : 0)} µs`
    : ns >= 1 ? `${ns.toFixed(ns < 10 ? 1 : 0)} ns`
      : `${(ns * 1000).toFixed(0)} ps`);

const formatMHz = mhz => (mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz`
  : mhz >= 1 ? `${mhz.toFixed(mhz < 10 ? 2 : 1)} MHz`
    : `${(mhz * 1000).toFixed(mhz * 1000 < 10 ? 1 : 0)} kHz`);

// Oscilloscope trace: a photodetector wired to a screen shows the pulse train
// in time, each pulse scaled by whatever survived the temporal gates on its
// path. A polarization modulator read through an analyzer therefore appears
// here as the alternating pulse pattern it physically is, not as a steady
// averaged level. The window spans two periods of whichever is slower, the
// train or the modulation, so one full repeat of the structure is always
// visible.
function scopePlot(reading) {
  const trace = scopeTrace(reading.pulse);
  if (!trace) return null;
  const baseline = 6, height = 17;
  const xAt = ns => -35 + 70 * (trace.spanNs > 0 ? ns / trace.spanNs : 0);
  // Scaled to the trace's own peak, never below 1, so a stimulated-Raman
  // GAIN (which lifts the receiving beam above its unmodulated level) reads
  // as taller pulses instead of being clipped flat against the ceiling.
  const peak = Math.max(1, ...trace.pulses.map(p => p.amplitude || 0), ...trace.envelope.map(e => e.value || 0));
  const yAt = value => baseline - Math.max(0, Math.min(1, value / peak)) * height;

  const axis = `<line x1="-35" y1="${baseline}" x2="35" y2="${baseline}" stroke="#294453" stroke-width="0.8"/>`;
  const tick = (ns, anchor) => {
    const x = xAt(ns).toFixed(2);
    return `<line x1="${x}" y1="${baseline}" x2="${x}" y2="${baseline + 1.4}" stroke="#3d5566" stroke-width="0.6"/>` +
      `<text x="${x}" y="${baseline + 5.8}" text-anchor="${anchor}" font-size="3.4" fill="#5f7d8e">${esc(formatTimeNs(ns))}</text>`;
  };

  // The gate envelope behind the pulses makes the modulation shape readable
  // even where the train is too dense to resolve individual spikes.
  const envelope = trace.envelope.length > 1
    ? `<polyline data-scope-envelope="${trace.envelope.length}" points="${trace.envelope
      .map(p => `${xAt(p.tNs).toFixed(2)},${yAt(p.value).toFixed(2)}`).join(' ')}" ` +
      `fill="none" stroke="#67e8f9" stroke-width="0.7" opacity="0.45"/>`
    : '';

  const spikes = trace.pulses.filter(p => p.amplitude > 1e-6).map(p => {
    const x = xAt(p.tNs).toFixed(2);
    return `<line x1="${x}" y1="${baseline}" x2="${x}" y2="${yAt(p.amplitude).toFixed(2)}" ` +
      `stroke="${reading.color || '#8fd3ff'}" stroke-width="1.3" stroke-linecap="round"/>`;
  }).join('');

  const caption = trace.modulationMHz
    ? `MOD ${formatMHz(trace.modulationMHz)} · REP ${formatMHz(trace.repRateMHz)}`
    : `REP ${formatMHz(trace.repRateMHz)}`;

  return `<g data-scope-pulses="${trace.pulses.length}">` + axis + envelope + spikes +
    tick(0, 'start') + tick(trace.spanNs / 2, 'middle') + tick(trace.spanNs, 'end') + `</g>` +
    `<text x="-35" y="17" font-size="4.6" fill="#fde68a">${esc(caption)}</text>` +
    `<text x="35" y="17" text-anchor="end" font-size="4.6" fill="#7892a1">Σw ${compactNumber(reading.signal)}</text>`;
}

// A laser line has no physical width of its own; LINE_WIDTH_NM is the
// nominal width it is spread over so a density axis can assign it a finite
// height and a drawn line has a finite thickness. Not a configurable
// instrument resolution — modeling a real spectrometer's resolving power is
// outside what this app is for.
const LINE_WIDTH_NM = 0.1;

// Height each sample contributes to the plot.
//
// "density" is the honest physical axis: power per nanometre. A broadband
// sample owns one bin of its profile, so its density is power/binWidth; a
// laser line owns no width at all, so it is spread over LINE_WIDTH_NM. That
// makes a line and a band comparable instead of depending on how finely the
// band happened to be sampled — but it also means a line towers over
// everything, which is exactly what a real spectrometer shows.
//
// "relative" instead scales every source's own contribution to its own peak,
// so a weak Raman line stays visible beside the pump that excited it.
function spectralHeights(samples, sensor) {
  const relative = sensor?.params?.intensityScale === 'relative';
  const density = samples.map(sample => {
    const width = sample.continuum && sample.widthNm > 0 ? sample.widthNm : LINE_WIDTH_NM;
    return Math.max(0, sample.power || 0) / width;
  });
  if (!relative) return density;
  const peakOf = new Map();
  samples.forEach((sample, i) => {
    const key = sample.sourceId || '';
    peakOf.set(key, Math.max(peakOf.get(key) || 0, density[i]));
  });
  return density.map((value, i) => value / Math.max(1e-12, peakOf.get(samples[i].sourceId || '') || 1));
}

function spectrumPlot(reading, sensor, baseline = 8) {
  const samples = reading.spectrum?.length
    ? reading.spectrum
    : [{ wavelength: reading.wavelength, power: reading.signal, color: reading.color, continuum: false }];
  const [lo, hi] = spectrumRange(reading, sensor);
  const span = Math.max(1e-6, hi - lo);
  const inRange = samples.filter(sample => sample.wavelength >= lo && sample.wavelength <= hi);
  const heights = spectralHeights(inRange, sensor);
  const visible = inRange.map((sample, i) => ({ ...sample, height: heights[i] }));
  const maximum = Math.max(...visible.map(sample => sample.height), 1e-12);
  const xAt = wl => -35 + 70 * (wl - lo) / span;
  const yFor = height => Math.max(0, 15 * height / maximum);
  const lines0 = visible.filter(sample => !sample.continuum);
  const band0 = visible.filter(sample => sample.continuum);
  const peaks = choosePeaks(visible, lines0, band0, sensor, xAt);
  const tick = (wl, anchor) => {
    const x = xAt(wl);
    // Both captions are four digits wide at this font size, so they collide
    // well before their anchors do -- and an end tick is anchored inward
    // while a peak caption is centred, which brings them closer still. Sized
    // to the text rather than to a nominal gap.
    const crowded = peaks.some(peak => Math.abs(xAt(peak.wavelength) - x) < 9);
    return `<line x1="${x.toFixed(2)}" y1="${baseline}" x2="${x.toFixed(2)}" y2="${baseline + 1.4}" stroke="#3d5566" stroke-width="0.6"/>` +
      (crowded ? '' : `<text x="${x.toFixed(2)}" y="${baseline + 5.8}" text-anchor="${anchor}" font-size="3.6" fill="#5f7d8e">${Math.round(wl)}</text>`);
  };
  const axis = `<line x1="-35" y1="${baseline}" x2="35" y2="${baseline}" stroke="#294453" stroke-width="0.8"/>`;
  const ticks = tick(lo, 'start') + tick((lo + hi) / 2, 'middle') + tick(hi, 'end');
  const unit = sensor?.params?.intensityScale === 'relative' ? 'rel.' : 'per nm';
  const yLabel = `<text x="-35" y="${(baseline - 16.5).toFixed(2)}" font-size="3.4" fill="#5f7d8e">I (${unit})</text>`;

  // Discrete lines and a continuum are different measurements and are drawn
  // differently: two laser lines, or a set of Raman lines, are separate peaks
  // with nothing in between, while a broadband source really does carry light
  // at every wavelength across its width. Smoothing through discrete lines
  // invented a rainbow between them. A reading can hold both — a
  // supercontinuum plus a Raman line — so each part is drawn its own way.
  const lines = visible.filter(sample => !sample.continuum);
  const band = visible.filter(sample => sample.continuum);
  const stemFor = sample => {
    const x = xAt(sample.wavelength).toFixed(2);
    const height = Math.max(1.2, yFor(sample.height));
    return `<line x1="${x}" y1="${baseline}" x2="${x}" y2="${(baseline - height).toFixed(2)}" ` +
      `stroke="${sample.color || wavelengthToColor(sample.wavelength)}" stroke-width="2" stroke-linecap="round"/>`;
  };

  if (!visible.length) return axis + ticks;
  const marks = peakLabels(peaks, xAt, baseline);
  if (band.length < 2) {
    // Nothing continuous to smooth through: every peak stands on its own.
    return axis + yLabel + `<g data-spectrum-points="${visible.length}" data-spectrum-lines="${visible.length}">`
      + visible.map(stemFor).join('') + `</g>` + ticks + marks;
  }

  // One curve per connected band. A source can arrive carrying several bands
  // that do not touch -- an AOTF selecting three lines out of one
  // supercontinuum is the standard case -- and a single curve drawn through
  // all of them paints a spectrum across the gaps the AOTF is specifically
  // there to block. Each band gets its own path and its own gradient.
  const bandGroups = [];
  for (const sample of band) {
    const key = sample.bandId || sample.sourceId || '';
    const open = bandGroups[bandGroups.length - 1];
    if (open && open.key === key) open.samples.push(sample);
    else bandGroups.push({ key, samples: [sample] });
  }
  const clipId = `specClip${esc(sensor?.id || 'x')}`;
  const drawn = bandGroups.map((group, index) => {
    const gradientId = `specGrad${esc(sensor?.id || 'x')}b${index}`;
    const points = group.samples.map(sample =>
      ({ x: xAt(sample.wavelength), y: baseline - yFor(sample.height) }));
    // A band reduced to a single sample has no curve to draw; a stem carries
    // it instead, so a very narrow band is never silently dropped.
    if (points.length < 2) {
      return { defs: '', body: `<g data-spectrum-band-segment="${group.samples.length}">${stemFor(group.samples[0])}</g>` };
    }
    // the fill traces the same curve but pinned to the baseline at both ends,
    // so it reads as a filled lineshape rather than a floating ribbon
    const fillPoints = [{ x: points[0].x, y: baseline }, ...points, { x: points[points.length - 1].x, y: baseline }];
    // The gradient spans this band's own extent, so its colours stay tied to
    // the wavelengths underneath them even when other bands or discrete lines
    // sit outside it.
    const bandLo = group.samples[0].wavelength;
    const bandHi = group.samples[group.samples.length - 1].wavelength;
    const bandSpan = Math.max(1e-6, bandHi - bandLo);
    const stops = group.samples.map(sample => {
      const offset = ((sample.wavelength - bandLo) / bandSpan * 100).toFixed(1);
      return `<stop offset="${offset}%" stop-color="${sample.color || wavelengthToColor(sample.wavelength)}"/>`;
    }).join('');
    return {
      defs: `<linearGradient id="${gradientId}" x1="${xAt(bandLo).toFixed(2)}" y1="0" x2="${xAt(bandHi).toFixed(2)}" y2="0" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`,
      body: `<g data-spectrum-band-segment="${group.samples.length}">`
        + `<path d="${smoothPath(fillPoints)} Z" fill="url(#${gradientId})" opacity="0.35" stroke="none"/>`
        + `<path d="${smoothPath(points)}" fill="none" stroke="url(#${gradientId})" stroke-width="1.4" stroke-linecap="round"/>`
        + `</g>`,
    };
  });
  return `<defs><clipPath id="${clipId}"><rect x="-35" y="${(baseline - 17).toFixed(2)}" width="70" height="17.5"/></clipPath>` +
    drawn.map(entry => entry.defs).join('') + `</defs>` +
    axis + yLabel +
    `<g clip-path="url(#${clipId})" data-spectrum-points="${band.length}">` +
    drawn.map(entry => entry.body).join('') +
    (lines.length ? `<g data-spectrum-lines="${lines.length}">${lines.map(stemFor).join('')}</g>` : '') +
    `</g>` + ticks + marks;
}

// Wavelength captions on the axis: every discrete line, plus the peak of each
// continuous band, so a reading can be read off without counting pixels
// against the endpoint ticks. Labels are dropped when they would collide, and
// the strongest peaks win.
function choosePeaks(visible, lines, band, sensor, xAt) {
  if (sensor?.params?.labelPeaks === false) return [];
  const peaks = [...lines];
  if (band.length >= 2) {
    // One caption per band, at its brightest point. A sampled profile rarely
    // has a sample exactly on its maximum, so the peak is interpolated from
    // the three samples around the brightest one — a parabola through them
    // is exact for a Gaussian near its top, and reports 532 nm for a 532 nm
    // line rather than whichever gridpoint happened to land closest.
    const bySource = new Map();
    for (const sample of band) {
      const key = sample.sourceId || '';
      const list = bySource.get(key) || [];
      list.push(sample);
      bySource.set(key, list);
    }
    for (const list of bySource.values()) {
      let top = 0;
      list.forEach((sample, i) => { if (sample.height > list[top].height) top = i; });
      const peak = list[top];
      const before = list[top - 1], after = list[top + 1];
      let wavelength = peak.wavelength;
      if (before && after) {
        const denominator = before.height - 2 * peak.height + after.height;
        if (Math.abs(denominator) > 1e-12) {
          const shift = 0.5 * (before.height - after.height) / denominator;
          // Only trust the correction inside the bracketing samples.
          if (Math.abs(shift) <= 1) {
            wavelength = peak.wavelength + shift * (after.wavelength - before.wavelength) / 2;
          }
        }
      }
      peaks.push({ ...peak, wavelength });
    }
  }
  // Strongest first, dropping any that would overprint one already placed,
  // then back into wavelength order for a readable axis.
  const chosen = [];
  for (const peak of [...peaks].sort((a, b) => b.height - a.height)) {
    if (chosen.length >= 6) break;
    const x = xAt(peak.wavelength);
    if (chosen.some(other => Math.abs(xAt(other.wavelength) - x) < 6)) continue;
    chosen.push(peak);
  }
  return chosen.sort((a, b) => a.wavelength - b.wavelength);
}

function peakLabels(peaks, xAt, baseline) {
  return `<g data-spectrum-labels="${peaks.length}">` + peaks.map(peak => {
    const x = xAt(peak.wavelength);
    const anchor = x < -28 ? 'start' : x > 28 ? 'end' : 'middle';
    return `<text x="${x.toFixed(2)}" y="${(baseline + 5.8).toFixed(2)}" text-anchor="${anchor}" ` +
      `font-size="3.6" font-weight="700" fill="${peak.color || wavelengthToColor(peak.wavelength)}">${Math.round(peak.wavelength)}</text>`;
  }).join('') + `</g>`;
}

function profile(reading) {
  const values = reading.profile || [], maximum = Math.max(...values, 1e-9), width = values.length ? 70 / values.length : 0;
  return values.map((value, index) => {
    if (!(value > 0)) return '';
    const height = Math.max(0.6, 20 * value / maximum);
    return `<rect data-profile-bin="${index}" x="${(-35 + index * width).toFixed(2)}" y="${(11 - height).toFixed(2)}" width="${Math.max(0.3, width - 0.4).toFixed(2)}" height="${height.toFixed(2)}" rx="0.3" fill="${reading.profileColors?.[index] || reading.color}"/>`;
  }).join('') + `<line x1="-35" y1="11.5" x2="35" y2="11.5" stroke="#294453" stroke-width="0.8"/>`;
}

function objectGlyph(image) {
  if (!image) return '';
  const shape = OBJ_SHAPES[image.shape] || OBJ_SHAPES.arrow, cx = -8, cy = 1;
  const height = clamp(Math.abs(image.localTipY - image.localBaseY) * 0.9, 7, 20), sign = image.magnification < 0 ? -1 : 1;
  const point = value => ({ x: cx + value[0] * height, y: cy + value[1] * height * sign });
  let svg = `<g data-camera-object-image="true"><title>Object image falls on camera</title>`;
  for (const line of shape.lines || []) svg += `<polyline points="${line.map(item => { const p = point(item); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(' ')}" fill="none" stroke="${image.color}" stroke-width="1.25"/>`;
  for (const polygon of shape.polys || []) svg += `<polygon points="${polygon.map(item => { const p = point(item); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(' ')}" fill="${image.color}"/>`;
  return svg + `</g><text x="-34" y="14" font-size="3.3" font-weight="760" fill="#e2f1f5">OBJECT IMAGE</text>`;
}

function cameraMap(reading, sensor, elements) {
  const values = reading.profile || [], columns = Math.min(24, values.length), rows = clamp(Math.round(sensor.params.rows || 12), 6, 16);
  if (!columns) return '';
  const grouped = Array.from({ length: columns }, (_, column) => {
    const start = Math.floor(column * values.length / columns), end = Math.max(start + 1, Math.floor((column + 1) * values.length / columns));
    const slice = values.slice(start, end), value = slice.reduce((sum, sample) => sum + sample, 0);
    return { value, index: start, color: reading.profileColors?.[start] || reading.color };
  });
  const maximum = Math.max(...grouped.map(item => item.value), 1e-9), x0 = -35, y0 = -11, width = 54, height = 24;
  let pixels = '';
  for (let column = 0; column < columns; column++) {
    const level = grouped[column].value / maximum, sigma = 1.4 + level * rows * 0.19;
    for (let row = 0; row < rows; row++) {
      const dy = row - (rows - 1) / 2, intensity = level * Math.exp(-(dy * dy) / (2 * sigma * sigma));
      if (intensity < 0.035) continue;
      pixels += `<rect data-camera-pixel="${column}:${row}" x="${(x0 + column * width / columns).toFixed(2)}" y="${(y0 + row * height / rows).toFixed(2)}" width="${Math.max(0.35, width / columns - 0.25).toFixed(2)}" height="${Math.max(0.35, height / rows - 0.25).toFixed(2)}" fill="${grouped[column].color}" opacity="${clamp(0.15 + 0.85 * intensity, 0, 1).toFixed(2)}"/>`;
    }
  }
  return `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" rx="1.5" fill="#031119" stroke="#294453"/>${pixels}${objectGlyph(objectImageAtCamera(sensor, elements))}` +
    `<text x="22" y="-6" font-size="4" fill="#6d8796">BEAM Ø</text><text x="40" y="1" text-anchor="end" font-size="6" fill="#d9e8ee">${reading.beamDiameter > 0 ? `${reading.beamDiameter.toFixed(1)} mm` : 'POINT'}</text>` +
    `<text x="40" y="7" text-anchor="end" font-size="4" fill="#6d8796">INTENSITY</text><text x="40" y="14" text-anchor="end" font-size="6" fill="#d9e8ee">Σw ${compactNumber(reading.signal)}</text>`;
}

function polarizationGlyph(reading) {
  const text = String(reading.polarization), match = /(?:Linear|Elliptical)\s+(-?[\d.]+)°/.exec(text), rotation = match ? -Number(match[1]) : 0;
  if (/^Linear/.test(text)) return `<g transform="translate(-24 1) rotate(${rotation})" stroke="#e2f1f5" stroke-width="1.5"><line x1="-9" y1="0" x2="9" y2="0"/><path d="M 9,0 L 5,-2.5 M 9,0 L 5,2.5 M -9,0 L -5,-2.5 M -9,0 L -5,2.5"/></g>`;
  if (/^Circular/.test(text)) return `<g transform="translate(-24 1)" fill="none" stroke="#e2f1f5" stroke-width="1.5"><circle r="8"/><path d="M 5.5,-5.8 L 9,-5.2 L 7.4,-1.8" fill="#e2f1f5"/></g>`;
  if (/^Elliptical/.test(text)) return `<g transform="translate(-24 1) rotate(${rotation})" fill="none" stroke="#e2f1f5" stroke-width="1.5"><ellipse rx="9" ry="4.5"/><path d="M 5.4,-3.5 L 8.8,-2.8 L 7.2,0.1" fill="#e2f1f5"/></g>`;
  return `<g transform="translate(-24 1)" stroke="#8fa7b5"><line x1="-8" y1="-5" x2="8" y2="5"/><line x1="-8" y1="5" x2="8" y2="-5"/><circle r="8" fill="none" stroke-dasharray="2 2"/></g>`;
}

function formatPower(watts, signal) {
  if (!Number.isFinite(watts)) return [compactNumber(signal), 'rel. power'];
  if (Math.abs(watts) >= 1) return [compactNumber(watts), 'W'];
  if (Math.abs(watts) >= 0.001) return [compactNumber(watts * 1000), 'mW'];
  if (Math.abs(watts) >= 1e-6) return [compactNumber(watts * 1e6), 'µW'];
  return [watts.toExponential(1), 'W'];
}

function pulseRate(pulse) { return !pulse ? 'CW' : pulse.mixed ? 'MIXED' : `${compactNumber(pulse.repRateMHz)} MHz`; }
function pulseDuration(pulse) { return !pulse ? '—' : pulse.mixed ? 'MIXED' : `${compactNumber(pulse.pulseWidthFs)} fs`; }

// The cross-correlation screen, built to behave like the scope you actually
// watch while hunting time zero. The axis here is LABORATORY ARRIVAL TIME, not
// the scan delay of the autocorrelation display above: two pulses sit at their
// own arrival times and slide together as an arm is tuned. Both peaks keep a
// constant height, because each beam's own second harmonic does not care about
// the relative delay -- what grows between them is the sum-frequency signal,
// which exists only where the two overlap. Bring them together, watch the
// middle peak light up, and that is time zero.
//
// The origin is the midpoint of the two arrivals, so the display stays
// symmetric and both peaks remain visible however far apart they are, up to
// the instrument's scan range.
function crossCorrelationScope(sensor, reading) {
  const { arms, reason } = crossCorrelationPair(reading);
  if (!arms) return { note: reason };
  const cc = crossCorrelationReading(arms[0], arms[1]);
  if (!cc) return { note: 'NO PULSE' };
  if (!cc.synchronized) return { note: 'UNSYNCHRONIZED — RATES DIFFER' };

  const halfSpanFs = crossScopeHalfSpanFs(sensor.params);
  const sep = cc.offsetFs;
  const t = v => (Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)} ps`
    : `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)} fs`);

  // The pulses sit either side of the origin, so both leave the window at the
  // same moment. A flat line would say nothing about how far off they are, so
  // say the number instead -- and say it in millimetres of path as well, since
  // that is the unit of the control you are about to turn.
  // The chosen window is an exact setting, so label it exactly -- "25 ps",
  // not the general formatter's rounding of 25000 fs.
  const spanLabel = `${halfSpanFs / 1000} ps`;
  if (Math.abs(sep) / 2 > halfSpanFs) {
    const mm = Math.abs(sep) * 1e-15 * C_MM_PER_NS * 1e9;
    return { note: `RELATIVE DELAY ${t(Math.abs(sep))} > SPAN ±${spanLabel}`
      + `|SHORTEN THE ${sep > 0 ? 'SECOND' : 'FIRST'} ARM BY ${mm < 10 ? mm.toFixed(2) : mm.toFixed(1)} MM` };
  }

  const baseline = 8, height = 19;
  const xAt = fs => -35 + 70 * (fs + halfSpanFs) / (2 * halfSpanFs);
  const yAt = v => baseline - Math.max(0, Math.min(1, v)) * height;

  // Sampling follows the window, not the features: at a wide timebase a 150 fs
  // pulse is a spike a fraction of a pixel across, so the curve is drawn on a
  // grid fine enough to keep it from vanishing between samples.
  const narrowest = Math.min(arms[0].pulseWidthFs, arms[1].pulseWidthFs, cc.traceFwhmFs);
  const steps = Math.max(72, Math.min(600, Math.ceil((2 * halfSpanFs) / Math.max(1e-9, narrowest / 8))));
  const curve = (centreFs, fwhmFs, shape, amplitude) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const tau = -halfSpanFs + (2 * halfSpanFs) * i / steps;
      pts.push(`${xAt(tau).toFixed(2)},${yAt(amplitude * correlationShapeValue(tau - centreFs, fwhmFs, shape)).toFixed(2)}`);
    }
    return pts;
  };

  // Each arm's own envelope, at its own arrival, at constant height. The two
  // are tinted apart rather than by wavelength: both arms of a real bench are
  // often in the infrared, where wavelengthToColor returns the same red twice.
  const armTint = ['#7dd3fc', '#fcd34d'];
  const armSvg = arms.map((armInfo, index) => {
    const centre = index === 0 ? -sep / 2 : sep / 2;
    const pts = curve(centre, armInfo.pulseWidthFs, armInfo.pulseShape, 0.7);
    const label = Number.isFinite(armInfo.centerWavelengthNm)
      ? `<text x="${xAt(centre).toFixed(2)}" y="${(baseline + 9.4)}" text-anchor="middle" font-size="3" fill="${armTint[index]}">${Math.round(armInfo.centerWavelengthNm)} NM</text>`
      : '';
    return `<polyline data-arrival-envelope="${index}" points="${pts.join(' ')}" fill="none" stroke="${armTint[index]}" stroke-width="0.9" opacity="0.9"/>` + label;
  }).join('');

  // The sum-frequency signal sits midway between the arrivals -- at the origin,
  // by construction -- and its height is the overlap. This is the peak that
  // lights up when the arms meet, and the one a real cross-correlator detects.
  const sfg = cc.overlap > 0.002
    ? `<polyline data-cross-correlation="${steps + 1}" points="${curve(0, cc.traceFwhmFs, cc.traceShape, cc.overlap).join(' ')}" fill="none" stroke="${reading.color || '#fca5a5'}" stroke-width="1.3"/>`
    : '';

  const atZero = Math.abs(sep) < cc.traceFwhmFs * 0.02;
  const zeroX = xAt(0).toFixed(2);

  return { svg: `<line x1="-35" y1="${baseline}" x2="35" y2="${baseline}" stroke="#294453" stroke-width="0.8"/>` +
    `<line x1="${zeroX}" y1="${baseline}" x2="${zeroX}" y2="${yAt(1).toFixed(2)}" stroke="#3d5566" stroke-width="0.5" stroke-dasharray="1 1"/>` +
    armSvg + sfg +
    `<text x="${zeroX}" y="${(baseline + 5.4)}" text-anchor="middle" font-size="3.4" fill="#5f7d8e">0</text>` +
    `<text x="-35" y="${(baseline + 5.4)}" font-size="3.4" fill="#5f7d8e">−${esc(spanLabel)}</text>` +
    `<text x="35" y="${(baseline + 5.4)}" text-anchor="end" font-size="3.4" fill="#5f7d8e">+${esc(spanLabel)}</text>` +
    `<text x="-35" y="-8.2" font-size="6.2" font-weight="780" fill="${atZero ? '#86efac' : '#ecf7fa'}">` +
    `${atZero ? 'TIME ZERO' : esc(`${sep > 0 ? '+' : '−'}${t(Math.abs(sep))}`)}</text>` +
    `<text x="-35" y="-3.4" font-size="3.2" fill="#7892a1">ARRIVAL TIME · OVERLAP ${(cc.overlap * 100).toFixed(0)}%` +
    `${cc.sumFrequencyNm ? ` · SFG ${cc.sumFrequencyNm.toFixed(0)} NM` : ''}</text>` };
}

// Intensity-autocorrelation trace: what an autocorrelator actually puts on a
// screen. The horizontal axis is delay, not laboratory time — the instrument
// scans one arm against the other — and the curve is the self-convolution of
// the pulse envelope, which is why it is wider than the pulse by a
// shape-dependent factor and always symmetric about zero delay.
function autocorrelationPlot(sensor, reading) {
  if (!reading.pulse || reading.pulse.mixed) return null;
  const assumed = sensor.params?.assumedShape || 'gauss';
  const actual = reading.pulse.pulseShape || 'gauss';
  const arriving = Number.isFinite(reading.pulse.stretchedPulseWidthFs)
    ? reading.pulse.stretchedPulseWidthFs : reading.pulse.pulseWidthFs;
  const ac = autocorrelationReading(arriving, assumed, actual);
  if (!ac) return null;
  const fsLabel = v => (v < 1000 ? `${Math.round(v)} FS` : `${(v / 1000).toFixed(2)} PS`);

  const baseline = 8, height = 19;
  // The same fixed timebase the cross-correlation scope uses. An
  // autocorrelation that re-ranged itself would draw every duration at the
  // same apparent width, so three traces of 150, 731 and 150 fs would look
  // identical and only their labels would differ -- which defeats the
  // comparison such a scene exists to make.
  const spanFs = crossScopeHalfSpanFs(sensor.params);
  // Centred on zero, so the trace fits while its half-maximum chord does.
  if (ac.traceFwhmFs / 2 > spanFs) {
    return { note: `AUTOCORRELATION ${fsLabel(ac.traceFwhmFs)} WIDER THAN SPAN ±${spanFs / 1000} ps`
      + '|WIDEN THE TIME SPAN' };
  }
  const xAt = fs => -35 + 70 * (fs + spanFs) / (2 * spanFs);
  const yAt = v => baseline - Math.max(0, Math.min(1, v)) * height;
  // Gaussian autocorrelation of a Gaussian is Gaussian; sech² is close enough
  // to sech² for a qualitative screen. Shared with the cross-correlation so the
  // curve and the half-maximum chord drawn across it cannot disagree -- they
  // did for sech² sources, where the argument was scaled twice over and the
  // curve fell to half maximum at a quarter of the trace width.
  const shape = tau => correlationShapeValue(tau, ac.traceFwhmFs, actual);

  const steps = Math.max(96, Math.min(600, Math.ceil((2 * spanFs) / Math.max(1e-9, ac.traceFwhmFs / 10))));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const tau = -spanFs + (2 * spanFs) * i / steps;
    points.push(`${xAt(tau).toFixed(2)},${yAt(shape(tau)).toFixed(2)}`);
  }

  const halfY = yAt(0.5).toFixed(2);
  const halfLeft = xAt(-ac.traceFwhmFs / 2).toFixed(2);
  const halfRight = xAt(ac.traceFwhmFs / 2).toFixed(2);
  const fs = v => (v < 100 ? `${v.toFixed(1)} fs` : `${Math.round(v).toLocaleString()} fs`);

  return `<line x1="-35" y1="${baseline}" x2="35" y2="${baseline}" stroke="#294453" stroke-width="0.8"/>` +
    `<line x1="${xAt(0).toFixed(2)}" y1="${baseline}" x2="${xAt(0).toFixed(2)}" y2="${yAt(1).toFixed(2)}" stroke="#3d5566" stroke-width="0.5" stroke-dasharray="1 1"/>` +
    `<polyline data-autocorrelation="${points.length}" points="${points.join(' ')}" fill="none" stroke="${reading.color || '#fca5a5'}" stroke-width="1.1"/>` +
    // the half-maximum chord is the measurement itself, so draw it
    `<line x1="${halfLeft}" y1="${halfY}" x2="${halfRight}" y2="${halfY}" stroke="#fca5a5" stroke-width="0.6" stroke-dasharray="1.6 1.2" opacity="0.85"/>` +
    `<text x="${xAt(0).toFixed(2)}" y="${(baseline + 5.4)}" text-anchor="middle" font-size="3.4" fill="#5f7d8e">0 DELAY</text>` +
    `<text x="-35" y="${(baseline + 5.4)}" font-size="3.4" fill="#5f7d8e">−${spanFs / 1000} ps</text>` +
    `<text x="35" y="${(baseline + 5.4)}" text-anchor="end" font-size="3.4" fill="#5f7d8e">+${spanFs / 1000} ps</text>` +
    // The curve peaks at centre, so the inferred duration sits in the empty
    // upper-left corner where the wings are flat, clear of the header line.
    `<text x="-35" y="-8.2" font-size="6.2" font-weight="780" fill="#ecf7fa">${esc(fs(ac.inferredPulseWidthFs))}</text>` +
    `<text x="-35" y="-3.4" font-size="3.2" fill="${ac.shapeMismatch ? '#fca5a5' : '#7892a1'}">` +
    `${ac.shapeMismatch ? `ASSUMES ${assumed === 'sech2' ? 'SECH²' : 'GAUSS'}, SOURCE ${actual === 'sech2' ? 'SECH²' : 'GAUSS'}` : `AC ${esc(fs(ac.traceFwhmFs))} ÷ ${ac.assumedFactor.toFixed(3)}`}</text>`;
}

function panel(sensor, reading, elements, view) {
  const name = sensor.label || registry[sensor.type].label;
  if (sensor.type === 'camera') {
    if (view === 'detail') return header(name, 'SPATIAL METRICS', reading.pulse) + metrics([
      ['INTENSITY', `Σw ${compactNumber(reading.signal)}`], ['BEAM Ø', reading.beamDiameter > 0 ? `${reading.beamDiameter.toFixed(2)} mm` : 'POINT'],
      ['CENTROID', Number.isFinite(reading.centroid) ? `${reading.centroid.toFixed(2)} mm` : '—'], ['MAP', `${reading.profile?.length || 0}×${sensor.params.rows || 12}`],
    ]);
    if (view === 'spectrum') return header(name, 'LINE PROFILE', reading.pulse) + profile(reading);
    return header(name, '2D INTENSITY', reading.pulse) + cameraMap(reading, sensor, elements);
  }
  if (sensor.type === 'detector') {
    // A pulsed arrival has real temporal structure, so the screen becomes an
    // oscilloscope rather than a single averaged number. CW light keeps the
    // plain intensity readout — there is nothing to plot against time.
    const scope = reading.pulse ? scopePlot(reading) : null;
    if (scope) return header(name, 'OSCILLOSCOPE', reading.pulse) + scope;
    return header(name, 'REL INTENSITY', reading.pulse) +
      `<circle cx="-31" cy="-1" r="2.3" fill="${reading.color}"/><text x="35" y="4" text-anchor="end" font-size="15" font-weight="780" fill="#ecf7fa">${compactNumber(reading.signal)}</text><text x="35" y="12" text-anchor="end" font-size="5" fill="#7892a1">Σw · REL INTENSITY</text>`;
  }
  if (sensor.type === 'autocorrelator' && (sensor.params?.measurementMode || 'auto') === 'cross') {
    const { svg, note } = crossCorrelationScope(sensor, reading);
    if (svg) return header(name, 'CROSS-CORRELATION', reading.pulse) + svg;
    const [state, hint] = String(note).split('|');
    return header(name, 'CROSS-CORRELATION', reading.pulse)
      + metrics(hint ? [['STATE', state], ['', hint]] : [['STATE', state]]);
  }
  if (sensor.type === 'autocorrelator') {
    const plot = autocorrelationPlot(sensor, reading);
    if (plot && plot.note) {
      const [state, hint] = String(plot.note).split('|');
      return header(name, 'AUTOCORRELATION', reading.pulse)
        + metrics(hint ? [['STATE', state], ['', hint]] : [['STATE', state]]);
    }
    if (plot) return header(name, 'AUTOCORRELATION', reading.pulse) + plot;
    return header(name, 'AUTOCORRELATION', reading.pulse) + metrics([
      ['STATE', reading.pulse?.mixed ? 'MIXED TRAINS' : 'NO PULSE'],
      ['DURATION', '—'],
    ]);
  }
  if (sensor.type === 'pmt') {
    const verdict = pmtVerdict(reading);
    return header(name, 'LOW-LIGHT INTENSITY', reading.pulse) + metrics([
      ['INPUT', `\u03a3w ${compactNumber(reading.signal)}`], ['GAIN', `\u00d7${compactNumber(reading.gain)}`],
      ['PMT OUTPUT', `${compactNumber(reading.outputSignal)} a.u.`],
      ['S / DARK', Number.isFinite(reading.snr) ? `${compactNumber(reading.snr)}\u00d7` : '\u2014'],
    ]) + `<text x="-36" y="17.5" font-size="4.6" font-weight="700" fill="${verdict?.key === 'linear' ? '#7fd7a6' : '#f0b46a'}">${esc((verdict?.label || '').toUpperCase())}</text>`;
  }
  if (sensor.type === 'powermeter') {
    const [value, unit] = formatPower(reading.detectedPowerW, reading.signal);
    // The value and its unit sit on one baseline; the old provenance caption
    // ("from configured source power") collided with the unit and is dropped.
    // A partial attribution does get its own line: the figure is then a floor,
    // because some of the light that arrived came from a source carrying no
    // power rating of its own, and silently under-reporting would be worse.
    const partial = reading.detectedPowerW != null && reading.powerCoversAllArrivals === false
      ? '<text x="-36" y="17.5" font-size="4.4" font-weight="700" fill="#f0b46a">+ UNRATED SOURCE</text>'
      : '';
    return header(name, 'OPTICAL POWER', reading.pulse)
      + `<text x="35" y="6" text-anchor="end" font-size="14" font-weight="780" fill="#ecf7fa">${value}</text>`
      + `<text x="35" y="14" text-anchor="end" font-size="5.2" fill="#86efac">${unit}</text>`
      + partial;
  }
  if (sensor.type === 'wavefrontdetector') {
    const wave = reading.wavefront, divergence = wave.state === 'COLLIMATED' ? '0.00°' : `${wave.divergenceDeg.toFixed(2)}°`;
    return header(name, 'WAVEFRONT + INTENSITY', reading.pulse) + `<text x="35" y="-4" text-anchor="end" font-size="8.2" font-weight="780" fill="#e9e3ff">${wave.state}</text><text x="35" y="4" text-anchor="end" font-size="5.2" fill="#a99bd4">DIVERGENCE ${divergence}</text><text x="35" y="13" text-anchor="end" font-size="5.2" fill="#d9e8ee">INTENSITY Σw ${compactNumber(reading.signal)}</text>`;
  }
  if (sensor.type === 'polarimeter') return header(name, 'POLARIZATION · STOKES', reading.pulse) + polarizationGlyph(reading) +
    `<text x="-11" y="-5" font-size="6" font-weight="760" fill="#f5e8f1">${esc(String(reading.polarization).toUpperCase())}</text><text x="-11" y="3" font-size="4.4" fill="#b99aaa">DoP ${(100 * reading.stokes.normalized.degree).toFixed(0)}%</text><text x="-11" y="11" font-size="4.2" fill="#d9e8ee">S0 ${compactNumber(reading.stokes.s0)}  S1 ${compactNumber(reading.stokes.s1)}</text><text x="35" y="11" text-anchor="end" font-size="4.2" fill="#d9e8ee">S2 ${compactNumber(reading.stokes.s2)}  S3 ${compactNumber(reading.stokes.s3)}</text>`;
  if (sensor.type === 'spectrometer') {
    // No mode line here — a spectrometer only ever shows this one labeled
    // plot, so "WAVELENGTH + BANDWIDTH" restated nothing the plot and its
    // caption below don't already say, and sat close enough to the ticks and
    // the bandwidth caption to visually collide with both. Dropping it frees
    // room to raise the plot itself, so its axis ticks stop crowding the
    // caption underneath.
    // No bandwidth caption: a single number cannot describe several lines,
    // and it read as the span between the outermost ones.
    return header(name, null, reading.pulse) + spectrumPlot(reading, sensor, 1);
  }
  if (sensor.type === 'generaldetector' && view === 'spectrum') {
    return header(name, 'GENERAL · SPECTRUM', reading.pulse) + spectrumPlot(reading, sensor);
  }
  if (sensor.type === 'generaldetector' && view === 'detail') return header(name, 'STOKES + PULSE TIMING', reading.pulse) + metrics([
    ['S0', compactNumber(reading.stokes.s0)], ['S1', compactNumber(reading.stokes.s1)], ['S2', compactNumber(reading.stokes.s2)],
    ['S3', compactNumber(reading.stokes.s3)], ['REP RATE', pulseRate(reading.pulse)], ['PULSE DURATION', pulseDuration(reading.pulse)],
  ], 3);
  if (sensor.type === 'generaldetector') {
    const [power, unit] = formatPower(reading.detectedPowerW, reading.signal);
    const wave = reading.wavefront.state === 'COLLIMATED' ? 'COLLIMATED' : `${reading.wavefront.state} ${reading.wavefront.divergenceDeg.toFixed(2)}°`;
    return header(name, 'ALL LIGHT PROPERTIES', reading.pulse) + metrics([
      ['POWER / INTENSITY', `${power} ${unit}`], ['BEAM Ø', reading.beamDiameter > 0 ? `${reading.beamDiameter.toFixed(2)} mm` : 'POINT'], ['WAVEFRONT', wave],
      ['POLARIZATION', String(reading.polarization).toUpperCase()], ['WAVELENGTH', spectrumLabel(reading)], ['PULSE', reading.pulse ? `${pulseRate(reading.pulse)}·${pulseDuration(reading.pulse)}`.replace(/ /g, '') : 'CW'],
    ], 3);
  }
  return '';
}

const originalDisplaySVG = registry.display.svg;
registry.display.svg = function detectorAwareDisplaySVG(display, elements = []) {
  const base = originalDisplaySVG(display, elements);
  if (display.params.screenOn === false) return base;
  const sensor = resolveDisplaySensor(display, elements);
  if (!sensor || !DETECTOR_TYPES.includes(sensor.type)) return base;
  // The camera's canonical renderer owns its measured 1D profile. Appending
  // the legacy enhanced overlay would fabricate a second spatial dimension.
  if (sensor.type === 'camera') return base;
  const reading = enhancedReading(sensor, elements);
  if (!reading) return base;
  const scale = displayRenderScale(display.params.displayScale);
  const view = resolvedDisplayView(display, sensor);
  const content = panel(sensor, reading, elements, view);
  return base + `<g transform="scale(${scale})" data-detector-readout="${esc(sensor.type)}" data-display-density="${displayDensity(scale)}" pointer-events="none"><rect x="-42.2" y="-28.2" width="84.4" height="45.4" rx="2.5" fill="#061822"/><g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${content}</g></g>`;
};

function paletteItem(type) {
  const def = registry[type], element = createElement(type);
  const size = typeof def.size === 'function' ? def.size(element) : (def.size_ ? def.size_(element) : def.size);
  const viewBox = Math.max(size.w, size.h) + 12, meta = getElementMeta(type, element.params);
  const description = def.description || DESCRIPTIONS[type] || meta.description;
  const search = `${def.label} ${def.category} ${description} ${(def.aliases || []).join(' ')}`.toLowerCase();
  return `<button type="button" class="palitem" data-type="${type}" data-search="${esc(search)}" title="${esc(description)}"><svg viewBox="${-viewBox / 2} ${-viewBox / 2} ${viewBox} ${viewBox}">${def.svg(element)}</svg><span class="pal-copy"><span class="pal-label">${esc(def.label)}</span><span class="pal-desc">${esc(description)}</span></span><i class="cap-dot ${meta.tier}" title="${esc(meta.status)}"></i></button>`;
}

async function rebuildGroup(category) {
  const group = document.querySelector(`.palette-group[data-category="${category}"]`), list = group?.querySelector('.catlist');
  if (!list) return;
  const types = Object.entries(registry).filter(([, def]) => def.category === category && !def.hidden)
    .sort((a, b) => (a[1].paletteOrder ?? 100) - (b[1].paletteOrder ?? 100)).map(([type]) => type);
  list.innerHTML = types.map(paletteItem).join('');
  const count = group.querySelector('.group-count');
  if (count) count.textContent = String(types.length);
  const { startPlacing } = await import('./canvas.js');
  list.querySelectorAll('.palitem').forEach(item => item.addEventListener('click', () => startPlacing(item.dataset.type)));
}

async function enhancePalette() {
  if (typeof document === 'undefined') return;
  await rebuildGroup('Detectors');
  const group = document.querySelector('.palette-group[data-category="Detectors"]');
  if (group) group.open = true;
  const count = document.getElementById('libraryCount');
  if (count) count.textContent = `${document.querySelectorAll('.palitem').length} components`;
  const { renderAll } = await import('./canvas.js');
  renderAll();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhancePalette, { once: true });
  else setTimeout(enhancePalette, 0);
}

export { DESCRIPTIONS, enhancedReading, objectImageAtCamera };
