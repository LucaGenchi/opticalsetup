// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// One call from a prescription to everything the page shows: first-order
// data, Seidel sums, the image plane, the meridional layout and the spot
// diagrams with their failures. Pure data in, plain data out, so the same
// function runs in the page's worker and in the tests.
//
// Every wavelength is aimed at the primary wavelength's paraxial pupil, as
// OpticStudio and Optiland do, so a pupil coordinate names the same ray
// bundle in every colour.

import { normalizeSystem, stopIndexOf } from './system.js';
import { firstOrder, seidelSums, seidelWavefront } from './paraxial.js';
import { traceModel, traceRay, FAILURES } from './trace.js';
import { pupilGrid, spotStats, bestFocusShift } from './spot.js';
import { makeSurface, sag, conicDomain } from './surfaces.js';
import { AIR, materialName, materialRangeIssue } from './materials.js';

export const HIGH_NA = 0.6;
const LAYOUT_PUPIL = [-1, -0.5, 0, 0.5, 1];
const PROFILE_SAMPLES = 48;

const fmt = (v, d = 3) => Number(v).toPrecision(d);

function checkSystem(sys) {
  const errors = [];
  sys.surfaces.forEach((s, j) => {
    if (s.type !== 'paraxial') return;
    const before = j === 0 ? AIR : sys.surfaces[j - 1].material;
    if (before !== AIR) errors.push(`Surface ${j + 1} is an ideal lens; it must sit in air, but the medium before it is ${materialName(before, sys.surfaces[j - 1].index)}.`);
  });
  return errors;
}

export function analyzeSystem(input) {
  const sys = normalizeSystem(input);
  const errors = checkSystem(sys);
  const warnings = [];
  const primaryNm = sys.wavelengthsNm[sys.primaryWavelength];
  const fo = errors.length ? null : firstOrder(sys, primaryNm);
  if (fo && !fo.ok) errors.push(fo.reason);
  if (errors.length) return { ok: false, system: sys, errors, warnings };

  // Glass indices quoted outside their fit.
  const seen = new Set();
  sys.surfaces.forEach(s => sys.wavelengthsNm.forEach(nm => {
    const range = materialRangeIssue(s.material, nm);
    if (range && !seen.has(s.material)) {
      seen.add(s.material);
      warnings.push({ kind: 'glass', text: `${materialName(s.material)} is fitted from ${range[0]} to ${range[1]} nm; at ${fmt(nm, 4)} nm its index is held at the edge of that range.` });
    }
  }));

  const byWavelength = sys.wavelengthsNm.map(nm => {
    const f = nm === primaryNm ? fo : firstOrder(sys, nm);
    return { nm, efl: f.ok ? f.efl : NaN, bfl: f.ok ? f.bfl : NaN, imageDistance: f.ok ? f.imageDistance : NaN };
  });
  const sorted = [...sys.wavelengthsNm].sort((a, b) => a - b);
  const seidel = seidelSums(sys, fo, sorted[0], sorted[sorted.length - 1]);
  const waves = seidelWavefront(seidel.total);
  for (const key of Object.keys(waves)) waves[key] /= primaryNm * 1e-6;

  const S = sys.surfaces, last = S.length - 1;
  const models = sys.wavelengthsNm.map(nm => traceModel(sys, nm, fo));
  const zLast = models[0].zLast;
  const zParaxial = zLast + fo.imageDistance;
  const extent = new Float64Array(S.length);

  // Spot rays, first to the paraxial image plane; any other plane is a
  // straight-line step from there.
  const grid = pupilGrid(sys.pupilSamples);
  const fields = sys.fields.values;
  const raw = fields.map(field => models.map(model => {
    const x = [], y = [], sx = [], sy = [], failed = {};
    for (const [px, py] of grid) {
      const r = traceRay(model, field, px, py, zParaxial, { extent });
      if (!r.ok) { failed[r.fail] = (failed[r.fail] ?? 0) + 1; continue; }
      x.push(r.x); y.push(r.y); sx.push(r.D[0] / r.D[2]); sy.push(r.D[1] / r.D[2]);
    }
    return { x, y, sx, sy, failed };
  }));

  let bestShift = null;
  const groups = raw.map(perWl => ({
    x: perWl.flatMap(w => w.x), y: perWl.flatMap(w => w.y),
    sx: perWl.flatMap(w => w.sx), sy: perWl.flatMap(w => w.sy),
  }));
  if (sys.image.focus === 'best-rms') bestShift = bestFocusShift(groups);
  const base = sys.image.focus === 'fixed' ? zLast + S[last].thickness
    : sys.image.focus === 'best-rms' ? zParaxial + bestShift : zParaxial;
  const zImage = base + sys.image.offsetMm;
  if (!(zImage > zLast)) warnings.push({ kind: 'image', text: 'The image plane lies inside or before the last surface; rays are still extended to it, as a virtual image.' });
  const shift = zImage - zParaxial;

  const airy = 1.22 * primaryNm * 1e-6 * fo.workingFno;
  // Where the paraxial chief ray of a field meets the chosen image plane.
  // The paraxial chief ray is traced for the largest field and is linear in
  // tan θ (or in the object height), so other fields scale from it.
  const fieldMax = Math.max(...fields);
  const lastIndex = fo.chief.y.length - 1;
  const paraxialEdge = fo.chief.y[lastIndex] + fo.chief.u[lastIndex] * (zImage - zLast);
  const paraxialHeight = field => (!fieldMax ? 0 : sys.fields.type === 'angle'
    ? paraxialEdge * Math.tan(field * Math.PI / 180) / Math.tan(fieldMax * Math.PI / 180)
    : paraxialEdge * field / fieldMax);
  const byNm = sys.wavelengthsNm.map((nm, i) => [nm, i]).sort((x, y) => x[0] - y[0]);
  const primaryModel = models[sys.primaryWavelength];
  const spots = fields.map((field, fi) => {
    const chief = traceRay(primaryModel, field, 0, 0, zImage);
    const ref = chief.ok ? { x: chief.x, y: chief.y } : null;
    let total = 0, lost = 0, clipped = 0;
    const perWavelength = raw[fi].map((w, wi) => {
      const xs = w.x.map((v, i) => v + shift * w.sx[i]);
      const ys = w.y.map((v, i) => v + shift * w.sy[i]);
      const failures = Object.values(w.failed).reduce((a, b) => a + b, 0);
      total += xs.length + failures; lost += failures; clipped += w.failed.clipped ?? 0;
      return { nm: sys.wavelengthsNm[wi], x: xs, y: ys, failed: w.failed, ...spotStats(xs, ys) };
    });
    const poly = spotStats(perWavelength.flatMap(w => w.x), perWavelength.flatMap(w => w.y));
    // Distortion: the real chief ray against its paraxial height, as a
    // fraction (only off axis). Lateral colour: how far apart the centroids
    // of the shortest and longest wavelengths land.
    const ideal = paraxialHeight(field);
    const distortion = ref && Math.abs(ideal) > 1e-12 ? (ref.y - ideal) / ideal : null;
    const short = perWavelength[byNm[0][1]], long = perWavelength[byNm[byNm.length - 1][1]];
    const lateralColour = byNm.length > 1 && short.count && long.count ? Math.hypot(short.cx - long.cx, short.cy - long.cy) : null;
    return { field, chief: ref, perWavelength, poly, rays: total, lost, vignetting: total ? clipped / total : 0, paraxialHeight: ideal, distortion, lateralColour };
  });

  // Ray failures, one warning per kind with where it happens.
  const failureCounts = {};
  spots.forEach(s => s.perWavelength.forEach(w => Object.entries(w.failed).forEach(([kind, count]) => { failureCounts[kind] = (failureCounts[kind] ?? 0) + count; })));
  for (const [kind, count] of Object.entries(failureCounts)) {
    if (kind === 'clipped') continue;
    warnings.push({ kind: 'rays', text: `${count} spot ray${count === 1 ? '' : 's'} ${FAILURES[kind] ?? kind} and ${count === 1 ? 'is' : 'are'} left out of the spot statistics.` });
    if (kind === 'stop' && sys.rayAiming === 'paraxial') {
      warnings.push({ kind: 'aiming', text: 'Aimed at the paraxial entrance pupil, some rays cross the stop outside its radius, because the real pupil is shifted and distorted (pupil aberration). Real ray aiming fills the stop exactly.' });
    }
  }
  spots.forEach(s => {
    if (s.vignetting > 0) warnings.push({ kind: 'vignetting', text: `Field ${fmt(s.field, 4)}${sys.fields.type === 'angle' ? '°' : ' mm'}: ${(100 * s.vignetting).toFixed(1)} % of the pupil is clipped by a set clear aperture (vignetting).` });
    const where = `Field ${fmt(s.field, 4)}${sys.fields.type === 'angle' ? '°' : ' mm'}`;
    if (!s.poly.count) warnings.push({ kind: 'rays', text: `${where}: no ray reaches the image, so there is no spot to draw.` });
    else if (!s.chief) warnings.push({ kind: 'rays', text: `${where}: the chief ray fails, so this spot is drawn about its centroid.` });
  });

  // Meridional layout rays at the primary wavelength.
  const layoutRays = [];
  fields.forEach((field, fi) => LAYOUT_PUPIL.forEach(py => {
    const r = traceRay(primaryModel, field, 0, py, zImage, { path: true, extent });
    if (r.points) layoutRays.push({ field: fi, py, ok: r.ok, fail: r.fail ?? null, points: r.points.map(p => [p[2], p[1]]) });
  }));

  // Clear semi-diameters: the set value, or the largest traced height.
  const surfacesDrawn = S.map((s, j) => {
    const auto = Math.sqrt(extent[j]);
    const sd = s.stop ? Math.max(fo.stopRadius, auto) : s.semiDiameter > 0 ? s.semiDiameter : auto;
    return { z: models[0].surfaces[j].z, sd, auto, set: s.semiDiameter > 0, stop: s.stop, type: s.type, material: s.material };
  });
  // Glass bodies share one rim height, as a lens is ground.
  surfacesDrawn.forEach((d, j) => {
    if (S[j].material !== AIR && j < last) {
      const rim = Math.max(d.sd, surfacesDrawn[j + 1].sd);
      d.rim = rim; surfacesDrawn[j + 1].rimBefore = rim;
    }
  });
  surfacesDrawn.forEach((d, j) => {
    const geom = makeSurface(S[j]);
    const h = Math.max(d.sd, d.rim ?? 0, d.rimBefore ?? 0);
    const limit = Math.sqrt(conicDomain(geom));
    const reach = Math.min(h, limit * 0.999999);
    if (h > limit) warnings.push({ kind: 'geometry', text: `Surface ${j + 1} is a closed conic that ends at a height of ${fmt(limit)} mm, below its ${fmt(h)} mm semi-diameter.` });
    d.profile = [];
    for (let i = 0; i <= PROFILE_SAMPLES; i++) {
      const y = -reach + 2 * reach * i / PROFILE_SAMPLES;
      d.profile.push([d.z + (S[j].type === 'paraxial' ? 0 : sag(geom, y * y)), y]);
    }
    d.height = reach;
  });
  // Rays are launched on the entrance-pupil plane, which can lie inside the
  // lens; the drawing starts them a little before the first surface (or at
  // the object, when it is near enough to draw).
  const zFront = Math.min(0, ...surfacesDrawn[0].profile.map(p => p[0]));
  const lead = 0.18 * Math.max(1, zImage - zFront);
  const drawObject = !sys.object.atInfinity && sys.object.distanceMm <= 1.5 * Math.max(1, zImage);
  const z0 = drawObject ? -sys.object.distanceMm : zFront - lead;
  for (const ray of layoutRays) {
    if (drawObject || ray.points.length < 2) continue;
    const [[za, ya], [zb, yb]] = ray.points;
    ray.points[0] = [z0, zb === za ? ya : ya + (yb - ya) * (z0 - za) / (zb - za)];
  }

  surfacesDrawn.forEach((d, j) => {
    if (d.rim == null) return;
    const front = d.profile[d.profile.length - 1][0], back = surfacesDrawn[j + 1].profile[surfacesDrawn[j + 1].profile.length - 1][0];
    if (back < front) warnings.push({ kind: 'geometry', text: `The lens between surfaces ${j + 1} and ${j + 2} has negative edge thickness at its rim (${fmt(back - front)} mm): the two faces cross.` });
  });

  const fieldSign = sys.fields.type === 'angle';
  if (fo.naImage > HIGH_NA || fo.naObject > HIGH_NA) {
    warnings.push({ kind: 'high-na', text: `The numerical aperture exceeds ${HIGH_NA}: the Airy radius here is the scalar, paraxial value, which is not accurate at high NA. A vector-diffraction tool (for example Optiland, open source) is the right check.` });
  }

  return {
    ok: true, system: sys, errors, warnings,
    primaryNm, stop: stopIndexOf(sys),
    firstOrder: {
      efl: fo.efl, bfl: fo.bfl, zEp: fo.zEp, epd: 2 * fo.rEp, zXp: fo.zXp, xpd: 2 * fo.rXp,
      stopRadius: fo.stopRadius, imageDistance: fo.imageDistance, imageHeight: fo.imageHeight,
      magnification: fo.magnification, fno: fo.fnoInfinite, workingFno: fo.workingFno,
      naImage: fo.naImage, naObject: fo.naObject, totalTrack: fo.totalTrack, lagrange: fo.lagrange,
    },
    byWavelength, seidel, seidelWaves: waves,
    image: { mode: sys.image.focus, z: zImage, fromLast: zImage - zLast, paraxialFromLast: fo.imageDistance, bestShift, offset: sys.image.offsetMm },
    airyRadius: airy,
    surfaces: surfacesDrawn,
    layoutRays, layoutStart: z0, objectDrawn: drawObject,
    spots,
    fieldUnit: fieldSign ? '°' : 'mm',
  };
}
