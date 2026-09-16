// Generates the time-zero example: `node tools/build-crosscorrelator-example.mjs`.
//
// FINDING TIME ZERO WITH SUM-FREQUENCY GENERATION. Two colours only mix while
// both pulses are inside the crystal at once, so the sum-frequency signal is
// the instrument that finds the delay at which they coincide — time zero.
//
// Both colours come from one laser, which is how a real two-colour bench
// guarantees the trains are synchronous: a 1030 nm, 200 fs, 80 MHz oscillator
// is frequency-doubled, and a shortpass dichroic splits the 515 nm harmonic
// from the residual fundamental. The two arms are recombined collinearly on a
// second dichroic of the same kind and focused into the mixing crystal, whose
// 343.3 nm sum frequency is isolated by a bandpass filter.
//
// The delay. The fundamental arm is periscoped up and back down, a stage of
// two mirrors: moving that stage by Δx changes its path by 2Δx, so the delay
// moves by 2Δx/c. Here it stands 200 mm off the axis and therefore carries
// 400 mm — 1.33 ns — more path than the harmonic arm. The delay line in the
// harmonic arm is set to exactly that, so the two arrive together and the
// example opens at time zero. 60 µm of path — 30 µm of stage travel — leaves
// about a quarter of the signal, and 0.2 mm drops it under the workbench's
// 2 % display cutoff. Gaussian pulses have no sharp overlap boundary; that
// cutoff is where the drawing stops, not where the physics does.
//
// What the model does not do: phase matching, the polarizations the two beams
// would need, the focusing overlap in the crystal, and any depletion of the
// fundamental by the mixing. The drawn signal is an authored fraction gated by
// arrival time alone.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../Examples/Ultrashort Pulses/', import.meta.url));
// Hyphens in a filename become spaces in the built example manifest, so the
// name is written the way the manifest will read it back.
export const XCORR_NAME = 'Finding time zero — a two colour cross correlator';

const C_MM_PER_NS = 299.792458;
export const REP_RATE_MHZ = 80;
export const PULSE_FS = 200;
export const FUNDAMENTAL_NM = 1030;
export const HARMONIC_NM = FUNDAMENTAL_NM / 2;
export const SUM_NM = 1 / (1 / HARMONIC_NM + 1 / FUNDAMENTAL_NM);

// Layout. The axis carries the harmonic arm; the fundamental is folded up over
// it and brought back down onto the combiner.
const AXIS = 520;
export const FOCAL_MM = 150;          // the lens, and where the crystal sits
export const STAGE_OFFSET_MM = 200;   // how far the fold stands off the axis
const SPLIT_X = 460, COMBINE_X = 1040;
export const STAGE_EXTRA_MM = 2 * STAGE_OFFSET_MM;   // its double-pass penalty
export const DELAY_MM = STAGE_EXTRA_MM;              // what the delay line matches
export const DELAY_NS = DELAY_MM / C_MM_PER_NS;
export const XCORR_PATH = {
  splitter: { x: SPLIT_X, y: AXIS },
  M1: { x: SPLIT_X, y: AXIS - STAGE_OFFSET_MM },
  M2: { x: COMBINE_X, y: AXIS - STAGE_OFFSET_MM },
  combiner: { x: COMBINE_X, y: AXIS },
};

const round = v => Math.round(v * 1e4) / 1e4;
const el = (id, type, p, params, extra = {}) =>
  ({ id, type, x: round(p.x), y: round(p.y), rot: 0, label: '', showLabel: false, params, ...extra });
const text = (id, x, y, body, fontSize = 11) =>
  el(id, 'textlabel', { x, y }, { text: body, fontSize, fill: '#34454d' });
const named = (label, labelPos = 'b') => ({ label, showLabel: true, labelPos });
const wavelengthProbe = (id, p) => el(id, 'probe', p, { prop: 'wl' });
// Both dichroics are the same part, used the two ways round: each passes the
// harmonic and turns the fundamental through 90°.
const harmonicSeparator = { dtype: 'shortpass', cutoff: 700, length: 40 };

export function crossCorrelatorScene() {
  const { splitter, M1, M2, combiner } = XCORR_PATH;
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', { x: 820, y: 430 }, { w: 1680, h: 760, background: 'white' }),
      text('title', 30, 30,
        '# Finding time zero — a two-colour cross-correlator\n'
        + 'Sum-frequency generation only happens while both pulses are in the crystal, so the signal itself locates the delay where they meet', 12),
      el('laser', 'pulsedlaser', { x: 100, y: AXIS }, {
        wavelength: FUNDAMENTAL_NM, pulseWidthFs: PULSE_FS, repRateMHz: REP_RATE_MHZ, avgPowerW: 2,
        transformLimited: true, pulseShape: 'gauss', beamMode: 'line',
      }, named('1030 nm · 200 fs · 80 MHz')),
      el('doubler', 'crystal', { x: 300, y: AXIS }, { convert: 'shg', aperture: 16, efficiency: 0.35, transmitPump: true },
        named('SHG crystal · 515 nm', 't')),
      el('splitter', 'dichroic', splitter, harmonicSeparator, { rot: 45, ...named('shortpass 700 nm', 'b') }),
      // The fundamental arm: up, across, and back down onto the combiner.
      el('M1', 'mirror', M1, { length: 40, refl: 100 }, { rot: 45, ...named('M1 · delay stage', 't') }),
      el('M2', 'mirror', M2, { length: 40, refl: 100 }, { rot: -45, ...named('M2 · delay stage', 't') }),
      wavelengthProbe('fundamental-wavelength', { x: 750, y: AXIS - STAGE_OFFSET_MM }),
      // The harmonic arm, with the matching delay.
      el('delay', 'delayline', { x: 760, y: AXIS }, { moveMode: 'static', delayMm: DELAY_MM, aperture: 24 },
        named(`delay line · ΔL = ${DELAY_MM} mm`, 'b')),
      wavelengthProbe('harmonic-wavelength', { x: 900, y: AXIS }),
      el('combiner', 'dichroic', combiner, harmonicSeparator, { rot: -45, ...named('shortpass 700 nm', 'b') }),
      el('focus', 'lens', { x: 1140, y: AXIS }, { f: FOCAL_MM, dia: 25.4 }, named(`f = ${FOCAL_MM} mm`, 'b')),
      el('mixer', 'crystal', { x: 1140 + FOCAL_MM, y: AXIS }, {
        convert: 'sfg', aperture: 16, efficiency: 0.3, transmitPump: true,
      }, named('SFG crystal', 't')),
      el('uv-filter', 'filter', { x: 1400, y: AXIS }, { ftype: 'bandpass', center: 343, band: 20, trans: 0.9, length: 25.4 },
        named('bandpass 343 nm', 'b')),
      // After the filter, where the sum frequency travels alone: on the axis
      // before it, three collinear beams share the same line.
      wavelengthProbe('sum-wavelength', { x: 1465, y: AXIS }),
      el('signal-detector', 'detector', { x: 1530, y: AXIS }, { aperture: 26 }, named('cross-correlation signal')),
      text('stage-note', 620, AXIS - STAGE_OFFSET_MM - 90,
        `The fundamental stands ${STAGE_OFFSET_MM} mm off the axis and crosses it twice, so this arm carries\n`
        + `2 × ${STAGE_OFFSET_MM} mm = ${STAGE_EXTRA_MM} mm of extra path: in this double-pass geometry, moving the stage by Δx moves the delay by 2Δx / c.`, 10),
      text('delay-note', 620, AXIS + 70,
        `The delay line matches it, ΔL = ${DELAY_MM} mm = ${DELAY_NS.toFixed(2)} ns, so the two pulses reach the crystal together.\n`
        + 'Retune it by 0.06 mm — 30 µm of stage travel — and about a quarter of the signal is left; by 0.2 mm it falls under the 2 % the workbench still draws.', 10),
      text('legend', 30, AXIS + 250,
        `Both colours come from one laser, so the two trains are synchronous by construction: 515 nm and ${FUNDAMENTAL_NM} nm mix to ${SUM_NM.toFixed(1)} nm only where they coincide in time.\n`
        + 'The crystal\'s Mixing readout gives the arrival difference and the overlap; scanning the delay through zero traces the cross-correlation.\n'
        + 'Phase matching, the polarizations the two beams would need, focusing overlap and depletion of either beam are not modelled: the signal is an authored fraction gated by arrival time.', 10),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(DIR, { recursive: true });
  const path = join(DIR, `${XCORR_NAME}.json`);
  await writeFile(path, `${JSON.stringify(crossCorrelatorScene(), null, 2)}\n`);
  console.log(`wrote ${path}`);
  console.log({ DELAY_MM, DELAY_NS, SUM_NM });
}
