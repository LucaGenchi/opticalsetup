// Detector catalogue redesign and detector-aware screen panels.

import {
  createElement, displayDensity, displayRenderScale, getElementMeta, registry, resolveDisplaySensor,
  resolvedDisplayView,
} from './elements.js';
import { detectorReading } from './raytrace.js';
import { enhancedReading, objectImageAtCamera } from './detector-measurements.js';
import { fwhmToSigma } from './spectrum.js';
import { scopeTrace } from './pulses.js';
import { esc, smoothPath, wavelengthToColor } from './util.js';

export const DETECTOR_TYPES = [
  'camera', 'detector', 'pmt', 'powermeter', 'wavefrontdetector',
  'polarimeter', 'spectrometer', 'generaldetector',
];

const DESCRIPTIONS = {
  camera: 'Measures a pixel-integrated one-dimensional intensity profile and resolves supported interference from sized monochromatic CW lasers.',
  detector: 'Measures the relative intensity incident on its active surface.',
  pmt: 'Measures intensity with qualitative gain and saturation for weak fluorescence, microscopy, and point-source signals.',
  powermeter: 'Reports incoming optical power when source power is configured, otherwise relative detected power.',
  wavefrontdetector: 'Reports intensity and classifies the incident beam as collimated, converging, or diverging with a qualitative divergence angle.',
  polarimeter: 'Reports polarization state, normalized Stokes parameters, and a visual linear, circular, elliptical, or unpolarized representation.',
  spectrometer: 'Reports centre wavelength, detected spectral range, bandwidth, and a qualitative spectrum.',
  generaldetector: 'Reports intensity, power, beam size, wavefront, polarization and Stokes parameters, wavelength and bandwidth, plus pulse repetition rate and duration.',
  display: 'Connects to one detector and shows only the properties that detector measures. The cable carries data and never affects rays.',
};

function compactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toExponential(1);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

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
  paletteOrder: 1, sensorFaceX: -22, description: DESCRIPTIONS.camera,
  aliases: ['beam camera', 'beam profiler', 'image sensor', 'interferogram', 'interference camera', 'beam diameter'],
});
Object.assign(registry.detector, {
  paletteOrder: 2, sensorFaceX: -19, description: DESCRIPTIONS.detector,
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
registry.generaldetector = instrumentDefinition({
  label: 'General detector', code: 'ALL', readoutKind: 'general', paletteOrder: 8, width: 54, accent: '#67e8f9',
  aliases: ['universal detector', 'all properties', 'pulse detector', 'repetition rate', 'pulse duration'],
});
registry.display.label = 'Detector screen';
registry.display.paletteOrder = 20;
registry.display.description = DESCRIPTIONS.display;
registry.display.aliases = [...new Set([...(registry.display.aliases || []), 'detector screen', 'instrument display'])];
if (registry.eye) { registry.eye.category = 'Microscopy'; registry.eye.paletteOrder = 20; }

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
function spectrumRange(reading, sensor) {
  const manual = sensor?.params?.rangeMode === 'manual';
  const rangeMin = sensor?.params?.rangeMin, rangeMax = sensor?.params?.rangeMax;
  if (manual && Number.isFinite(rangeMin) && Number.isFinite(rangeMax) && rangeMax > rangeMin) {
    return [rangeMin, rangeMax];
  }
  const sigma = fwhmToSigma(reading.bandwidth || 0);
  return [reading.wavelength - 2 * sigma - 5, reading.wavelength + 2 * sigma + 5];
}

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
    const crowded = peaks.some(peak => Math.abs(xAt(peak.wavelength) - x) < 6);
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

  const points = band.map(sample => ({ x: xAt(sample.wavelength), y: baseline - yFor(sample.height) }));
  // the fill traces the same curve but pinned to the baseline at both ends,
  // so it reads as a filled lineshape rather than a floating ribbon
  const fillPoints = [{ x: points[0].x, y: baseline }, ...points, { x: points[points.length - 1].x, y: baseline }];
  const clipId = `specClip${esc(sensor?.id || 'x')}`, gradientId = `specGrad${esc(sensor?.id || 'x')}`;
  // The gradient spans the band's own extent, so its colours stay tied to the
  // wavelengths underneath them even when discrete lines sit outside it.
  const bandLo = band[0].wavelength, bandHi = band[band.length - 1].wavelength;
  const bandSpan = Math.max(1e-6, bandHi - bandLo);
  const stops = band.map(sample => {
    const offset = ((sample.wavelength - bandLo) / bandSpan * 100).toFixed(1);
    return `<stop offset="${offset}%" stop-color="${sample.color || wavelengthToColor(sample.wavelength)}"/>`;
  }).join('');
  return `<defs><clipPath id="${clipId}"><rect x="-35" y="${(baseline - 17).toFixed(2)}" width="70" height="17.5"/></clipPath>` +
    `<linearGradient id="${gradientId}" x1="${xAt(bandLo).toFixed(2)}" y1="0" x2="${xAt(bandHi).toFixed(2)}" y2="0" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>` +
    axis + yLabel +
    `<g clip-path="url(#${clipId})">` +
    `<path data-spectrum-points="${band.length}" d="${smoothPath(fillPoints)} Z" fill="url(#${gradientId})" opacity="0.35" stroke="none"/>` +
    `<path d="${smoothPath(points)}" fill="none" stroke="url(#${gradientId})" stroke-width="1.4" stroke-linecap="round"/>` +
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

function panel(sensor, reading, view) {
  const name = sensor.label || registry[sensor.type].label;
  if (sensor.type === 'detector') {
    // A pulsed arrival has real temporal structure, so the screen becomes an
    // oscilloscope rather than a single averaged number. CW light keeps the
    // plain intensity readout — there is nothing to plot against time.
    const scope = reading.pulse ? scopePlot(reading) : null;
    if (scope) return header(name, 'OSCILLOSCOPE', reading.pulse) + scope;
    return header(name, 'REL INTENSITY', reading.pulse) +
      `<circle cx="-31" cy="-1" r="2.3" fill="${reading.color}"/><text x="35" y="4" text-anchor="end" font-size="15" font-weight="780" fill="#ecf7fa">${compactNumber(reading.signal)}</text><text x="35" y="12" text-anchor="end" font-size="5" fill="#7892a1">Σw · REL INTENSITY</text>`;
  }
  if (sensor.type === 'pmt') return header(name, 'LOW-LIGHT INTENSITY', reading.pulse) + metrics([
    ['INPUT', `Σw ${compactNumber(reading.signal)}`], ['GAIN', `×${compactNumber(sensor.params.gain || 1)}`],
    ['PMT OUTPUT', `${compactNumber(reading.outputSignal)} a.u.`], ['STATE', reading.saturated ? 'SATURATED' : 'LINEAR'],
  ]);
  if (sensor.type === 'powermeter') {
    const [value, unit] = formatPower(reading.detectedPowerW, reading.signal);
    // The value and its unit sit on one baseline; the old provenance caption
    // ("from configured source power") collided with the unit and is dropped.
    return header(name, 'OPTICAL POWER', reading.pulse)
      + `<text x="35" y="6" text-anchor="end" font-size="14" font-weight="780" fill="#ecf7fa">${value}</text>`
      + `<text x="35" y="14" text-anchor="end" font-size="5.2" fill="#86efac">${unit}</text>`;
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
  // The camera's canonical renderer in elements.js now owns its complete
  // 1D profile UI. Appending this enhanced overlay used to draw a second,
  // fabricated 2D pixel map over it and left both readouts in the SVG.
  if (sensor.type === 'camera') return base;
  const reading = enhancedReading(sensor, elements);
  if (!reading) return base;
  const scale = displayRenderScale(display.params.displayScale);
  const view = resolvedDisplayView(display, sensor);
  const content = panel(sensor, reading, view);
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
  await rebuildGroup('Microscopy');
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
