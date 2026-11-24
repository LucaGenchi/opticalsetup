// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The Faraday rotator and the physical optical isolator (step P2 of the
// Physics in 2D track, docs/physics/faraday.md). DOM-free;
// sketch/js/raytrace.js applies these to the light that crosses the
// elements.
//
// A magneto-optic medium in a magnetic field B along the beam rotates the
// polarization by θ = V·B·L (V the Verdet constant, L the length). The
// rotation is fixed by the field, not by the direction the light travels:
// it is a turn of the polarization about the field's direction b̂,
// right-handed for V > 0. In the basis of sketch/js/mueller.js (Jones
// vectors (E_p, E_s), the azimuth measured from p̂ towards ŝ, (p̂, ŝ, k̂)
// right-handed) a turn right-handed about k̂ raises the azimuth. So light
// travelling along b̂ sees its azimuth raised by V·B·L, and light travelling
// against it sees it lowered by the same amount, in its own basis. Seen
// looking towards the source, a positive V turns the polarization
// anticlockwise for light travelling along the field and clockwise for light
// travelling against it; TGG's V is negative. A return pass therefore
// doubles the rotation instead of undoing it, which no reciprocal element
// (a waveplate, an optically active medium) can do.
//
// To first order the rotation does not depend on the angle at which light
// crosses the medium: the path through it grows as 1/cos θ while the field
// component along the ray falls as cos θ.

import { MATERIAL_RECORDS, verdetConstant } from './materials/catalogue.js';
import { applyMueller, composeMueller, linearDiattenuatorMueller, rotatorMueller, stokesVector } from './mueller.js';

const R2D = 180 / Math.PI;

// The materials a Faraday element offers: the catalogue's records that carry
// Verdet data, and a custom constant.
const VERDET_RECORDS = [...MATERIAL_RECORDS.values()].filter(record => record.verdet);
export const FARADAY_MATERIAL_OPTIONS = Object.freeze([
  ...VERDET_RECORDS.map(record => [record.id, record.label]),
  ['custom', 'Custom Verdet constant'],
]);
const recordOf = id => VERDET_RECORDS.find(record => record.id === id) || null;

// The Verdet constant of the element's material at a vacuum wavelength, in
// rad/(T·m), signed; or { issue } when it is not known there. A custom
// constant is the same at every wavelength.
export function verdetAt(params, wavelengthNm) {
  const nm = Number(wavelengthNm);
  if (!(nm > 0)) return { issue: 'no wavelength' };
  if (params.material === 'custom') {
    const v = Number(params.verdetCustom);
    return Number.isFinite(v) ? { verdet: v } : { issue: 'no Verdet constant is set' };
  }
  const record = recordOf(params.material) || VERDET_RECORDS[0];
  if (!record) return { issue: 'no material with Verdet data' };
  const v = verdetConstant(record, nm);
  if (v === null) {
    const [lo, hi] = record.verdet.range;
    return { issue: `${record.label.replace(/,.*$/, '')} has no Verdet constant at ${Math.round(nm)} nm: its data cover ${lo}–${hi} nm`, range: [lo, hi] };
  }
  return { verdet: v, record };
}

// The field's direction b̂ relative to the element's forward axis: +1 along
// it, −1 against it.
export const fieldSign = params => (params.fieldDir === 'against' ? -1 : 1);

// The rotation a Faraday rotator gives light travelling along its field, in
// degrees (the azimuth's change, in that light's own basis): V·B·L. Or
// { issue }.
export function faradayRotationDeg(params, wavelengthNm) {
  const v = verdetAt(params, wavelengthNm);
  if (v.issue) return v;
  const fieldT = Math.max(0, Number(params.fieldT) || 0);
  const lengthM = Math.max(0, Number(params.lengthMm) || 0) / 1000;
  // (No field gives 0, not −0.)
  return { deg: v.verdet * fieldT * lengthM * R2D || 0, verdet: v.verdet };
}

// The rotation light crossing the element sees in its own basis: positive
// for a positive V along the field, and of the opposite sign against it.
// `alongForward` says whether the light travels along the element's own
// forward axis.
export function rotationForCrossingDeg(params, wavelengthNm, alongForward) {
  const r = faradayRotationDeg(params, wavelengthNm);
  if (r.issue) return r;
  return { ...r, deg: r.deg * fieldSign(params) * (alongForward ? 1 : -1) };
}

// A normalized Stokes state turned by `deg` (azimuth raised, from p̂ towards
// ŝ); null (unpolarized) stays null.
export function rotateStokes(stokes, deg) {
  if (!stokes) return null;
  const [s0, s1, s2, s3] = applyMueller(rotatorMueller(deg), stokesVector(stokes));
  return { s1: s1 / s0, s2: s2 / s0, s3: s3 / s0 };
}

// ---------------------------------------------------------------- Isolator
//
// The physical isolator: an input polarizer at a, a Faraday rotator whose
// field is chosen so that light travelling forward is turned by +45° at the
// design wavelength λd, and an output polarizer at a + 45°. With ideal
// polarizers and a rotation error δ(λ) = θ(λ) − 45°, the forward
// transmission is cos²δ and light returning along the output polarizer
// leaks back through the input one as sin²δ. Each polarizer here passes a
// fraction 1/ER (its extinction ratio) of the light polarized across its
// axis, which sets the isolation where δ is small.

// The forward rotation at a wavelength, in degrees: 45° at λd, scaled by
// the material's dispersion, V(λ)/V(λd). Or { issue }.
export function isolatorRotationDeg(params, wavelengthNm) {
  const design = verdetAt(params, params.designWl);
  if (design.issue) return { issue: `the design wavelength: ${design.issue}` };
  if (!(Math.abs(design.verdet) > 0)) return { issue: 'the Verdet constant at the design wavelength is zero' };
  const here = verdetAt(params, wavelengthNm);
  if (here.issue) return here;
  return { deg: 45 * here.verdet / design.verdet };
}

// The field-length product B·L (T·m) the design needs: |45°| / |V(λd)|.
export function isolatorFieldLength(params) {
  const design = verdetAt(params, params.designWl);
  if (design.issue || !(Math.abs(design.verdet) > 0)) return null;
  return (Math.PI / 4) / Math.abs(design.verdet);
}

// The fraction a polarizer of extinction ratio `db` (dB) passes across its
// axis.
export const leakOfExtinction = db => 10 ** (-Math.max(0, Number(db) || 0) / 10);

// What light of normalized state `stokes` (null: unpolarized) keeps, and the
// state it leaves in, crossing the physical isolator at one wavelength.
// `forward` is the direction of travel relative to the element's arrow;
// every angle is in the crossing light's own basis, which `axisFor` gives
// (an axis set for forward light appears at −θ to light going the other
// way). Or { issue }.
export function isolatorCrossing(params, wavelengthNm, stokes, forward, axisFor = a => (forward ? a : -a)) {
  const rotation = isolatorRotationDeg(params, wavelengthNm);
  if (rotation.issue) return rotation;
  const leak = leakOfExtinction(params.extinctionDb);
  const a = Number(params.inputAxis) || 0;
  const input = linearDiattenuatorMueller(axisFor(a), 1, leak);
  const output = linearDiattenuatorMueller(axisFor(a + 45), 1, leak);
  // Forward light is turned by +45° at λd in its own basis; light going back
  // by the opposite amount in its own basis, the same turn about the field.
  const rotator = rotatorMueller(forward ? rotation.deg : -rotation.deg);
  const m = forward ? composeMueller(composeMueller(input, rotator), output) : composeMueller(composeMueller(output, rotator), input);
  const [s0, s1, s2, s3] = applyMueller(m, stokesVector(stokes));
  if (!(s0 > 0)) return { transmission: 0, stokes: null, rotationDeg: rotation.deg };
  return { transmission: s0, stokes: { s1: s1 / s0, s2: s2 / s0, s3: s3 / s0 }, rotationDeg: rotation.deg };
}

// The isolator's figures at one wavelength: the forward transmission of
// light polarized along the input polarizer, the transmission back of light
// polarized along the output polarizer (the reflection of the forward
// beam), and the isolation, −10·log10 of the latter. Or { issue }.
export function isolatorFigures(params, wavelengthNm) {
  const a = Number(params.inputAxis) || 0;
  const linear = deg => ({ s1: Math.cos(2 * deg * Math.PI / 180), s2: Math.sin(2 * deg * Math.PI / 180), s3: 0 });
  const forward = isolatorCrossing(params, wavelengthNm, linear(a), true);
  if (forward.issue) return forward;
  // Light returning along the output polarizer: at a + 45° in the forward
  // basis, at −(a + 45°) in its own.
  const back = isolatorCrossing(params, wavelengthNm, linear(-(a + 45)), false);
  const isolationDb = back.transmission > 0 ? -10 * Math.log10(back.transmission) : Infinity;
  return { rotationDeg: forward.rotationDeg, forward: forward.transmission, backward: back.transmission, isolationDb };
}
