// Generates the near-infrared supercontinuum example:
// `node tools/build-nir-supercontinuum-example.mjs`.
//
// A NEAR-INFRARED CONTINUUM FROM A YAG PLATE. Femtosecond pulses focused into
// a bulk crystal broaden into a continuum on both sides of the pump. With a
// Yb laser near 1035 nm in YAG the red side reaches well into the near
// infrared, which is how Vernuccio et al. (Opt. Express 30, 30135, 2022)
// made the 1050-1300 nm Stokes band for multiplex CARS. This scene stops at
// the part the model supports: generation, separating the red side from the
// pump and the visible, selecting a band, and reading it on a spectrometer.
//
// What the model does. The crystal's continuum band is estimated from the
// arriving pump wavelength and the medium, interpolated between reference
// spectra (Dubietis et al., Lith. J. Phys. 57, 113, 2017): an illustration,
// not a prediction. The band is drawn flat. The 10 mm plate length is layout
// and context only; it does not enter the estimate, and neither do the focus,
// pulse energy or duration. The 1050-1300 nm window is an authored bandpass,
// since a longpass alone would pass the whole red side of the estimate. The
// paper's pump etalon, prism compressor, sample and CARS detection are not
// drawn: the specimen model has no broadband multiplex CARS.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../Examples/Nonlinear Optics/', import.meta.url));
// Hyphens in a filename become spaces in the built example manifest, so the
// name is written the way the manifest will read it back.
export const NIR_SC_NAME = 'Near infrared supercontinuum in YAG';

export const PUMP_NM = 1035;
export const PULSE_FS = 270;
export const REP_RATE_MHZ = 2;
export const SEPARATOR_NM = 1050;
export const WINDOW_LO_NM = 1050;
export const WINDOW_HI_NM = 1300;
export const FOCAL_MM = 100;
export const CONTINUUM_SHARE = 0.5;

const AXIS = 320;
const LASER_X = 110, LENS_X = 380;
export const CRYSTAL_X = LENS_X + FOCAL_MM;
const COLLIMATOR_X = CRYSTAL_X + FOCAL_MM;
const SEPARATOR_X = 780, WINDOW_X = 930, NIR_SPEC_X = 1110, VIS_SPEC_Y = AXIS + 190;

const round = v => Math.round(v * 1e4) / 1e4;
const el = (id, type, p, params, extra = {}) =>
  ({ id, type, x: round(p.x), y: round(p.y), rot: 0, label: '', showLabel: false, params, ...extra });
const text = (id, x, y, body, fontSize = 11) =>
  el(id, 'textlabel', { x, y }, { text: body, fontSize, fill: '#34454d' });
const named = (label, labelPos = 'b') => ({ label, showLabel: true, labelPos });

export function nirSupercontinuumScene() {
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', { x: 700, y: 330 }, { w: 1380, h: 660, background: 'white' }),
      text('title', 30, 30,
        '# Near infrared supercontinuum in YAG\n'
        + 'A 1035 nm femtosecond pump broadens in a bulk crystal; a longpass keeps the red side and a bandpass selects 1050–1300 nm', 12),
      el('laser', 'pulsedlaser', { x: LASER_X, y: AXIS }, {
        wavelength: PUMP_NM, pulseWidthFs: PULSE_FS, repRateMHz: REP_RATE_MHZ, avgPowerW: 2,
        transformLimited: true, pulseShape: 'gauss', beamMode: 'line',
      }, named(`${PUMP_NM} nm · ${PULSE_FS} fs · ${REP_RATE_MHZ} MHz`, 't')),
      el('focus', 'lens', { x: LENS_X, y: AXIS }, { f: FOCAL_MM, dia: 25.4 }, named(`f = ${FOCAL_MM} mm`, 'b')),
      el('crystal', 'crystal', { x: CRYSTAL_X, y: AXIS }, {
        convert: 'sc', scMedium: 'yag', scRange: 'estimate', aperture: 12,
        efficiency: CONTINUUM_SHARE, transmitPump: true,
      }, named('YAG plate · 10 mm (drawn for context)', 't')),
      el('collimator', 'lens', { x: COLLIMATOR_X, y: AXIS }, { f: FOCAL_MM, dia: 25.4 }, named(`f = ${FOCAL_MM} mm`, 'b')),
      // Everything below the separator's edge — the residual pump and the
      // visible side of the continuum — is reflected to its own spectrometer.
      el('separator', 'dichroic', { x: SEPARATOR_X, y: AXIS }, { dtype: 'longpass', cutoff: SEPARATOR_NM, length: 25.4 },
        { rot: -45, ...named(`longpass ${SEPARATOR_NM} nm`, 't') }),
      el('visible-spectrometer', 'spectrometer', { x: SEPARATOR_X, y: VIS_SPEC_Y }, {
        aperture: 30, rangeMode: 'manual', rangeMin: 400, rangeMax: 1100, intensityScale: 'density', labelPeaks: false,
      }, { rot: 90, ...named('pump + visible side', 'r') }),
      el('window', 'filter', { x: WINDOW_X, y: AXIS }, {
        ftype: 'bandpass', center: (WINDOW_LO_NM + WINDOW_HI_NM) / 2, band: WINDOW_HI_NM - WINDOW_LO_NM, length: 25.4,
      }, named(`bandpass ${WINDOW_LO_NM}–${WINDOW_HI_NM} nm (authored)`, 'b')),
      el('nir-spectrometer', 'spectrometer', { x: NIR_SPEC_X, y: AXIS }, {
        aperture: 30, rangeMode: 'manual', rangeMin: 950, rangeMax: 1400, intensityScale: 'density', labelPeaks: false,
      }, named('selected near-infrared band', 'b')),
      el('screen', 'display', { x: NIR_SPEC_X, y: AXIS - 180 }, {
        sensorId: 'nir-spectrometer', displayScale: 1.6, screenOn: true, displayView: 'main',
      }, named('what the spectrometer shows', 't')),
      text('band-note', 40, AXIS + 110,
        `Select the crystal: its Continuum readout gives the estimated band, about 506–1776 nm for a ${PUMP_NM} nm pump in YAG,\n`
        + 'interpolated between reference spectra — an illustration, not a prediction. Change the pump wavelength or the medium and it follows.', 10),
      text('limits', 40, AXIS + 290,
        'The band is drawn flat. Plate length, focusing, pulse energy and duration do not enter the estimate; on a bench they move both edges.\n'
        + `The ${WINDOW_HI_NM} nm upper edge is an authored selection: a longpass alone would pass the whole red side.\n`
        + 'Pump etalon, prism compressor, sample and CARS detection of the multiplex CARS bench this band was made for are not drawn.', 10),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(DIR, { recursive: true });
  const path = join(DIR, `${NIR_SC_NAME}.json`);
  await writeFile(path, `${JSON.stringify(nirSupercontinuumScene(), null, 2)}\n`);
  console.log(`wrote ${path}`);
}
