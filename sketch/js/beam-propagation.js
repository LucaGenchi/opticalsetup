// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Beam propagation in the drawing plane (step G1 of the Physics in 2D track,
// docs/physics/beam-propagation.md): the beam parameter a source starts, and
// the in-plane ray-transfer matrix measured from the tracer with two
// companion rays. DOM-free; sketch/js/raytrace.js moves the companions
// through the same surfaces as the central ray and calls these functions.
//
// The waist-ray and divergence-ray method of optical design programs
// (R. Herloski, S. Marshall and R. Antos, Appl. Opt. 22, 1168 (1983); J. A.
// Arnaud, Appl. Opt. 24, 538 (1985)): one companion starts displaced across
// the central ray by δy, the other tilted by δθ. Wherever the central ray
// is, each companion's offset along p̂ (the in-plane transverse direction,
// the basis of step A2) and its reduced slope n·sin(angle) relative to the
// central ray, divided by its starting offset, are the columns of the
// matrix from the source to that point:
//
//   A = y₁/δy   C = n·u₁/δy     (the displaced companion)
//   B = y₂/δV   D = n·u₂/δV     (the tilted one, δV = n₀ sin δθ)
//
// The matrices are finite differences, exact to first order in δ; the
// test suite shows them converging to the analytic matrices as δ shrinks.

import { qFromWaist } from './gaussian-beam.js';

const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;

// The in-plane transverse direction p̂ of a ray travelling along d: d turned
// a quarter turn anticlockwise in the drawing.
export const transverse = d => ({ x: -d.y, y: d.x });
const rotate = (d, angle) => ({ x: d.x * Math.cos(angle) - d.y * Math.sin(angle), y: d.x * Math.sin(angle) + d.y * Math.cos(angle) });

// The companions' starting offsets: 0.1 µm and 1 µrad. The matrices are a
// first-order finite difference, so their error shrinks in proportion to
// these (about 1e-6 of B through a prism or a grating here, 4e-7 on D of a
// tilted mirror), while positions of order 1 m resolve to about 1e-13 mm,
// some 1e-8 of the offsets.
export const COMPANION_STEP = Object.freeze({ offsetMm: 1e-4, tiltRad: 1e-6 });

// The two companions of a central ray starting at p along d in a medium of
// index n.
export function companionStarts(p, d, step = COMPANION_STEP) {
  const t = transverse(d);
  return [
    { p: { x: p.x + t.x * step.offsetMm, y: p.y + t.y * step.offsetMm }, d: { ...d } },
    { p: { ...p }, d: rotate(d, step.tiltRad) },
  ];
}

// A companion's offset and reduced slope relative to the central ray at the
// plane through `p` square to `d`, in a medium of index n.
export function companionOffset(central, companion, index) {
  const { p, d } = central;
  const along = dot(companion.d, d);
  if (!(along > 0)) return null;
  const s = -dot({ x: companion.p.x - p.x, y: companion.p.y - p.y }, d) / along;
  const at = { x: companion.p.x + companion.d.x * s - p.x, y: companion.p.y + companion.d.y * s - p.y };
  return { y: dot(at, transverse(d)), v: index * cross(d, companion.d) };
}

// The matrix from the companions' start (index n₀) to the plane of `central`
// (index n), or null when a companion no longer travels with it.
export function measuredMatrix(central, companions, index, startIndex = 1, step = COMPANION_STEP) {
  const displaced = companionOffset(central, companions[0], index);
  const tilted = companionOffset(central, companions[1], index);
  if (!displaced || !tilted) return null;
  const dV = startIndex * Math.sin(step.tiltRad);
  const matrix = { A: displaced.y / step.offsetMm, C: displaced.v / step.offsetMm, B: tilted.y / dV, D: tilted.v / dV };
  return Object.values(matrix).every(Number.isFinite) ? matrix : null;
}

// How far the beam parameter is followed: a far-field half-angle above this
// leaves the paraxial Gaussian beam behind, and the readout declines.
export const PARAXIAL_LIMIT_RAD = 0.2;

// An edge closer than this many beam radii to the central ray clips the
// beam: at 1.5 w a Gaussian's in-plane profile has 0.13 % of its power
// beyond the edge on that side.
export const CLIP_RADII = 1.5;

// The beam a laser starts: a laser drawn with a size is a Gaussian beam
// whose 1/e² diameter is its Beam width, with the waist at its output and a
// beam quality M² (1 by default). The Beam width is the only size setting,
// so the drawn beam and the beam parameter cannot disagree. A laser drawn as
// a simple line, a supercontinuum, an LED and a point source start none
// (`noBeamReason` says why). Null without one.
export const BEAM_SOURCE_TYPES = new Set(['cwlaser', 'pulsedlaser']);
export function sourceBeamParameter(type, params = {}) {
  if (!BEAM_SOURCE_TYPES.has(type) || params.beamMode !== 'beam') return null;
  const waistUm = Number(params.beamWidth) * 500;
  const wavelengthNm = Number(params.wavelength);
  if (!(waistUm > 0) || !(wavelengthNm > 0)) return null;
  const m2 = Math.max(1, Number(params.beamM2) || 1);
  return { waistUm, m2, wavelengthNm, q: qFromWaist({ waistUm, wavelengthNm, m2, index: 1 }) };
}

// Why a source starts no Gaussian beam, in a sentence a readout can show;
// null for a source that starts one.
export function noBeamReason(type, params = {}) {
  if (BEAM_SOURCE_TYPES.has(type)) {
    return params.beamMode === 'beam' ? null : 'this laser is drawn as a simple line; draw it as a beam with size for a Gaussian beam';
  }
  if (type === 'sclaser') return 'a supercontinuum spans many wavelengths, each with its own beam size and divergence, so no single Gaussian beam describes it';
  if (type === 'ledsource') return 'an LED is an incoherent, extended source: it is described by rays, not by a Gaussian beam';
  if (type === 'pointsource') return 'a point source radiates in all directions: it is described by rays, not by a Gaussian beam';
  return 'this light does not come from a laser drawn with a size';
}

// The beam a fiber's output starts, when its mode is known: a hollow-core
// capillary's HE₁₁ mode through the best-coupling Gaussian of
// sketch/js/fiber.js (1/e field radius 0.64 a), or a step-index fiber set
// single-mode through the best Gaussian of its LP₀₁ mode
// (calculators/fiber-coupling/lp01.js, given as `lp01Ratio(V)` = w/a). The
// waist sits on the end face. Otherwise { issue }.
export function fiberBeamParameter(fiber, wavelengthNm, lp01Ratio) {
  const nm = Number(wavelengthNm);
  if (!(nm > 0)) return { issue: 'no wavelength' };
  if (fiber.fiberModel === 'argon') {
    const a = Number(fiber.coreDiameterUm) / 2;
    if (!(a > 0)) return { issue: 'no core diameter' };
    return { waistUm: 0.64 * a, m2: 1, wavelengthNm: nm, q: qFromWaist({ waistUm: 0.64 * a, wavelengthNm: nm }), mode: 'HE11' };
  }
  const core = Number(fiber.singleModeCoreUm);
  if (!(core > 0)) return { issue: 'no single-mode core is set, so its output mode is not known' };
  const a = core / 2, na = Number(fiber.inputNA);
  const V = 2 * Math.PI * a * 1e-3 * na / (nm * 1e-6);
  if (!(V > 0)) return { issue: 'no numerical aperture' };
  if (V >= 2.405) return { issue: `the fiber guides more than one mode at ${Math.round(nm)} nm (V = ${V.toFixed(2)})` };
  if (V < 1.2) return { issue: `V = ${V.toFixed(2)} is below the range the LP01 fit covers (1.2)` };
  const waistUm = lp01Ratio(V) * a;
  return { waistUm, m2: 1, wavelengthNm: nm, q: qFromWaist({ waistUm, wavelengthNm: nm }), mode: 'LP01', V };
}

// The shortest distance between segments PQ and AB, and where along PQ it
// falls (0 at P, 1 at Q).
export function segmentGap(P, Q, A, B) {
  const u = { x: Q.x - P.x, y: Q.y - P.y }, v = { x: B.x - A.x, y: B.y - A.y };
  const w = { x: P.x - A.x, y: P.y - A.y };
  const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w);
  const den = a * c - b * b;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (b * e - c * d) / den)) : 0;
  let t = c > 1e-12 ? (b * s + e) / c : 0;
  if (t < 0 || t > 1) {
    t = Math.min(1, Math.max(0, t));
    s = a > 1e-12 ? Math.min(1, Math.max(0, (b * t - d) / a)) : 0;
  }
  const dx = w.x + u.x * s - v.x * t, dy = w.y + u.y * s - v.y * t;
  return { distance: Math.hypot(dx, dy), along: s };
}
