// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// One field's pupil at one wavelength, for the analyses that need the light
// to be coherent (engine/imaging.js, engine/coupling.js): the same reference
// sphere, direction scales and validity guards as the diffraction analysis
// (engine/diffraction.js), for a single wavelength. The sphere is centred on
// the primary wavelength's chief ray at the image plane, as there, so another
// wavelength's image carries its lateral colour.

import { normalizeSystem } from './system.js';
import { firstOrder, paraxialRay, mediumIndices } from './paraxial.js';
import { traceModel, FAILURES } from './trace.js';
import { traceBundle, referenceSphere } from './wavefront.js';
import { analyzeSystem, checkSystem, HIGH_NA } from './analyze.js';
import { directionScale, pupilSamples, pupilDistortion, FRESNEL_LIMIT, ALIAS_WAVES, PUPIL_DISTORTION_LIMIT, MIN_LIT } from './diffraction.js';

const fmt = (v, d = 3) => String(Number(Number(v).toPrecision(d)));

// Pupil samples on the nodes of a grid of spacings (dpx, dpy), the centre
// among them, inside the unit disc. Each sample's signed grid indices
// (kx, ky) are its spatial frequency on an M × M transform (mirrored by
// `flipX`/`flipY`, for an inverted exit pupil, as in diffraction.js), and
// `index` is where it sits in the unshifted M × M array. With the centre on
// a node the transform's zero frequency is the pupil's centre, which the
// coherent transfer function needs.
export function nodeSamples(M, dpx, dpy = dpx, flipX = false, flipY = false) {
  const px = [], py = [], kx = [], ky = [], index = [];
  const Kx = Math.floor(1 / dpx + 1e-9), Ky = Math.floor(1 / dpy + 1e-9);
  for (let i = -Ky; i <= Ky; i++) {
    const y = i * dpy;
    for (let j = -Kx; j <= Kx; j++) {
      const x = j * dpx;
      if (x * x + y * y > 1 + 1e-12) continue;
      const cj = flipX ? -j : j, ci = flipY ? -i : i;
      px.push(x); py.push(y); kx.push(cj); ky.push(ci);
      index.push(((ci + M) % M) * M + ((cj + M) % M));
    }
  }
  return {
    px: Float64Array.from(px), py: Float64Array.from(py),
    kx: Int32Array.from(kx), ky: Int32Array.from(ky), index: Int32Array.from(index), M, dpx, dpy,
  };
}

// Largest OPD step (waves) between neighbouring samples of a node grid.
export function nodeStep(samples, opd) {
  const key = (i, j) => `${i},${j}`;
  const at = new Map();
  for (let k = 0; k < opd.length; k++) if (Number.isFinite(opd[k])) at.set(key(samples.ky[k], samples.kx[k]), opd[k]);
  let worst = 0;
  for (let k = 0; k < opd.length; k++) {
    const v = opd[k];
    if (!Number.isFinite(v)) continue;
    const right = at.get(key(samples.ky[k], samples.kx[k] + 1)), up = at.get(key(samples.ky[k] + 1, samples.kx[k]));
    if (right !== undefined) worst = Math.max(worst, Math.abs(right - v));
    if (up !== undefined) worst = Math.max(worst, Math.abs(up - v));
  }
  return worst;
}

// The pupil of field `field` (an index into the system's fields) at
// wavelength `wavelength` (an index; the primary one by default), for the
// image plane `zImage` (from the geometric analysis when not given).
export function monochromaticPupil(input, { field = 0, zImage = null, wavelength = null } = {}) {
  const sys = normalizeSystem(input);
  const errors = checkSystem(sys);
  const primary = sys.primaryWavelength, primaryNm = sys.wavelengthsNm[primary];
  const fo = errors.length ? null : firstOrder(sys, primaryNm);
  if (fo && !fo.ok) errors.push(fo.reason);
  if (errors.length) return { ok: false, errors, warnings: [] };
  const fi = Math.min(Math.max(0, Math.round(Number(field) || 0)), sys.fields.values.length - 1);
  const asked = wavelength == null ? NaN : Number(wavelength);
  const wi = Number.isFinite(asked) ? Math.min(Math.max(0, Math.round(asked)), sys.wavelengthsNm.length - 1) : primary;
  const nm = sys.wavelengthsNm[wi], fieldValue = sys.fields.values[fi];
  if (!Number.isFinite(zImage)) {
    const geo = analyzeSystem(sys);
    if (!geo.ok) return { ok: false, errors: geo.errors, warnings: [] };
    zImage = geo.image.z;
  }
  const d = sys.diffraction, S = sys.surfaces, last = S.length - 1;
  const warnings = [];
  const primaryModel = traceModel(sys, primaryNm, fo);
  const model = wi === primary ? primaryModel : traceModel(sys, nm, fo);
  const zXp = Number.isFinite(fo.zXp) ? model.zLast + fo.zXp : model.zLast;
  const n = mediumIndices(sys, nm);
  const paraxialNa = n[S.length] * Math.abs(paraxialRay(sys, n, fo.marginal.y[0], fo.objectSlope.marginal).u[last]);
  if (!(paraxialNa > 0)) return { ok: false, errors: ['The image-space NA is zero: the beam does not converge, so there is no point-spread function.'], warnings };
  const primaryChief = traceBundle(primaryModel, fieldValue, [0], [0], { clip: d.vignetting });
  const chief = wi === primary ? primaryChief : traceBundle(model, fieldValue, [0], [0], { clip: d.vignetting });
  const coarse = pupilSamples(12, 2 / 12);
  const sphere = referenceSphere(primaryChief, zImage, zXp, primaryChief.valid[0] ? null : traceBundle(primaryModel, fieldValue, coarse.px, coarse.py, { clip: d.vignetting }));
  if (!sphere) return { ok: false, errors: ['No ray of this field reaches the image, so there is no wavefront to diffract.'], warnings };
  if (!sphere.fromChief) warnings.push({ kind: 'chief', text: 'The chief ray of the primary wavelength fails, so the image is centred on the rays’ centroid instead.' });
  const scale = directionScale(model, fieldValue, sphere, zImage, paraxialNa, d.vignetting);
  // A Gaussian beam narrower than the pupil focuses like a smaller pupil:
  // its 1/e² radius sets the Fresnel number (and its focal shift).
  const zDistance = Math.abs(zImage - zXp);
  const radius = fo.rXp * (d.illumination === 'gaussian' ? Math.min(1, d.beamRatio) : 1);
  const fresnel = Number.isFinite(fo.zXp) && zDistance > 0 ? radius * radius / (nm * 1e-6 * zDistance) : Infinity;
  if (fresnel < FRESNEL_LIMIT) {
    warnings.push({ kind: 'fresnel', text: `The Fresnel number of the exit pupil seen from the image, a²/(λz) = ${fmt(fresnel, 3)}, is below ${FRESNEL_LIMIT}${radius < fo.rXp ? ' (for the Gaussian beam’s radius)' : ''}: the focus is not where the pupil-based (Debye) model puts it (focal shift), so these results are unreliable. This happens with very small or very slow optics, or a narrow beam.` });
  }
  if (fo.naImage > HIGH_NA || fo.naObject > HIGH_NA) {
    warnings.push({ kind: 'high-na', text: `The numerical aperture exceeds ${HIGH_NA}: scalar diffraction ignores polarization, which matters at high NA. A vector-diffraction tool (for example Optiland, open source) is the right check.` });
  }
  // The direction of the primary chief ray at the image (or, when it
  // fails, from the exit pupil to the image point): where a fiber points.
  const C = sphere.C;
  const toward = primaryChief.valid[0] ? Array.from(primaryChief.D.slice(0, 3)) : [C[0], C[1], C[2] - zXp];
  const length = Math.hypot(...toward);
  return {
    ok: true, sys, fo, fi, fieldValue, wi, nm, zImage, zXp, model, chief, sphere, scale, fresnel, warnings,
    chiefDirection: toward.map(v => v / length),
    na: { x: scale.n * Math.abs(scale.ax), y: scale.n * Math.abs(scale.ay) },
  };
}

// The guards that depend on the sampled bundle: too few lit samples (an
// error), ray failures, vignetting, aliasing and pupil distortion.
export function bundleChecks(p, bundle, opd, samples, step) {
  const lit = opd.reduce((count, v) => count + (Number.isFinite(v) ? 1 : 0), 0);
  const cut = (bundle.failed.clipped ?? 0) + (bundle.failed.stop ?? 0);
  if (lit < MIN_LIT) {
    return { error: `At ${fmt(p.nm, 4)} nm only ${lit} of the ${bundle.K} pupil samples carry light, too few. ${cut ? 'Apertures cut the rest: choose a finer pupil grid, or turn clear apertures off to see the lens without vignetting.' : 'Choose a finer pupil grid.'}` };
  }
  const warnings = [];
  if (step > ALIAS_WAVES) {
    warnings.push({ kind: 'aliasing', text: `The wavefront changes by up to ${fmt(step, 2)} waves between neighbouring pupil samples (more than half a wave), so the result is aliased. Choose a finer pupil grid${p.sys.diffraction.grid < 256 ? ` (${p.sys.diffraction.grid * 2} or more)` : ''}, or reduce the aberration.` });
  }
  for (const [kind, count] of Object.entries(bundle.failed)) {
    if (kind === 'clipped' || kind === 'stop') continue;
    warnings.push({ kind: 'rays', text: `${count} pupil ray${count === 1 ? '' : 's'} ${FAILURES[kind] ?? kind}; ${count === 1 ? 'it carries' : 'they carry'} no light.` });
  }
  if (cut && p.sys.diffraction.vignetting) warnings.push({ kind: 'vignetting', text: `${fmt(100 * cut / bundle.K, 3)} % of the pupil is cut by apertures; no light passes there (vignetting).` });
  const distortion = pupilDistortion(bundle, p.zImage, p.sphere);
  if (distortion > PUPIL_DISTORTION_LIMIT) {
    warnings.push({ kind: 'pupil', text: `The rays leave the lens up to ${fmt(100 * distortion, 2)} % away from an evenly spaced grid of directions (pupil distortion); the calculation assumes an even grid, so it is approximate. Real ray aiming can help.` });
  }
  return { warnings, lit, cut, distortion };
}
