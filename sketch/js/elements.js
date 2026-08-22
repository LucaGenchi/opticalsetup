// Registry of optical elements.
// Local coordinates: element centered at (0,0); default optical propagation is along +x.
// def = { label, category, size:{w,h}|fn(el), params:[...], svg(el)->string,
//         surfaces(el)->[{x1,y1,x2,y2,kind,data}], source(el)->[rays],
//         immersionSource(el)->{x,y}, immersionContact(el)->segment|segments }
// Surface kinds handled by the tracer: mirror, lens, cmirror, refract,
// dichroic, filter, split, grating, absorb, transmit (data may change
// wavelength / deflect).

import { distToSegment, esc, rotPt, smoothPath, toWorld, wavelengthToColor } from './util.js';
import { uid } from './util.js';
import { detectorReading, objectivePupilFill, probeAt } from './raytrace.js';
import { fwhmToSigma, spectrumSamples, transformLimitedBandwidthNm } from './spectrum.js';
import {
  boundaryBounds, boundaryPathData, boundarySegments, isSimpleBoundary,
  pointInBoundary, sampleBoundary,
} from './polygon.js';
import { polarizationDescription, stokesAngleDeg } from './polarization.js';
import { glassIndex, isDispersiveGlass, GLASS_OPTIONS } from './glass.js';
import {
  OBJECTIVE_FRONT_X, OBJECTIVE_MEDIA, OBJECTIVE_NA_DEFAULT, OBJECTIVE_SHOULDER_X, OBJECTIVE_WD_MIN,
  objectiveAcceptanceHalfAngleDeg, objectiveBackX, objectiveBarrelHalfHeight,
  objectiveBarrelHalfHeightAt, objectiveStopX,
  objectiveEffectiveFocalLength, objectiveFrontAperture, objectiveLensPlaneX, objectiveMagnification,
  objectiveMaximumNA, objectiveMaximumWorkingDistance, objectiveMediumIndex, objectiveMediumKey,
  objectiveNumericalAperture, objectivePupilDiameter, objectivePupilRadius, objectiveWorkingDistance,
} from './objective.js';
import { pulseOverlap } from './pulses.js';

// true when the element's rotation would render baked-in text upside down
function isFlipped(el) {
  const r = ((el.rot || 0) % 360 + 360) % 360;
  return r > 90 && r < 270;
}
// rotation for side-mounted (vertical) text that keeps it readable
function sideTextRot(el) {
  const r = (((el.rot || 0) + 90) % 360 + 360) % 360;
  return (r > 90 && r < 270) ? -90 : 90;
}

const GLASS = '#c9e4f5', GLASS_S = '#4a90c4';
const FREEGLASS_DEFAULT = [
  { x: -36, y: -24 }, { x: 30, y: -24 }, { x: 38, y: 20 }, { x: -26, y: 26 },
];

// ---- thick spherical lens -----------------------------------------------
// A surface of signed radius R with its vertex at xv has its centre of
// curvature at xv + R, so R > 0 bulges toward −x (front-convex) and R < 0
// toward +x. R = 0 is the flat case, drawn and traced as a plain line.
const surfaceSag = (y, xv, R) => (xv + R) - Math.sign(R) * Math.sqrt(Math.max(0, R * R - y * y));

// Radii below the semi-diameter would need a sphere smaller than the lens
// itself; clamping keeps the boundary constructible rather than producing NaN
// geometry at parameter extremes (enforced by test/geometry.test.js).
function thickLensRadii(params) {
  const h = Math.max(0.5, (params.dia ?? 25.4) / 2);
  const clampR = R => {
    const r = Number(R) || 0;
    if (Math.abs(r) < 1e-6) return 0;                       // flat
    return Math.sign(r) * Math.max(Math.abs(r), h * 1.02);
  };
  return { h, R1: clampR(params.r1), R2: clampR(params.r2) };
}

// The tracer ignores any intersection closer than 0.05 units along a ray, an
// epsilon that stops a surface re-hitting itself. Two glass bodies in optical
// contact therefore lose one of their two coincident interfaces, and the ray
// exits into air instead of crossing into the next glass — a cemented doublet
// traced that way comes out badly wrong (measured: 275mm against a true
// 359mm). Holding cemented groups apart by slightly more than that epsilon
// makes both interfaces real again. The cost is a hair of air where the
// cement should be: at this separation it shifts a 100mm doublet's focus by
// about 0.15%, well inside what this qualitative tracer claims anywhere else,
// and real optical cement is a 10-20um layer of not-quite-glass regardless.
export const MIN_CEMENT_GAP = 0.06;

// Glass bodies expose per-surface transmission as a percentage, like every
// other optic's Transmission efficiency; the tracer works in fractions.
export function surfaceTransmission(params = {}) {
  const pct = Number.isFinite(Number(params.transEff)) ? Number(params.transEff) : 98;
  return Math.min(1, Math.max(0, pct / 100));
}

// Closed boundary for the glass body, plus the centre thickness actually used:
// a strongly biconvex lens with too little centre thickness would have its two
// faces cross at the rim, so the thickness is raised until a real edge remains.
export function thickLensGeometry(params = {}) {
  const { h, R1, R2 } = thickLensRadii(params);
  const MIN_EDGE = 0.4;
  const sag1 = R1 ? surfaceSag(h, 0, R1) : 0;               // sag measured from the vertex
  const sag2 = R2 ? surfaceSag(h, 0, R2) : 0;
  const d = Math.max(Number(params.thickness) || 0.5, MIN_EDGE + sag1 - sag2);
  const xv1 = -d / 2, xv2 = d / 2;
  const xEdge1 = R1 ? surfaceSag(h, xv1, R1) : xv1;
  const xEdge2 = R2 ? surfaceSag(h, xv2, R2) : xv2;

  const points = [{ x: xEdge1, y: h }];
  if (R1) points.push({ x: xv1, y: 0, arc: true });
  points.push({ x: xEdge1, y: -h }, { x: xEdge2, y: -h });
  if (R2) points.push({ x: xv2, y: 0, arc: true });
  points.push({ x: xEdge2, y: h });

  const xs = points.map(p => p.x);
  return { points, h, R1, R2, d, xv1, xv2, span: Math.max(...xs) - Math.min(...xs) };
}

// Some requested combinations cannot describe a closed spherical singlet: a
// radius smaller than the semi-aperture has no real circular edge, while too
// little centre thickness makes the two faces cross. The geometry stays safe
// by realizing the nearest constructible shape; expose that adjustment so the
// inspector never lets the requested numbers silently disagree with the trace.
export function thickLensAdjustment(params = {}) {
  const g = thickLensGeometry(params);
  const requested = {
    r1: Number(params.r1) || 0,
    r2: Number(params.r2) || 0,
    thickness: Number(params.thickness) || 0.5,
  };
  const differs = Math.abs(g.R1 - requested.r1) > 1e-9
    || Math.abs(g.R2 - requested.r2) > 1e-9
    || Math.abs(g.d - requested.thickness) > 1e-9;
  return differs ? { r1: g.R1, r2: g.R2, thickness: g.d } : null;
}

// Paraxial summary of what the surfaces add up to: effective focal length by
// the lensmaker's equation with the thickness term, and the back focal
// distance measured from the rear vertex. Reported to the user rather than
// configured — the trace never consults these.
export function thickLensCardinals(params = {}, wavelength = 587.6) {
  const { R1, R2, d } = thickLensGeometry(params);
  const n = glassIndex(params.glass, wavelength) ?? 1.5;
  const c1 = R1 ? 1 / R1 : 0, c2 = R2 ? 1 / R2 : 0;
  const power = (n - 1) * (c1 - c2 + (n - 1) * d * c1 * c2 / n);
  if (Math.abs(power) < 1e-9) return { f: Infinity, bfd: Infinity, n };
  const f = 1 / power;
  return { f, bfd: f * (1 - (n - 1) * d * c1 / n), n };
}

const formatFocal = v => (Number.isFinite(v) ? `${Number(v.toPrecision(4))}` : '∞ (afocal)');
const formatGeometryValue = v => Number(v.toPrecision(4)).toString().replace('-', '−');
const formatRealizedGeometry = params => {
  const g = thickLensGeometry(params);
  return `R₁ ${formatGeometryValue(g.R1)} · R₂ ${formatGeometryValue(g.R2)} · t ${formatGeometryValue(g.d)} mm`;
};

// Names the shape the two radii actually describe. Worth showing, because the
// standard Cartesian convention the lensmaker's equation needs is famously
// counter-intuitive on the REAR surface: R is positive when the centre of
// curvature lies further along the ray, so a biconvex lens is R1 > 0 with
// R2 < 0 — the rear surface bulges outward at NEGATIVE radius. Reporting the
// resulting shape means nobody has to hold that in their head.
export function thickLensShapeName(params = {}) {
  const { R1, R2 } = thickLensGeometry(params);
  const face = (R, rear) => (R === 0 ? 'plano' : (rear ? R < 0 : R > 0) ? 'convex' : 'concave');
  const front = face(R1, false), back = face(R2, true);
  if (front === 'plano' && back === 'plano') return 'Plane slab';
  if (front === 'plano' || back === 'plano') {
    const curved = front === 'plano' ? back : front;
    return front === 'plano' ? `Plano-${curved}` : `${curved[0].toUpperCase()}${curved.slice(1)}-plano`;
  }
  // Both faces bulging the same way is a bi- lens; one of each is a meniscus.
  if (front !== back) {
    const power = thickLensCardinals(params).f;
    return `Meniscus (${power > 0 ? 'positive' : 'negative'})`;
  }
  return front === 'convex' ? 'Biconvex' : 'Biconcave';
}

// Two glass bodies in true optical contact do not trace correctly: the tracer
// ignores any intersection closer than 0.05 units along a ray, so a pair of
// coincident interfaces loses one of them and the ray wrongly exits into air.
// A hand-built cemented doublet therefore comes out silently wrong rather than
// visibly broken, which is the worst way for a model to fail — so say so.
export const GLASS_BODY_TYPES = new Set(['thicklens', 'freeglass']);

function glassBodyWorldPoints(el) {
  const local = el?.type === 'thicklens' ? thickLensGeometry(el.params).points
    : el?.type === 'freeglass' ? freeglassPoints(el)
      : null;
  if (!local) return null;
  return sampleBoundary(local, { maxAngle: Math.PI / 24 }).map(pt => toWorld(el, pt.x, pt.y));
}

const pointsBounds = pts => ({
  x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)),
  y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)),
});

// Closest approach between two sampled boundaries. Bounding boxes alone would
// cry wolf on a cemented pair whose rims interlock while their surfaces are
// millimetres apart, so measure the boundaries themselves — but use the boxes
// first to skip anything obviously far away.
function boundaryGap(a, b) {
  const ba = pointsBounds(a), bb = pointsBounds(b);
  const coarse = Math.max(Math.max(ba.x0 - bb.x1, bb.x0 - ba.x1), Math.max(ba.y0 - bb.y1, bb.y0 - ba.y1));
  if (coarse >= MIN_CEMENT_GAP) return coarse;   // cheap reject
  let best = Infinity;
  const scan = (pts, poly) => {
    for (const pt of pts) {
      for (let i = 0; i < poly.length; i++) {
        best = Math.min(best, distToSegment(pt, poly[i], poly[(i + 1) % poly.length]));
        if (best === 0) return;
      }
    }
  };
  scan(a, b);
  if (best > 0) scan(b, a);
  return best;
}

// The nearest other glass body sitting closer than the tracer can resolve.
// Nested or fully overlapping bodies are a different (also unsupported) case
// and are left to the existing "not surface-merged" note: their boundaries are
// nowhere near each other, so nothing here fires.
const CEMENT_WARN_BELOW = MIN_CEMENT_GAP * 0.99;   // so the recommended gap itself is clean
export function touchingGlassBody(el, elements = []) {
  const mine = glassBodyWorldPoints(el);
  if (!mine || !mine.length) return null;
  for (const other of elements) {
    if (!other || other === el || other.id === el.id || !GLASS_BODY_TYPES.has(other.type)) continue;
    const pts = glassBodyWorldPoints(other);
    if (!pts || !pts.length) continue;
    const gap = boundaryGap(mine, pts);
    if (gap < CEMENT_WARN_BELOW) return { id: other.id, type: other.type, gap: Math.max(0, gap) };
  }
  return null;
}

function freeglassPoints(el) {
  const scale = Math.min(10, Math.max(0.1, el.params.scale || 1));
  const points = Array.isArray(el.params.vertices) && el.params.vertices.length >= 3
    ? el.params.vertices : FREEGLASS_DEFAULT;
  return points.map(p => ({
    x: p.x * scale, y: p.y * scale, ...(p.arc === true ? { arc: true } : {}),
  }));
}

function freeglassEditCandidate(el, index, localPoint) {
  if (!Number.isInteger(index) || !Number.isFinite(localPoint?.x) || !Number.isFinite(localPoint?.y)) return null;
  const scale = Math.min(10, Math.max(0.1, el.params.scale || 1));
  const limit = 5000 * scale;
  const points = freeglassPoints(el);
  if (!points[index]) return null;
  points[index] = {
    x: Math.min(limit, Math.max(-limit, localPoint.x)),
    y: Math.min(limit, Math.max(-limit, localPoint.y)),
    ...(points[index].arc === true ? { arc: true } : {}),
  };
  if (!isSimpleBoundary(points)) return null;
  const b = boundaryBounds(points), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const shift = rotPt(cx, cy, el.rot || 0);
  return {
    x: el.x + shift.x,
    y: el.y + shift.y,
    vertices: points.map(p => ({
      x: (p.x - cx) / scale, y: (p.y - cy) / scale,
      ...(p.arc === true ? { arc: true } : {}),
    })),
  };
}

function rectAbsorb(w, h) {
  const x = w / 2, y = h / 2;
  return [
    { x1: -x, y1: -y, x2: x, y2: -y, kind: 'absorb' },
    { x1: x, y1: -y, x2: x, y2: y, kind: 'absorb' },
    { x1: x, y1: y, x2: -x, y2: y, kind: 'absorb' },
    { x1: -x, y1: y, x2: -x, y2: -y, kind: 'absorb' },
  ];
}

// One-sided detector housing: light is measured at the front face and the
// remaining enclosure simply absorbs it. This lets detectors provide a useful
// readout without pretending the qualitative tracer reports calibrated power.
function detectorSurfaces(w, h, detectorType, detectorData = {}) {
  const x = w / 2, y = h / 2;
  return [
    { x1: -x, y1: -y, x2: -x, y2: y, kind: 'detector', data: { aperture: h, detectorType, ...detectorData } },
    { x1: -x, y1: -y, x2: x, y2: -y, kind: 'absorb' },
    { x1: x, y1: -y, x2: x, y2: y, kind: 'absorb' },
    { x1: x, y1: y, x2: -x, y2: y, kind: 'absorb' },
  ];
}

function signalLamp(el, x, y) {
  const rd = detectorReading(el.id);
  const on = rd && rd.signal > 0.001;
  return `<circle cx="${x}" cy="${y}" r="3.1" fill="${on ? rd.color : '#88919b'}" opacity="${on ? 1 : 0.45}" ` +
    `stroke="#fff" stroke-width="0.8"/>`;
}

export function resolveDisplaySensor(display, elements = []) {
  const sensorId = typeof display?.params?.sensorId === 'string' ? display.params.sensorId : '';
  if (!sensorId || !Array.isArray(elements)) return null;
  return elements.find(candidate => candidate?.id === sensorId
    && candidate.id !== display.id
    && registry[candidate.type]?.readoutKind) || null;
}

export function displayDensity(displayScale = 1) {
  const scale = Math.min(3, Math.max(0.5, Number.isFinite(displayScale) ? displayScale : 1));
  return scale < 0.85 ? 'compact' : scale < 1.45 ? 'standard' : 'expanded';
}

// Detector screens and the beam probe's readout card both expose a "Display
// scale" number, but the range users actually pick from (0.25–1.5) is
// deliberately an octave below the 0.5–3 range the drawing/sizing code was
// tuned against — every use doubles it back out, so the default (1) renders
// at what used to require manually dialing the old control up to 2.
export function displayRenderScale(rawScale = 1, min = 0.25, max = 1.5, factor = 2) {
  return Math.min(max, Math.max(min, Number.isFinite(rawScale) ? rawScale : 1)) * factor;
}

// The beam probe's card reads better a little smaller than the detector
// screen's, so its own "1" is 1.5x the original baseline rather than 2x,
// and the dial runs 0.5x-2x around that.
export const probeScale = el => displayRenderScale(el?.params?.displayScale, 0.5, 2, 1.5);

function availableDisplaySensors(display, elements = []) {
  return Array.isArray(elements) ? elements.filter(candidate => candidate?.id !== display?.id
    && registry[candidate?.type]?.readoutKind) : [];
}

// Which screen views a linked sensor actually has data for. Only the camera
// and the general detector carry more than one readout; a photodiode has a
// single channel of information, so offering it a "wavelength samples" view
// drew a spectrum it never measured underneath its own oscilloscope.
const DISPLAY_VIEWS = {
  camera: ['main', 'spectrum', 'detail'],
  generaldetector: ['main', 'spectrum', 'detail'],
};

export function displayViewsFor(sensorType) {
  return DISPLAY_VIEWS[sensorType] || ['main'];
}

// The view actually rendered: the stored one when the linked sensor supports
// it, else its primary readout. A display keeps its stored view when it is
// re-pointed at a sensor that cannot show it, rather than being rewritten.
export function resolvedDisplayView(display, sensor) {
  const views = displayViewsFor(sensor?.type);
  const stored = display?.params?.displayView;
  return views.includes(stored) ? stored : 'main';
}

export function displayActionUpdate(display, action, elements = []) {
  if (!display || display.type !== 'display') return null;
  if (action === 'power') {
    const screenOn = display.params.screenOn === false;
    return { updates: { screenOn }, message: screenOn ? 'Sensor display on' : 'Sensor display standby' };
  }
  if (action === 'view') {
    const sensor = resolveDisplaySensor(display, elements);
    const views = displayViewsFor(sensor?.type);
    if (views.length < 2) {
      return { updates: {}, message: sensor ? `${displaySensorName(sensor)} has one readout` : 'No sensor connected' };
    }
    const current = views.includes(display.params.displayView) ? display.params.displayView : 'main';
    const displayView = views[(views.indexOf(current) + 1) % views.length];
    return { updates: { displayView }, message: `Display view: ${displayView}` };
  }
  if (action === 'input') {
    const sensors = availableDisplaySensors(display, elements);
    if (!sensors.length) return { updates: { sensorId: '' }, message: 'No sensors available' };
    const ids = ['', ...sensors.map(sensor => sensor.id)];
    const current = ids.includes(display.params.sensorId) ? display.params.sensorId : '';
    const sensorId = ids[(ids.indexOf(current) + 1) % ids.length];
    const sensor = sensors.find(candidate => candidate.id === sensorId);
    return {
      updates: { sensorId },
      message: sensor ? `Display input: ${displaySensorName(sensor)}` : 'Display input disconnected',
    };
  }
  return null;
}

function displaySensorName(sensor) {
  const name = sensor?.label || registry[sensor?.type]?.label || 'Sensor';
  return String(name).trim().slice(0, 18) || 'Sensor';
}

function displaySpectrum(rd) {
  return rd.bandMax - rd.bandMin > 2
    ? `${Math.round(rd.bandMin)}–${Math.round(rd.bandMax)} nm`
    : `${Math.round(rd.wavelength)} nm`;
}

function shortSpectrum(rd) {
  return rd.bandMax - rd.bandMin > 2
    ? `λ${Math.round(rd.bandMin)}–${Math.round(rd.bandMax)}`
    : `λ${Math.round(rd.wavelength)} nm`;
}

function compactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return '>999';
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function shortPolarization(polarization = '') {
  return String(polarization)
    .replace(/^Linear /, 'LIN ')
    .replace(/^Elliptical /, 'ELLIP ')
    .replace(/^Circular$/, 'CIRC')
    .replace(/^Unpolarized$/, 'UNPOL')
    .replace(/^Mixed linear$/, 'MIX LIN')
    .slice(0, 12);
}

function displayViewName(view, rd) {
  if (view === 'spectrum') return 'λ SAMPLES';
  if (view === 'detail') return 'DETAIL';
  return rd?.readoutKind === 'camera' ? '1D PROFILE' : rd?.readoutKind === 'pmt' ? 'PMT OUTPUT' : 'REL SIGNAL';
}

function displayProfile(rd, { x = -35, width = 70, baseline = 5, height = 15 } = {}) {
  if (!Array.isArray(rd.profile) || !rd.profile.length) return '';
  const values = rd.profile.map(value => Number.isFinite(value) ? Math.max(0, value) : 0);
  const max = Math.max(...values, 1e-9);
  const binWidth = width / values.length;
  return values.map((value, i) => {
    if (value <= 1e-12) return '';
    const barHeight = Math.max(0.7, height * value / max);
    const color = rd.profileColors?.[i] || rd.color || '#d8e7ee';
    return `<rect data-profile-bin="${i}" x="${(x + i * binWidth).toFixed(2)}" y="${(baseline - barHeight).toFixed(2)}" ` +
      `width="${Math.max(0.35, binWidth - 0.45).toFixed(2)}" height="${barHeight.toFixed(2)}" rx="0.35" fill="${color}"/>`;
  }).join('');
}

function displaySpectrumPlot(rd, { baseline = 5, height = 15 } = {}) {
  const samples = Array.isArray(rd.spectrum) && rd.spectrum.length
    ? rd.spectrum : [{ wavelength: rd.wavelength, power: rd.signal, color: rd.color }];
  const lo = Number.isFinite(rd.bandMin) ? rd.bandMin : rd.wavelength;
  const hi = Number.isFinite(rd.bandMax) ? rd.bandMax : rd.wavelength;
  const span = Math.max(1, hi - lo);
  const max = Math.max(...samples.map(sample => sample.power || 0), 1e-9);
  const marks = samples.map((sample, index) => {
    const x = hi - lo < 1e-9 ? 0 : -34 + 68 * (sample.wavelength - lo) / span;
    const y = baseline - Math.max(1.2, height * Math.max(0, sample.power || 0) / max);
    return `<line data-spectrum-sample="${index}" x1="${x.toFixed(2)}" y1="${baseline}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" ` +
      `stroke="${sample.color || wavelengthToColor(sample.wavelength)}" stroke-width="${samples.length > 12 ? 1.4 : 2.2}" stroke-linecap="round"/>`;
  }).join('');
  return `<line x1="-35" y1="${baseline}" x2="35" y2="${baseline}" stroke="#294453" stroke-width="0.8"/>${marks}`;
}

// Two lines rather than sharing one row: a long sensor name (e.g.
// "PHOTODETECTOR") and the current readout mode used to compete for the
// same baseline and could overlap. Stacking them costs a little vertical
// room, which the rest of standardDisplayReading()'s layout below (all at
// y >= -9) already clears.
function displayHeader(sensorName, mode, pulse) {
  const headerName = sensorName.toUpperCase();
  const nameSize = Math.max(3.9, Math.min(6, 46 / Math.max(1, headerName.length * 0.62)));
  return `<text x="-36" y="-23.5" font-size="${nameSize.toFixed(2)}" font-weight="760" letter-spacing="0.35" fill="#9eb5c3">${esc(headerName)}</text>` +
    `<text x="-36" y="-16.5" font-size="4.5" font-weight="700" letter-spacing="0.35" fill="${pulse ? '#67e8f9' : '#648092'}">${esc(mode)}${pulse ? ' · PULSE' : ''}</text>`;
}

function displayDetail(rd) {
  const entries = rd.readoutKind === 'camera'
    ? [['SIGNAL', `Σw ${compactNumber(rd.signal)}`], ['CENTROID', rd.centroid == null ? '—' : `${rd.centroid.toFixed(2)} mm`],
      ['BINS', String(rd.profile?.length || 0)], ['λ SPAN', displaySpectrum(rd)]]
    : rd.readoutKind === 'pmt'
      ? [['INPUT', `Σw ${compactNumber(rd.signal)}`], ['OUTPUT', `${compactNumber(rd.outputSignal)} a.u.`],
        ['STATE', rd.saturated ? 'SATURATED' : 'LINEAR'], ['λ SPAN', displaySpectrum(rd)]]
      : [['SIGNAL', `Σw ${compactNumber(rd.signal)}`], ['SPOT', rd.samples > 1 ? `${rd.spotSpan.toFixed(1)} mm` : 'POINT'],
        ['POL', shortPolarization(rd.polarization)], ['λ SPAN', displaySpectrum(rd)]];
  return entries.map(([label, value], index) => {
    const x = index % 2 ? 4 : -35;
    const y = index < 2 ? -8 : 5;
    return `<text x="${x}" y="${y}" font-size="4.2" font-weight="700" letter-spacing="0.35" fill="#5f7d8e">${label}</text>` +
      `<text x="${x}" y="${y + 6}" font-size="5.2" font-weight="680" fill="#d9e8ee">${esc(value)}</text>`;
  }).join('');
}

function compactDisplayReading(sensorName, rd, view) {
  const header = `<text x="-35" y="-17" font-size="6" font-weight="760" letter-spacing="0.4" fill="#8fa9b8">${esc(sensorName.toUpperCase().slice(0, 11))}</text>`;
  if (view === 'spectrum') {
    const spectral = rd.bandMax - rd.bandMin > 2
      ? `${Math.round(rd.bandMin)}–${Math.round(rd.bandMax)}`
      : `${Math.round(rd.wavelength)}`;
    return header + `<text x="0" y="6" text-anchor="middle" font-size="${spectral.length > 6 ? 11 : 15}" font-weight="780" fill="${rd.color}">${spectral}</text>` +
      `<text x="0" y="13" text-anchor="middle" font-size="5" font-weight="700" fill="#7792a2">nm · DETECTED λ</text>`;
  }
  if (view === 'detail') {
    return header + `<text x="0" y="4" text-anchor="middle" font-size="8" font-weight="750" fill="#d9e8ee">${esc(shortPolarization(rd.polarization))}</text>` +
      `<text x="0" y="13" text-anchor="middle" font-size="5" fill="#7792a2">${esc(shortSpectrum(rd))}</text>`;
  }
  if (rd.readoutKind === 'camera' && rd.profile) {
    return header + displayProfile(rd, { x: -35, width: 70, baseline: 12, height: 20 }) +
      `<line x1="-35" y1="12.5" x2="35" y2="12.5" stroke="#294453" stroke-width="0.8"/>`;
  }
  const value = rd.readoutKind === 'pmt' ? rd.outputSignal : rd.signal;
  const unit = rd.readoutKind === 'pmt' ? 'a.u.' : 'Σw';
  return header + `<circle cx="-29" cy="2" r="2.3" fill="${rd.color}"/>` +
    `<text x="30" y="7" text-anchor="end" font-size="15" font-weight="780" fill="#ecf7fa">${compactNumber(value)}</text>` +
    `<text x="34" y="13" text-anchor="end" font-size="5" font-weight="700" fill="#7792a2">${unit}</text>`;
}

function standardDisplayReading(sensorName, rd, view, density) {
  const header = displayHeader(sensorName, displayViewName(view, rd), rd.pulse);
  if (view === 'detail') return header + displayDetail(rd);
  if (view === 'spectrum') {
    return header + displaySpectrumPlot(rd, { baseline: density === 'expanded' ? 4 : 6, height: 16 }) +
      `<text x="-35" y="14" font-size="5.2" fill="#8fa7b5">${esc(shortSpectrum(rd))}</text>` +
      `<text x="35" y="14" text-anchor="end" font-size="5.2" font-weight="700" fill="#d9e8ee">Σw ${compactNumber(rd.signal)}</text>`;
  }
  if (rd.readoutKind === 'camera' && rd.profile) {
    const expanded = density === 'expanded';
    const baseline = expanded ? 1 : 5;
    return header + displayProfile(rd, { x: -35, width: 70, baseline, height: expanded ? 14 : 16 }) +
      `<line x1="-35" y1="${baseline + 0.5}" x2="35" y2="${baseline + 0.5}" stroke="#294453" stroke-width="0.8"/>` +
      (expanded
        ? `<text x="-35" y="7" font-size="4" fill="#557181">−½</text><text x="0" y="7" text-anchor="middle" font-size="4" fill="#557181">0</text><text x="35" y="7" text-anchor="end" font-size="4" fill="#557181">+½ sensor</text>`
        : '') +
      `<text x="-35" y="14" font-size="5.2" fill="#8fa7b5">${esc(shortSpectrum(rd))}</text>` +
      `<text x="35" y="14" text-anchor="end" font-size="5.2" font-weight="700" fill="#d9e8ee">Σw ${compactNumber(rd.signal)}</text>`;
  }
  const value = rd.readoutKind === 'pmt' ? rd.outputSignal : rd.signal;
  const unit = rd.readoutKind === 'pmt' ? 'a.u.' : 'Σw';
  const stateText = rd.saturated ? 'SATURATED' : shortPolarization(rd.polarization);
  return header + `<circle cx="-31" cy="-2" r="2.3" fill="${rd.color}"/>` +
    `<text x="35" y="6" text-anchor="end" font-size="14" font-weight="780" fill="#ecf7fa">${compactNumber(value)}</text>` +
    `<text x="35" y="-6" text-anchor="end" font-size="4.7" font-weight="700" fill="#7892a1">${unit}</text>` +
    `<text x="-35" y="14" font-size="5.2" fill="#8fa7b5">${esc(shortSpectrum(rd))}</text>` +
    `<text x="35" y="14" text-anchor="end" font-size="5.2" font-weight="700" fill="${rd.saturated ? '#fb7185' : '#6ee7b7'}">${esc(stateText)}</text>`;
}

function displayControls(screenOn, density, hasReading) {
  const compact = density === 'compact';
  const labelSize = compact ? 4.1 : 4.5;
  return `<g class="display-control" data-display-action="power" role="button" aria-label="Toggle display power">` +
    `<title>Power</title><circle class="display-control-face" cx="-40" cy="27" r="4.4" fill="#14232c" stroke="${screenOn ? '#6ee7b7' : '#60727e'}" stroke-width="1.1"/>` +
    `<path d="M -40,23.8 L -40,27.1 M -42.2,25.2 A 3,3 0 1 0 -37.8,25.2" fill="none" stroke="${screenOn ? '#6ee7b7' : '#80909a'}" stroke-width="0.9" stroke-linecap="round"/></g>` +
    `<g class="display-control" data-display-action="input" role="button" aria-label="Cycle sensor input">` +
    `<title>Cycle sensor input</title><rect class="display-control-face" x="-30" y="22.5" width="23" height="9" rx="2" fill="#1b2b35" stroke="#536a78" stroke-width="0.9"/>` +
    `<text x="-18.5" y="28.6" text-anchor="middle" font-size="${labelSize}" font-weight="760" letter-spacing="0.35" fill="#b7c7d0">${compact ? 'IN' : 'INPUT'}</text></g>` +
    `<g class="display-control" data-display-action="view" role="button" aria-label="Cycle display view">` +
    `<title>Cycle display view</title><rect class="display-control-face" x="-3.5" y="22.5" width="23" height="9" rx="2" fill="#1b2b35" stroke="#536a78" stroke-width="0.9"/>` +
    `<text x="8" y="28.6" text-anchor="middle" font-size="${labelSize}" font-weight="760" letter-spacing="0.35" fill="#b7c7d0">${compact ? 'V' : 'VIEW'}</text></g>` +
    `<circle cx="41" cy="27" r="2.3" fill="${screenOn && hasReading ? '#34d399' : '#596b76'}"/>` +
    `<text x="33" y="29" text-anchor="end" font-size="3.6" font-weight="700" letter-spacing="0.35" fill="#708692">QUAL</text>`;
}

function displayScreenSVG(el, elements = []) {
  const scale = displayRenderScale(el.params.displayScale);
  const density = displayDensity(scale);
  const screenOn = el.params.screenOn !== false;
  const sensor = resolveDisplaySensor(el, elements);
  const view = resolvedDisplayView(el, sensor);
  const hasConfiguredLink = Boolean(el.params.sensorId);
  const rd = sensor ? detectorReading(sensor.id) : null;
  const sensorName = sensor ? displaySensorName(sensor) : '';
  let screen;

  if (!screenOn) {
    screen = `<text x="0" y="-1" text-anchor="middle" font-size="9" font-weight="760" letter-spacing="1" fill="#415661">STANDBY</text>` +
      `<text x="0" y="10" text-anchor="middle" font-size="5" fill="#31454f">${sensor ? esc(sensorName) : 'input retained'}</text>`;
  } else if (!sensor) {
    screen = `<text x="0" y="-2" text-anchor="middle" font-size="9" font-weight="760" letter-spacing="0.8" fill="${hasConfiguredLink ? '#f59e0b' : '#94a3b8'}">${hasConfiguredLink ? 'LINK LOST' : 'SELECT INPUT'}</text>` +
      `<text x="0" y="10" text-anchor="middle" font-size="5.4" fill="#607887">${hasConfiguredLink ? 'Press INPUT to relink' : 'Press INPUT to connect'}</text>`;
  } else if (!rd) {
    screen = `<text x="-35" y="-20" font-size="5.7" font-weight="760" letter-spacing="0.45" fill="#8fa9b8">${esc(sensorName.toUpperCase())}</text>` +
      `<circle cx="-29" cy="1" r="2.2" fill="#64748b"/>` +
      `<text x="-23" y="3" font-size="8.5" font-weight="760" letter-spacing="0.7" fill="#a7b8c5">NO SIGNAL</text>` +
      `<text x="-35" y="14" font-size="5.2" fill="#607887">Σw 0.00 · aim at sensor face</text>`;
  } else {
    screen = density === 'compact'
      ? compactDisplayReading(sensorName, rd, view)
      : standardDisplayReading(sensorName, rd, view, density);
  }

  return `<g transform="scale(${scale})" data-display-density="${density}"><rect x="-49" y="-36" width="98" height="72" rx="6" fill="#24313b" stroke="#111b22" stroke-width="1.7"/>` +
    `<path d="M -43,-32 H 43" stroke="#40515d" stroke-width="0.8" opacity="0.7"/>` +
    `<rect x="-43" y="-29" width="86" height="47" rx="3" fill="${screenOn ? '#061822' : '#071219'}" stroke="#45606f" stroke-width="1.2"/>` +
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${screen}</g>` +
    `<circle cx="-49" cy="19" r="3.6" fill="#13212a" stroke="#89a2b2" stroke-width="1"/>` +
    `<circle cx="-49" cy="19" r="1.3" fill="${sensor ? '#60a5fa' : '#52636f'}"/>` +
    displayControls(screenOn, density, Boolean(rd)) +
    `</g>`;
}

export function displayCableSVG(display, elements = []) {
  const sensor = resolveDisplaySensor(display, elements);
  if (!sensor) return '';
  const rawPort = registry[sensor.type]?.dataPort;
  const localPort = typeof rawPort === 'function' ? rawPort(sensor) : rawPort;
  if (!Number.isFinite(localPort?.x) || !Number.isFinite(localPort?.y)) return '';
  const from = toWorld(sensor, localPort.x, localPort.y);
  const scale = displayRenderScale(display.params.displayScale);
  const to = toWorld(display, -49 * scale, 19 * scale);
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return '';
  const direction = to.x >= from.x ? 1 : -1;
  const bend = Math.min(90, Math.max(24, Math.abs(to.x - from.x) * 0.42 + Math.abs(to.y - from.y) * 0.12));
  const path = `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} C ${(from.x + direction * bend).toFixed(2)} ${from.y.toFixed(2)}, ${(to.x - direction * bend).toFixed(2)} ${to.y.toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  return `<g data-sensor-link="${esc(sensor.id)}" pointer-events="none">` +
    `<path d="${path}" fill="none" stroke="#f8fafc" stroke-width="5.2" stroke-linecap="round" opacity="0.9" vector-effect="non-scaling-stroke"/>` +
    `<path d="${path}" fill="none" stroke="#40586a" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
    `<circle cx="${from.x.toFixed(2)}" cy="${from.y.toFixed(2)}" r="3.2" fill="#1f3340" stroke="#9eb3c0" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
    `</g>`;
}

function boxSVG(w, h, fill, stroke, text, textFill, flip) {
  return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    (text ? `<text x="0" y="0" ${flip ? 'transform="rotate(180)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="${Math.min(11, w / (text.length * 0.62))}" font-weight="600" fill="${textFill || '#fff'}">${esc(text)}</text>` : '');
}

function hatch(x, y1, y2, side, n) {
  // decorative hatching behind mirror-like surfaces
  if (!Number.isFinite(n) || n < 1 || y2 <= y1) return '';
  let s = '';
  const step = (y2 - y1) / n;
  for (let i = 0; i <= n; i++) {
    const y = y1 + i * step;
    s += `<line x1="${x}" y1="${y}" x2="${x + 6 * side}" y2="${y + 6}" stroke="#888" stroke-width="1"/>`;
  }
  return s;
}

// Wavefront shapers (SLM / DMD / deformable mirror) compose their optical
// function from up to 4 overlaid layers, applied in order to the reflected ray.
export const MAX_SHAPER_LAYERS = 4;
export function newShaperLayer() {
  return { type: 'lensarray', n: 3, f: 50, lines: 600, orders: '1', angle: 5, div: 8 };
}
const layersParam = { key: 'layers', label: 'Optical function', type: 'layers', def: [] };

// object shapes for image-formation diagrams, in unit coords:
// base at (0,0), tip at (0,-1); the traced image redraws the same shape
// scaled by the magnification (negative m = inverted)
// Normalized around y = 0 (the object's anchor, also the ray fan's origin):
// a shape spanning the full "height" param extends ±0.5 of it either side,
// so a 20mm-tall shape sits 10mm above and 10mm below the point that's
// actually irradiating — both the live icon (svg() below) and the redrawn
// image at the image plane (raytrace.js) read these same coordinates.
export const OBJ_SHAPES = {
  arrow: {
    lines: [[[0, 0.5], [0, -0.22]]],
    polys: [[[0, -0.5], [-0.17, -0.16], [0.17, -0.16]]],
  },
  F: {
    lines: [[[-0.06, 0.5], [-0.06, -0.5]], [[-0.06, -0.5], [0.42, -0.5]], [[-0.06, -0.05], [0.3, -0.05]]],
    polys: [],
  },
  tree: {
    // fir tree: short trunk + three stacked crown tiers
    lines: [[[0, 0.5], [0, 0.22]]],
    polys: [
      [[-0.36, 0.26], [0.36, 0.26], [0, -0.08]],
      [[-0.28, 0.02], [0.28, 0.02], [0, -0.3]],
      [[-0.2, -0.2], [0.2, -0.2], [0, -0.5]],
    ],
  },
};

// Infographic card for the beam probe ("?" tool). Every branch draws with its
// top-left corner at the local origin and reports its own {w, h}, so the
// caller can place the card relative to the sampled point and keep it upright
// no matter how the probe itself is rotated — see probeCardPlacement().
function probeCard(el, rd) {
  if (!rd) {
    return {
      w: 56,
      h: 24,
      body: `<rect x="0" y="0" width="56" height="24" rx="4" fill="#fff" stroke="#c9ced6"/>` +
        `<text x="28" y="12" text-anchor="middle" dominant-baseline="central" font-size="8" fill="#9aa2ad">no beam</text>`,
    };
  }
  const prop = el.params.prop;
  const isSC = rd.bw >= 200;
  const c = wavelengthToColor(rd.wl);

  if (prop === 'wl') {
    const label = isSC ? `SC ${Math.round(rd.wl - rd.bw / 2)}–${Math.round(rd.wl + rd.bw / 2)} nm`
      : rd.bw > 0 ? `${Math.round(rd.wl)} ± ${Math.round(rd.bw / 2)} nm` : `${Math.round(rd.wl)} nm`;
    const w = label.length * 5.4 + 24;
    return {
      w,
      h: 24,
      body: `<rect x="0" y="0" width="${w}" height="24" rx="4" fill="#fff" stroke="#c9ced6"/>` +
        `<circle cx="11" cy="12" r="4.5" fill="${isSC ? '#fff' : c}" ${isSC ? 'stroke="#888"' : ''}/>` +
        (isSC ? `<path d="M 7,12 A 4.5 4.5 0 0 1 15.5,12" fill="#e04040"/><path d="M 7,12 A 4.5 4.5 0 0 0 15.5,12" fill="#3050e0"/>` : '') +
        `<text x="20" y="12" font-size="9" dominant-baseline="central" fill="#333">${label}</text>`,
    };
  }

  if (prop === 'pol') {
    let icon, lab, labSize = 8;
    if (rd.polMod) {
      // A modulated segment alternates between two states, so its average is
      // a meaningless (often zero-length) Stokes vector. Name both states and
      // the rate instead — that is what is physically there.
      const name = s => polarizationDescription(s).replace(/^Linear /, '').replace('°', '°');
      const mhz = rd.polMod.frequencyMHz;
      const rate = mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz`
        : mhz >= 1 ? `${mhz.toFixed(mhz < 10 ? 2 : 1)} MHz`
          : `${(mhz * 1000).toFixed(0)} kHz`;
      icon = `<g stroke="#7c3aed" stroke-width="1.6"><line x1="-8.5" y1="0" x2="8.5" y2="0"/>` +
        `<line x1="0" y1="-8.5" x2="0" y2="8.5"/></g>` +
        `<path d="M -6,-11 L 6,-11 M 3,-13.5 L 6,-11 L 3,-8.5" fill="none" stroke="#7c3aed" stroke-width="1.2"/>`;
      lab = `${name(rd.polMod.stokesLow)} ↔ ${name(rd.polMod.stokesHigh)} · ${rate}`;
      labSize = 7;
    } else if (rd.pol === 'c') {
      icon = `<path d="M 8,2 A 8.2 8.2 0 1 1 3,-7.7" fill="none" stroke="#333" stroke-width="1.6"/>` +
        `<path d="M 3,-7.7 L 7.5,-8.5 L 4.5,-3.6 Z" fill="#333"/>`;
      lab = 'circular';
    } else if (typeof rd.pol === 'number') {
      icon = `<g transform="rotate(${-rd.pol})"><line x1="-8.5" y1="0" x2="8.5" y2="0" stroke="#333" stroke-width="1.6"/>` +
        `<path d="M 10,0 L 4.5,-3 L 4.5,3 Z M -10,0 L -4.5,-3 L -4.5,3 Z" fill="#333"/></g>`;
      lab = `linear ${Math.round(rd.pol)}°`;
    } else if (rd.pol === 'e') {
      // Elliptical: partial retardance (e.g. a waveplate not at 0/45/90° to
      // the input) leaves a nonzero circular component (s3) without being
      // purely circular — distinct from, and must not collapse into, the
      // true "no polarization at all" case below.
      const angle = rd.stokes ? stokesAngleDeg(rd.stokes) : 0;
      icon = `<g transform="rotate(${-angle})"><ellipse cx="0" cy="0" rx="8.5" ry="4" fill="none" stroke="#333" stroke-width="1.6"/>` +
        `<path d="M 8.5,0 L 4,-2.6 L 4,2.6 Z" fill="#333"/></g>`;
      lab = `elliptical ${Math.round(angle)}°`;
    } else {
      icon = `<g stroke="#666" stroke-width="1.3"><line x1="-8" y1="0" x2="8" y2="0"/><line x1="0" y1="-8" x2="0" y2="8"/><line x1="-5.7" y1="-5.7" x2="5.7" y2="5.7"/><line x1="-5.7" y1="5.7" x2="5.7" y2="-5.7"/></g>`;
      lab = 'unpolarized';
    }
    // Sized to the label so a long modulation caption never spills outside
    // the box the caller uses for placement and export bounds.
    const w = Math.max(56, lab.length * labSize * 0.56 + 12);
    return {
      w,
      h: 44,
      body: `<g transform="translate(${w / 2},14)"><circle r="14" fill="#fff" stroke="#c9ced6"/>${icon}</g>` +
        `<text x="${w / 2}" y="38" text-anchor="middle" font-size="${labSize}" fill="#333">${lab}</text>`,
    };
  }

  // spectrum plot: λ (nm) vs I (a.u.), real sampled data, smoothed through a
  // Catmull-Rom spline (matching the spectrometer's own screen readout).
  // Domain is ±2σ of the beam's FWHM bandwidth plus 5 nm padding — wide
  // enough to actually show the Gaussian shape, not just its half-max width
  // — and the rendered samples are both filtered to that domain and clipped,
  // since the spec's own sampled support (±3σ) can otherwise reach past it.
  const W = 74, H = 50, x0 = 10, y0 = H - 13, pw = W - 18, ph = H - 24;
  const sigma = fwhmToSigma(rd.bw || 0);
  const lo = rd.wl - 2 * sigma - 5, hi = rd.wl + 2 * sigma + 5, span = Math.max(1e-6, hi - lo);
  const xAt = wl => x0 + pw * (wl - lo) / span;
  let curve = '';
  if (rd.spec) {
    const samples = (spectrumSamples(rd.spec, 28) || []).filter(s => s.wl >= lo && s.wl <= hi);
    const peak = Math.max(...samples.map(s => s.weight), 1e-9);
    if (samples.length < 2) {
      const sample = samples[0];
      if (sample) {
        const x = xAt(sample.wl).toFixed(2), height = Math.max(1, (sample.weight / peak) * ph);
        curve = `<line x1="${x}" y1="${y0}" x2="${x}" y2="${(y0 - height).toFixed(2)}" stroke="${wavelengthToColor(sample.wl)}" stroke-width="2" stroke-linecap="round"/>`;
      }
    } else {
      const points = samples.map(s => ({ x: xAt(s.wl), y: y0 - Math.max(0, (s.weight / peak) * ph) }));
      const fillPoints = [{ x: points[0].x, y: y0 }, ...points, { x: points[points.length - 1].x, y: y0 }];
      const clipId = `probeSpecClip${esc(el.id)}`, gradientId = `probeSpecGrad${esc(el.id)}`;
      const stops = samples.map((s, i) => {
        const offset = samples.length > 1 ? (i / (samples.length - 1) * 100).toFixed(1) : 0;
        return `<stop offset="${offset}%" stop-color="${wavelengthToColor(s.wl)}"/>`;
      }).join('');
      curve = `<defs><clipPath id="${clipId}"><rect x="${x0}" y="${(y0 - ph - 2).toFixed(2)}" width="${pw}" height="${(ph + 3).toFixed(2)}"/></clipPath>` +
        `<linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">${stops}</linearGradient></defs>` +
        `<g clip-path="url(#${clipId})">` +
        `<path data-spectrum-points="${samples.length}" d="${smoothPath(fillPoints)} Z" fill="url(#${gradientId})" opacity="0.3" stroke="none"/>` +
        `<path d="${smoothPath(points)}" fill="none" stroke="url(#${gradientId})" stroke-width="1.6" stroke-linecap="round"/>` +
        `</g>`;
    }
  } else {
    const x = xAt(rd.wl).toFixed(2);
    curve = `<line x1="${x}" y1="${y0}" x2="${x}" y2="${(y0 - ph).toFixed(2)}" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
  }
  const tick = (wl, anchor) => {
    const x = xAt(wl).toFixed(2);
    return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${(y0 + 1.6).toFixed(2)}" stroke="#888" stroke-width="0.7"/>` +
      `<text x="${x}" y="${(y0 + 6).toFixed(2)}" text-anchor="${anchor}" font-size="4.6" fill="#666">${Math.round(wl)}</text>`;
  };
  const vlabel = isSC ? `${Math.round(rd.wl - rd.bw / 2)}–${Math.round(rd.wl + rd.bw / 2)} nm`
    : rd.bw > 0 ? `${Math.round(rd.wl)} ± ${Math.round(rd.bw / 2)} nm` : `${Math.round(rd.wl)} nm`;
  return {
    w: W,
    h: H,
    body: `<rect x="0" y="0" width="${W}" height="${H}" rx="4" fill="#fff" stroke="#c9ced6"/>` +
      `<line x1="${x0}" y1="${y0}" x2="${x0 + pw}" y2="${y0}" stroke="#888" stroke-width="1"/>` +
      `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - ph - 2}" stroke="#888" stroke-width="1"/>` +
      curve +
      tick(lo, 'start') + tick((lo + hi) / 2, 'middle') + tick(hi, 'end') +
      `<text x="${x0 - 4}" y="${y0 - ph}" text-anchor="middle" font-size="5.5" fill="#888" transform="rotate(-90 ${x0 - 4} ${y0 - ph})">I (a.u.)</text>` +
      `<text x="${x0 + pw}" y="${y0 - ph - 1}" text-anchor="end" font-size="6.5" fill="#333">${vlabel}</text>`,
  };
}

// Where the probe's readout card sits and how it is oriented. The leader line
// points straight up from the sampled point at 0° and swings around that
// point as the probe is rotated, but the card itself is counter-rotated so
// its text and plots always read horizontally — an upside-down spectrum is
// useless. The card is anchored by whichever edge faces the sampled point, so
// it always extends away from the beam rather than covering it.
const PROBE_LEADER = 22;

function probeCardPlacement(el, card, scale) {
  const rot = el.rot || 0;
  const a = rot * Math.PI / 180;
  const dirX = Math.sin(a), dirY = -Math.cos(a); // local "up" in world space
  const x = dirX * PROBE_LEADER + (-card.w / 2 + dirX * card.w / 2) * scale;
  const y = dirY * PROBE_LEADER + (-card.h / 2 + dirY * card.h / 2) * scale;
  return { rot, x, y, w: card.w * scale, h: card.h * scale };
}

// samples can generate signal (fluorescence / SHG / THG / CARS) and
// independently transmit or block the excitation beam
// A specimen can emit several signals at once — up to five stacked channels,
// the same overlay pattern the wavefront shapers use for their optical
// function (see layersParam / newShaperLayer above). An empty list is an
// optically inert specimen that only attenuates the excitation.
export const MAX_SAMPLE_CHANNELS = 5;

// A specimen is one of four kinds. Absorbing and resin have no signal
// channels at all; the two "specimen" types each offer their own menu of
// stackable signals, because a linear process and a nonlinear one are never
// alternatives for the same physical sample.
export const SPECIMEN_TYPES = [
  ['absorbing', 'Absorbing specimen'],
  ['resin', 'Photocurable resin'],
  ['linear', 'Linear specimen'],
  ['nonlinear', 'Nonlinear specimen'],
];

export const LINEAR_SIGNAL_KINDS = [
  ['fluor', 'Fluorescence — isotropic'],
  ['raman', 'Spontaneous Raman — isotropic'],
  ['phase', 'Phase contrast — retardance'],
];
export const NONLINEAR_SIGNAL_KINDS = [
  ['tpef', 'Two-photon fluorescence (2PEF)'],
  ['thpef', 'Three-photon fluorescence (3PEF)'],
  ['shg', 'Second harmonic (SHG)'],
  ['thg', 'Third harmonic (THG)'],
  ['sfg', 'Sum frequency (SFG)'],
  ['cars', 'CARS — anti-Stokes'],
  ['srs', 'Stimulated Raman (SRS)'],
];

export function signalKindsFor(specimenType) {
  if (specimenType === 'linear') return LINEAR_SIGNAL_KINDS;
  if (specimenType === 'nonlinear') return NONLINEAR_SIGNAL_KINDS;
  return [];
}

const LINEAR_KIND_SET = new Set(LINEAR_SIGNAL_KINDS.map(([k]) => k));
const NONLINEAR_KIND_SET = new Set(NONLINEAR_SIGNAL_KINDS.map(([k]) => k));
export const ALL_SIGNAL_KINDS = [...LINEAR_SIGNAL_KINDS, ...NONLINEAR_SIGNAL_KINDS];

// Kept for the legacy single-`mode` reader and any external caller.
export const SIGNAL_KINDS = ALL_SIGNAL_KINDS;

// Four- and three-wave mixing need two DIFFERENT excitation colours present
// at the same spot; the others are driven by a single beam. SRS likewise
// needs two beams — one to carry the modulation and one to receive it.
export const MIXING_KINDS = new Set(['sfg', 'cars']);
export const TWO_BEAM_KINDS = new Set(['sfg', 'cars', 'srs']);
// Incoherent emission radiates in every direction, so it has no forward/epi
// distinction to offer. The parametric signals are generated along the
// excitation direction and are forward-dominant, with a weaker backward
// (epi) lobe that real epi-detected CARS/SHG setups rely on.
export const ISOTROPIC_KINDS = new Set(['fluor', 'raman', 'tpef', 'thpef']);
export const EPI_CAPABLE_KINDS = new Set(['shg', 'thg', 'sfg', 'cars']);
// These modify the excitation beam in place rather than emitting a new one.
export const MODIFIER_KINDS = new Set(['phase', 'srs']);

// How far above the driving photon energy an emission sits by default: real
// Stokes shifts are tens of nm, and the same offset reads sensibly for
// one-, two- and three-photon excitation.
export const EMISSION_OFFSET_NM = 20;

// The photon order each emission is pumped by — 1 for ordinary
// fluorescence, 2 for 2PEF, 3 for 3PEF. The emitted photon must be less
// energetic than the combined excitation photons, i.e. its wavelength must
// exceed excitation/order.
export const EMISSION_ORDER = { fluor: 1, tpef: 2, thpef: 3 };

// Spontaneous Raman lines, as Stokes shifts in cm^-1. Real reference values
// for a handful of specimens people actually image, so a spectrometer
// downstream reconstructs a recognizable fingerprint rather than noise.
export const RAMAN_MATERIALS = [
  ['lipid', 'Lipids (CH₂)', [1440, 1650, 2845, 2880]],
  ['protein', 'Protein (amide I)', [1004, 1450, 1660, 2930]],
  ['dmso', 'DMSO', [670, 1042, 2913, 2994]],
  ['pmma', 'PMMA (acrylic)', [812, 1452, 1730, 2952]],
  ['polystyrene', 'Polystyrene', [1001, 1602, 3054]],
  ['water', 'Water (O–H)', [1640, 3250, 3400]],
];
const RAMAN_BY_ID = new Map(RAMAN_MATERIALS.map(([id, label, shifts]) => [id, { label, shifts }]));
export const ramanShifts = material => RAMAN_BY_ID.get(material)?.shifts || RAMAN_BY_ID.get('lipid').shifts;

// A Stokes-shifted wavelength: 1/lambda_s = 1/lambda_p - shift, with the
// shift converted from cm^-1 to nm^-1 (1 cm^-1 = 1e-7 nm^-1).
export function ramanStokesWl(pumpWl, shiftCm) {
  if (!(pumpWl > 0)) return null;
  const inv = 1 / pumpWl - shiftCm * 1e-7;
  return inv > 1e-9 ? 1 / inv : null;
}

// Real fluorophores, as the two numbers that matter for a sketch: where
// they absorb and where they emit, each as a peak plus a full width at half
// maximum. Excitation away from the absorption peak still works, just more
// weakly — which is the point of picking a dye at all. "Custom" keeps the
// generic behavior: absorbs whatever arrives and emits one Stokes offset
// above it.
export const FLUOROPHORES = [
  ['custom', 'Custom (any excitation)', null],
  ['dapi', 'DAPI', { absPeak: 358, absFwhm: 70, emPeak: 461, emFwhm: 70 }],
  ['hoechst', 'Hoechst 33342', { absPeak: 350, absFwhm: 70, emPeak: 461, emFwhm: 75 }],
  ['gfp', 'GFP (EGFP)', { absPeak: 488, absFwhm: 40, emPeak: 507, emFwhm: 45 }],
  ['rhodamine', 'Rhodamine (TRITC)', { absPeak: 555, absFwhm: 45, emPeak: 580, emFwhm: 45 }],
];
const FLUOROPHORE_BY_ID = new Map(FLUOROPHORES.map(([id, label, spec]) => [id, spec]));
export const fluorophoreSpec = id => FLUOROPHORE_BY_ID.get(id) || null;

// How well a dye absorbs at one wavelength, relative to its own peak. A
// multiphoton process is driven by the combined energy of its photons, so
// n-photon excitation at lambda behaves like one-photon excitation at
// lambda/n — an 800 nm beam reaches DAPI's 358 nm band two photons at a time.
export function fluorophoreAbsorption(id, excitationWl, order = 1) {
  const spec = fluorophoreSpec(id);
  if (!spec || !(excitationWl > 0)) return 1;
  const effective = excitationWl / Math.max(1, order);
  const halfWidth = Math.max(1, spec.absFwhm) / 2;
  return Math.exp(-Math.LN2 * ((effective - spec.absPeak) / halfWidth) ** 2);
}

export function newSampleChannel(kind = 'fluor') {
  return {
    kind, wl: 520, eff: 0.1, epi: false, epiRatio: 0.15, autoWl: true,
    autoColor: true, color: '#22c55e',
    material: 'lipid',        // spontaneous Raman fingerprint
    fluorophore: 'custom',    // emission band for the fluorescence kinds
    retardance: 90, axis: 45, // phase contrast
    transferEff: 0.1,         // SRS modulation transfer
    requireOverlap: true,     // two-beam signals need the pulses to coincide
  };
}

// Photon-energy conservation, in nm. Returns null when a combination is not
// physical (e.g. an anti-Stokes photon needing more energy than the two pump
// photons carry).
export function sumFrequencyWl(a, b) {
  const inv = 1 / a + 1 / b;
  return inv > 1e-9 ? 1 / inv : null;
}
export function carsAntiStokesWl(pumpWl, stokesWl) {
  const inv = 2 / pumpWl - 1 / stokesWl;
  return inv > 1e-9 ? 1 / inv : null;
}

// Legacy scenes stored one `mode` plus its own wavelength/efficiency fields.
// They keep loading unchanged by being read as a single-channel list.
export function legacySampleChannels(p) {
  if (!p || !p.mode || p.mode === 'none') return [];
  const eff = Number.isFinite(p.signalEff) ? p.signalEff : 0.1;
  if (p.mode === 'fluor') return [{ ...newSampleChannel('fluor'), wl: p.fluorWl ?? 520, eff }];
  if (p.mode === 'cars') return [{ ...newSampleChannel('cars'), wl: p.carsWl ?? 660, eff, autoWl: false }];
  if (p.mode === 'shg' || p.mode === 'thg') return [{ ...newSampleChannel(p.mode), eff }];
  return [];
}

// Which of the four specimen kinds this element is. Sketches saved before
// the type existed are read from whatever they do carry: an explicit resin
// material, the signal channels they already stack, or the old per-material
// `sampleKind` — so nothing silently changes behavior on load.
export function specimenTypeOf(p) {
  if (p?.specimenType) return p.specimenType;
  const legacy = p?.sampleKind;
  if (legacy === 'resin') return 'resin';
  const stacked = Array.isArray(p?.channels) && p.channels.length ? p.channels : legacySampleChannels(p);
  if (stacked.length) return stacked.some(c => NONLINEAR_KIND_SET.has(c.kind)) ? 'nonlinear' : 'linear';
  if (legacy === 'fluorescent') return 'linear';
  if (legacy === 'nonlinear') return 'nonlinear';
  return 'absorbing';
}

export function sampleChannels(p) {
  const type = specimenTypeOf(p);
  // Absorbing and resin specimens emit nothing. Channels the user configured
  // under another type are kept in params (so switching back restores them)
  // but take no part in the trace, and a channel is only ever honored under
  // the type whose menu offers it.
  const allowed = type === 'linear' ? LINEAR_KIND_SET : type === 'nonlinear' ? NONLINEAR_KIND_SET : null;
  if (!allowed) return [];
  const raw = Array.isArray(p?.channels) && p.channels.length ? p.channels : legacySampleChannels(p);
  return raw.filter(c => allowed.has(c.kind)).slice(0, MAX_SAMPLE_CHANNELS);
}

// Two-beam signals only happen while both pulses are at the spot together.
// When they are not, say by how much and in which direction to fix it, so a
// silent signal is diagnosable instead of mysterious.
function overlapWarning(channel, records) {
  if (channel.requireOverlap === false) return null;
  const sorted = [...records].sort((a, b) => a.wl - b.wl);
  const a = sorted[0], b = sorted[sorted.length - 1];
  const { factor, skewNs, comparable } = pulseOverlap(a, b);
  if (!comparable || factor >= 0.5) return null;
  const skewPs = skewNs * 1000;
  const pathMm = skewNs * 299.792458;
  const what = channel.kind === 'srs' ? 'Stimulated Raman' : channel.kind === 'sfg' ? 'Sum frequency' : 'CARS';
  return `${what} needs the two pulses to arrive together: they are ${skewPs.toFixed(skewPs < 10 ? 2 : 0)} ps apart `
    + `(${pathMm.toFixed(pathMm < 10 ? 2 : 0)} mm of path). Match the arms, or add a delay line.`;
}

// Whether a channel has to know what else is illuminating the specimen —
// which colours are present, and whether any of them carries a modulation.
// SHG, THG and phase contrast derive everything from the ray in front of
// them, so a specimen made only of those never pays for the probe pass.
export function channelNeedsExcitationProbe(c) {
  if (TWO_BEAM_KINDS.has(c.kind)) return !(c.kind === 'cars' && c.autoWl === false);
  if (c.kind === 'raman') return true;
  // Emission channels need it even when the wavelength is pinned: the
  // photon-energy floor a manual value has to clear is set by the SHORTEST
  // beam on the spot, which a single ray cannot know on its own.
  if (EMISSION_ORDER[c.kind]) return true;
  return false;
}

// The excitation colour a single-beam signal is driven by. With several
// beams on the spot the shortest wavelength carries the most energy per
// photon, so it is the one that drives fluorescence and Raman.
export function drivingExcitationWl(incidentWls) {
  const list = (incidentWls || []).filter(w => Number.isFinite(w) && w > 0);
  return list.length ? Math.min(...list) : null;
}

// The wavelength an emission channel defaults to for a given excitation:
// one Stokes offset above the energy its pump photons can reach.
export function defaultEmissionWl(kind, excitationWl) {
  const order = EMISSION_ORDER[kind];
  if (!order || !(excitationWl > 0)) return null;
  return Math.round(excitationWl / order + EMISSION_OFFSET_NM);
}

// Physically impossible or under-specified configurations, reported as a
// short sentence for the inspector to surface. Returns null when the channel
// is fine. `incidentWls` is what actually reaches this specimen.
export function channelWarning(channel, incident) {
  // `incident` is either the plain wavelengths or the full probe records
  // (wavelength, path length, pulse train) needed to judge arrival timing.
  const records = (incident || []).map(b => (typeof b === 'number' ? { wl: b } : b))
    .filter(b => Number.isFinite(b?.wl) && b.wl > 0);
  const distinct = [...new Set(records.map(b => Math.round(b.wl)))];
  if (TWO_BEAM_KINDS.has(channel.kind)) {
    if (channel.kind === 'cars' && channel.autoWl === false) return null;
    if (distinct.length < 2) {
      return channel.kind === 'srs'
        ? 'Stimulated Raman needs two excitation beams — one carrying the modulation, one to receive it.'
        : `${channel.kind === 'sfg' ? 'Sum frequency' : 'CARS'} needs two different excitation wavelengths at the sample.`;
    }
    return overlapWarning(channel, records);
  }
  const order = EMISSION_ORDER[channel.kind];
  if (!order) return null;
  const excitation = drivingExcitationWl(records.map(b => b.wl));
  const dye = fluorophoreSpec(channel.fluorophore);
  if (dye && excitation > 0) {
    const absorbed = fluorophoreAbsorption(channel.fluorophore, excitation, order);
    if (absorbed < 0.05) {
      const label = (FLUOROPHORES.find(([id]) => id === channel.fluorophore) || [, 'This dye'])[1];
      const effective = Math.round(excitation / order);
      const via = order === 1 ? `${effective} nm` : `${Math.round(excitation)} nm at ${order} photons (${effective} nm effective)`;
      return `${label} barely absorbs ${via} — its band peaks at ${dye.absPeak} nm. `
        + `Emission is ${(absorbed * 100).toFixed(absorbed < 0.01 ? 2 : 1)}% of what it would be on peak.`;
    }
    return null;
  }
  if (channel.autoWl !== false) return null;
  if (!(excitation > 0) || !(channel.wl > 0)) return null;
  const floor = excitation / order;
  if (channel.wl < floor) {
    const what = order === 1 ? 'Fluorescence' : `${order}-photon fluorescence`;
    return `${what} cannot emit at ${Math.round(channel.wl)} nm: that is more energetic than `
      + `${order === 1 ? 'the' : `${order} combined`} ${Math.round(excitation)} nm excitation photon${order === 1 ? '' : 's'} `
      + `(must exceed ${Math.round(floor)} nm).`;
  }
  return null;
}

function sampleModeParams() {
  return [
    { key: 'specimenType', label: 'Specimen type', type: 'select', def: 'absorbing', options: SPECIMEN_TYPES,
      // Sketches predating the type selector are read from what they do
      // carry — stacked channels, a legacy single `mode`, or the old
      // per-material `sampleKind`.
      migrate: p => specimenTypeOf({ ...p, specimenType: null }) },
    // Only the two signal-bearing types show a channel list; the resin's own
    // preview controls live on the stage, next to its piezo scan.
    { key: 'channels', label: 'Signals generated', type: 'signals', def: [], show: p => {
      const type = specimenTypeOf(p);
      return type === 'linear' || type === 'nonlinear';
    } },
    { key: 'showSignalSpot', label: 'Show excitation spot', type: 'checkbox', def: true, appearance: true },
    { key: 'thickness', label: 'Sample thickness (mm)', type: 'number', min: 1, max: 20, step: 0.5, def: 6, appearance: true },
    { key: 'voxelPreview', label: '2PP voxel preview', type: 'checkbox', def: false, show: p => specimenTypeOf(p) === 'resin' },
    { key: 'voxelSize', label: 'Voxel marker (mm)', type: 'number', min: 0.1, max: 6, step: 0.1, def: 0.6, show: p => specimenTypeOf(p) === 'resin' && p.voxelPreview },
    { key: 'transmitExc', label: 'Transmit excitation', type: 'checkbox', def: true, show: p => specimenTypeOf(p) !== 'absorbing' },
    // An absorbing specimen is exactly this one dial: full transmission down
    // to zero, where it blocks the beam outright.
    { key: 'transmission', label: 'Excitation transmission', type: 'number', min: 0, max: 1, step: 0.05, def: 0.8, show: p => specimenTypeOf(p) === 'absorbing' || p.transmitExc },
    // Legacy single-signal fields: hidden, kept so pre-channels sketches keep
    // loading and are read through legacySampleChannels() above.
    { key: 'mode', label: 'Signal generated', type: 'select', def: 'none', show: () => false, options: [['none', 'None'], ['fluor', 'Fluorescence (isotropic)'], ['shg', 'SHG λ/2 (forward)'], ['thg', 'THG λ/3 (forward)'], ['cars', 'CARS (forward)']] },
    { key: 'fluorWl', label: 'Emission λ (nm)', type: 'number', min: 200, max: 1200, step: 5, def: 520, show: () => false },
    { key: 'carsWl', label: 'CARS λ (nm)', type: 'number', min: 200, max: 1200, step: 5, def: 660, show: () => false },
    { key: 'signalEff', label: 'Signal efficiency', type: 'number', min: 0, max: 1, step: 0.05, def: 0.1, show: () => false },
  ];
}
// A piezo stage can translate the mounted specimen along its own XY (long
// axis, transverse to the beam) and Z (its own optical axis — a 2D stand-in
// for focus/depth) directions. Three scan patterns:
//   'xy'   — continuous bidirectional (triangle) sweep along XY only.
//   'z'    — continuous bidirectional sweep along Z only.
//   'sync' — a raster scan: XY sweeps continuously (one full left-to-right
//            or right-to-left pass per half period) while Z advances by one
//            discrete step each time XY completes a pass, bouncing back
//            down once it reaches the far end — a serpentine line-by-line
//            scan, not a calibrated piezo trajectory.
// XY maps to the local-x offset and Z to the local-y offset, matching the
// sample's local geometry (its long/clear-aperture axis is local x, the
// beam crosses it along local y — see sampleSurfaces). The caller rotates
// this local offset into world space by the element's own rot (same
// pattern as retroOffsetAt below), so XY stays parallel to the specimen's
// long axis and Z stays perpendicular to it at any placed angle.
function triangleWave(timeSeconds, frequency, travel) {
  const phase = ((timeSeconds * frequency) % 1 + 1) % 1;
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return (triangle - 0.5) * travel;
}

function syncZOffset(timeSeconds, freqXY, travelZ, steps) {
  const n = Math.max(2, Math.round(steps) || 2);
  if (!(freqXY > 0)) return -travelZ / 2;
  const halfPeriod = 1 / (2 * freqXY);
  const sweepIndex = Math.floor(timeSeconds / halfPeriod);
  const cycleLen = 2 * (n - 1);
  const stepPhase = ((sweepIndex % cycleLen) + cycleLen) % cycleLen;
  const level = stepPhase <= n - 1 ? stepPhase : cycleLen - stepPhase;
  return -travelZ / 2 + (level / (n - 1)) * travelZ;
}

// A retroreflector's delay-line motion translates the whole element along
// its own apex axis (local x, pointing from the mouth toward the apex); the
// caller rotates this local offset into world space by the element's own
// rot (same pattern the piezo stage uses — see stageOffsetAt above), since
// a retroreflector is routinely placed at an arbitrary angle to fold a beam
// path. The offset ranges over
// [0, travel], starting at 0 (the placed position, the shortest path) and
// moving only in the positive-x direction — away from the mouth, which
// always lengthens the round-trip optical path, never shortens it.
export function retroOffsetAt(params = {}, timeSeconds = 0) {
  if (params.moveMode !== 'linear' || !Number.isFinite(timeSeconds)) return { x: 0, y: 0 };
  const travel = Math.min(200, Math.max(0, params.travel ?? 50));
  const freq = Math.min(10, Math.max(0.01, params.freqHz ?? 0.2));
  return { x: triangleWave(timeSeconds, freq, travel) + travel / 2, y: 0 };
}

export function stageOffsetAt(params = {}, timeSeconds = 0) {
  const mode = params.pzMode || 'static';
  if (mode === 'static' || !Number.isFinite(timeSeconds)) return { x: 0, y: 0 };
  const travelXY = Math.min(150, Math.max(0, params.pzTravelXY ?? 12));
  const freqXY = Math.min(10, Math.max(0.01, params.pzFreqXY ?? 0.15));
  const travelZ = Math.min(150, Math.max(0, params.pzTravelZ ?? 8));
  if (mode === 'xy') return { x: triangleWave(timeSeconds, freqXY, travelXY), y: 0 };
  if (mode === 'z') {
    const freqZ = Math.min(10, Math.max(0.01, params.pzFreqZ ?? 0.1));
    return { x: 0, y: triangleWave(timeSeconds, freqZ, travelZ) };
  }
  if (mode === 'sync') {
    const steps = Math.min(50, Math.max(2, Math.round(params.pzZSteps ?? 5)));
    return { x: triangleWave(timeSeconds, freqXY, travelXY), y: syncZOffset(timeSeconds, freqXY, travelZ, steps) };
  }
  return { x: 0, y: 0 };
}

// A 2PP voxel's apparent size/opacity qualitatively broadens and fades the
// further the sample currently sits from the stage's nominal Z=0 (focus)
// plane — a stand-in for real defocus-broadened, threshold-limited exposure
// in a system with no true third axis. `travelZ` scales what "far" means so
// the falloff tracks whatever axial range the user configured.
export function voxelDepthFactor(zOffset = 0, travelZ = 8) {
  const halfTravel = Math.max(1e-6, travelZ / 2);
  return Math.min(1, Math.abs(zOffset) / halfTravel);
}

// Fallback material-identity color, used only when no live traced hit is
// available yet (e.g. nothing currently illuminates the sample). Once a ray
// hits, the actual generated-signal wavelength (computed in raytrace.js)
// takes over for fluorescence and nonlinear signals.
function stageSampleColor(params) {
  // The first channel whose wavelength is known without knowing what is
  // actually illuminating the specimen — SHG/THG/SFG/CARS all depend on the
  // incident colour, so they fall through to the material tint below.
  const named = sampleChannels(params).find(c => c.kind === 'fluor' || (c.kind === 'cars' && c.autoWl === false));
  if (named) return wavelengthToColor(named.wl);
  const type = specimenTypeOf(params);
  if (type === 'resin') return '#9b5de5';
  if (type === 'nonlinear') return '#e6a23c';
  if (type === 'absorbing') return '#69737e';
  return '#e2758f';
}

// How thick the specimen glass is DRAWN. The tracer crosses it as a thin
// sheet whatever this says, so it is presentation only — it never changes
// where a ray meets the specimen or what it does there.
export const sampleThickness = p => Math.min(20, Math.max(1, p?.thickness ?? 6));

function signalSpotSVG(el) {
  const hit = el._signalHitLocal;
  if (!el.params.showSignalSpot || !hit) return '';
  const color = Number.isFinite(hit.wl) ? wavelengthToColor(hit.wl) : stageSampleColor(el.params);
  return `<circle cx="${hit.x.toFixed(2)}" cy="${hit.y.toFixed(2)}" r="1.4" fill="${color}" opacity="0.85"/>`;
}

function sampleSurfaces(el, h) {
  const p = el.params;
  const writeVoxel = specimenTypeOf(p) === 'resin' && p.voxelPreview === true;
  const reportHit = true;
  const channels = sampleChannels(p);
  // One surface carries every channel, so a multimodal specimen emits all of
  // its signals from the same spot on a single crossing. An inert specimen
  // (no channels) keeps the plain attenuate/absorb behavior it always had.
  if (channels.length) {
    return [{
      x1: -h, y1: 0, x2: h, y2: 0, kind: 'specimen',
      data: { channels, transmitExc: p.transmitExc, transmission: p.transmission, writeVoxel, reportHit },
    }];
  }
  return p.transmitExc
    ? [{ x1: -h, y1: 0, x2: h, y2: 0, kind: 'attenuate', data: { transmission: p.transmission, writeVoxel, reportHit, specimen: true } }]
    : rectAbsorb(2 * h, 8).map(s => ({ ...s, data: { reportHit } }));
}

// lens outline at x=cx: biconvex for f>=0, biconcave for f<0.
// The refracting faces are the two VERTICAL surfaces the beam crosses, so
// for a diverging lens those are the ones that curve inward (waist at mid).
function lensShape(cx, h, f) {
  const d = f >= 0
    ? `M ${cx},${-h} Q ${cx + 9},0 ${cx},${h} Q ${cx - 9},0 ${cx},${-h} Z`
    : `M ${cx - 6},${-h} L ${cx + 6},${-h} Q ${cx},0 ${cx + 6},${h} L ${cx - 6},${h} Q ${cx},0 ${cx - 6},${-h} Z`;
  return `<path d="${d}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
}

function prismGeometry(el) {
  const height = Math.max(5, el.params.psize || 25.4);
  const apex = Math.min(80, Math.max(10, el.params.apex || 60)) * Math.PI / 180;
  const halfBase = height * Math.tan(apex / 2);
  return {
    top: { x: 0, y: -height / 2 },
    left: { x: -halfBase, y: height / 2 },
    right: { x: halfBase, y: height / 2 },
    width: 2 * halfBase,
    height,
  };
}

// laser body height grows with the beam width so a thick beam never
// exceeds its source
function laserH(el) {
  const p = el.params;
  return p.beamMode === 'beam' ? Math.max(34, p.beamWidth + 28) : 34;
}

// absorbing housing around a shaper's active face: top, bottom, back, and the
// two bits of front frame beyond the active area (face at x=fx, body to x=bx)
function shaperBody(fx, bx, L, hh) {
  return [
    { x1: fx, y1: -hh, x2: bx, y2: -hh, kind: 'absorb' },
    { x1: fx, y1: hh, x2: bx, y2: hh, kind: 'absorb' },
    { x1: bx, y1: -hh, x2: bx, y2: hh, kind: 'absorb' },
    { x1: fx, y1: -hh, x2: fx, y2: -L, kind: 'absorb' },
    { x1: fx, y1: L, x2: fx, y2: hh, kind: 'absorb' },
  ];
}

const P = {
  wavelength: { key: 'wavelength', label: 'Wavelength (nm)', type: 'number', min: 100, max: 12000, step: 1, def: 532 },
  autoColor: { key: 'autoColor', label: 'Color from λ', type: 'checkbox', def: true },
  color: { key: 'color', label: 'Beam color', type: 'color', def: '#e02020', show: p => !p.autoColor },
};

// Shared by every mirror in the Mirrors category: a reflectivity percentage
// and, once it's set below 100%, an opt-in toggle for actually drawing the
// leaked transmitted beam (default off — the leak is still fully traced for
// correct detector/power-budget readings either way, see raytrace.js's
// `hidden` ray flag; this only controls whether it's rendered).
function reflectivityParams() {
  return [
    { key: 'refl', label: 'Reflectivity (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
    { key: 'showTransmitted', label: 'Display transmitted beam', type: 'checkbox', def: false, show: p => (p.refl ?? 100) < 100 },
  ];
}

// Ideal quasistatic galvo command. The mechanical mirror angle is what the
// user configures; a reflected beam changes direction by twice that amount.
// Animation deliberately omits inertia/resonance so the UI never implies a
// calibrated scanner transfer function.
export function galvoAngleAt(params = {}, timeSeconds = 0) {
  const center = Math.min(45, Math.max(-45, Number.isFinite(params.commandAngle) ? params.commandAngle : 0));
  if (params.scanMode !== 'sine' && params.scanMode !== 'triangle') {
    return Math.min(45, Math.max(-45, center));
  }
  const amplitude = Math.min(10, 45 - Math.abs(center),
    Math.max(0, Number.isFinite(params.scanAmplitude) ? params.scanAmplitude : 0));
  const frequency = Math.min(5000, Math.max(0.01, Number.isFinite(params.scanFrequencyHz) ? params.scanFrequencyHz : 100));
  const phase = (Number.isFinite(params.scanPhaseDeg) ? params.scanPhaseDeg : 0) * Math.PI / 180;
  const cycle = timeSeconds * frequency + phase / (2 * Math.PI);
  const frac = ((cycle % 1) + 1) % 1;
  const wave = params.scanMode === 'triangle'
    ? (frac < 0.25 ? 4 * frac : frac < 0.75 ? 2 - 4 * frac : 4 * frac - 4)
    : Math.sin(2 * Math.PI * frac);
  return Math.min(45, Math.max(-45, center + amplitude * wave));
}

// ---- shared laser-source building blocks --------------------------------
// CW Laser, Pulsed Laser and Supercontinuum laser are three separate palette
// entries over one emission contract, rather than a single element with an
// "Emission" switch. Folding them together meant the icon could disagree with
// the configured behavior (a laser drawn as a plain box while set to emit a
// supercontinuum), and buried each source's real controls behind others that
// did not apply. They still share beam geometry, polarization, color and the
// (wl, bw, spec) spectrum resolved by resolveSourceSpectrum().
const beamShapeParams = beamWidthDef => [
  { key: 'beamMode', label: 'Beam style', type: 'select', def: 'beam', options: [['line', 'Simple line'], ['beam', 'Beam with size']] },
  { key: 'beamWidth', label: 'Beam width (mm)', type: 'number', min: 1, max: 60, step: 0.5, def: beamWidthDef, show: p => p.beamMode === 'beam' },
];

const POL_PARAM = { key: 'pol', label: 'Polarization (°)', type: 'number', min: 0, max: 180, step: 5, def: 0 };

// Repetition rate and emission offset are the pulse-train timing both pulsed
// sources expose. Pulse duration is not shared: it is a property of the laser
// line itself, while a supercontinuum's duration is set by whatever generated
// it upstream, so the SC source does not claim to know it.
const pulseTrainParams = () => [
  { key: 'repRateMHz', label: 'Repetition rate (MHz)', type: 'number', min: 0.001, max: 1000000, step: 1, def: 80 },
  { key: 'pulsePhaseNs', label: 'Emission offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0 },
];

// Purely a rendering choice: the pulse train stays fully simulated when this
// is off — it still drives the time-scale picker and still gates two-colour
// temporal overlap — only the travelling pulse packets stop being drawn, so
// the beam reads as a steady CW line.
const SHOW_PULSE_PARAM = { key: 'showPulse', label: 'Show pulse dynamics', type: 'checkbox', def: true };

// `temporalMode` stopped being a user-facing switch when the sources split —
// the element type is the answer now — but the tracer, the time-scale picker
// and the pulse animation all still read it, so each type pins its own value
// as a single-option, never-rendered param that survives save/load intact.
const pinnedParam = (key, value) => ({ key, label: key, type: 'select', def: value, options: [[value, value]], show: () => false });

// Exit aperture half-height: tracks the configured beam width so a wide beam
// visibly leaves a wide port.
function laserAperture(el) {
  const hh = laserH(el) / 2;
  return el.params.beamMode === 'beam' ? Math.min(hh - 4, el.params.beamWidth / 2 + 3) : 6;
}

function laserSource(el) {
  const p = el.params;
  if (p.beamMode === 'beam') {
    // sample rays across the beam width; adjacent samples with an identical
    // interaction history are filled as an envelope strip, so a lenslet
    // array splits the beam into visibly separate focusing beamlets
    const K = 25, w = p.beamWidth;
    const out = [];
    for (let i = 0; i < K; i++) out.push({ x: 52, y: -w / 2 + w * i / (K - 1), dx: 1, dy: 0, sample: i });
    return out;
  }
  return [{ x: 52, y: 0, dx: 1, dy: 0 }];
}

// Peak power of a mode-locked pulse train: the pulse energy (average power
// spread over one repetition period) delivered within a single pulse, scaled
// by the shape factor relating an envelope's FWHM duration to its true peak.
const PEAK_SHAPE_FACTOR = { gauss: 0.9394, sech2: 0.8815 };

export function peakPowerW(params = {}) {
  const avg = Number(params.avgPowerW);
  const repHz = Number(params.repRateMHz) * 1e6;
  const tau = Number(params.pulseWidthFs) * 1e-15;
  if (!(avg > 0) || !(repHz > 0) || !(tau > 0)) return null;
  const shape = PEAK_SHAPE_FACTOR[params.pulseShape] ?? PEAK_SHAPE_FACTOR.gauss;
  return shape * (avg / repHz) / tau;
}

const POWER_UNITS = [[1e12, 'TW'], [1e9, 'GW'], [1e6, 'MW'], [1e3, 'kW'], [1, 'W'], [1e-3, 'mW'], [1e-6, 'µW']];

export function formatPower(watts) {
  if (!(watts > 0)) return '—';
  for (const [scale, unit] of POWER_UNITS) {
    if (watts >= scale) return `${Number((watts / scale).toPrecision(3))} ${unit}`;
  }
  return `${Number((watts * 1e9).toPrecision(3))} nW`;
}

export const registry = {

  // ---------------- Sources ----------------
  cwlaser: {
    label: 'CW Laser', category: 'Sources', paletteOrder: 0, size: { w: 104, h: 38 },
    aliases: ['laser', 'continuous wave laser', 'cw laser', 'diode laser', 'helium neon', 'he-ne'],
    snapPt: { x: 52, y: 0 }, // beam exit aperture
    size_: el => ({ w: 104, h: laserH(el) + 4 }),
    params: [
      P.wavelength,
      { key: 'avgPowerW', label: 'Average power (W)', type: 'number', min: 0, max: 1000, step: 0.001, def: 0.1 },
      ...beamShapeParams(3),
      POL_PARAM,
      P.autoColor, P.color,
      pinnedParam('temporalMode', 'cw'),
    ],
    svg(el) {
      const h = laserH(el), hh = h / 2, ap = laserAperture(el);
      return `<rect x="-46" y="${-hh}" width="92" height="${h}" rx="4" fill="#3a3f46" stroke="#22252a" stroke-width="1.5"/>` +
        `<text x="0" y="0" ${isFlipped(el) ? 'transform="rotate(180)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" letter-spacing="1.2" fill="#fff">CW LASER</text>` +
        `<rect x="46" y="${-ap}" width="5" height="${2 * ap}" fill="#666" stroke="#444" stroke-width="1"/>`;
    },
    surfaces: el => rectAbsorb(92, laserH(el)),
    source: laserSource,
  },

  pulsedlaser: {
    label: 'Pulsed Laser', category: 'Sources', paletteOrder: 1, size: { w: 104, h: 38 },
    aliases: ['pulsed laser', 'ultrafast laser', 'femtosecond laser', 'mode-locked laser', 'fs laser', 'ti:sapphire'],
    snapPt: { x: 52, y: 0 },
    size_: el => ({ w: 104, h: laserH(el) + 4 }),
    params: [
      P.wavelength,
      { key: 'avgPowerW', label: 'Average power (W)', type: 'number', min: 0, max: 1000, step: 0.001, def: 0.1 },
      ...beamShapeParams(3),
      ...pulseTrainParams(),
      { key: 'pulseWidthFs', label: 'Pulse duration (fs)', type: 'number', min: 1, max: 1000000000, step: 10, def: 150 },
      { key: 'transformLimited', label: 'Transform-limited (time–bandwidth product)', type: 'checkbox', def: true },
      {
        // The envelope shape matters either way: it sets the time–bandwidth
        // constant while transform-limited, and the peak-power shape factor
        // always.
        key: 'pulseShape', label: 'Pulse shape', type: 'select', def: 'gauss',
        options: [['gauss', 'Gaussian'], ['sech2', 'Sech²']],
      },
      // Bandwidth is one row that changes hands. While transform-limited it is
      // an output — the minimum width this duration and shape allow — so it is
      // shown read-only next to Peak power. Switching that off hands the field
      // to the user, which is how a chirped pulse is described: a spectrum
      // wider than its duration requires. 0 nm stays a deliberate, valid
      // setting — an idealized monochromatic pulse train.
      {
        key: 'bandwidthTL', label: 'Bandwidth (nm)', type: 'readout',
        readout: p => String(Number(transformLimitedBandwidthNm(p.pulseWidthFs, p.wavelength, p.pulseShape).toPrecision(4))),
        show: p => p.transformLimited,
      },
      {
        key: 'bandwidth', label: 'Bandwidth (nm)', type: 'number', min: 0, max: 400, step: 0.5, def: 5,
        show: p => !p.transformLimited,
      },
      POL_PARAM,
      P.autoColor, P.color,
      { key: 'peakPower', label: 'Peak power', type: 'readout', readout: p => formatPower(peakPowerW(p)) },
      SHOW_PULSE_PARAM,
      pinnedParam('temporalMode', 'pulsed'),
    ],
    svg(el) {
      const h = laserH(el), hh = h / 2, ap = laserAperture(el);
      return `<rect x="-46" y="${-hh}" width="92" height="${h}" rx="4" fill="#3a3f46" stroke="#22252a" stroke-width="1.5"/>` +
        `<text x="0" y="-3" ${isFlipped(el) ? 'transform="rotate(180)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="700" letter-spacing="1.5" fill="#fff">LASER</text>` +
        `<g stroke="#8fd3ff" stroke-width="1.2" opacity="0.95"><path d="M -17,8 L -12,8 L -10,3 L -8,11 L -6,8 L -1,8"/><path d="M 3,8 L 8,8 L 10,3 L 12,11 L 14,8 L 19,8"/></g>` +
        `<rect x="46" y="${-ap}" width="5" height="${2 * ap}" fill="#666" stroke="#444" stroke-width="1"/>`;
    },
    surfaces: el => rectAbsorb(92, laserH(el)),
    source: laserSource,
  },

  // Unified replacement for the old LED + Light source: one isotropic point
  // emitter. Rays are evanescent — they fade within ~110 mm (5x a fluorescent
  // specimen's range) unless a nearby lens / objective / fiber tip collects
  // them, which keeps 360° emission from flooding the canvas.
  pointsource: {
    label: 'Point source', category: 'Sources', paletteOrder: 3, size: { w: 30, h: 30 },
    aliases: ['led', 'lamp', 'light source', 'bulb', 'isotropic source', 'point emitter'],
    size_: el => ({ w: 30 * (el.params.displayScale || 1), h: 30 * (el.params.displayScale || 1) }),
    params: [
      { key: 'displayScale', label: 'Display scale', type: 'number', min: 0.5, max: 2.5, step: 0.1, def: 1 },
      P.wavelength,
      { key: 'bwMode', label: 'Spectrum', type: 'select', def: 'mono', options: [['mono', 'Monochromatic'], ['band', 'Broadband']] },
      { key: 'bandwidth', label: 'Spectrum width (nm)', type: 'number', min: 10, max: 600, step: 10, def: 400, show: p => p.bwMode === 'band' },
      { key: 'spread', label: 'Emission angle (°)', type: 'number', min: 10, max: 360, step: 10, def: 360 },
      { key: 'nrays', label: 'Rays', type: 'number', min: 4, max: 32, step: 2, def: 12 },
      P.autoColor, P.color,
    ],
    svg(el) {
      const c = el.params.autoColor === false && el.params.color ? el.params.color : wavelengthToColor(el.params.wavelength);
      let spokes = '';
      for (let i = 0; i < 8; i++) {
        const a = (i * 45) * Math.PI / 180;
        spokes += `<line x1="${(6 * Math.cos(a)).toFixed(1)}" y1="${(6 * Math.sin(a)).toFixed(1)}" x2="${(11 * Math.cos(a)).toFixed(1)}" y2="${(11 * Math.sin(a)).toFixed(1)}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`;
      }
      return `<g transform="scale(${el.params.displayScale || 1})"><circle r="4.5" fill="${c}" stroke="#333" stroke-width="1"/>` + spokes + `</g>`;
    },
    source(el) {
      const { spread, nrays } = el.params, out = [];
      const n = Math.max(1, Math.round(nrays));
      for (let i = 0; i < n; i++) {
        // A full-circle source must not duplicate the -180°/+180° sample.
        const aDeg = spread >= 359.999
          ? 360 * i / n
          : (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1));
        const a = aDeg * Math.PI / 180;
        out.push({ x: 0, y: 0, dx: Math.cos(a), dy: Math.sin(a), evan: true, evanLen: 110 });
      }
      return out;
    },
  },

  // ---------------- Mirrors ----------------
  mirror: {
    label: 'Mirror', category: 'Mirrors', paletteOrder: 0, size: { w: 14, h: 56 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      ...reflectivityParams(),
    ],
    size_: el => ({ w: 14, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      return `<line x1="0" y1="${-L}" x2="0" y2="${L}" stroke="#444" stroke-width="3.5"/>` + hatch(-1.5, -L, L - 6, -1, Math.round(el.params.length / 8));
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'mirror', data: { refl: el.params.refl, showTransmitted: el.params.showTransmitted } }];
    },
  },

  galvo: {
    label: 'Galvo mirror', category: 'Mirrors', paletteOrder: 4, size: { w: 30, h: 40 },
    size_: el => {
      const L = Math.max(6, el.params.length || 20);
      const sweep = Math.abs(el.params.commandAngle || 0) + (el.params.scanMode === 'static' ? 0 : Math.abs(el.params.scanAmplitude || 0));
      const a = Math.min(45, sweep) * Math.PI / 180;
      return { w: Math.max(30, L * Math.sin(a) + 18), h: Math.max(40, L * Math.cos(a) + 18) };
    },
    params: [
      { key: 'length', label: 'Mirror size (mm)', type: 'number', min: 6, max: 60, step: 2, def: 20 },
      { key: 'commandAngle', label: 'Center mechanical angle (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 0 },
      { key: 'scanMode', label: 'Scan waveform', type: 'select', def: 'static', options: [['static', 'Static'], ['sine', 'Sine scan'], ['triangle', 'Triangle scan']] },
      { key: 'scanAmplitude', label: 'Peak mechanical sweep (°)', type: 'number', min: 0, max: 10, step: 0.5, def: 1, show: p => p.scanMode !== 'static' },
      { key: 'scanFrequencyHz', label: 'Scan frequency (Hz)', type: 'number', min: 0.01, max: 5000, step: 1, def: 100, show: p => p.scanMode !== 'static' },
      { key: 'scanPhaseDeg', label: 'Scan phase (°)', type: 'number', min: -360, max: 360, step: 5, def: 0, show: p => p.scanMode !== 'static' },
      ...reflectivityParams(),
    ],
    svg(el) {
      const L = el.params.length / 2;
      const command = galvoAngleAt(el.params, el._animationTimeS || 0);
      return `<circle r="4.5" fill="#777" stroke="#444" stroke-width="1.2"/>` +
        `<g transform="rotate(${command})"><line x1="0" y1="${-L}" x2="0" y2="${L}" stroke="#444" stroke-width="3"/></g>` +
        `<path d="M -9,${-L - 3} A ${L + 5} ${L + 5} 0 0 1 9,${-L - 3}" fill="none" stroke="#999" stroke-width="1.2" stroke-dasharray="3 2"/>` +
        `<path d="M -9,${L + 3} A ${L + 5} ${L + 5} 0 0 0 9,${L + 3}" fill="none" stroke="#999" stroke-width="1.2" stroke-dasharray="3 2"/>` +
        (el.params.scanMode !== 'static' ? `<circle cx="10" cy="${-L - 5}" r="2.5" fill="#8b5cf6"/>` : '');
    },
    surfaces(el) {
      const L = el.params.length / 2;
      const a = galvoAngleAt(el.params, el._animationTimeS || 0) * Math.PI / 180;
      return [{
        x1: L * Math.sin(a), y1: -L * Math.cos(a), x2: -L * Math.sin(a), y2: L * Math.cos(a), kind: 'mirror',
        data: { refl: el.params.refl, showTransmitted: el.params.showTransmitted },
      }];
    },
  },

  retroreflector: {
    label: 'Retroreflector', category: 'Mirrors', paletteOrder: 5, size: { w: 24, h: 56 },
    size_: el => ({ w: el.params.length / 2 + 10, h: el.params.length + 10 }),
    params: [
      { key: 'moveHeading', label: 'Delay-line movement', type: 'section' },
      { key: 'moveMode', label: 'Motion', type: 'select', def: 'static', options: [['static', 'Static'], ['linear', 'Periodic linear']] },
      { key: 'travel', label: 'Travel range (mm)', type: 'number', min: 0, max: 200, step: 1, def: 50, show: p => p.moveMode === 'linear' },
      { key: 'freqHz', label: 'Frequency (Hz)', type: 'number', min: 0.01, max: 10, step: 0.01, def: 0.2, show: p => p.moveMode === 'linear' },
      { key: 'opticalHeading', label: 'Optical behavior', type: 'section' },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      ...reflectivityParams(),
    ],
    // Apex at the local origin (the element's anchor/pivot point) pointing
    // toward +x, with two mirror arms opening toward -x at exactly 45° each
    // — a right-angle "roof" corner reflector. In 2D this returns any
    // incoming ray exactly antiparallel to its incidence direction
    // (offset in y), independent of incidence angle within its aperture —
    // the defining property of a corner retroreflector, unlike a single
    // flat mirror whose return direction depends on incidence angle.
    svg(el) {
      const L = el.params.length / 2;
      return `<path d="M ${-L},${L} L 0,0 L ${-L},${-L}" fill="#e8eaee" fill-opacity="0.3" stroke="#444" stroke-width="3.5"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      const data = { refl: el.params.refl, showTransmitted: el.params.showTransmitted };
      return [
        { x1: 0, y1: 0, x2: -L, y2: L, kind: 'mirror', data },
        { x1: 0, y1: 0, x2: -L, y2: -L, kind: 'mirror', data },
      ];
    },
  },

  cmirrorx: {
    label: 'Convex mirror', category: 'Mirrors', paletteOrder: 1, size: { w: 18, h: 56 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: 5, max: 2000, step: 5, def: -100, negative: true },
      ...reflectivityParams(),
    ],
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      // bulges toward the incoming beam (from -x)
      return `<path d="M 0,${-L} Q -7,0 0,${L}" fill="none" stroke="#444" stroke-width="3.5"/>` + hatch(1, -L, L - 6, 1, Math.round(el.params.length / 8));
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'cmirror', data: { f: -Math.abs(el.params.f), refl: el.params.refl, showTransmitted: el.params.showTransmitted } }];
    },
  },

  cmirror: {
    label: 'Concave mirror', category: 'Mirrors', paletteOrder: 2, size: { w: 18, h: 56 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: 5, max: 2000, step: 5, def: 100 },
      ...reflectivityParams(),
    ],
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      // hollow toward the incoming beam (from -x): focuses it
      return `<path d="M 0,${-L} Q 7,0 0,${L}" fill="none" stroke="#444" stroke-width="3.5"/>` + hatch(1, -L, L - 6, 1, Math.round(el.params.length / 8));
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'cmirror', data: { f: Math.abs(el.params.f), refl: el.params.refl, showTransmitted: el.params.showTransmitted } }];
    },
  },

  oap: {
    label: 'Parabolic mirror', category: 'Mirrors', paletteOrder: 3, size: { w: 40, h: 90 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 80 },
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: 5, max: 2000, step: 5, def: 50 },
      ...reflectivityParams(),
    ],
    size_: el => {
      const L = el.params.length / 2;
      const sag = (L * L) / (4 * Math.max(5, el.params.f));
      return { w: Math.max(20, 2 * sag + 14), h: el.params.length + 6 };
    },
    svg(el) {
      // true parabola x = -y²/(4f): vertex at the origin, opening toward the
      // incoming beam, focus at (-f, 0). Shorter f -> visibly deeper curve.
      const L = el.params.length / 2, f = Math.max(5, el.params.f);
      const N = 26;
      let dp = '';
      for (let i = 0; i <= N; i++) {
        const y = -L + (2 * L * i) / N;
        const x = -(y * y) / (4 * f);
        dp += (i ? ' L ' : 'M ') + x.toFixed(1) + ',' + y.toFixed(1);
      }
      let ticks = '';
      for (let y = -L + 4; y < L - 3; y += 8) {
        const x = -(y * y) / (4 * f);
        ticks += `<line x1="${(x + 1.5).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + 7).toFixed(1)}" y2="${(y + 5).toFixed(1)}" stroke="#888" stroke-width="1"/>`;
      }
      return `<path d="${dp}" fill="none" stroke="#444" stroke-width="3.5" stroke-linejoin="round"/>` + ticks;
    },
    surfaces(el) {
      // real geometry: the parabola as a chain of small plane mirrors, so
      // reflection off the actual curve sends a collimated beam to the focus
      const L = el.params.length / 2, f = Math.max(5, el.params.f);
      // more segments for deeper curves so marginal rays still hit the focus
      const N = Math.min(64, Math.max(16, Math.round(L / 2 + (L * L) / (6 * f))));
      const segs = [];
      const data = { refl: el.params.refl, showTransmitted: el.params.showTransmitted };
      let py = -L, px = -(py * py) / (4 * f);
      for (let i = 1; i <= N; i++) {
        const y = -L + (2 * L * i) / N;
        const x = -(y * y) / (4 * f);
        segs.push({ x1: px, y1: py, x2: x, y2: y, kind: 'mirror', data });
        px = x; py = y;
      }
      return segs;
    },
  },

  // ---------------- Lenses ----------------
  lens: {
    label: 'Convex lens', category: 'Lenses', paletteOrder: 0, size: { w: 18, h: 56 },
    params: [
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 100 },
      { key: 'dia', label: 'Diameter', type: 'optsize', def: 25.4 },
      { key: 'transEff', label: 'Transmission efficiency (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
    ],
    size_: el => ({ w: 18, h: el.params.dia + 6 }),
    svg(el) { return lensShape(0, el.params.dia / 2, el.params.f); },
    surfaces(el) {
      const h = el.params.dia / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'lens', data: { f: el.params.f, transEff: el.params.transEff } }];
    },
  },

  // A real lens instead of a paraxial one: two spherical surfaces with actual
  // glass between them, refracted by Snell's law at each. Nothing about its
  // focal length is configured — it emerges from the radii, thickness and
  // index, which is exactly why spherical and chromatic aberration come out
  // of it for free rather than being painted on. See thickLensCardinals() for
  // the paraxial summary shown in the inspector.
  thicklens: {
    label: 'Thick lens (spherical)', category: 'Lenses', paletteOrder: 2,
    aliases: ['real lens', 'spherical lens', 'singlet', 'biconvex', 'plano-convex', 'meniscus', 'aberration'],
    params: [
      { key: 'r1', label: 'Front radius R₁ (mm)', type: 'number', min: -2000, max: 2000, step: 1, def: 60, slider: false },
      { key: 'r2', label: 'Rear radius R₂ (mm)', type: 'number', min: -2000, max: 2000, step: 1, def: -60, slider: false },
      { key: 'thickness', label: 'Centre thickness (mm)', type: 'number', min: 0.5, max: 60, step: 0.1, def: 6 },
      { key: 'dia', label: 'Diameter', type: 'optsize', def: 25.4 },
      { key: 'glass', label: 'Glass', type: 'select', def: 'nbk7', options: GLASS_OPTIONS },
      { key: 'transEff', label: 'Per-surface transmission (%)', type: 'number', min: 0, max: 100, step: 1, def: 98 },
      { key: 'shape', label: 'Shape', type: 'readout', readout: p => thickLensShapeName(p) },
      {
        key: 'realizedGeometry', label: 'Geometry used', type: 'readout',
        show: p => Boolean(thickLensAdjustment(p)), readout: p => formatRealizedGeometry(p),
      },
      { key: 'efl', label: 'Focal length at 587.6 nm (mm)', type: 'readout', readout: p => formatFocal(thickLensCardinals(p).f) },
      { key: 'bfd', label: 'Back focal distance at 587.6 nm (mm)', type: 'readout', readout: p => formatFocal(thickLensCardinals(p).bfd) },
    ],
    size_: el => { const g = thickLensGeometry(el.params); return { w: g.span + 6, h: 2 * g.h + 6 }; },
    svg(el) {
      const g = thickLensGeometry(el.params);
      return `<path d="${boundaryPathData(g.points)}" fill="${GLASS}" fill-opacity="0.72" stroke="${GLASS_S}" stroke-width="1.5" stroke-linejoin="round"/>`;
    },
    surfaces(el) {
      const g = thickLensGeometry(el.params);
      // The two spherical faces and their closing rim form one glass boundary.
      // Axial rays outside that boundary miss the clear aperture; a ray that
      // actually reaches the physical rim still exits with the correct medium.
      return boundarySegments(g.points).map((segment, i) => ({
        x1: segment.a.x, y1: segment.a.y, x2: segment.b.x, y2: segment.b.y, kind: 'refract',
        data: {
          material: el.params.glass, transmission: surfaceTransmission(el.params),
          topologyKey: `face-${i}`,
          ...(segment.kind === 'arc' ? { arcPoint: { x: segment.through.x, y: segment.through.y } } : {}),
        },
      }));
    },
    hitTest(el, localPoint, tolerance = 4) {
      const points = thickLensGeometry(el.params).points;
      const sampled = sampleBoundary(points, { maxAngle: Math.PI / 90 });
      return pointInBoundary(localPoint, points)
        || sampled.some((a, i) => distToSegment(localPoint, a, sampled[(i + 1) % sampled.length]) <= tolerance);
    },
    containsLocal(el, localPoint) { return pointInBoundary(localPoint, thickLensGeometry(el.params).points); },
    refractiveIndex(el, wavelength = 550) { return glassIndex(el.params.glass, wavelength) ?? 1.5; },
  },

  telescope: {
    label: 'Telescope (lens pair)', category: 'Lenses', paletteOrder: 3, size: { w: 174, h: 62 },
    size_: el => ({ w: Math.max(30, el.params.f1 + el.params.f2) + 26, h: (el.params.dia || 25.4) + 10 }),
    params: [
      { key: 'f1', label: 'Lens 1 focal (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 100 },
      { key: 'f2', label: 'Lens 2 focal (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 50 },
      { key: 'dia', label: 'Lens diameter', type: 'optsize', def: 25.4 },
      { key: 'transEff', label: 'Transmission efficiency (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
    ],
    svg(el) {
      const p = el.params, s = Math.max(5, p.f1 + p.f2), h = (p.dia || 25.4) / 2;
      return `<line x1="${-s / 2}" y1="0" x2="${s / 2}" y2="0" stroke="#b6bdc6" stroke-width="1" stroke-dasharray="4 4"/>` +
        lensShape(-s / 2, h, p.f1) + lensShape(s / 2, h, p.f2);
    },
    surfaces(el) {
      // Each lens carries the same shared coating spec, so the pair's
      // overall throughput is transEff² — matching two real lenses with
      // matched AR coatings, consistent with how `dia` is already shared.
      const p = el.params, s = Math.max(5, p.f1 + p.f2), h = (p.dia || 25.4) / 2;
      return [
        { x1: -s / 2, y1: -h, x2: -s / 2, y2: h, kind: 'lens', data: { f: p.f1, transEff: p.transEff } },
        { x1: s / 2, y1: -h, x2: s / 2, y2: h, kind: 'lens', data: { f: p.f2, transEff: p.transEff } },
      ];
    },
  },

  objective: {
    // Back (tube-lens/infinity side, where a telescope or scan relay delivers
    // collimated light) is the wide barrel and carries the back pupil; front
    // (sample side) is the narrow tip at local x=+16, the physical boundary
    // the working distance is measured from. The equivalent refracting plane
    // of focal length EFL sits at x = 16 + WD - EFL, always inside the barrel
    // because WD is capped at EFL. It is never drawn — an objective is an
    // opaque barrel, not a visible singlet. See objective.js.
    label: 'Objective', category: 'Lenses', paletteOrder: 4, size: { w: 36, h: 40 },
    snapPt: { x: OBJECTIVE_FRONT_X, y: 0 }, // physical sample-facing front tip
    // The objective owns the medium; immersion.js derives the disposable
    // relationship from this front tip to a compatible scene contact.
    immersionSource: () => ({ x: OBJECTIVE_FRONT_X, y: 0 }),
    size_: el => ({
      w: (OBJECTIVE_FRONT_X - objectiveBackX(el.params)) + 4,
      h: 2 * objectiveBarrelHalfHeight(el.params) + 6,
    }),
    // the barrel is no longer centred on the element origin once it grows
    boxAnchor: el => ({ x: (OBJECTIVE_FRONT_X + objectiveBackX(el.params)) / 2, y: 0 }),
    params: [
      // EFL is the objective's real optical power and the thing the tracer
      // uses. Magnification is what it produces once the user's own tube lens
      // images it, so it is reported rather than set.
      { key: 'efl', label: 'Effective focal length EFL (mm)', type: 'number', min: 1, max: 200, step: 0.1, def: 10 },
      {
        key: 'magnification', label: 'Magnification with a 200 mm tube lens (×)', type: 'readout',
        readout: p => `${objectiveMagnification(p).toFixed(1)}×`,
      },
      // A real objective focuses at or inside its own focal length, so WD
      // starts equal to EFL and can only be shortened from there.
      {
        key: 'workingDistance', label: 'Working distance (mm)', type: 'number',
        min: OBJECTIVE_WD_MIN, max: p => objectiveMaximumWorkingDistance(p), step: 0.1, def: 10,
      },
      {
        key: 'immersion', label: 'Objective medium', type: 'select', def: 'air',
        options: [
          ['air', OBJECTIVE_MEDIA.air.label],
          ['water', OBJECTIVE_MEDIA.water.label],
          ['oil', OBJECTIVE_MEDIA.oil.label],
          ['custom', OBJECTIVE_MEDIA.custom.label],
        ],
        // Accepted only when loading an older high-NA sketch. The inspector
        // shows it as a disabled current value, never as a new choice.
        legacyOptions: [['legacy', OBJECTIVE_MEDIA.legacy.label]],
      },
      {
        key: 'immersionIndex', label: 'Medium index (n)', type: 'number', min: 1, max: 2, step: 0.001, def: 1.333,
        show: p => p.immersion === 'custom',
      },
      {
        key: 'na', label: 'Rated numerical aperture (NA)', type: 'number', min: 0.05,
        max: p => objectiveMaximumNA(p), step: 0.01, def: OBJECTIVE_NA_DEFAULT,
      },
      {
        key: 'acceptanceHalfAngle', label: 'Object-side half-angle θ', type: 'readout',
        readout: p => {
          const angle = objectiveAcceptanceHalfAngleDeg(p);
          return Number.isFinite(angle) ? `${angle.toFixed(1)}°` : 'Resolve medium';
        },
      },
      { key: 'showAcceptance', label: 'Show acceptance angle', type: 'checkbox', def: false },
      // What the rated NA costs you in practice: the back pupil is a real
      // stop, so a beam wider than 2*f*NA loses its overflow to the barrel.
      {
        key: 'pupilFill', label: 'Back-pupil fill', type: 'readout',
        readout: (p, el) => {
          const pupil = objectivePupilDiameter(p);
          const fill = el ? objectivePupilFill(el.id) : null;
          if (!fill) return `${pupil.toFixed(1)} mm pupil · no beam`;
          const ratio = fill.beamDiameter / pupil;
          if (ratio <= 1.001) {
            return `${fill.beamDiameter.toFixed(1)} / ${pupil.toFixed(1)} mm — ${(ratio * 100).toFixed(0)}% filled, all through`;
          }
          return `${fill.beamDiameter.toFixed(1)} / ${pupil.toFixed(1)} mm — overfilled, ` +
            `${(fill.transmitted * 100).toFixed(0)}% through (${((1 - fill.transmitted) * 100).toFixed(0)}% lost)`;
        },
      },
      // Underfilling the pupil does not just waste the rating — it hands you a
      // smaller NA, and with it a bigger focal spot. That is the number the
      // experiment actually runs at, so report it next to the fill.
      {
        key: 'effectiveNA', label: 'Effective NA in use', type: 'readout',
        readout: (p, el) => {
          const rated = objectiveNumericalAperture(p);
          const fill = el ? objectivePupilFill(el.id) : null;
          if (!fill) return `${rated.toFixed(2)} rated · no beam`;
          const effective = rated * Math.min(1, fill.fill);
          if (fill.fill >= 0.999) return `${rated.toFixed(2)} — the full rated NA`;
          return `${effective.toFixed(2)} of ${rated.toFixed(2)} — the pupil is only ` +
            `${(fill.fill * 100).toFixed(0)}% filled, so the spot is ${(rated / effective).toFixed(1)}× wider`;
        },
      },
      { key: 'transEff', label: 'Transmission efficiency (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
      {
        key: 'frontAperture', label: 'Front aperture (mm)', type: 'number', min: 1, max: 100, step: 0.5, def: 20,
        appearance: true,
      },
    ],
    svg(el) {
      const h = objectiveFrontAperture(el.params) / 2;
      const outer = objectiveBarrelHalfHeight(el.params);
      const back = objectiveBackX(el.params);
      // The nose taper is fixed geometry: only the straight rear section
      // lengthens when a short working distance pushes the lens plane back,
      // so a long objective still reads as an objective.
      const shoulder = OBJECTIVE_SHOULDER_X;
      const pupilHalf = Math.min(outer - 1, Math.max(0.8, objectivePupilRadius(el.params)));
      return `<path d="M 16,${-h} L ${shoulder},${-outer} L ${back},${-outer} L ${back},${outer} L ${shoulder},${outer} L 16,${h} Z" fill="#8d98a5" stroke="#4d565f" stroke-width="1.5"/>` +
        `<line x1="${shoulder}" y1="${-outer}" x2="${shoulder}" y2="${outer}" stroke="#4d565f" stroke-width="1"/>` +
        // No lens is drawn: an objective is an opaque barrel. What IS visible
        // at the back is the iris the rated NA leaves open — the dark bars
        // are the metal a beam overfilling the pupil is lost to.
        `<rect x="${back}" y="${-outer}" width="2.4" height="${(outer - pupilHalf).toFixed(2)}" fill="#2f3e4d"/>` +
        `<rect x="${back}" y="${pupilHalf.toFixed(2)}" width="2.4" height="${(outer - pupilHalf).toFixed(2)}" fill="#2f3e4d"/>` +
        // the front tip is a boundary, not a slab of glass: a working distance
        // shorter than a drawn thickness would otherwise look like it focused
        // inside solid glass
        `<line x1="16" y1="${-h}" x2="16" y2="${h}" stroke="${GLASS_S}" stroke-width="2"/>`;
    },
    surfaces(el) {
      const lensX = objectiveLensPlaneX(el.params);
      const outer = objectiveBarrelHalfHeight(el.params);
      const pupil = Math.min(outer, objectivePupilRadius(el.params));
      // The stop sits at the back focal plane, which for an infinity objective
      // is where its entrance pupil is — see objectiveStopX. Its outer extent
      // follows the barrel at that point so it cannot swallow light that
      // visually passes outside the housing.
      const stopX = objectiveStopX(el.params);
      const stopOuter = objectiveBarrelHalfHeightAt(el.params, stopX);
      // The stop starts a hair outside the rated pupil, and the clear bore
      // matches it. A beam sized to exactly fill the pupil lands its edge rays
      // right on the boundary, and without this margin the stop — which the
      // ray reaches first — would swallow them and report a full beam as lost.
      const edge = Math.min(outer, pupil + 0.02);
      const shared = {
        effectiveFocalLength: objectiveEffectiveFocalLength(el.params),
        workingDistance: objectiveWorkingDistance(el.params),
        objectiveMediumIndex: objectiveMediumIndex(el.params),
        // A legacy >1 NA is kept in the editor so old sketches are not
        // rewritten with an invented medium. Until the author resolves
        // that medium, however, it is not a configured NA that downstream
        // sample calculations or handoffs may rely on.
        ...(objectiveMediumKey(el.params) === 'legacy'
          ? {}
          : { objectiveNA: objectiveNumericalAperture(el.params) }),
      };
      // `pupilSpan` is the segment's local y-range, so the tracer can turn a
      // hit into a distance from the barrel axis for the overfill readout.
      return [{
        // The equivalent refracting plane carries the objective's REAL focal
        // length, positioned so that collimated light focuses exactly one
        // working distance beyond the front tip. That is what makes the back
        // focal plane a true conjugate and the magnification honest. Its
        // clear aperture is the rated pupil, so NA really does set the
        // convergence angle of a beam that fills it.
        x1: lensX, y1: -edge, x2: lensX, y2: edge, kind: 'lens',
        data: {
          ...shared, f: shared.effectiveFocalLength, transEff: el.params.transEff,
          pupilRadius: pupil, pupilSpan: [-edge, edge],
        },
      },
      // The metal around the pupil. Overfilling it is normal practice — you do
      // it to reach the full rated NA — and the light that lands outside is
      // genuinely lost, so it stops here rather than sailing through as if the
      // housing were not there.
      ...(stopOuter > edge + 0.01 ? [
        { x1: stopX, y1: edge, x2: stopX, y2: stopOuter, kind: 'absorb', data: { ...shared, pupilRadius: pupil, pupilSpan: [edge, stopOuter] } },
        { x1: stopX, y1: -edge, x2: stopX, y2: -stopOuter, kind: 'absorb', data: { ...shared, pupilRadius: pupil, pupilSpan: [-edge, -stopOuter] } },
      ] : [])];
    },
  },

  // ---------------- Filters & splitters ----------------
  dichroic: {
    label: 'Dichroic mirror', category: 'Filters & Splitters', paletteOrder: 3, size: { w: 14, h: 56 },
    params: [
      { key: 'dtype', label: 'Type', type: 'select', def: 'longpass', options: [['longpass', 'Longpass (transmit long λ)'], ['shortpass', 'Shortpass (transmit short λ)'], ['bandpass', 'Bandpass']] },
      { key: 'cutoff', label: 'Cutoff (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 550, show: p => p.dtype !== 'bandpass' },
      { key: 'center', label: 'Band center (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 550, show: p => p.dtype === 'bandpass' },
      { key: 'band', label: 'Band width (nm)', type: 'number', min: 1, max: 2000, step: 5, def: 50, show: p => p.dtype === 'bandpass' },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    size_: el => ({ w: 14, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      return `<rect x="-3" y="${-L}" width="6" height="${el.params.length}" fill="#dfeef7" stroke="#5d7f96" stroke-width="1.5"/>` +
        `<line x1="-3" y1="${-L}" x2="-3" y2="${L}" stroke="#b04ad0" stroke-width="2"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2, p = el.params;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'dichroic', data: { dtype: p.dtype, cutoff: p.cutoff, center: p.center, band: p.band } }];
    },
  },

  filter: {
    label: 'Filter', category: 'Filters & Splitters', paletteOrder: 2, size: { w: 12, h: 42 },
    params: [
      { key: 'ftype', label: 'Type', type: 'select', def: 'bandpass', options: [['bandpass', 'Bandpass'], ['longpass', 'Longpass'], ['shortpass', 'Shortpass'], ['nd', 'Neutral density']] },
      { key: 'cutoff', label: 'Cutoff (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 500, show: p => p.ftype === 'longpass' || p.ftype === 'shortpass' },
      { key: 'center', label: 'Band center (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 525, show: p => p.ftype === 'bandpass' },
      { key: 'band', label: 'Band width (nm)', type: 'number', min: 1, max: 2000, step: 5, def: 40, show: p => p.ftype === 'bandpass' },
      { key: 'trans', label: 'Transmission (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.5, show: p => p.ftype === 'nd' },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    size_: el => ({ w: 12, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      const fill = el.params.ftype === 'nd' ? '#9aa0a6' : '#bfe3c9';
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="${fill}" stroke="#557" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2, p = el.params;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'filter', data: { ftype: p.ftype, cutoff: p.cutoff, center: p.center, band: p.band, trans: p.trans } }];
    },
  },

  bs: {
    label: 'Beamsplitter', category: 'Filters & Splitters', paletteOrder: 1, size: { w: 30, h: 30 },
    size_: el => ({ w: (el.params.size || 26) + 4, h: (el.params.size || 26) + 4 }),
    params: [
      { key: 'ratio', label: 'Transmission (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: 'size', label: 'Cube size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const s = (el.params.size || 26) / 2;
      return `<rect x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.5"/>` +
        `<line x1="${-s}" y1="${s}" x2="${s}" y2="${-s}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const s = (el.params.size || 26) / 2;
      return [{ x1: -s, y1: s, x2: s, y2: -s, kind: 'split', data: { ratio: el.params.ratio } }];
    },
  },

  // ---------------- Polarization ----------------
  polarizer: {
    label: 'Polarizer', category: 'Polarization', size: { w: 24, h: 56 },
    size_: el => ({ w: 24, h: el.params.length + 6 }),
    params: [
      { key: 'pangle', label: 'Axis angle (°)', type: 'number', min: 0, max: 180, step: 5, def: 0 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2, a = el.params.pangle;
      // The transmission axis is drawn along the lab horizontal at 0° and
      // sweeps to vertical at 90°, matching how every polarization readout in
      // the app (probe glyph, detector "Linear N°") already draws that angle.
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="#cfd8e3" stroke="#54606e" stroke-width="1.4"/>` +
        `<g transform="rotate(${-a})"><circle r="8.5" fill="#fff" stroke="#54606e" stroke-width="1.2"/>` +
        `<line x1="-6" y1="0" x2="6" y2="0" stroke="#54606e" stroke-width="1.6"/>` +
        `<path d="M -8,0 L -4,-2.4 L -4,2.4 Z M 8,0 L 4,-2.4 L 4,2.4 Z" fill="#54606e"/></g>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'polarizer', data: { a: el.params.pangle } }];
    },
  },

  hwp: {
    label: 'λ/2 waveplate', category: 'Polarization', size: { w: 18, h: 56 },
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    params: [
      { key: 'a', label: 'Fast axis (°)', type: 'number', min: 0, max: 180, step: 5, def: 22.5 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2;
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="#f3e3c3" stroke="#a08340" stroke-width="1.4"/>` +
        `<text x="0" y="${-L - 6}" text-anchor="middle" dominant-baseline="central" font-size="8.5" fill="#7a6430" ${isFlipped(el) ? `transform="rotate(180 0 ${-L - 6})"` : ''}>λ/2</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'wp', data: { a: el.params.a, half: true } }];
    },
  },

  qwp: {
    label: 'λ/4 waveplate', category: 'Polarization', size: { w: 18, h: 56 },
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    params: [
      { key: 'a', label: 'Fast axis (°)', type: 'number', min: 0, max: 180, step: 5, def: 45 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2;
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="#e8d5ef" stroke="#8a5fa8" stroke-width="1.4"/>` +
        `<text x="0" y="${-L - 6}" text-anchor="middle" dominant-baseline="central" font-size="8.5" fill="#6a4a80" ${isFlipped(el) ? `transform="rotate(180 0 ${-L - 6})"` : ''}>λ/4</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'wp', data: { a: el.params.a, half: false } }];
    },
  },

  pbs: {
    label: 'Polarizing BS', category: 'Polarization', size: { w: 30, h: 30 },
    size_: el => ({ w: (el.params.size || 26) + 4, h: (el.params.size || 26) + 4 }),
    params: [{ key: 'size', label: 'Cube size', type: 'optsize', def: 25.4 }],
    svg(el) {
      const s = (el.params.size || 26) / 2;
      return `<rect x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" fill="#d5e3f0" stroke="#3f6a92" stroke-width="1.6"/>` +
        `<line x1="${-s}" y1="${s}" x2="${s}" y2="${-s}" stroke="#3f6a92" stroke-width="1.6"/>` +
        `<text x="${-s}" y="${s + 8}" text-anchor="start" dominant-baseline="central" font-size="8.5" fill="#3f6a92" font-weight="600" ${isFlipped(el) ? `transform="rotate(180 ${-s} ${s + 8})"` : ''}>PBS</text>`;
    },
    surfaces(el) {
      const s = (el.params.size || 26) / 2;
      return [{ x1: -s, y1: s, x2: s, y2: -s, kind: 'pbs' }];
    },
  },

  isolator: {
    label: 'Optical isolator', category: 'Polarization', size: { w: 50, h: 26 },
    size_: el => ({ w: 50, h: (el.params.aperture || 22) + 4 }),
    params: [{ key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 8, max: 100, step: 2, def: 22 }],
    svg(el) {
      const h = (el.params.aperture || 22) / 2;
      return `<rect x="-23" y="${-h}" width="46" height="${2 * h}" rx="${Math.min(11, h)}" fill="#6b7280" stroke="#3f4650" stroke-width="1.5"/>` +
        `<path d="M -12,0 L 10,0 M 10,0 L 3,-5 M 10,0 L 3,5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    },
    surfaces: el => {
      const h = (el.params.aperture || 22) / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'isolator' }];
    },
  },

  // ---------------- Dispersive elements ----------------
  grating: {
    label: 'Diffraction grating', category: 'Dispersive elements', size: { w: 16, h: 56 },
    params: [
      { key: 'lines', label: 'Lines / mm', type: 'number', min: 50, max: 3600, step: 50, def: 600 },
      { key: 'orders', label: 'Orders (e.g. -1,0,1)', type: 'text', def: '1' },
      { key: 'transmissive', label: 'Transmissive', type: 'checkbox', def: false },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    size_: el => ({ w: 16, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      let ticks = '';
      for (let y = -L + 3; y <= L - 3; y += 5) ticks += `<line x1="0" y1="${y}" x2="4" y2="${y}" stroke="#333" stroke-width="1"/>`;
      return `<rect x="0" y="${-L}" width="6" height="${el.params.length}" fill="#e8e0f0" stroke="#5d5575" stroke-width="1.5"/>` + ticks;
    },
    surfaces(el) {
      const L = el.params.length / 2, p = el.params;
      const orders = [...new Set(String(p.orders).split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n)))].slice(0, 21);
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'grating', data: { d: 1e6 / p.lines, orders: orders.length ? orders : [1], transmissive: p.transmissive } }];
    },
  },

  slit: {
    label: 'Slit', category: 'Beam Block', size: { w: 10, h: 56 },
    params: [
      { key: 'gap', label: 'Gap (mm)', type: 'number', min: 0.5, max: 60, step: 0.5, def: 8 },
      { key: 'length', label: 'Plate size', type: 'optsize', def: 50.8 },
    ],
    size_: el => ({ w: 10, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2, g = Math.min(L, el.params.gap / 2);
      if (g >= L) return '';
      return `<rect x="-2.5" y="${-L}" width="5" height="${L - g}" fill="#333"/>` +
        `<rect x="-2.5" y="${g}" width="5" height="${L - g}" fill="#333"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2, g = Math.min(L, el.params.gap / 2);
      if (g >= L) return [];
      return [
        { x1: 0, y1: -L, x2: 0, y2: -g, kind: 'absorb' },
        { x1: 0, y1: g, x2: 0, y2: L, kind: 'absorb' },
      ];
    },
  },

  prism: {
    label: 'Prism', category: 'Dispersive elements', size: { w: 44, h: 44 },
    size_: el => { const g = prismGeometry(el); return { w: g.width + 6, h: g.height + 6 }; },
    params: [
      { key: 'apex', label: 'Apex angle (°)', type: 'number', min: 10, max: 80, step: 5, def: 60 },
      { key: 'psize', label: 'Size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const g = prismGeometry(el);
      return `<path d="M ${g.top.x},${g.top.y} L ${g.left.x},${g.left.y} L ${g.right.x},${g.right.y} Z" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const { left, top, right } = prismGeometry(el);
      const data = { material: 'nbk7', transmission: 0.98 };
      return [
        { x1: left.x, y1: left.y, x2: top.x, y2: top.y, kind: 'refract', data: { ...data, topologyKey: 'edge-0' } },
        { x1: top.x, y1: top.y, x2: right.x, y2: right.y, kind: 'refract', data: { ...data, topologyKey: 'edge-1' } },
        { x1: right.x, y1: right.y, x2: left.x, y2: left.y, kind: 'refract', data: { ...data, topologyKey: 'edge-2' } },
      ];
    },
  },

  freeglass: {
    label: 'Freeform glass', category: 'Dispersive elements', paletteOrder: 3,
    aliases: ['custom prism', 'polygon glass', 'arbitrary glass', 'glass polygon', 'curved glass', 'circular arc glass'],
    construction: { kind: 'polygon', pointsKey: 'vertices', minPoints: 3, circularArcs: true },
    size_(el) {
      const b = boundaryBounds(freeglassPoints(el));
      return { w: b.x1 - b.x0 + 6, h: b.y1 - b.y0 + 6 };
    },
    params: [
      { key: 'vertices', label: 'Boundary points', type: 'boundary', def: FREEGLASS_DEFAULT, hidden: true },
      { key: 'scale', label: 'Overall scale', type: 'number', min: 0.1, max: 10, step: 0.05, def: 1 },
      { key: 'material', label: 'Glass model', type: 'select', def: 'constant', options: [['constant', 'Constant index'], ...GLASS_OPTIONS] },
      { key: 'ior', label: 'Refractive index', type: 'number', min: 1.01, max: 2.5, step: 0.01, def: 1.5, show: p => p.material === 'constant' },
      { key: 'transEff', label: 'Per-surface transmission (%)', type: 'number', min: 0, max: 100, step: 1, def: 98 },
    ],
    svg(el) {
      const path = boundaryPathData(freeglassPoints(el));
      return `<path d="${path}" fill="${GLASS}" fill-opacity="0.72" stroke="${GLASS_S}" stroke-width="1.5" stroke-linejoin="round"/>`;
    },
    surfaces(el) {
      const points = freeglassPoints(el);
      const material = isDispersiveGlass(el.params.material) ? el.params.material : undefined;
      return boundarySegments(points).map((segment, i) => ({
        x1: segment.a.x, y1: segment.a.y, x2: segment.b.x, y2: segment.b.y, kind: 'refract',
        data: {
          material, ior: el.params.ior, transmission: surfaceTransmission(el.params),
          topologyKey: `edge-${i}`,
          ...(segment.kind === 'arc'
            ? { arcPoint: { x: segment.through.x, y: segment.through.y } }
            : {}),
        },
      }));
    },
    editPoints: {
      get: freeglassPoints,
      candidate: freeglassEditCandidate,
      hint: 'blue anchors and purple curve nodes reshape the boundary',
    },
    hitTest(el, localPoint, tolerance = 4) {
      const points = freeglassPoints(el);
      const sampled = sampleBoundary(points, { maxAngle: Math.PI / 90 });
      return pointInBoundary(localPoint, points)
        || sampled.some((a, i) => distToSegment(localPoint, a, sampled[(i + 1) % sampled.length]) <= tolerance);
    },
    containsLocal(el, localPoint) { return pointInBoundary(localPoint, freeglassPoints(el)); },
    refractiveIndex(el, wavelength = 550) {
      return glassIndex(el.params.material, wavelength)
        ?? Math.min(2.5, Math.max(1.01, el.params.ior || 1.5));
    },
  },

  diffuser: {
    label: 'Diffuser', category: 'Dispersive elements', size: { w: 14, h: 56 },
    size_: el => ({ w: 14, h: el.params.length + 6 }),
    params: [
      { key: 'div', label: 'Divergence (°)', type: 'number', min: 0.5, max: 40, step: 0.5, def: 8 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2;
      let rough = `M -3,${-L}`;
      for (let y = -L; y < L - 1; y += 3) rough += ` L ${-3 - (y % 6 === 0 ? 1.8 : 0.4)},${y + 1.5}`;
      rough += ` L -3,${L}`;
      return `<rect x="-3" y="${-L}" width="6" height="${el.params.length}" fill="#eceef1" stroke="#6b7280" stroke-width="1.3"/>` +
        `<path d="${rough}" fill="none" stroke="#6b7280" stroke-width="1"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'diffuser', data: { div: el.params.div } }];
    },
  },

  // ---------------- Wavefront shaping ----------------
  slm: {
    label: 'SLM', category: 'Wavefront Shaping', size: { w: 30, h: 50 },
    snapPt: { x: -9, y: 0 }, // active face
    params: [
      { key: 'transmissive', label: 'Transmissive', type: 'checkbox', def: false },
      { key: 'length', label: 'Active size (mm)', type: 'number', min: 10, max: 100, step: 2, def: 40 },
      { key: 'zeroOrder', label: '0th-order reflection', type: 'checkbox', def: false },
      { key: 'zeroFrac', label: '0th-order fraction (0–1)', type: 'number', min: 0.01, max: 0.9, step: 0.01, def: 0.1, show: p => p.zeroOrder },
      layersParam,
    ],
    size_: el => ({ w: 30, h: el.params.length + 10 }),
    svg(el) {
      const L = el.params.length / 2;
      let px = '';
      for (let y = -L + 2; y < L - 1; y += 5) px += `<line x1="-11" y1="${y}" x2="-7" y2="${y}" stroke="#4ac0b0" stroke-width="2.5"/>`;
      return `<rect x="-9" y="${-L - 3}" width="20" height="${el.params.length + 6}" rx="2" fill="#3a4750" stroke="#222b31" stroke-width="1.5"/>` + px +
        `<text x="3" y="0" text-anchor="middle" dominant-baseline="central" font-size="8.5" font-weight="600" fill="#fff" transform="rotate(${sideTextRot(el)} 3 0)">SLM</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      const body = el.params.transmissive ? [] : shaperBody(-9, 11, L, L + 3);
      return [{
        x1: -9, y1: -L, x2: -9, y2: L, kind: 'shaper',
        data: {
          layers: el.params.layers || [], length: el.params.length, transmissive: !!el.params.transmissive,
          zeroOrder: !!el.params.zeroOrder, zeroFrac: el.params.zeroFrac || 0.1,
        },
      }, ...body];
    },
  },

  dmd: {
    label: 'DMD', category: 'Wavefront Shaping', size: { w: 30, h: 50 },
    snapPt: { x: -9, y: 0 }, // active face
    params: [
      { key: 'length', label: 'Active size (mm)', type: 'number', min: 10, max: 100, step: 2, def: 40 },
      { key: 'tilt', label: 'Micromirror tilt (°)', type: 'number', min: 1, max: 20, step: 0.5, def: 12 },
      { key: 'pitch', label: 'Pattern pitch (mm)', type: 'number', min: 1, max: 40, step: 0.5, def: 8 },
      { key: 'duty', label: 'ON fraction (0–1)', type: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5 },
      { key: 'routeOff', label: 'Show OFF order', type: 'checkbox', def: false },
    ],
    size_: el => ({ w: 30, h: el.params.length + 10 }),
    svg(el) {
      const L = el.params.length / 2;
      let mm = '';
      for (let y = -L + 4; y < L - 2; y += 6) mm += `<line x1="-11" y1="${y + 2}" x2="-7" y2="${y - 2}" stroke="#cfd6dd" stroke-width="1.6"/>`;
      return `<rect x="-9" y="${-L - 3}" width="20" height="${el.params.length + 6}" rx="2" fill="#2e3a42" stroke="#1b2329" stroke-width="1.5"/>` + mm +
        `<text x="3" y="0" text-anchor="middle" dominant-baseline="central" font-size="8.5" font-weight="600" fill="#fff" transform="rotate(${sideTextRot(el)} 3 0)">DMD</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{
        x1: -9, y1: -L, x2: -9, y2: L, kind: 'dmd',
        data: {
          length: el.params.length, tilt: el.params.tilt, pitch: el.params.pitch,
          duty: el.params.duty, routeOff: el.params.routeOff,
        },
      }, ...shaperBody(-9, 11, L, L + 3)];
    },
  },

  dm: {
    label: 'Deformable mirror', category: 'Wavefront Shaping', size: { w: 22, h: 56 },
    params: [
      { key: 'length', label: 'Aperture (mm)', type: 'number', min: 10, max: 100, step: 2, def: 50 },
      { key: 'f', label: 'Defocus focal length (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 200 },
      { key: 'steer', label: 'Tip / tilt (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 0 },
    ],
    size_: el => ({ w: 22, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      // wavy membrane
      const nW = Math.max(3, Math.round(el.params.length / 12));
      const step = el.params.length / nW;
      let d = `M 0,${-L}`, side = 1;
      for (let i = 0; i < nW; i++) {
        const y = -L + i * step;
        d += ` Q ${3 * side},${y + step / 2} 0,${y + step}`;
        side = -side;
      }
      let act = '';
      for (let y = -L + 2; y < L - 4; y += 7) act += `<rect x="4" y="${y}" width="4" height="4" fill="#8d98a5"/>`;
      return `<rect x="8" y="${-L}" width="4" height="${el.params.length}" fill="#4d565f"/>` + act +
        `<path d="${d}" fill="none" stroke="#444" stroke-width="2.5"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{
        x1: 0, y1: -L, x2: 0, y2: L, kind: 'dm',
        data: { f: el.params.f, steer: el.params.steer },
      }, ...shaperBody(0, 12, L, L)];
    },
  },

  // ---------------- Detectors ----------------
  detector: {
    label: 'Photodetector', category: 'Detectors', readoutKind: 'detector', size: { w: 40, h: 30 },
    snapPt: { x: -19, y: 0 }, // entrance window
    dataPort: { x: 20, y: 0 },
    size_: el => ({ w: 40, h: (el.params.aperture || 26) + 4 }),
    params: [{ key: 'aperture', label: 'Sensor height (mm)', type: 'number', min: 6, max: 120, step: 2, def: 26 }],
    svg(el) {
      const h = el.params.aperture || 26;
      return boxSVG(36, h, '#4b5563', '#2b333d', 'PD', null, isFlipped(el)) +
        `<rect x="-19.5" y="${-(h - 8) / 2}" width="3" height="${h - 8}" fill="#93c5fd" stroke="#2b333d" stroke-width="1"/>` +
        signalLamp(el, 11, -h / 2 + 5);
    },
    surfaces: el => detectorSurfaces(38, el.params.aperture || 26, 'Photodetector'),
  },

  pmt: {
    label: 'PMT', category: 'Detectors', readoutKind: 'pmt', size: { w: 54, h: 30 },
    snapPt: { x: -25, y: 0 }, // entrance window
    dataPort: { x: 27, y: 0 },
    size_: el => ({ w: 54, h: (el.params.aperture || 26) + 4 }),
    params: [
      { key: 'aperture', label: 'Photocathode height (mm)', type: 'number', min: 6, max: 120, step: 2, def: 26 },
      { key: 'gain', label: 'Qualitative gain', type: 'number', min: 1, max: 1000, step: 1, def: 10 },
      { key: 'saturation', label: 'Output saturation', type: 'number', min: 1, max: 10000, step: 10, def: 100 },
    ],
    svg(el) {
      const h = el.params.aperture || 26;
      return `<rect x="-25" y="${-h / 2}" width="50" height="${h}" rx="${Math.min(13, h / 2)}" fill="#4b5563" stroke="#2b333d" stroke-width="1.5"/>` +
        `<rect x="-27" y="${-(h - 8) / 2}" width="4" height="${h - 8}" fill="#93c5fd" stroke="#2b333d" stroke-width="1"/>` +
        `<text x="2" y="0" ${isFlipped(el) ? 'transform="rotate(180 2 0)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="600" fill="#fff">PMT</text>` +
        signalLamp(el, 16, -h / 2 + 6);
    },
    surfaces: el => detectorSurfaces(52, el.params.aperture || 26, 'PMT', { gain: el.params.gain, saturation: el.params.saturation }),
  },

  camera: {
    label: 'Camera', category: 'Detectors', readoutKind: 'camera', size: { w: 44, h: 34 },
    snapPt: { x: -22, y: 0 }, // sensor face
    dataPort: { x: 22, y: 0 },
    size_: el => ({ w: 44, h: (el.params.ch || 30) + 4 }),
    params: [
      { key: 'ch', label: 'Sensor height (mm)', type: 'number', min: 20, max: 150, step: 2, def: 30 },
      { key: 'pixels', label: '1D pixels', type: 'number', min: 8, max: 64, step: 1, def: 16 },
    ],
    svg(el) {
      const h = el.params.ch || 30;
      return boxSVG(40, h, '#4b5563', '#2b333d', 'CAM', null, isFlipped(el)) +
        `<rect x="-24" y="${-(h - 16) / 2}" width="5" height="${h - 16}" fill="#333" stroke="#2b333d"/>` +
        signalLamp(el, 13, -h / 2 + 7);
    },
    surfaces: el => detectorSurfaces(44, el.params.ch || 30, 'Camera sensor', { pixels: el.params.pixels }),
  },

  eye: {
    label: 'Human eye', category: 'Detectors', readoutKind: 'retina', size: { w: 36, h: 36 },
    snapPt: { x: -15, y: 0 }, // pupil
    dataPort: el => ({ x: (el.params.diameter || 30) / 2 + 3, y: 0 }),
    size_: el => ({ w: (el.params.diameter || 30) + 6, h: (el.params.diameter || 30) + 6 }),
    params: [
      { key: 'diameter', label: 'Eye diameter (mm)', type: 'number', min: 18, max: 60, step: 1, def: 30 },
      { key: 'pupil', label: 'Pupil diameter (mm)', type: 'number', min: 2, max: 12, step: 0.5, def: 12 },
      { key: 'focus', label: 'Lens focal length (mm)', type: 'number', min: 20, max: 35, step: 0.5, def: 30 },
    ],
    svg(el) {
      const scale = (el.params.diameter || 30) / 30;
      return `<g transform="scale(${scale})"><circle r="15" fill="#fff" stroke="#4d565f" stroke-width="1.5"/>` +
        // cornea bulge over the pupil
        `<path d="M -14.2,-7 Q -21,0 -14.2,7" fill="rgba(160,200,240,0.45)" stroke="#4a7fa8" stroke-width="1.2"/>` +
        // iris above and below the pupil
        `<path d="M -14.5,-9 L -10.5,-5.5" stroke="#7a5230" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M -14.5,9 L -10.5,5.5" stroke="#7a5230" stroke-width="2.4" stroke-linecap="round"/>` +
        // crystalline lens
        `<ellipse cx="-8.5" cy="0" rx="3" ry="6.5" fill="#cfe4f5" stroke="#4a7fa8" stroke-width="1"/>` +
        // retina
        `<path d="M 7,-13 A 15 15 0 0 1 7,13" fill="none" stroke="#c86a6a" stroke-width="2.5"/></g>`;
    },
    surfaces(el) {
      // the pupil acts as an ideal lens that focuses collimated light onto
      // the retina; the rest of the eyeball absorbs
      const scale = (el.params.diameter || 30) / 30;
      const radius = 15 * scale, retina = 13 * scale;
      const h = Math.min(radius * 0.8, Math.max(1, el.params.pupil / 2));
      return [
        { x1: -radius, y1: -h, x2: -radius, y2: h, kind: 'lens', data: { f: el.params.focus } },
        { x1: -radius, y1: -radius, x2: -radius, y2: -h, kind: 'absorb' },
        { x1: -radius, y1: h, x2: -radius, y2: radius, kind: 'absorb' },
        { x1: -radius, y1: -radius, x2: radius, y2: -radius, kind: 'absorb' },
        { x1: -radius, y1: radius, x2: radius, y2: radius, kind: 'absorb' },
        { x1: radius, y1: -retina, x2: radius, y2: retina, kind: 'detector', data: { aperture: 2 * retina, detectorType: 'Retina' } },
      ];
    },
  },

  display: {
    label: 'Sensor display', category: 'Detectors', paletteOrder: 10, size: { w: 98, h: 72 },
    aliases: ['screen', 'monitor', 'readout', 'oscilloscope', 'data acquisition', 'DAQ'],
    rotatable: false,
    paramsTitle: 'Signal connection',
    size_: el => {
      const scale = displayRenderScale(el.params.displayScale);
      return { w: 98 * scale, h: 72 * scale };
    },
    params: [
      { key: 'sensorId', label: 'Sensor input', type: 'sensor', def: '' },
      { key: 'displayScale', label: 'Display scale', type: 'number', min: 0.25, max: 1.5, step: 0.05, def: 1 },
      { key: 'screenOn', label: 'Power', type: 'checkbox', def: true, hidden: true },
      { key: 'displayView', label: 'View', type: 'select', def: 'main', options: [['main', 'Primary'], ['spectrum', 'Wavelength samples'], ['detail', 'Detail']], hidden: true },
    ],
    directHint: 'Use the blue handles to resize · PWR, INPUT, and VIEW operate directly on the display.',
    svg: displayScreenSVG,
    surfaces: () => [],
  },

  beamdump: {
    label: 'Beam dump', category: 'Beam Block', size: { w: 24, h: 26 },
    size_: el => ({ w: 24, h: (el.params.aperture || 22) + 4 }),
    params: [{ key: 'aperture', label: 'Absorber height (mm)', type: 'number', min: 6, max: 120, step: 2, def: 22 }],
    svg(el) {
      const h = (el.params.aperture || 22) / 2;
      return `<path d="M -10,${-h} L 10,${-h} L 10,${h} L -10,${h} Z M -10,${-h} L 4,0 L -10,${h}" fill="#26292e" stroke="#111" stroke-width="1.5"/>`;
    },
    surfaces: el => rectAbsorb(20, el.params.aperture || 22),
  },

  // ---------------- Modulators & misc ----------------
  aom: {
    label: 'AOM', category: 'Modulators', size: { w: 44, h: 30 },
    size_: el => ({ w: 44, h: (el.params.aperture || 26) + 4 }),
    params: [
      { key: 'aperture', label: 'Active aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 26 },
      { key: 'deflect', label: 'Deflection (°)', type: 'number', min: -45, max: 45, step: 0.5, def: 4 },
      { key: 'rfMHz', label: 'RF frequency (MHz)', type: 'number', min: -10000, max: 10000, step: 1, def: 80 },
      { key: 'zero', label: 'Keep 0th order', type: 'checkbox', def: false },
      { key: 'eff', label: 'Efficiency (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.85 },
      { key: 'modulate', label: 'Modulate RF drive', type: 'checkbox', def: false },
      { key: 'modShape', label: 'Modulation waveform', type: 'select', def: 'square', options: [['square', 'RF on/off'], ['sine', 'Sinusoidal intensity']], show: p => p.modulate },
      { key: 'modFreqMHz', label: 'Modulation frequency (MHz)', type: 'number', min: 0.000001, max: 1000, step: 0.001, def: 1, show: p => p.modulate },
      { key: 'chopDuty', label: 'On fraction (0–1)', type: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5, show: p => p.modulate && p.modShape !== 'sine' },
      { key: 'modDepth', label: 'Modulation depth (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 1, show: p => p.modulate && p.modShape === 'sine' },
      { key: 'phaseNs', label: 'Modulation offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0, show: p => p.modulate },
    ],
    svg(el) { return boxSVG(40, el.params.aperture || 26, '#c9b458', '#8a7a2e', 'AOM', '#3d3616', isFlipped(el)); },
    surfaces(el) {
      const p = el.params;
      return [{
        x1: 0, y1: -(p.aperture || 26) / 2, x2: 0, y2: (p.aperture || 26) / 2, kind: 'aom',
        data: {
          deflect: p.deflect, rfMHz: p.rfMHz, zero: p.zero, eff: p.eff,
          gate: p.modulate ? {
            frequencyMHz: p.modFreqMHz, duty: p.chopDuty, phaseNs: p.phaseNs,
            shape: p.modShape, depth: p.modDepth,
          } : null,
        },
      }];
    },
  },

  aotf: {
    label: 'AOTF', category: 'Modulators', size: { w: 56, h: 30 },
    size_: el => ({ w: 56, h: (el.params.aperture || 26) + 4 }),
    params: [
      { key: 'aperture', label: 'Active aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 26 },
      { key: 'center', label: 'Selected wavelength (nm)', type: 'number', min: 150, max: 8000, step: 1, def: 532 },
      { key: 'band', label: 'Passband width (nm)', type: 'number', min: 0.5, max: 2000, step: 0.5, def: 1 },
      { key: 'deflect', label: 'Deflection (°)', type: 'number', min: -45, max: 45, step: 0.5, def: 4 },
      { key: 'rfMHz', label: 'RF frequency (MHz)', type: 'number', min: -10000, max: 10000, step: 1, def: 80 },
      { key: 'eff', label: 'Selected-order efficiency (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.8 },
    ],
    svg(el) {
      return boxSVG(52, el.params.aperture || 26, '#7fc7c4', '#397b78', 'AOTF', '#153b39', isFlipped(el));
    },
    surfaces(el) {
      const p = el.params, h = (p.aperture || 26) / 2;
      // Qualitative composition of a narrow spectral selector and its selected
      // acousto-optic order; this does not imply a calibrated device response.
      return [
        { x1: -1, y1: -h, x2: -1, y2: h, kind: 'filter', data: { ftype: 'bandpass', center: p.center, band: p.band } },
        { x1: 1, y1: -h, x2: 1, y2: h, kind: 'aom', data: { deflect: p.deflect, rfMHz: p.rfMHz, zero: false, eff: p.eff, gate: null } },
      ];
    },
  },

  delayline: {
    label: 'Mechanical delay line', category: 'Pulse Timing', size: { w: 40, h: 32 },
    params: [
      { key: 'delayMm', label: 'Extra optical path (mm)', type: 'number', min: 0, max: 100000, step: 1, def: 100 },
      { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 24 },
    ],
    size_: el => ({ w: 40, h: (el.params.aperture || 24) + 8 }),
    svg(el) {
      const h = (el.params.aperture || 24) / 2;
      const flipped = isFlipped(el) ? 'transform="rotate(180)"' : '';
      return `<rect x="-18" y="${-h - 3}" width="36" height="${2 * h + 6}" rx="3" fill="#d8d1ec" stroke="#69588f" stroke-width="1.4"/>` +
        `<g ${flipped} fill="none" stroke="#514171" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M -15,0 H -6 L 4,-7 H 11 L 4,0 L 11,7 H 4 L -6,0"/>` +
        `<path d="M -1,-10 V 10" stroke-dasharray="2 2" opacity="0.65"/></g>` +
        `<text x="0" y="${h + 1}" ${flipped} text-anchor="middle" dominant-baseline="central" font-size="7" font-weight="700" fill="#44365f">ΔL</text>`;
    },
    surfaces(el) {
      const h = (el.params.aperture || 24) / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'delay', data: { delayMm: el.params.delayMm } }];
    },
  },

  // Voltage-controlled retarder (Pockels effect): "Static retardance" acts as
  // a plain waveplate at the configured crystal axis. "Switching" square-wave
  // toggles the retardance between two states at a set frequency — paired
  // with a downstream polarizer/analyzer (and, for a clean two-state linear
  // swing, a quarter-wave plate before the EOM), this is how a real EOM
  // becomes an intensity modulator, the standard technique behind
  // modulation-transfer methods like stimulated Raman scattering. Detector
  // and analyzer readings use the duty-cycle-averaged Stokes state (the same
  // convention the chopper element uses for CW light) rather than animating
  // individual pulses mid-switch — this reports the correct time-averaged
  // modulation depth but doesn't synchronize with a pulsed source's own
  // repetition rate.
  eom: {
    label: 'EOM', category: 'Modulators', size: { w: 48, h: 28 },
    size_: el => ({ w: 48, h: (el.params.aperture || 24) + 4 }),
    params: [
      { key: 'aperture', label: 'Active aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 24 },
      { key: 'modulate', label: 'Apply voltage', type: 'checkbox', def: false },
      // Irrelevant in the H↔V flip drive, where the required axis is derived
      // from whatever polarization actually arrives.
      { key: 'a', label: 'Crystal axis (°)', type: 'number', min: 0, max: 180, step: 5, def: 0, show: p => p.modulate && !(p.driveMode === 'switching' && p.switchMode !== 'custom') },
      {
        key: 'driveMode', label: 'Drive', type: 'select', def: 'static',
        options: [['static', 'Static retardance'], ['switching', 'Switching (square wave)']],
        show: p => p.modulate,
      },
      {
        // The default needs no crystal-axis reasoning at all: "Flip" is the
        // half-wave switch a Pockels cell is normally used for, and it
        // rotates whatever linear state arrives by exactly 90° (H<->V),
        // which is what an analyzer or PBS turns into full-depth intensity
        // modulation. Explicit retardance states stay available underneath.
        key: 'switchMode', label: 'Switch between', type: 'select', def: 'flip',
        options: [['flip', 'Orthogonal polarizations (H↔V)'], ['custom', 'Custom retardance states']],
        show: p => p.modulate && p.driveMode === 'switching',
      },
      { key: 'retardance', label: 'Retardance (°)', type: 'number', min: -720, max: 720, step: 5, def: 90, show: p => p.modulate && p.driveMode !== 'switching' },
      { key: 'retardanceLow', label: 'Low-state retardance (°)', type: 'number', min: -720, max: 720, step: 5, def: 0, show: p => p.modulate && p.driveMode === 'switching' && p.switchMode === 'custom' },
      { key: 'retardanceHigh', label: 'High-state retardance (°)', type: 'number', min: -720, max: 720, step: 5, def: 180, show: p => p.modulate && p.driveMode === 'switching' && p.switchMode === 'custom' },
      { key: 'switchFreqMHz', label: 'Switching frequency (MHz)', type: 'number', min: 0.000001, max: 1000, step: 0.001, def: 1, show: p => p.modulate && p.driveMode === 'switching' },
      { key: 'switchDuty', label: 'High-state duty (0–1)', type: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5, show: p => p.modulate && p.driveMode === 'switching' },
      { key: 'switchPhaseNs', label: 'Switching offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0, show: p => p.modulate && p.driveMode === 'switching' },
    ],
    svg(el) { return boxSVG(44, el.params.aperture || 24, '#b8c9a3', '#66794a', 'EOM', '#2f3a20', isFlipped(el)); },
    surfaces(el) {
      const p = el.params;
      if (!p.modulate) return [];
      const h = (p.aperture || 24) / 2;
      const data = p.driveMode === 'switching'
        ? {
          a: p.a, switching: true, flip: p.switchMode !== 'custom',
          retardanceLow: p.retardanceLow, retardanceHigh: p.retardanceHigh,
          duty: p.switchDuty, frequencyMHz: p.switchFreqMHz, phaseNs: p.switchPhaseNs,
        }
        : { a: p.a, retardance: p.retardance };
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'retarder', data }];
    },
  },

  chopper: {
    label: 'Chopper', category: 'Modulators', size: { w: 40, h: 40 },
    size_: el => ({ w: (el.params.diameter || 40) + 4, h: (el.params.diameter || 40) + 4 }),
    params: [
      { key: 'modulate', label: 'Modulate on/off', type: 'checkbox', def: true },
      { key: 'diameter', label: 'Wheel diameter (mm)', type: 'number', min: 20, max: 120, step: 2, def: 40 },
      { key: 'frequencyHz', label: 'Chop frequency (Hz)', type: 'number', min: 0.1, max: 20000, step: 0.1, def: 1000, show: p => p.modulate },
      { key: 'chopDuty', label: 'On fraction (0–1)', type: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5, show: p => p.modulate },
      { key: 'phaseNs', label: 'Gate offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0, show: p => p.modulate },
    ],
    svg(el) {
      let blades = '';
      const p = el.params, r = (p.diameter || 40) / 2 - 2;
      const bladeSpan = 60 * (1 - Math.min(0.95, Math.max(0.05, p.chopDuty ?? 0.5)));
      // Six identical blade/slot pairs make one gate period a 60° wheel step.
      // The positive rotation also places the fixed horizontal ray in a slot
      // for phase < duty and behind a blade for the remainder of the cycle.
      const rawAngle = Number.isFinite(el._simulationTimeNs)
        ? (el._simulationTimeNs - (p.phaseNs || 0)) * (p.frequencyHz || 1000) * 6e-8
        : (el._animationTimeS || 0) * 60 * Math.min(2, Math.max(0.25, p.frequencyHz || 1000));
      const physicalAngle = ((rawAngle % 60) + 60) % 60;
      for (let i = 0; i < 6; i++) {
        const a0 = i * 60, a1 = a0 + bladeSpan;
        const x0 = r * Math.cos(a0 * Math.PI / 180), y0 = r * Math.sin(a0 * Math.PI / 180),
          x1 = r * Math.cos(a1 * Math.PI / 180), y1 = r * Math.sin(a1 * Math.PI / 180);
        blades += `<path d="M 0,0 L ${x0},${y0} A ${r} ${r} 0 0 1 ${x1},${y1} Z" fill="#8d98a5"/>`;
      }
      return `<g transform="rotate(${physicalAngle})">${blades}</g>` +
        `<circle r="3.5" fill="#4d565f"/><circle r="${r + 0.5}" fill="none" stroke="#4d565f" stroke-width="1" stroke-dasharray="2 3"/>`;
    },
    surfaces(el) {
      const p = el.params;
      if (!p.modulate) return [];
      const half = (p.diameter || 40) / 2;
      return [{
        x1: 0, y1: -half, x2: 0, y2: half, kind: 'chop',
        data: {
          frequencyMHz: (p.frequencyHz || 1000) / 1e6,
          duty: p.chopDuty,
          phaseNs: p.phaseNs,
        },
      }];
    },
  },

  crystal: {
    label: 'Crystal', category: 'Nonlinear Optics', size: { w: 36, h: 26 },
    size_: el => ({ w: 36, h: (el.params.aperture || 22) + 4 }),
    params: [
      { key: 'aperture', label: 'Crystal aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 22 },
      { key: 'convert', label: 'Convert λ', type: 'select', def: 'none', options: [['none', 'None'], ['shg', 'SHG (λ/2)'], ['thg', 'THG (λ/3)'], ['sc', 'Supercontinuum (white)'], ['opo', 'OPO (signal + idler)'], ['custom', 'Custom output λ']] },
      { key: 'outWl', label: 'Output λ (nm)', type: 'number', min: 100, max: 12000, step: 1, def: 532, show: p => p.convert === 'custom' },
      { key: 'pumpWl', label: 'Pump λ (nm)', type: 'number', min: 100, max: 3000, step: 1, def: 532, show: p => p.convert === 'opo' },
      { key: 'signalWl', label: 'Signal λ (nm)', type: 'number', min: 100, max: 11000, step: 1, def: 800, show: p => p.convert === 'opo' },
      { key: 'efficiency', label: 'Conversion efficiency', type: 'number', min: 0, max: 1, step: 0.05, def: 0.5, show: p => p.convert !== 'none' },
      { key: 'transmitPump', label: 'Transmit residual pump', type: 'checkbox', def: true, show: p => p.convert !== 'none' },
    ],
    svg(el) {
      const isOpo = el.params.convert === 'opo';
      const h = (el.params.aperture || 22) / 2;
      return `<path d="M -12,${-h} L 16,${-h} L 12,${h} L -16,${h} Z" fill="${isOpo ? '#d8e8f5' : '#e4d5f2'}" stroke="${isOpo ? '#4a7fa8' : '#8a5fb0'}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const p = el.params;
      if (p.convert === 'none') return [];
      const h = (p.aperture || 22) / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'transmit', data: { convert: p.convert, outWl: p.outWl, pumpWl: p.pumpWl, signalWl: p.signalWl, efficiency: p.efficiency, transmitPump: p.transmitPump } }];
    },
  },

  glassrod: {
    label: 'Glass rod', category: 'Dispersive elements', size: { w: 64, h: 14 },
    params: [
      { key: 'rodlen', label: 'Length (mm)', type: 'number', min: 20, max: 300, step: 5, def: 60 },
      { key: 'dia', label: 'Diameter', type: 'optsize', def: 12.7 },
      { key: 'ior', label: 'Refractive index', type: 'number', min: 1.01, max: 2.5, step: 0.01, def: 1.52 },
    ],
    size_: el => ({ w: el.params.rodlen + 4, h: (el.params.dia || 10) + 4 }),
    svg(el) {
      const L = el.params.rodlen / 2, d = el.params.dia || 10;
      return `<rect x="${-L}" y="${-d / 2}" width="${el.params.rodlen}" height="${d}" rx="${Math.min(4, d / 3)}" fill="${GLASS}" fill-opacity="0.72" stroke="${GLASS_S}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const x = el.params.rodlen / 2, y = (el.params.dia || 10) / 2;
      const data = { ior: el.params.ior || 1.52, transmission: 0.96 };
      // All four faces are dielectric boundaries. The tracer tracks whether a
      // ray is inside this rod, so it refracts on entry/exit and reflects when
      // total internal reflection occurs at a side wall.
      return [
        { x1: -x, y1: -y, x2: x, y2: -y, kind: 'refract', data: { ...data, topologyKey: 'edge-0' } },
        { x1: x, y1: -y, x2: x, y2: y, kind: 'refract', data: { ...data, topologyKey: 'edge-1' } },
        { x1: x, y1: y, x2: -x, y2: y, kind: 'refract', data: { ...data, topologyKey: 'edge-2' } },
        { x1: -x, y1: y, x2: -x, y2: -y, kind: 'refract', data: { ...data, topologyKey: 'edge-3' } },
      ];
    },
  },

  // ---------------- Microscopy ----------------
  sample: {
    // Horizontal at rot 0: the clear-aperture/long axis runs left-right
    // (local x), the beam crosses it top-to-bottom (local y).
    label: 'Sample', category: 'Microscopy', size: { w: 40, h: 14 },
    size_: el => ({ w: (el.params.aperture || 34) + 6, h: Math.max(14, sampleThickness(el.params) + 8) }),
    params: [{ key: 'aperture', label: 'Sample width (mm)', type: 'number', min: 6, max: 150, step: 2, def: 50, appearance: true }, ...sampleModeParams()],
    svg(el) {
      const p = el.params;
      const h = (p.aperture || 34) / 2, t = sampleThickness(p);
      return `<rect x="${-h}" y="${(-t / 2).toFixed(2)}" width="${2 * h}" height="${t}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.2"/>` +
        signalSpotSVG(el);
    },
    // Both visible specimen faces are explicit immersion contacts. They are
    // target surfaces, not separate liquid elements, and never move merely
    // because an objective couples to one.
    immersionContact: el => {
      const halfWidth = (el.params.aperture || 34) / 2;
      const halfThickness = sampleThickness(el.params) / 2;
      return [
        { x1: -halfWidth, y1: -halfThickness, x2: halfWidth, y2: -halfThickness },
        { x1: -halfWidth, y1: halfThickness, x2: halfWidth, y2: halfThickness },
      ];
    },
    surfaces: el => sampleSurfaces(el, (el.params.aperture || 34) / 2),
  },

  stage: {
    // Horizontal at rot 0, same convention as 'sample': the clear-aperture
    // axis runs left-right (local x), the beam crosses top-to-bottom
    // (local y). The mounting brackets grip the specimen's left/right short
    // edges accordingly.
    label: 'Sample on piezo stage', category: 'Microscopy', size: { w: 56, h: 22 },
    size_: el => ({ w: (el.params.aperture || 50) + 30, h: Math.max(22, sampleThickness(el.params) + 14) }),
    params: [
      { key: 'pzHeading', label: 'Piezo movement', type: 'section' },
      { key: 'pzMode', label: 'Scan pattern', type: 'select', def: 'static', options: [['static', 'Static'], ['xy', 'XY — long axis'], ['z', 'Z — depth'], ['sync', 'XYZ sync — raster']] },
      { key: 'pzTravelXY', label: 'XY travel (mm)', type: 'number', min: 0, max: 150, step: 1, def: 12, show: p => p.pzMode === 'xy' || p.pzMode === 'sync' },
      { key: 'pzFreqXY', label: 'XY scan frequency (Hz)', type: 'number', min: 0.01, max: 10, step: 0.01, def: 0.15, show: p => p.pzMode === 'xy' || p.pzMode === 'sync' },
      { key: 'pzTravelZ', label: 'Z travel (mm)', type: 'number', min: 0, max: 150, step: 1, def: 8, show: p => p.pzMode === 'z' || p.pzMode === 'sync' },
      { key: 'pzFreqZ', label: 'Z scan frequency (Hz)', type: 'number', min: 0.01, max: 10, step: 0.01, def: 0.1, show: p => p.pzMode === 'z' },
      { key: 'pzZSteps', label: 'Z raster lines', type: 'number', min: 2, max: 50, step: 1, def: 5, show: p => p.pzMode === 'sync' },
      { key: 'opticalHeading', label: 'Optical behavior', type: 'section' },
      { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 6, max: 150, step: 2, def: 50, appearance: true },
      // Legacy per-material selector, replaced by `specimenType`. Hidden but
      // still declared so pre-existing sketches keep loading and can be read
      // by specimenTypeOf().
      { key: 'sampleKind', label: 'Sample material', type: 'select', def: 'generic', show: () => false, options: [['generic', 'General sample'], ['fluorescent', 'Fluorescent specimen'], ['resin', 'Photocurable resin'], ['nonlinear', 'Nonlinear specimen'], ['opaque', 'Absorbing specimen']] },
      ...sampleModeParams(),
    ],
    svg(el) {
      const p = el.params;
      const clear = (p.aperture || 50) / 2, outer = clear + 12;
      const spot = signalSpotSVG(el);
      // Two separate L brackets (short-side cap + rail) grip the glass from
      // its left and right short edges and protrude 20% of the glass length
      // inward, leaving a 60%-of-length window between them for the beam.
      const windowX = clear * 0.6;
      const t = sampleThickness(p);
      return `<path d="M ${-outer},-8 L ${-outer},6 L ${-windowX},6" fill="none" stroke="#4d565f" stroke-width="4"/>` +
        `<path d="M ${outer},-8 L ${outer},6 L ${windowX},6" fill="none" stroke="#4d565f" stroke-width="4"/>` +
        `<rect x="${-clear}" y="${(-t / 2).toFixed(2)}" width="${2 * clear}" height="${t}" fill="${GLASS}" fill-opacity="0.75" stroke="${GLASS_S}" stroke-width="1.2"/>` +
        spot +
        (p.voxelPreview ? `<circle cx="0" cy="-0.5" r="6.2" fill="none" stroke="#7c3aed" stroke-width="0.8" stroke-dasharray="1.5 1.5"/>` : '');
    },
    immersionContact: el => {
      const halfWidth = (el.params.aperture || 50) / 2;
      const halfThickness = sampleThickness(el.params) / 2;
      return [
        { x1: -halfWidth, y1: -halfThickness, x2: halfWidth, y2: -halfThickness },
        { x1: -halfWidth, y1: halfThickness, x2: halfWidth, y2: halfThickness },
      ];
    },
    surfaces(el) {
      const clear = Math.max(2, (el.params.aperture || 50) / 2), outer = clear + 12;
      const mount = [
        { x1: -outer, y1: 6, x2: -clear, y2: 6, kind: 'absorb' },
        { x1: clear, y1: 6, x2: outer, y2: 6, kind: 'absorb' },
      ];
      return [...mount, ...sampleSurfaces(el, clear)];
    },
  },

  // ---------------- Imaging ----------------
  objarrow: {
    label: 'Object', category: 'Sources', size: { w: 20, h: 60 },
    size_: el => ({ w: 20, h: 2 * el.params.height + 10 }),
    imaging: true,
    params: [
      { key: 'height', label: 'Height (mm)', type: 'number', min: 2, max: 150, step: 1, def: 22 },
      { key: 'shape', label: 'Shape', type: 'select', def: 'arrow', options: [['arrow', 'Arrow'], ['F', 'Letter F'], ['tree', 'Tree']] },
      { key: 'raysMode', label: 'Rays from tip', type: 'select', def: 'fan', options: [['fan', 'Show ray fan'], ['none', 'No rays']] },
      { key: 'spread', label: 'Fan angle (°)', type: 'number', min: 1, max: 40, step: 1, def: 10, show: p => p.raysMode === 'fan' },
      { key: 'nrays', label: 'Rays', type: 'number', min: 2, max: 9, step: 1, def: 3, show: p => p.raysMode === 'fan' },
      { key: 'showImage', label: 'Draw image formed', type: 'checkbox', def: true },
      { ...P.wavelength, def: 620 },
      P.autoColor, P.color,
    ],
    svg(el) {
      const p = el.params, h = p.height;
      const c = p.autoColor === false && p.color ? p.color : wavelengthToColor(p.wavelength);
      const sh = OBJ_SHAPES[p.shape] || OBJ_SHAPES.arrow;
      let s = `<line x1="-7" y1="0" x2="7" y2="0" stroke="#888" stroke-width="1.2"/>`;
      for (const ln of sh.lines) {
        s += `<polyline points="${ln.map(q => `${(q[0] * h).toFixed(1)},${(q[1] * h).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      for (const pg of sh.polys) {
        s += `<polygon points="${pg.map(q => `${(q[0] * h).toFixed(1)},${(q[1] * h).toFixed(1)}`).join(' ')}" fill="${c}"/>`;
      }
      return s;
    },
    source(el) {
      const p = el.params;
      if (p.raysMode !== 'fan') return [];
      const n = Math.max(2, Math.round(p.nrays)), out = [];
      // fan from the object's own anchor point (on the shared optical axis,
      // not the off-axis tip): the central ray is exactly horizontal, so it
      // passes through the center of every on-axis lens undeviated (h = 0
      // there) and stays a fixed horizontal reference as the surrounding
      // rays fan out symmetrically — half clockwise, half counterclockwise
      // — and bend toward it at each focusing surface.
      for (let i = 0; i < n; i++) {
        const a = (-p.spread / 2 + p.spread * i / (n - 1)) * Math.PI / 180;
        out.push({ x: 1, y: 0, dx: Math.cos(a), dy: Math.sin(a) });
      }
      return out;
    },
    surfaces: () => [],
  },

  probe: {
    label: 'Beam probe (?)', category: 'Annotations', size: { w: 24, h: 24 },
    size_: el => {
      const scale = probeScale(el);
      return { w: 24 * scale, h: 24 * scale };
    },
    noLabel: true,
    params: [
      { key: 'displayScale', label: 'Display scale', type: 'number', min: 0.5, max: 2, step: 0.05, def: 1 },
      { key: 'prop', label: 'Show', type: 'select', def: 'spectrum', options: [['spectrum', 'Spectrum plot'], ['pol', 'Polarization'], ['wl', 'Wavelength label']] },
    ],
    svg(el) {
      const scale = probeScale(el);
      const card = probeCard(el, probeAt(el.x, el.y));
      const place = probeCardPlacement(el, card, scale);
      // The crosshair marks the exact point being read and must stay put
      // regardless of scale — only the readout card grows with Display scale.
      // The leader rotates with the element (so the card swings around the
      // sampled point), while the card itself is counter-rotated to stay
      // upright and readable.
      const crosshair = `<circle r="4.5" fill="none" stroke="#e07020" stroke-width="1.6"/>` +
        `<line x1="0" y1="-8" x2="0" y2="8" stroke="#e07020" stroke-width="1"/>` +
        `<line x1="-8" y1="0" x2="8" y2="0" stroke="#e07020" stroke-width="1"/>` +
        `<line x1="0" y1="-9" x2="0" y2="${-PROBE_LEADER}" stroke="#e07020" stroke-width="1"/>`;
      return crosshair +
        `<g transform="rotate(${-place.rot}) translate(${place.x.toFixed(2)},${place.y.toFixed(2)}) scale(${scale})">` +
        card.body + `</g>`;
    },
    surfaces: () => [],
  },

  // Hidden from the palette: the Annotations "Arrow" tile starts the freehand
  // draw-arrow tool instead (same concept, drawn point-by-point). Existing
  // placed arrowann elements stay fully editable.
  arrowann: {
    label: 'Arrow', category: 'Annotations', hidden: true, size: el => ({
      w: el.params.len + 8,
      h: Math.max(20, 2 * (3 + 1.5 * el.params.width) + 4),
    }),
    params: [
      { key: 'len', label: 'Length (mm)', type: 'number', min: 10, max: 400, step: 5, def: 60 },
      { key: 'width', label: 'Line width', type: 'number', min: 0.5, max: 8, step: 0.5, def: 2 },
      { key: 'fill', label: 'Color', type: 'color', def: '#333333' },
    ],
    svg(el) {
      const p = el.params, L = p.len / 2, w = p.width;
      const hl = Math.min(p.len, 6 + 3 * w), hw = 3 + 1.5 * w;
      return `<line x1="${-L}" y1="0" x2="${(L - hl + 1).toFixed(1)}" y2="0" stroke="${p.fill}" stroke-width="${w}" stroke-linecap="round"/>` +
        `<path d="M ${L},0 L ${L - hl},${-hw} L ${L - hl},${hw} Z" fill="${p.fill}"/>`;
    },
    surfaces: () => [],
  },

  figureframe: {
    label: 'Figure frame', category: 'Annotations', paletteOrder: 99,
    aliases: ['crop', 'artboard', 'export frame', 'paper frame'],
    singleton: true,
    hideInExport: true,
    exportFrame: true,
    rotatable: false,
    noLabel: true,
    directHint: 'blue handles set the exact export crop',
    params: [
      { key: 'w', label: 'Figure width (mm)', type: 'number', min: 40, max: 2000, step: 5, def: 320 },
      { key: 'h', label: 'Figure height (mm)', type: 'number', min: 30, max: 2000, step: 5, def: 200 },
      { key: 'background', label: 'SVG background', type: 'select', def: 'transparent', options: [['transparent', 'Transparent'], ['white', 'White']] },
    ],
    size: el => ({ w: el.params.w, h: el.params.h }),
    hitTest(el, point, tolerance) {
      const hw = el.params.w / 2, hh = el.params.h / 2;
      if (Math.abs(point.x) > hw + tolerance || Math.abs(point.y) > hh + tolerance) return false;
      return Math.abs(Math.abs(point.x) - hw) <= tolerance || Math.abs(Math.abs(point.y) - hh) <= tolerance;
    },
    svg(el) {
      const w = el.params.w, h = el.params.h, x = -w / 2, y = -h / 2;
      const m = Math.min(12, w / 7, h / 7);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#7d8ca3" stroke-width="1.2" stroke-dasharray="7 5"/>` +
        `<path d="M ${x},${y + m} V ${y} H ${x + m} M ${-x - m},${y} H ${-x} V ${y + m} M ${-x},${-y - m} V ${-y} H ${-x - m} M ${x + m},${-y} H ${x} V ${-y - m}" fill="none" stroke="#50637d" stroke-width="2"/>` +
        `<text x="${x + 7}" y="${y + 15}" font-size="9" font-weight="700" letter-spacing="0.7" fill="#64748b">FIGURE</text>`;
    },
    surfaces: () => [],
  },

  highlight: {
    label: 'Highlight', category: 'Annotations', background: true,
    size: el => ({ w: el.params.w, h: el.params.h }),
    // Painted in its own layer behind the grid holes, beams, and every other
    // element (see renderHighlights() in canvas.js) — purely a background
    // wash that is still part of the exported figure, unlike the figure
    // frame's canvas-only crop border. It never intercepts or attenuates a
    // traced ray (surfaces() is empty).
    params: [
      { key: 'shape', label: 'Shape', type: 'select', def: 'rect', options: [['rect', 'Rectangle'], ['circle', 'Circle']] },
      { key: 'w', label: 'Width (mm)', type: 'number', min: 5, max: 2000, step: 5, def: 120 },
      { key: 'h', label: 'Height (mm)', type: 'number', min: 5, max: 2000, step: 5, def: 80 },
      { key: 'fill', label: 'Color', type: 'color', def: '#fde047' },
      { key: 'opacity', label: 'Opacity (%)', type: 'number', min: 5, max: 100, step: 5, def: 35 },
    ],
    hitTest(el, point, tolerance) {
      const hw = el.params.w / 2 + tolerance, hh = el.params.h / 2 + tolerance;
      if (el.params.shape === 'circle') return (point.x * point.x) / (hw * hw) + (point.y * point.y) / (hh * hh) <= 1;
      return Math.abs(point.x) <= hw && Math.abs(point.y) <= hh;
    },
    svg(el) {
      const p = el.params, w = p.w, h = p.h;
      const fillOpacity = Math.min(1, Math.max(0.05, (p.opacity ?? 35) / 100));
      const shape = p.shape === 'circle'
        ? `<ellipse cx="0" cy="0" rx="${w / 2}" ry="${h / 2}" fill="${p.fill}" fill-opacity="${fillOpacity}"/>`
        : `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${p.fill}" fill-opacity="${fillOpacity}"/>`;
      return shape;
    },
    surfaces: () => [],
  },

  // ---------------- Custom ----------------
  box: {
    label: 'Custom box', category: 'Custom', size: el => ({ w: el.params.w + 4, h: el.params.h + 4 }),
    params: [
      { key: 'text', label: 'Label', type: 'text', def: 'Device' },
      { key: 'w', label: 'Width (mm)', type: 'number', min: 10, max: 400, step: 5, def: 70 },
      { key: 'h', label: 'Height (mm)', type: 'number', min: 10, max: 400, step: 5, def: 40 },
      { key: 'behavior', label: 'Beam behavior', type: 'select', def: 'block', options: [['block', 'Blocks beam'], ['pass', 'Beam passes through']] },
      { key: 'fill', label: 'Fill', type: 'color', def: '#eef0f3' },
    ],
    svg(el) {
      const p = el.params;
      return boxSVG(p.w, p.h, p.fill, '#7a828c', p.text, '#3d444d', isFlipped(el));
    },
    surfaces(el) {
      return el.params.behavior === 'block' ? rectAbsorb(el.params.w, el.params.h) : [];
    },
  },

  blocker: {
    label: 'Invisible blocker', category: 'Beam Block', size: el => ({ w: el.params.w + 4, h: el.params.h + 4 }),
    hideInExport: true,
    params: [
      { key: 'w', label: 'Width (mm)', type: 'number', min: 4, max: 400, step: 2, def: 16 },
      { key: 'h', label: 'Height (mm)', type: 'number', min: 4, max: 400, step: 2, def: 60 },
    ],
    svg(el) {
      const p = el.params;
      return `<rect x="${-p.w / 2}" y="${-p.h / 2}" width="${p.w}" height="${p.h}" rx="2" fill="rgba(208,96,96,0.07)" stroke="#d89c9c" stroke-width="1" stroke-dasharray="4 3"/>` +
        `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="9" fill="#c98080">✂</text>`;
    },
    surfaces(el) {
      return rectAbsorb(el.params.w, el.params.h);
    },
  },

  textlabel: {
    label: 'Text label', category: 'Annotations', size: el => ({ w: Math.max(30, String(el.params.text).length * el.params.fontSize * 0.6), h: el.params.fontSize + 10 }),
    // The element position is the box's LEFT edge, not its center (see
    // boxAnchor()), so typing longer text grows the box to the right instead
    // of re-centering it around the drop point every keystroke.
    anchorX: 'left',
    params: [
      { key: 'text', label: 'Text', type: 'text', def: 'Label' },
      { key: 'fontSize', label: 'Size (pt)', type: 'number', min: 6, max: 72, step: 1, def: 14 },
      { key: 'fill', label: 'Color', type: 'color', def: '#333333' },
    ],
    noLabel: true,
    svg(el) {
      const p = el.params;
      return `<text x="0" y="0" text-anchor="start" dominant-baseline="central" font-size="${p.fontSize}" fill="${p.fill}">${esc(p.text)}</text>`;
    },
    surfaces: () => [],
  },

  // ---------------- Lab elements ----------------
  // Purely cosmetic hardware set dressing: gas cells, windows, and similar
  // lab fixtures that appear in real beamline photos/diagrams but carry no
  // ray-tracing role of their own (surfaces() always returns []). A fiber
  // or manual beam drawn through one is just layered on top — no binding.
  gascell: {
    label: 'Gas cell', category: 'Lab elements', size: { w: 94, h: 59 },
    size_: el => ({ w: el.params.length + 4, h: el.params.height + 4 }),
    params: [
      { key: 'length', label: 'Length (mm)', type: 'number', min: 30, max: 250, step: 5, def: 90 },
      { key: 'height', label: 'Height (mm)', type: 'number', min: 20, max: 120, step: 2, def: 55 },
      { key: 'windowLeft', label: 'Window (left)', type: 'checkbox', def: false },
      { key: 'windowRight', label: 'Window (right)', type: 'checkbox', def: false },
      { key: 'extension', label: 'Extension tube', type: 'checkbox', def: false },
      {
        key: 'extensionSide', label: 'Extension side', type: 'select', def: 'right',
        options: [['left', 'Left'], ['right', 'Right']], show: p => p.extension,
      },
      {
        key: 'gasDirection', label: 'Gas port', type: 'select', def: 'out',
        options: [['out', 'Outward'], ['in', 'Inward'], ['closed', 'Closed']],
      },
      { key: 'transparency', label: 'Transparency (%)', type: 'number', min: 0, max: 100, step: 5, def: 100 },
    ],
    svg(el) {
      const p = el.params;
      const hl = p.length / 2, hh = p.height / 2;
      const bodyOpacity = (1 - p.transparency / 100).toFixed(2);
      const screwX = hl * 0.82, screwY = hh * 0.72;
      const winH = Math.min(20, p.height * 0.35);
      const gaugeR = Math.max(8, Math.min(15, p.height * 0.16));
      const tubeLen = Math.max(32, hl * 0.8);
      const tubeH = Math.min(24, p.height * 0.4);
      const leftOpen = p.extension && p.extensionSide === 'left';
      const rightOpen = p.extension && p.extensionSide === 'right';
      const r = 6;
      let s = '';
      if (p.extension) {
        const side = p.extensionSide === 'left' ? -1 : 1;
        const x0 = side > 0 ? hl : -hl - tubeLen;
        const x1 = side > 0 ? hl + tubeLen : -hl;
        s += `<rect x="${Math.min(x0, x1)}" y="${-tubeH / 2}" width="${tubeLen}" height="${tubeH}" fill="#b8933f" fill-opacity="${bodyOpacity}"/>` +
          `<line x1="${x0}" y1="${-tubeH / 2}" x2="${x1}" y2="${-tubeH / 2}" stroke="#7a5f28" stroke-width="2.5" stroke-linecap="round"/>` +
          `<line x1="${x0}" y1="${tubeH / 2}" x2="${x1}" y2="${tubeH / 2}" stroke="#7a5f28" stroke-width="2.5" stroke-linecap="round"/>`;
      }
      s += `<rect x="${-hl}" y="${-hh}" width="${p.length}" height="${p.height}" rx="${r}" fill="#b8933f" fill-opacity="${bodyOpacity}"/>` +
        `<rect x="${-hl}" y="${-hh}" width="${p.length}" height="${p.height * 0.17}" rx="${r}" fill="#d9b968" fill-opacity="${(0.55 * bodyOpacity).toFixed(2)}"/>`;
      // Housing outline: a normal rounded rect. Where an extension tube
      // connects, only the short stretch of wall directly between its two
      // rails is left undrawn -- the wall still runs from each rounded
      // corner down to the rail, so the opening lines up with the tube.
      let d = `M ${-hl + r} ${-hh} `;
      d += `L ${hl - r} ${-hh} `;
      d += `A ${r} ${r} 0 0 1 ${hl} ${-hh + r} `;
      if (rightOpen) {
        d += `L ${hl} ${-tubeH / 2} `;
        d += `M ${hl} ${tubeH / 2} `;
        d += `L ${hl} ${hh - r} `;
      } else {
        d += `L ${hl} ${hh - r} `;
      }
      d += `A ${r} ${r} 0 0 1 ${hl - r} ${hh} `;
      d += `L ${-hl + r} ${hh} `;
      d += `A ${r} ${r} 0 0 1 ${-hl} ${hh - r} `;
      if (leftOpen) {
        d += `L ${-hl} ${tubeH / 2} `;
        d += `M ${-hl} ${-tubeH / 2} `;
        d += `L ${-hl} ${-hh + r} `;
      } else {
        d += `L ${-hl} ${-hh + r} `;
      }
      d += `A ${r} ${r} 0 0 1 ${-hl + r} ${-hh} `;
      s += `<path d="${d}" fill="none" stroke="#7a5f28" stroke-width="2"/>` +
        `<circle cx="${-screwX}" cy="${-screwY}" r="4" fill="#5b4520" stroke="#3d2e15" stroke-width="1"/>` +
        `<circle cx="${screwX}" cy="${-screwY}" r="4" fill="#5b4520" stroke="#3d2e15" stroke-width="1"/>` +
        `<circle cx="${-screwX}" cy="${screwY}" r="4" fill="#5b4520" stroke="#3d2e15" stroke-width="1"/>` +
        `<circle cx="${screwX}" cy="${screwY}" r="4" fill="#5b4520" stroke="#3d2e15" stroke-width="1"/>`;
      if (p.windowLeft) {
        s += `<rect x="${-hl - 3}" y="${-winH / 2}" width="6" height="${winH}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1"/>`;
      }
      if (p.windowRight) {
        s += `<rect x="${hl - 3}" y="${-winH / 2}" width="6" height="${winH}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1"/>`;
      }
      const portX = hl * 0.5;
      s += `<circle cx="0" cy="${-hh}" r="${gaugeR}" fill="#fff" stroke="#4d565f" stroke-width="1.5"/>` +
        `<line x1="0" y1="${-hh}" x2="${gaugeR * 0.4}" y2="${-hh - gaugeR * 0.55}" stroke="#c0392b" stroke-width="1.5" stroke-linecap="round"/>` +
        `<rect x="${portX - 4}" y="${-hh - 10}" width="8" height="10" fill="#6b7280" stroke="#3f4650" stroke-width="1"/>`;
      if (p.gasDirection === 'in') {
        s += `<line x1="${portX}" y1="${-hh - 10}" x2="${portX}" y2="${-hh - 22}" stroke="#1361fa" stroke-width="2.2"/>` +
          `<polygon points="${portX},${-hh - 10} ${portX - 4},${-hh - 17} ${portX + 4},${-hh - 17}" fill="#1361fa"/>`;
      } else if (p.gasDirection === 'out') {
        s += `<line x1="${portX}" y1="${-hh - 22}" x2="${portX}" y2="${-hh - 10}" stroke="#1361fa" stroke-width="2.2"/>` +
          `<polygon points="${portX},${-hh - 27} ${portX - 4},${-hh - 20} ${portX + 4},${-hh - 20}" fill="#1361fa"/>`;
      }
      return s;
    },
    surfaces: () => [],
  },

  window: {
    label: 'Optical window', category: 'Lab elements', size: { w: 12, h: 32 },
    size_: el => ({ w: 12, h: el.params.length + 6 }),
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      { key: 'transparency', label: 'Transparency (%)', type: 'number', min: 0, max: 100, step: 5, def: 100 },
    ],
    svg(el) {
      const p = el.params, L = p.length / 2;
      const bodyOpacity = (1 - p.transparency / 100).toFixed(2);
      return `<rect x="-3" y="${-L}" width="6" height="${p.length}" fill="${GLASS}" fill-opacity="${bodyOpacity}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
    },
    surfaces: () => [],
  },
};

// Where an element's local origin (el.x, el.y) sits relative to the center
// of its size() box, in local (unrotated) coordinates. Every element type is
// center-anchored (origin === box center) except those that opt into
// anchorX: 'left', where the origin is the box's left-middle edge instead —
// see the textlabel entry above. Consumed by every generic piece of UI that
// draws or hit-tests a selection box around an element (canvas.js).
export function boxAnchor(el) {
  const d = registry[el.type];
  if (typeof d?.boxAnchor === 'function') return d.boxAnchor(el);
  if (d?.anchorX === 'left') return { x: getSize(el).w / 2, y: 0 };
  return { x: 0, y: 0 };
}

// concave lens: identical optics to 'lens', concave default focal length
registry.lensc = {
  ...registry.lens,
  label: 'Concave lens',
  paletteOrder: 1,
  params: registry.lens.params.map(p => (p.key === 'f' ? { ...p, def: -100 } : p)),
};

// The third laser source. Its spectrum is a flat top between two endpoints
// rather than a line, so it replaces wavelength with a range and defaults to
// a fixed broadband white instead of a colour derived from a centroid λ that
// no longer means much once the band is hundreds of nm wide.
registry.sclaser = {
  ...registry.pulsedlaser,
  label: 'Supercontinuum laser',
  paletteOrder: 2,
  aliases: ['super continuum', 'white laser', 'broadband pulsed source', 'sc laser'],
  params: [
    { ...P.wavelength, def: 500, show: () => false },
    { key: 'scMin', label: 'Spectrum minimum (nm)', type: 'number', min: 200, max: 11999, step: 10, def: 300 },
    { key: 'scMax', label: 'Spectrum maximum (nm)', type: 'number', min: 201, max: 12000, step: 10, def: 700 },
    { key: 'avgPowerW', label: 'Average power (W)', type: 'number', min: 0, max: 1000, step: 0.001, def: 1 },
    ...beamShapeParams(3),
    ...pulseTrainParams(),
    POL_PARAM,
    // Broadband white by default: a supercontinuum has no single colour to
    // derive, and this is the shade the tracer already paints wide-band light.
    { ...P.autoColor, def: false },
    { ...P.color, def: '#cbd8ea' },
    SHOW_PULSE_PARAM,
    pinnedParam('temporalMode', 'pulsed'),
  ],
  svg(el) {
    const h = laserH(el), hh = h / 2, ap = laserAperture(el);
    const stripes = ['#7c3aed', '#2563eb', '#10b981', '#eab308', '#f97316', '#ef4444']
      .map((c, i) => `<rect x="${46 + i * 0.85}" y="${-ap}" width="1" height="${2 * ap}" fill="${c}"/>`).join('');
    return `<rect x="-46" y="${-hh}" width="92" height="${h}" rx="4" fill="#24233a" stroke="#171629" stroke-width="1.5"/>` +
      `<text x="0" y="-3" ${isFlipped(el) ? 'transform="rotate(180)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="750" letter-spacing="1.1" fill="#fff">SC LASER</text>` +
      `<g stroke="#c4b5fd" stroke-width="1.1"><path d="M -17,8 L -12,8 L -10,3 L -8,11 L -6,8 L -1,8"/><path d="M 3,8 L 8,8 L 10,3 L 12,11 L 14,8 L 19,8"/></g>` + stripes;
  },
};

// Registry-owned direct-manipulation semantics. Canvas code only understands
// generic resize/tune descriptors; the component definition decides which
// real physical parameter a handle changes.
const DIRECT = {
  cwlaser: { resize: { y: 'beamWidth', set: { beamMode: 'beam' } }, tune: { key: 'wavelength', short: 'λ' } },
  pulsedlaser: { resize: { y: 'beamWidth', set: { beamMode: 'beam' } }, tune: { key: 'wavelength', short: 'λ' } },
  sclaser: { resize: { y: 'beamWidth', set: { beamMode: 'beam' } }, tune: { key: 'scMax', short: 'λ max' } },
  pointsource: { resize: { uniform: 'displayScale' }, tune: { key: 'spread', short: 'angle' } },
  objarrow: { resize: { y: 'height' }, tune: { key: 'spread', short: 'fan', when: p => p.raysMode === 'fan' } },
  mirror: { resize: { y: 'length' }, tune: { key: 'refl', short: 'R' } },
  galvo: { resize: { y: 'length' }, tune: { key: 'commandAngle', short: 'center' } },
  retroreflector: { resize: { y: 'length' }, tune: { key: 'refl', short: 'R' } },
  cmirrorx: { resize: { y: 'length' }, tune: { key: 'f', short: 'f' } },
  cmirror: { resize: { y: 'length' }, tune: { key: 'f', short: 'f' } },
  oap: { resize: { y: 'length' }, tune: { key: 'f', short: 'f' } },
  lens: { resize: { y: 'dia' }, tune: { key: 'f', short: 'f' } },
  lensc: { resize: { y: 'dia' }, tune: { key: 'f', short: 'f' } },
  // Radii are the physics, so the tune knob drives R1 (and the shape
  // follows); resize sets the clear aperture, which is genuinely a size.
  thicklens: { resize: { y: 'dia' }, tune: { key: 'r1', short: 'R₁' } },
  telescope: { resize: { y: 'dia' }, tune: { key: 'f2', short: 'f₂' } },
  // The blue handle changes the physical front opening. The purple control
  // moves the independently specified specimen focus; neither rewrites M/NA.
  objective: { resize: { y: 'frontAperture' }, tune: { key: 'efl', short: 'EFL' } },
  dichroic: { resize: { y: 'length' }, tune: { key: p => p.dtype === 'bandpass' ? 'center' : 'cutoff', short: 'λ' } },
  filter: { resize: { y: 'length' }, tune: { key: p => p.ftype === 'nd' ? 'trans' : p.ftype === 'bandpass' ? 'center' : 'cutoff', short: 'filter' } },
  bs: { resize: { uniform: 'size' }, tune: { key: 'ratio', short: 'T' } },
  polarizer: { resize: { y: 'length' }, tune: { key: 'pangle', short: 'axis' } },
  hwp: { resize: { y: 'length' }, tune: { key: 'a', short: 'axis' } },
  qwp: { resize: { y: 'length' }, tune: { key: 'a', short: 'axis' } },
  pbs: { resize: { uniform: 'size' } },
  isolator: { resize: { y: 'aperture' } },
  grating: { resize: { y: 'length' }, tune: { key: 'lines', short: 'lines' } },
  slit: { resize: { y: 'length' }, tune: { key: 'gap', short: 'gap' } },
  prism: { resize: { uniform: 'psize' }, tune: { key: 'apex', short: 'apex' } },
  freeglass: { resize: { uniform: 'scale' }, tune: { key: 'ior', short: 'n', when: p => p.material === 'constant' } },
  diffuser: { resize: { y: 'length' }, tune: { key: 'div', short: 'spread' } },
  slm: { resize: { y: 'length' }, tune: { key: 'zeroFrac', short: '0th', when: p => p.zeroOrder } },
  dmd: { resize: { y: 'length' }, tune: { key: 'tilt', short: 'tilt' } },
  dm: { resize: { y: 'length' }, tune: { key: 'steer', short: 'steer' } },
  detector: { resize: { y: 'aperture' } },
  pmt: { resize: { y: 'aperture' }, tune: { key: 'gain', short: 'gain' } },
  camera: { resize: { y: 'ch' }, tune: { key: 'pixels', short: 'px' } },
  eye: { resize: { uniform: 'diameter' }, tune: { key: 'focus', short: 'f' } },
  display: { resize: { uniform: 'displayScale' } },
  beamdump: { resize: { y: 'aperture' } },
  aom: { resize: { y: 'aperture' }, tune: { key: 'deflect', short: 'deflect' } },
  aotf: { resize: { y: 'aperture' }, tune: { key: 'center', short: 'λ select' } },
  delayline: { resize: { y: 'aperture' }, tune: { key: 'delayMm', short: 'ΔL' } },
  eom: { resize: { y: 'aperture' }, tune: { key: 'retardance', short: 'Δφ', when: p => p.modulate && p.driveMode !== 'switching' } },
  chopper: { resize: { uniform: 'diameter' }, tune: { key: 'chopDuty', short: 'duty', when: p => p.modulate } },
  crystal: { resize: { y: 'aperture' }, tune: { key: 'efficiency', short: 'η', when: p => p.convert !== 'none' } },
  glassrod: { resize: { x: 'rodlen', y: 'dia' }, tune: { key: 'ior', short: 'n' } },
  sample: { resize: { x: 'aperture' }, tune: { key: 'transmission', short: 'T', when: p => p.transmitExc } },
  stage: { resize: { x: 'aperture' } },
  arrowann: { resize: { x: 'len' }, tune: { key: 'width', short: 'stroke' } },
  figureframe: { resize: { x: 'w', y: 'h', anchor: true } },
  highlight: { resize: { x: 'w', y: 'h', anchor: true } },
  box: { resize: { x: 'w', y: 'h' } },
  blocker: { resize: { x: 'w', y: 'h' } },
  textlabel: { resize: { uniform: 'fontSize' } },
  probe: { resize: { uniform: 'displayScale' } },
  gascell: { resize: { x: 'length', y: 'height' }, tune: { key: 'transparency', short: 'transp.' } },
  window: { resize: { y: 'length' }, tune: { key: 'transparency', short: 'transp.' } },
};

for (const [type, direct] of Object.entries(DIRECT)) {
  if (registry[type]) registry[type].direct = direct;
}

export function getDirectManipulation(el) {
  const def = registry[el?.type];
  if (!def?.direct) return null;
  const resolveKey = value => typeof value === 'function' ? value(el.params) : value;
  const resize = def.direct.resize && (!def.direct.resize.when || def.direct.resize.when(el.params))
    ? Object.fromEntries(Object.entries(def.direct.resize).filter(([key]) => key !== 'when').map(([key, value]) => [key, resolveKey(value)]))
    : null;
  const rawTune = def.direct.tune;
  let tune = null;
  if (rawTune && (!rawTune.when || rawTune.when(el.params))) {
    const key = resolveKey(rawTune.key);
    const param = (def.params || []).find(spec => spec.key === key);
    if (param && (param.type === 'number' || param.type === 'optsize' || param.type === 'derived')) tune = { ...rawTune, key, param };
  }
  return resize || tune ? { resize, tune } : null;
}

// User-facing capability metadata. The distinction is deliberately explicit:
// simulated elements affect traced rays, configurable elements need an active
// mode, and diagram-only elements are honest visual annotations/placeholders.
const ELEMENT_HELP = {
  cwlaser: 'Emits a steady monochromatic collimated beam at one wavelength.',
  pulsedlaser: 'Emits a mode-locked pulse train; its bandwidth follows the pulse duration while transform-limited, or is set by hand.',
  sclaser: 'Emits a configurable pulsed supercontinuum band as a collimated beam.',
  pointsource: 'Emits isotropic light (360° by default, optionally broadband) that fades over a short evanescent range unless captured by a nearby lens, objective, or fiber tip.',
  objarrow: 'Traces object-tip rays and draws an ideal paraxial image; the image marker does not model downstream clipping.',
  mirror: 'Reflects rays with configurable size and reflectivity.',
  retroreflector: 'A right-angle pair of mirrors that reflects any incoming ray back antiparallel to its incidence direction, independent of angle. Its delay-line motion starts at the placed position and periodically slides the whole element away along its own apex axis, only ever lengthening the round-trip optical path over a user-set range — a physical model of a mechanical retroreflecting delay stage.',
  galvo: 'Reflects rays from a static or animated ideal quasistatic mechanical scan angle; high scan rates use a slowed preview.',
  cmirrorx: 'Diverges reflected rays with a paraxial focal-length model.',
  cmirror: 'Focuses reflected rays with a paraxial focal-length model.',
  oap: 'Reflects from segmented parabolic geometry toward the configured focus.',
  lens: 'Bends rays with a thin-lens, paraxial focal-length model.',
  lensc: 'Diverges rays with a negative thin-lens focal length.',
  thicklens: 'Refracts through two separated spherical or flat faces of selectable catalogue glass; focal distance plus spherical and chromatic aberration emerge from the traced geometry.',
  telescope: 'Applies two thin lenses separated by their focal lengths.',
  objective: 'Set the effective focal length (EFL) — the focal length of the whole objective as one equivalent lens — plus a working distance no longer than EFL; magnification is reported for a 200 mm tube lens. The equivalent plane sits inside the barrel so light focuses exactly one working distance past the front tip and the back focal plane (BFP) stays a real conjugate. Rated NA is the back pupil (2fNA): a beam filling it converges at the rated angle, and overfilling loses the overflow to the barrel.',
  dichroic: 'Transmits or reflects wavelength bands around its configured cutoff.',
  filter: 'Passes a spectral band or attenuates intensity as a neutral-density filter.',
  bs: 'Splits incident light into transmitted and reflected branches.',
  grating: 'Creates selected diffraction orders using the grating equation.',
  prism: 'Refracts through all three drawn N-BK7 boundaries with wavelength-dependent dispersion.',
  freeglass: 'Refracts through a directly editable boundary of straight segments and exact circular arcs. Supports constant index or selectable catalogue-glass dispersion; overlapping glass bodies are not surface-merged.',
  diffuser: 'Spreads incident light into a configurable angular fan.',
  glassrod: 'Refracts at every glass-air boundary and supports total internal reflection.',
  polarizer: 'Applies a linear polarization axis and Malus-law attenuation.',
  hwp: 'Rotates linear polarization around the configured fast axis.',
  qwp: 'Applies quarter-wave retardance, producing linear, elliptical, or circular polarization from the input state.',
  pbs: 'Separates orthogonal polarization states into two paths.',
  isolator: 'Passes light in one direction and blocks reverse propagation.',
  slit: 'Blocks rays outside the configured aperture gap.',
  beamdump: 'Absorbs incident rays.',
  blocker: 'Absorbs rays but stays hidden in exported figures.',
  slm: 'Reflects by default and can overlay lens-array, grating, steering, or speckle functions.',
  dmd: 'Routes a configurable binary micromirror pattern into ON and optional OFF orders.',
  dm: 'Applies continuous reflective tip, tilt, and paraxial defocus.',
  detector: 'Measures qualitative ray signal, spectrum, polarization, and spot span.',
  pmt: 'Applies configurable qualitative gain and saturation to detected optical signal.',
  camera: 'Bins incident rays into a configurable one-dimensional sensor profile.',
  eye: 'Focuses through a configurable pupil and reports the qualitative retinal signal and spot.',
  display: 'Shows the live qualitative output of a linked photodetector, PMT, camera, or retina.',
  aom: 'Deflects and frequency-shifts first-order light with efficiency, zero-order, and square or sinusoidal RF modulation.',
  aotf: 'Selects a configurable spectral band, then deflects and attenuates the selected acousto-optic order.',
  delayline: 'Adds a configurable folded optical-path delay while preserving the outgoing beam axis.',
  eom: 'Applies voltage-controlled polarization retardance — either a fixed waveplate-like shift, or a square-wave switch between two retardance states at a set frequency; an analyzer converts either into intensity modulation.',
  chopper: 'Gates finite-duration pulse trains in time and draws CW light as a chunked on/off pattern matching its duty cycle; detector readings use the duty-averaged CW power.',
  crystal: 'Converts a configurable fraction of pump power into SHG, THG, supercontinuum, OPO, or custom output.',
  sample: 'Attenuates excitation and can emit up to five stacked signals at once — fluorescence, SHG, THG, SFG, and CARS. Parametric signals are forward-generated with an optional weaker epi (backward) lobe; SFG and CARS additionally require two different excitation wavelengths at the same spot.',
  stage: 'Mechanically clips rays outside its clear aperture and optionally contains a sample. The piezo stage can scan the sample along its long axis (XY), along the beam axis (Z, depth), or raster both together; a resin sample can also show pulsed 2PP voxel marks.',
  probe: 'Reads spectrum, wavelength, or polarization from the nearest traced beam.',
  arrowann: 'Diagram annotation; does not interact with rays.',
  figureframe: 'Canvas-only export crop. Its border and handles never appear in the exported figure.',
  textlabel: 'Diagram annotation; does not interact with rays.',
  highlight: 'Background wash for calling out a region of the sketch; always drawn behind rays and elements, never interacts with rays.',
  box: 'Generic enclosure with explicit pass-through or beam-blocking behavior.',
  gascell: 'Diagram-only gas cell housing for gas-filled hollow-core fiber setups; never bends, blocks, or absorbs a ray.',
  window: 'Diagram-only optical window; never bends, blocks, or absorbs a ray.',
};

const DIAGRAM_ONLY = new Set(['arrowann', 'textlabel', 'figureframe', 'highlight', 'gascell', 'window']);
const SHAPERS = new Set(['slm']);

export function getElementMeta(type, params = {}, context = {}) {
  let tier = DIAGRAM_ONLY.has(type) ? 'diagram' : 'simulated';
  let note = '';
  let description = ELEMENT_HELP[type] || registry[type]?.description || 'Optical workbench component.';
  const displayLinkMissing = type === 'display' && params.sensorId
    && context.element && Array.isArray(context.elements)
    && !resolveDisplaySensor(context.element, context.elements);

  if (type === 'objective' && objectiveMediumKey(params) === 'legacy') {
    tier = 'configurable';
    note = 'This older high-NA sketch did not record a front medium. Choose air, water, oil, or a custom index before treating its rated NA as configured.';
  } else if (type === 'objective' && objectiveMediumKey(params) !== 'air') {
    note = 'Medium and NA set a qualitative angular acceptance guide. The curved immersion bridge is schematic; it does not add refraction, focal shift, wetting, or aberration correction.';
  } else if (type === 'objective') {
    note = 'Dry objectives are capped at NA 0.85, the practical ceiling for real dry designs. NA sets the back-pupil diameter 2fNA, so it changes the focusing cone and what an overfilled beam costs.';
  } else if (type === 'eom' && !params.modulate) {
    tier = 'configurable';
    note = 'Apply voltage to set a polarization retardance; use a downstream polarizer or PBS for amplitude modulation.';
  } else if (type === 'eom' && params.modulate && params.driveMode === 'switching') {
    note = params.switchMode === 'custom'
      ? 'The two retardance states alternate at the switching frequency. A downstream polarizer or PBS turns that into real intensity modulation — with a pulsed source, individual pulses are routed by the state they meet, so a photodetector on a screen shows the modulated train.'
      : 'Alternates the incoming polarization between two orthogonal states (H↔V) at the switching frequency; no crystal-axis tuning needed. Put a polarizer or PBS downstream to turn it into intensity modulation — with a pulsed source, individual pulses are routed by the state they meet, so a photodetector on a screen shows the modulated train.';
  } else if (type === 'display' && (!params.sensorId || displayLinkMissing)) {
    tier = 'configurable';
    note = displayLinkMissing
      ? 'The linked sensor is no longer in this sketch. Choose another input; the data cable never changes traced rays.'
      : 'Choose a sensor input in the inspector. The drawn cable carries data only and never changes traced rays.';
  } else if (type === 'crystal' && (!params.convert || params.convert === 'none')) {
    tier = 'configurable';
    note = 'Choose a conversion mode to generate an output wavelength.';
  } else if (SHAPERS.has(type) && (!Array.isArray(params.layers) || params.layers.length === 0)) {
    tier = 'configurable';
    note = 'Currently a plain reflector. Add an optical structure to shape the wavefront.';
  } else if (DIAGRAM_ONLY.has(type)) {
    note = 'This element is intentionally visual and never changes traced rays.';
  } else if (type === 'thicklens' || type === 'freeglass') {
    const cemented = context.element && Array.isArray(context.elements)
      ? touchingGlassBody(context.element, context.elements)
      : null;
    const adjusted = type === 'thicklens' ? thickLensAdjustment(params) : null;
    if (cemented) {
      tier = 'configurable';
      note = `This body is touching another glass body. The tracer cannot resolve two interfaces that close together, so one of them is skipped and the rays are wrong — not obviously wrong, just wrong. Leave at least ${MIN_CEMENT_GAP} mm between them; a real cemented group is a 10-20 µm layer of not-quite-glass anyway.`;
    } else if (adjusted) {
      note = `Requested radii or thickness cannot close at this aperture. The trace uses ${formatRealizedGeometry(params)}; see Geometry used below.`;
    } else if (type === 'thicklens') {
      note = 'A 2D meridional singlet with spherical or flat faces and visible-band catalogue approximations. Aspheres, skew rays, coatings, and calibrated off-axis aberrations are not modeled.';
    } else {
      note = 'Straight and circular-arc boundaries use qualitative geometric refraction. Nested or overlapping glass bodies are not surface-merged.';
    }
  } else if (type === 'stage' && params.voxelPreview) {
    note = 'Pulsed arrivals leave canvas-only 2PP voxel markers in the mounted sample; marker size/opacity qualitatively broadens with Z (depth) offset from focus. This is a 2D scan preview, not a threshold, dose, curing, or true 3D fabrication simulation.';
  } else if (type === 'stage' && params.pzMode && params.pzMode !== 'static') {
    note = 'The piezo stage motion is a display-time animation of the mounted sample — "sync" is a simple serpentine raster, not a calibrated piezo trajectory.';
  } else if (type === 'display') {
    note = 'The screen mirrors a linked sensor’s qualitative tracer output. Its data cable never changes traced rays.';
  }

  const labels = { simulated: 'Simulated', configurable: 'Needs setup', diagram: 'Diagram only' };
  return {
    tier,
    status: labels[tier],
    description,
    note,
  };
}

export const categories = [
  'Annotations',
  'Sources',
  'Mirrors',
  'Lenses',
  'Fibers',
  'Filters & Splitters',
  'Dispersive elements',
  'Polarization',
  'Beam Block',
  'Wavefront Shaping',
  'Detectors',
  'Modulators',
  'Pulse Timing',
  'Nonlinear Optics',
  'Microscopy',
  'Custom',
  'Lab elements',
];

export function getSize(el) {
  const d = registry[el.type];
  if (d.size_ && typeof d.size_ === 'function') return d.size_(el);
  if (typeof d.size === 'function') return d.size(el);
  return d.size;
}

// Axis-aligned world bounds for fitting/export. This includes common labels
// and the probe's readout card, which extend beyond the element hit box.
export function getVisualBounds(el, { includeLabel = true } = {}) {
  const d = registry[el.type];
  if (!d) return null;
  const sz = getSize(el);
  const a = (el.rot || 0) * Math.PI / 180;
  const ex = (Math.abs(sz.w * Math.cos(a)) + Math.abs(sz.h * Math.sin(a))) / 2;
  const ey = (Math.abs(sz.w * Math.sin(a)) + Math.abs(sz.h * Math.cos(a))) / 2;
  const anchor = boxAnchor(el);
  const cx = el.x + anchor.x * Math.cos(a) - anchor.y * Math.sin(a);
  const cy = el.y + anchor.x * Math.sin(a) + anchor.y * Math.cos(a);
  let x0 = cx - ex, x1 = cx + ex, y0 = cy - ey, y1 = cy + ey;

  if (el.type === 'probe') {
    // The card is counter-rotated to stay upright, so its world box is
    // axis-aligned and offset from the element — not a rotation of some
    // element-local rectangle.
    const scale = probeScale(el);
    const place = probeCardPlacement(el, probeCard(el, probeAt(el.x, el.y)), scale);
    const left = el.x + place.x, top = el.y + place.y;
    x0 = Math.min(x0, left); x1 = Math.max(x1, left + place.w);
    y0 = Math.min(y0, top); y1 = Math.max(y1, top + place.h);
  }

  if (includeLabel && el.showLabel && el.label) {
    const width = Math.max(8, String(el.label).length * 6.2);
    const pos = el.labelPos || 'b';
    if (pos === 'b') {
      const y = el.y + ey + 13;
      x0 = Math.min(x0, el.x - width / 2); x1 = Math.max(x1, el.x + width / 2); y1 = Math.max(y1, y + 3);
    } else if (pos === 't') {
      const y = el.y - ey - 7;
      x0 = Math.min(x0, el.x - width / 2); x1 = Math.max(x1, el.x + width / 2); y0 = Math.min(y0, y - 11);
    } else if (pos === 'l') {
      x0 = Math.min(x0, el.x - ex - 7 - width); y0 = Math.min(y0, el.y - 7); y1 = Math.max(y1, el.y + 7);
    } else {
      x1 = Math.max(x1, el.x + ex + 7 + width); y0 = Math.min(y0, el.y - 7); y1 = Math.max(y1, el.y + 7);
    }
  }
  return { x0, y0, x1, y1 };
}

// element label, drawn OUTSIDE the rotated group: always upright, positioned
// around the element's rotated bounding box (labelPos: b/t/l/r)
export function labelSVG(el) {
  if (!el.showLabel || !el.label) return '';
  const sz = getSize(el);
  const a = (el.rot || 0) * Math.PI / 180;
  const ex = (Math.abs(sz.w * Math.cos(a)) + Math.abs(sz.h * Math.sin(a))) / 2;
  const ey = (Math.abs(sz.w * Math.sin(a)) + Math.abs(sz.h * Math.cos(a))) / 2;
  const pos = el.labelPos || 'b';
  let x = el.x, y = el.y, anchor = 'middle', base = '';
  if (pos === 'b') y += ey + 13;
  else if (pos === 't') y -= ey + 7;
  else if (pos === 'l') { x -= ex + 7; anchor = 'end'; base = 'dominant-baseline="central"'; }
  else { x += ex + 7; anchor = 'start'; base = 'dominant-baseline="central"'; }
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" ${base} font-size="11" fill="#444">${esc(el.label)}</text>`;
}

export function createElement(type, x = 0, y = 0) {
  const d = registry[type];
  const params = {};
  for (const p of d.params || []) {
    if (p.type === 'readout' || p.type === 'derived') continue; // computed on demand, never stored
    params[p.key] = Array.isArray(p.def) ? JSON.parse(JSON.stringify(p.def)) : p.def;
  }
  return { id: uid(), type, x, y, rot: 0, label: '', showLabel: false, params };
}
