// Generates the synchronously pumped OPO example: `node tools/build-opo-example.mjs`.
//
// The cavity is inspired by the femtosecond OPO of O'Donnell, Chaitanya Kumar
// and Ebrahim-Zadeh (APL Photonics 4, 050801, 2019): a 42 mm MgO:PPLN crystal
// between two r = 100 mm concave mirrors M1 and M2, a plane mirror M3 and a
// plane output coupler M4 transmitting 5 % of the signal, pumped by 80–100 fs
// pulses near 1 µm at 80 MHz, with 400–600 fs signal pulses and a 3.1–4.3 µm
// idler 140–180 nm wide. The scene routes that architecture; it does not
// reproduce the oscillator's operating point.
//
// Synchronous pumping fixes the length. A signal pulse has to be back at the
// crystal when the next pump pulse arrives, so one round trip equals the pump
// period: the one-way group optical path is c / (2 f_rep) = 1873.70 mm for
// 80 MHz. In the real cavity the dispersive crystal makes the mirror spacing
// shorter than that; here the crystal is a thin surface, the whole path is
// air, and the two are equal. It is laid out in a Z to fit the page:
// M3 → M1 → crystal → M2 → M5 → M4.
//
// Output settings: the signal is authored at 29.43 cm⁻¹ with 5 × the pump
// duration, i.e. a 500 fs pulse just above its Gaussian transform limit, representative
// of the reported 400–600 fs. The idler is authored at 131 cm⁻¹ (≈160 nm at
// 3.5 µm, inside the reported 140–180 nm); its 500 fs duration follows the
// same factor and is illustrative. Conversion is fixed at 78 %, the reported
// maximum pump depletion, used as an illustrative lossless fraction.
//
// Three concessions to the workbench, all stated on the example page:
//  - M1 and M2 are drawn as plane dichroic mirrors. The workbench's curved
//    mirrors reflect every wavelength equally, so they could not let the pump
//    in or the idler out, and a zero-thickness crystal needs no focus. They
//    sit 50 mm either side of the crystal, where r = 100 mm mirrors would.
//  - In the real cavity M2 transmits both the idler and the residual pump. A
//    dichroic here switches at one edge, so the pump leaves through an extra
//    plane fold, M5, instead.
//  - The pump is a single axial ray, so the scene shows chief-ray routing
//    only: no focus, waist, resonator mode or overlap is represented, and
//    the 42 mm crystal's propagation and group-velocity matching are absent.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../Examples/Nonlinear Optics/', import.meta.url));
export const OPO_EXAMPLE_NAME = 'Synchronously pumped femtosecond OPO';

const C_MM_PER_NS = 299.792458;
export const REP_RATE_MHZ = 80;
export const CAVITY_LENGTH_MM = C_MM_PER_NS * 1e3 / REP_RATE_MHZ / 2;

const DEG = Math.PI / 180;
const dir = deg => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });
const along = (p, d, length) => ({ x: p.x + d.x * length, y: p.y + d.y * length });
const round = v => Math.round(v * 1e4) / 1e4;
// A flat reflector at `rot` degrees turns `from` into `to` when its normal
// lies along to − from.
const foldRot = (from, to) => {
  const deg = Math.atan2(to.y - from.y, to.x - from.x) / DEG;
  return round(((deg % 180) + 180) % 180);
};
const back = d => ({ x: -d.x, y: -d.y });

const AXIS = 250;
const HALF_FOLD = 8; // degrees each long leg leaves the crystal axis
const LEG_M3 = 330, LEG_M5 = 620;
const M1 = { x: 370, y: AXIS }, CRYSTAL = { x: 420, y: AXIS }, M2 = { x: 470, y: AXIS };
const TO_M3 = dir(180 + 2 * HALF_FOLD), TO_M5 = dir(2 * HALF_FOLD), TO_M4 = dir(170);
const M3 = along(M1, TO_M3, LEG_M3);
const M5 = along(M2, TO_M5, LEG_M5);
const LEG_M4 = CAVITY_LENGTH_MM - (M2.x - M1.x) - LEG_M3 - LEG_M5;
const M4 = along(M5, TO_M4, LEG_M4);

const el = (id, type, p, params, extra = {}) =>
  ({ id, type, x: round(p.x), y: round(p.y), rot: 0, label: '', showLabel: false, params, ...extra });
const text = (id, x, y, body, fontSize = 11) =>
  el(id, 'textlabel', { x, y }, { text: body, fontSize, fill: '#34454d' });
const named = (label, labelPos = 'b') => ({ label, showLabel: true, labelPos });

export function opoExampleScene() {
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', { x: 600, y: 350 }, { w: 1200, h: 620, background: 'white' }),
      text('title', 30, 70, '# Synchronously pumped femtosecond OPO\nMgO:PPLN singly resonant cavity after O\'Donnell, Chaitanya Kumar & Ebrahim-Zadeh, APL Photonics 4, 050801 (2019)', 12),
      text('cavity-note', 560, 118, `One-way cavity path ${CAVITY_LENGTH_MM.toFixed(1)} mm: round-trip time = 1 / ${REP_RATE_MHZ} MHz = ${(1e3 / REP_RATE_MHZ).toFixed(1)} ns,\nso each signal pulse returns to the crystal with the next pump pulse`, 10),
      el('pump', 'pulsedlaser', { x: 150, y: AXIS }, {
        wavelength: 1040, pulseWidthFs: 100, repRateMHz: REP_RATE_MHZ, avgPowerW: 2,
        transformLimited: true, pulseShape: 'gauss', beamMode: 'line',
      }, named('Yb:fibre pump · 1040 nm · 100 fs · 80 MHz')),
      el('lens', 'lens', { x: 270, y: AXIS }, { f: 150, dia: 25.4 }, named('f = 150 mm', 't')),
      el('M1', 'dichroic', M1, { dtype: 'shortpass', cutoff: 1200, length: 25.4 },
        { rot: foldRot(back(dir(0)), TO_M3), ...named('M1', 't') }),
      el('crystal', 'crystal', CRYSTAL, {
        convert: 'opo', aperture: 10, pumpWl: 1040, signalWl: 1480, pumpAcceptanceNm: 5,
        linewidthMode: 'both', signalLinewidthCm: 29.43, idlerLinewidthCm: 131,
        outputPhase: 'unknown', durationFactor: 5, efficiency: 0.78, transmitPump: true,
      }, named('MgO:PPLN')),
      el('M2', 'dichroic', M2, { dtype: 'longpass', cutoff: 2500, length: 25.4 },
        { rot: foldRot(dir(0), TO_M5), ...named('M2', 't') }),
      el('M3', 'mirror', M3, { length: 25.4, refl: 100 },
        { rot: foldRot(TO_M3, back(TO_M3)), ...named('M3', 'b') }),
      el('M5', 'dichroic', M5, { dtype: 'shortpass', cutoff: 1300, length: 25.4 },
        { rot: foldRot(TO_M5, TO_M4), ...named('M5', 't') }),
      el('M4', 'mirror', M4, { length: 25.4, refl: 95, showTransmitted: true },
        { rot: foldRot(TO_M4, back(TO_M4)), ...named('M4 · OC', 'b') }),
      el('pump-dump', 'beamdump', along(M5, TO_M5, 80), { aperture: 22 },
        { rot: 2 * HALF_FOLD, ...named('residual pump', 'b') }),
      el('idler-probe', 'probe', { x: 700, y: AXIS }, { prop: 'spectrum' }),
      el('idler-detector', 'detector', { x: 860, y: AXIS }, { aperture: 26 }, named('idler · 3.5 µm')),
      el('signal-probe', 'probe', along(M4, TO_M4, 60), { prop: 'spectrum' }),
      el('signal-detector', 'detector', along(M4, TO_M4, 150), { aperture: 26 },
        { rot: 170, ...named('signal · 1480 nm') }),
      text('coatings', 290, 318, 'M1 · transmits the pump, reflects the signal\nM2 · reflects the signal, transmits the idler\nM5 · reflects the signal, transmits the residual pump\nM3 · high reflector    M4 · output coupler, 5 % of the signal', 10),
      text('legend', 560, 590, 'Only the 1480 nm signal resonates. The crystal converts a fixed 78 % of the pump (the reported\nmaximum depletion, used as an illustrative fraction): threshold and gain are not modelled.', 10),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(DIR, { recursive: true });
  const path = join(DIR, `${OPO_EXAMPLE_NAME}.json`);
  await writeFile(path, `${JSON.stringify(opoExampleScene(), null, 2)}\n`);
  console.log(`wrote ${path}`);
  console.log({ CAVITY_LENGTH_MM, LEG_M4, M3, M5, M4 });
}
