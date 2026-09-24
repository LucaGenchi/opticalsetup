// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Generates the two-mirror telescope examples: `node tools/build-reflective-telescopes.mjs`.
//
// Both share one geometry so the comparison is about surface shape alone: a
// 55 mm primary of f = 40 mm (R = -80) with a 15 mm opening on the axis at
// y = 300, and a final focus 12.5 mm behind the primary vertex, at x = 512.5.
// The aperture is what it is because a source's beam width is capped at 60 mm,
// and in this orientation the beam has to span the whole primary; the design
// was derived at four times this size and scaled, which conic constants
// survive untouched.
//
// The conics are not guessed. A conic mirror images one pair of axial points
// with no spherical aberration when those points are its own two foci, and for
// a vertex at distance p from one and q from the other that fixes the surface:
//
//     R = 2pq/(p+q)            k = -((q-p)/(q+p))^2
//
// which is the mirror equation plus the eccentricity. Signed distances make it
// work for both cases: p > 0 for the Gregorian's real intermediate image, and
// p < 0 for the Cassegrain-type virtual one, which is what drives |k| past 1
// and turns the ellipse into a hyperbola.
//
// GREGORIAN. Parabolic primary (k = -1) forms a real image at its focus,
// x = 400. A concave ellipse 80 mm beyond it re-images that point to x = 610:
//     p = 100 - 80 = 20,  q = 152.5 - 80 = 72.5  (about the primary vertex)
//     R2 = +31.351351,    k2 = -0.322133
// Traced spot span at the focal plane: 7.1e-7 mm.
//
// RITCHEY-CHRETIEN. Not constructible this way -- neither mirror images the
// conjugates on its own -- so the pair was solved against this app's tracer by
// bisection: k2 chosen to null the signed spherical aberration at the focal
// plane, then k1 chosen to null the signed coma of a 0.3 degree bundle.
//     k1 = -1.040245,  k2 = -2.971093,  R2 = -26.153846
// The classical Cassegrain for the same geometry is k1 = -1 with
//     k2 = -((m+1)/(m-1))^2 = -2.609467  for m = q/p = 170/40 = 4.25,
// which the same bisection reproduces to six figures -- a check on the sign
// conventions above. Measured spot at the focal plane, this geometry:
//
//                        on axis     0.1 deg     0.3 deg
//   classical Cassegrain  4.5e-7     5.0e-3      2.2e-2   mm
//   Ritchey-Chretien      5.4e-4     1.9e-3      1.4e-2   mm
//
// The Cassegrain wins on the axis and loses immediately off it. By 0.3 degrees
// the gap has narrowed again because what is left is astigmatism, which the
// Ritchey-Chretien does not claim to correct.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../Examples/Reflective Imaging Systems/', import.meta.url));
const AX = 190;
const el = (id, type, x, y, params, extra = {}) =>
  ({ id, type, x, y, rot: 0, label: '', showLabel: false, params, ...extra });
const text = (id, x, y, body, fontSize = 11) =>
  el(id, 'textlabel', x, y, { text: body, fontSize, fill: '#34454d' });

function telescope({ title, subtitle, secX, secDia, R2, k2, k1, notes, controls }) {
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', 320, 292, { w: 560, h: 505, background: 'white' }),
      text('title', 60, 78, `# ${title}`, 15),
      text('subtitle', 60, 102, subtitle, 10),
      el('source', 'cwlaser', 150, AX,
        { wavelength: 550, avgPowerW: 0.1, beamMode: 'beam', beamWidth: 54, autoColor: true, temporalMode: 'cw' },
        { label: 'collimated starlight', showLabel: true, labelPos: 'b' }),
      el('primary', 'conicmirror', 500, AX,
        { dia: 55, hole: 15, radius: -80, conic: k1, facing: 'left', refl: 96 },
        { label: `primary · k = ${k1}`, showLabel: true, labelPos: 'r' }),
      el('secondary', 'conicmirror', secX, AX,
        { dia: secDia, hole: 0, radius: R2, conic: k2, facing: 'right', refl: 96 },
        { label: `secondary · k = ${k2}`, showLabel: true, labelPos: 't' }),
      // The camera's sensor plane sits 22 mm ahead of its anchor, so x = 534.5
      // puts it on the focus at x = 512.5.
      el('focal-plane', 'camera', 534.5, AX, { ch: 20, pixels: 32, interference: false, profileScale: 'absolute' },
        { label: 'focal plane', showLabel: true, labelPos: 'b' }),
      text('notes', 60, 300, notes, 10),
      text('controls', 60, 424, controls, 10),
      text('limits', 60, 476,
        'A 2D meridional section: no sagittal plane, so astigmatism and field curvature are not shown as a real instrument\n'
        + 'would show them, and nothing here is diffractive — no Airy disc, and none of the ring redistribution the central\n'
        + 'obstruction really causes. The secondary blocks the middle of the aperture because it is genuinely in the way.\n'
        + 'Signal is a relative sum over this 2D ray section, not transmitted power through a circular pupil, so what the\n'
        + 'obstruction costs here is not the fraction a 3D area calculation would give.', 9),
    ],
    beams: [],
  };
}

const scenes = [
  ['Gregorian telescope — element by element.json', telescope({
    title: 'Gregorian telescope', k1: -1, secX: 440, secDia: 30, R2: 31.351351, k2: -0.322133,
    subtitle: 'Parabolic primary · concave elliptical secondary beyond the prime focus · 2D geometric interpretation',
    notes: '### Two conics, each doing the one thing only it can\n'
      + 'The **parabola** is the surface that images infinity onto a point, so the primary brings starlight to a real\n'
      + 'focus at x = 460, inside the tube. The **ellipse** is the surface that images a point onto another point, and\n'
      + 'the secondary sits past that focus with its two foci on the intermediate image and on the focal plane. Each\n'
      + 'surface is exact for its own job, so the pair is exact: the traced spot spans **7e-7 mm**.\n\n'
      + 'The Gregorian pays for that in length — the secondary has to sit beyond the prime focus, so the tube is longer\n'
      + 'than a Cassegrain of the same focal length — and is repaid with an upright image and a real intermediate focus,\n'
      + 'where a field stop can sit and reject stray light before it ever reaches the detector.',
    controls: '**Try:** secondary k = 0 turns the ellipse into a sphere, and the point into a smear · primary k = 0 does the same at\n'
      + 'the other surface · slide the secondary and the focus walks off the sensor, because its foci no longer match the\n'
      + 'geometry · any wavelength from 400 to 700 nm leaves the focus exactly where it is. Mirrors have no dispersion.',
  })],
  ['Ritchey–Chrétien telescope — element by element.json', telescope({
    title: 'Ritchey–Chrétien telescope', k1: -1.040245, secX: 470, secDia: 27.5, R2: -26.153846, k2: -2.971093,
    subtitle: 'Two hyperboloids, aplanatic · the design of nearly every large research telescope · 2D geometric interpretation',
    notes: '### Giving up a perfect axis to buy a usable field\n'
      + 'Make the primary a **parabola** (k = -1) with the hyperbolic secondary that shares its focus (k = -2.609467) and\n'
      + 'this becomes a classical Cassegrain: exactly stigmatic on the axis, spot **4.5e-7 mm**. Tilt it a tenth of a degree\n'
      + 'and that becomes **5.0e-3 mm**, one-sided — **coma**, the aberration that confines a classical Cassegrain to a\n'
      + 'narrow field.\n\n'
      + 'The Ritchey–Chrétien makes **both** mirrors hyperbolic and gives up the exact axis — **5.4e-4 mm**, no longer zero —\n'
      + 'to cancel coma across the field: **1.9e-3 mm** at the same tenth of a degree. Hubble, the VLT and Keck are all this\n'
      + 'design, because a telescope is judged on the field it can image and not on the single point at its centre.',
    controls: '**Try:** set primary k = -1 and secondary k = -2.609467 for the classical Cassegrain and compare — on axis it gets\n'
      + '*better*, which is the whole point · by 0.3° the two are close again (2.2e-2 against 1.4e-2 mm), because what is\n'
      + 'left there is astigmatism, which this design does not claim to correct.',
  })],
];

for (const [name, scene] of scenes) {
  await writeFile(join(DIR, name), `${JSON.stringify(scene, null, 2)}\n`);
  console.log(`Wrote ${name} (${scene.elements.length} elements)`);
}
