// Generates the time-zero example: `node tools/build-crosscorrelator-example.mjs`.
//
// FINDING TIME ZERO BETWEEN TWO BEAMS. This is what a bench actually does.
// Focus two synchronised colours into one χ⁽²⁾ crystal and look at the
// spectrum behind it. Each beam doubles on its own whatever the timing, so two
// second-harmonic lines are always there: 516 nm from 1032 nm and 395 nm from
// 790 nm. When the two pulses arrive together, and only then, a third line
// appears between them — the sum frequency at 447 nm. That line appearing is
// time zero.
//
// The delay. The 1032 nm beam is folded down onto the combiner, so it carries
// a leg the other arm does not have; the delay line in the 790 nm arm makes up
// the difference and is the knob to scan. A mechanical stage carrying a fold
// changes the path by 2Δx for a move of Δx, while this element adds its ΔL
// directly.
//
// Both lasers run at 80 MHz. On a bench they would be locked to one clock,
// which is what makes a stable third line possible at all; this model draws
// mixing only between trains at the same repetition rate.
//
// What the model does not do: phase matching, so the polarizations and crystal
// angle a real 447 nm line needs are absent, and the relative strengths of the
// three lines — or whether a given crystal would show them together at all —
// are not predicted. The drawn lines are authored fractions, gated by arrival
// time alone.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../Examples/Ultrashort Pulses/', import.meta.url));
// Hyphens in a filename become spaces in the built example manifest, so the
// name is written the way the manifest will read it back.
export const XCORR_NAME = 'Finding time zero — sum frequency of two beams';

const C_MM_PER_NS = 299.792458;
export const REP_RATE_MHZ = 80;
export const PULSE_FS = 200;
export const IR_NM = 1032;
export const RED_NM = 790;
export const SUM_NM = 1 / (1 / IR_NM + 1 / RED_NM);
export const IR_SHG_NM = IR_NM / 2;
export const RED_SHG_NM = RED_NM / 2;

// Layout. The 790 nm beam runs along the axis; the 1032 nm beam comes in above
// it and is folded down onto the combiner, so the two arms differ by that leg
// and the delay line in the red arm makes it up.
const AXIS = 400;
const IR_AXIS = 200;
const LASER_X = 100, COMBINE_X = 900;
export const FOCAL_MM = 150;
// The mixed line is drawn generously so the whole scan stays visible: below
// 2 % of a beam the workbench stops drawing a ray at all, and a smaller share
// would make the line vanish while it still had overlap to show.
export const MIX_SHARE = 0.4;
export const FOLD_DROP_MM = AXIS - IR_AXIS;          // the 1032 nm arm's extra leg
export const DELAY_MM = FOLD_DROP_MM;                // what the delay line matches
export const DELAY_NS = DELAY_MM / C_MM_PER_NS;
export const XCORR_PATH = {
  irLaser: { x: LASER_X, y: IR_AXIS },
  fold: { x: COMBINE_X, y: IR_AXIS },
  redLaser: { x: LASER_X, y: AXIS },
  combiner: { x: COMBINE_X, y: AXIS },
};

const round = v => Math.round(v * 1e4) / 1e4;
const el = (id, type, p, params, extra = {}) =>
  ({ id, type, x: round(p.x), y: round(p.y), rot: 0, label: '', showLabel: false, params, ...extra });
const text = (id, x, y, body, fontSize = 11) =>
  el(id, 'textlabel', { x, y }, { text: body, fontSize, fill: '#34454d' });
const named = (label, labelPos = 'b') => ({ label, showLabel: true, labelPos });
const wavelengthProbe = (id, p) => el(id, 'probe', p, { prop: 'wl' });

export function crossCorrelatorScene() {
  const { irLaser, fold, redLaser, combiner } = XCORR_PATH;
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', { x: 760, y: 360 }, { w: 1560, h: 720, background: 'white' }),
      text('title', 30, 30,
        '# Finding time zero — sum frequency of two beams\n'
        + 'Both beams double all the time; the sum-frequency line exists only while their pulses are in the crystal together', 12),
      el('ir-laser', 'pulsedlaser', irLaser, {
        wavelength: IR_NM, pulseWidthFs: PULSE_FS, repRateMHz: REP_RATE_MHZ, avgPowerW: 2,
        transformLimited: true, pulseShape: 'gauss', beamMode: 'line',
      }, named('1032 nm · 200 fs · 80 MHz', 't')),
      el('red-laser', 'pulsedlaser', redLaser, {
        wavelength: RED_NM, pulseWidthFs: PULSE_FS, repRateMHz: REP_RATE_MHZ, avgPowerW: 2,
        transformLimited: true, pulseShape: 'gauss', beamMode: 'line',
      }, named('790 nm · 200 fs · 80 MHz')),
      wavelengthProbe('ir-wavelength', { x: 560, y: IR_AXIS }),
      // The delay line sits in the 790 nm arm and matches the fold in the
      // other one: this is the knob that finds time zero.
      el('delay', 'delayline', { x: 480, y: AXIS }, { moveMode: 'static', delayMm: DELAY_MM, aperture: 24 },
        named(`delay line · ΔL = ${DELAY_MM} mm`, 'b')),
      wavelengthProbe('red-wavelength', { x: 700, y: AXIS }),
      el('fold', 'mirror', fold, { length: 40, refl: 100 }, { rot: -45, ...named('fold · delay stage', 't') }),
      el('combiner', 'dichroic', combiner, { dtype: 'shortpass', cutoff: 900, length: 40 },
        { rot: -45, ...named('shortpass 900 nm · combiner', 'b') }),
      el('focus', 'lens', { x: COMBINE_X + 100, y: AXIS }, { f: FOCAL_MM, dia: 25.4 }, named(`f = ${FOCAL_MM} mm`, 'b')),
      el('crystal', 'crystal', { x: COMBINE_X + 100 + FOCAL_MM, y: AXIS }, {
        convert: 'shg', aperture: 16, efficiency: 0.3, mixEfficiency: MIX_SHARE, mixDfg: false, transmitPump: true,
      }, named('χ⁽²⁾ crystal', 't')),
      // The spectrum behind the crystal is the whole instrument: two harmonics
      // always, a third line only at time zero. A dichroic drops the two
      // fundamentals first, so the spectrometer sees the generated light.
      el('reject', 'dichroic', { x: COMBINE_X + 330, y: AXIS }, { dtype: 'shortpass', cutoff: 700, length: 30 },
        { rot: -45, ...named('shortpass 700 nm', 'b') }),
      el('fundamental-dump', 'beamdump', { x: COMBINE_X + 330, y: AXIS + 150 }, { aperture: 22 },
        { rot: 90, ...named('1032 + 790 nm', 'r') }),
      el('spectrometer', 'spectrometer', { x: COMBINE_X + 520, y: AXIS }, {
        aperture: 30, rangeMode: 'manual', rangeMin: 360, rangeMax: 560, intensityScale: 'density', labelPeaks: true,
      }, named('spectrometer', 'b')),
      // The screen is the point of the example: two peaks, or three.
      el('screen', 'display', { x: COMBINE_X + 520, y: AXIS - 190 }, {
        sensorId: 'spectrometer', displayScale: 1.8, screenOn: true, displayView: 'main',
      }, named('what the spectrometer shows', 't')),
      text('stage-note', 560, IR_AXIS - 90,
        `The 1032 nm beam is folded down onto the combiner, ${FOLD_DROP_MM} mm of path the other arm does not have.\n`
        + 'A mechanical stage carrying a fold changes the path by 2Δx for a move of Δx; this delay line adds its ΔL directly.', 10),
      text('delay-note', 150, AXIS + 80,
        `ΔL = ${DELAY_MM} mm = ${DELAY_NS.toFixed(3)} ns matches the fold, so both pulses reach the crystal together and the sum-frequency line is there.\n`
        + 'Retune it by 0.06 mm — 200 fs — and about a quarter of that peak is left; by 0.2 mm it is gone,\n'
        + 'while the two second harmonics stay exactly where they were. That is the measurement.', 10),
      text('legend', 30, AXIS + 250,
        `Behind the crystal: ${RED_SHG_NM} nm and ${IR_SHG_NM} nm, the two second harmonics, and ${SUM_NM.toFixed(1)} nm, the sum frequency of the pair.\n`
        + 'Both lasers run at 80 MHz; on a bench they would be locked to one clock, and this model mixes only trains at the same repetition rate.\n'
        + 'Phase matching is not modelled: the relative strengths of the three peaks are not predicted, and the polarizations each process needs are not checked.\n'
        + 'Difference-frequency generation is a checkbox on the crystal, left off here: its 3.4 µm line is outside the range this bench would look at.', 10),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(DIR, { recursive: true });
  const path = join(DIR, `${XCORR_NAME}.json`);
  await writeFile(path, `${JSON.stringify(crossCorrelatorScene(), null, 2)}\n`);
  console.log(`wrote ${path}`);
  console.log({ DELAY_MM, DELAY_NS, SUM_NM, IR_SHG_NM, RED_SHG_NM });
}
