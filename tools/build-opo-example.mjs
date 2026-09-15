// Generates the two OPO examples: `node tools/build-opo-example.mjs`.
//
// Both are singly resonant: every cavity mirror is a band reflector that
// returns the ~800 nm signal and transmits the 532 nm pump and 1588 nm idler,
// which is what real OPO mirror coatings do. Every fold is near normal
// incidence (12° in the picosecond cavity, 15° in the folded one), as cavity
// mirrors are used, so the beam folds back on itself rather than glancing off.
//
// 1. SYNCHRONOUSLY PUMPED PICOSECOND OPO. Modelled on the APE Levante Emerald
//    6 ps class (datasheet Rev 3.1.1): a 532 nm, ~6 ps, ~80 MHz, 4 W pump;
//    signal tunable 690–990 nm with a 0.3–0.4 nm bandwidth and ~5–6 ps
//    pulses; idler 1150–2300 nm; > 0.9 W signal and > 0.6 W idler. A signal
//    pulse must meet the next pump pulse at the crystal, so the round trip
//    equals the pump period: the one-way group optical path is
//    c / (2 f_rep) = 1873.70 mm at 80 MHz. The crystal is a thin surface
//    here, so the whole path is air and group and geometric lengths agree.
//    Layout: an M3 → F1 → M1 → crystal → M2 → M4 Z-cavity with one flat
//    fold, F1, in the long arm to fit the page. The idler and residual pump
//    leave together through M2 and are separated outside the cavity.
//    Settings: signal 0.30 nm (4.69 cm⁻¹) wide with 5/6 of the pump duration
//    (5 ps), the low ends of the datasheet ranges; at 800 nm that pair has a
//    time–bandwidth product of 0.70, the closest the ranges allow to the
//    quoted typical 0.6. The idler width is derived (uncorrelated pump and
//    signal), not a datasheet value. Conversion 0.375 is illustrative,
//    numerically inspired by the listed 0.9 W and 0.6 W output specifications
//    for a 4 W pump, which share no stated operating point. The datasheet
//    does not identify the internal mirrors or crystal; the scene's layout
//    and generic χ⁽²⁾ crystal are illustrative. The datasheet does not give the output-coupler transmission;
//    10 % is illustrative.
//    Concessions: M1 and M2 are drawn flat; real synchronously pumped
//    cavities focus into the crystal with curved mirrors, and the
//    workbench's curved mirrors are not wavelength-selective. The datasheet
//    couples signal and idler out collinearly; here the idler leaves through
//    M2. The pump is a single axial ray: chief-ray routing only.
//
// 2. OPTICAL PARAMETRIC OSCILLATOR, FOLDED CAVITY. A textbook nanosecond
//    OPO: a Q-switched 532 nm pump, a short plane-mirror cavity folded into a
//    V at a 15° angle of incidence, a signal linewidth set by the cavity and a partially reflecting
//    output coupler. Every number is illustrative rather than taken from one
//    instrument: 10 ns pump at 1 kHz with a 1 cm⁻¹ linewidth, signal 5 cm⁻¹,
//    output pulses 0.8 × the pump duration, 30 % conversion, 70 % output
//    coupler.
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../Examples/Nonlinear Optics/', import.meta.url));
export const SYNC_OPO_NAME = 'Synchronously pumped picosecond OPO';
export const FOLDED_OPO_NAME = 'Optical parametric oscillator — folded cavity, element by element';

const C_MM_PER_NS = 299.792458;
export const REP_RATE_MHZ = 80;
export const CAVITY_LENGTH_MM = C_MM_PER_NS * 1e3 / REP_RATE_MHZ / 2;
export const FOLD_INCIDENCE_DEG = 12;

const DEG = Math.PI / 180;
const dir = deg => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });
const along = (p, d, length) => ({ x: p.x + d.x * length, y: p.y + d.y * length });
const round = v => Math.round(v * 1e4) / 1e4;
// A flat reflector at `rot` degrees turns direction `from` into `to` when its
// normal lies along to − from.
const foldRot = (from, to) => {
  const deg = Math.atan2(to.y - from.y, to.x - from.x) / DEG;
  return round(((deg % 180) + 180) % 180);
};
const back = d => ({ x: -d.x, y: -d.y });
const TURN = 2 * FOLD_INCIDENCE_DEG;

const el = (id, type, p, params, extra = {}) =>
  ({ id, type, x: round(p.x), y: round(p.y), rot: 0, label: '', showLabel: false, params, ...extra });
const text = (id, x, y, body, fontSize = 11) =>
  el(id, 'textlabel', { x, y }, { text: body, fontSize, fill: '#34454d' });
const named = (label, labelPos = 'b') => ({ label, showLabel: true, labelPos });
const bandReflector = { dtype: 'notch', center: 800, band: 300, length: 25.4 };

// ---------------------------------------------------------------- 1 -------
const AXIS = 400;
const M1 = { x: 440, y: AXIS }, CRYSTAL = { x: 490, y: AXIS }, M2 = { x: 540, y: AXIS };
const TO_F1 = dir(-TURN);          // signal leaving M1, back over the crystal
const TO_M3 = dir(180);            // folded back level by F1 (in −24°, out 180°: 12° incidence)
const TO_M4 = dir(180 - TURN);     // signal leaving M2, back under the crystal
const ARM_F1 = 700, ARM_M4 = 360;
const F1 = along(M1, TO_F1, ARM_F1);
const ARM_M3 = CAVITY_LENGTH_MM - (M2.x - M1.x) - ARM_F1 - ARM_M4;
const M3 = along(F1, TO_M3, ARM_M3);
const M4 = along(M2, TO_M4, ARM_M4);
export const SYNC_OPO_PATH = { M3, F1, M1, M2, M4 };

export function syncOpoScene() {
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', { x: 600, y: 340 }, { w: 1200, h: 680, background: 'white' }),
      text('title', 30, 30, '# Synchronously pumped picosecond OPO\nGreen-pumped singly resonant oscillator, modelled on the APE Levante Emerald 6 ps datasheet', 12),
      text('cavity-note', 820, 470, `One-way cavity path ${CAVITY_LENGTH_MM.toFixed(1)} mm: round-trip time = 1 / ${REP_RATE_MHZ} MHz = ${(1e3 / REP_RATE_MHZ).toFixed(1)} ns,\nso each signal pulse returns to the crystal with the next pump pulse`, 10),
      el('pump', 'pulsedlaser', { x: 270, y: AXIS }, {
        wavelength: 532, pulseWidthFs: 6000, repRateMHz: REP_RATE_MHZ, avgPowerW: 4,
        transformLimited: true, pulseShape: 'gauss', beamMode: 'line',
      }, named('532 nm · 6 ps · 80 MHz · 4 W')),
      el('M1', 'dichroic', M1, bandReflector, { rot: foldRot(back(dir(0)), TO_F1), ...named('M1', 'b') }),
      el('crystal', 'crystal', CRYSTAL, {
        convert: 'opo', aperture: 10, pumpWl: 532, signalWl: 800, pumpAcceptanceNm: 1,
        linewidthMode: 'signal', signalLinewidthCm: 4.69,
        outputPhase: 'unknown', durationFactor: 0.8333, efficiency: 0.375, transmitPump: true,
      }, named('χ⁽²⁾ crystal', 't')),
      el('M2', 'dichroic', M2, bandReflector, { rot: foldRot(dir(0), TO_M4), ...named('M2', 't') }),
      el('F1', 'mirror', F1, { length: 25.4, refl: 100 }, { rot: foldRot(TO_F1, TO_M3), ...named('F1', 'r') }),
      el('M3', 'mirror', M3, { length: 25.4, refl: 100 }, { rot: foldRot(TO_M3, back(TO_M3)), ...named('M3 · HR', 'b') }),
      el('M4', 'mirror', M4, { length: 25.4, refl: 90, showTransmitted: true },
        { rot: foldRot(TO_M4, back(TO_M4)), ...named('M4 · output coupler', 'b') }),
      el('separator', 'dichroic', { x: 740, y: AXIS }, { dtype: 'longpass', cutoff: 1000, length: 25.4 },
        { rot: 135, ...named('separator', 't') }),
      el('pump-dump', 'beamdump', { x: 740, y: AXIS + 110 }, { aperture: 22 }, { rot: 90, ...named('residual pump') }),
      el('idler-probe', 'probe', { x: 850, y: AXIS }, { prop: 'spectrum' }),
      el('idler-detector', 'detector', { x: 1000, y: AXIS }, { aperture: 26 }, named('idler · 1588 nm')),
      el('signal-probe', 'probe', along(M4, TO_M4, 30), { prop: 'spectrum' }),
      el('signal-detector', 'detector', along(M4, TO_M4, 120), { aperture: 26 },
        { rot: round(180 - TURN), ...named('signal · 800 nm') }),
      text('coatings', 300, 610, 'M1, M2 · reflect the signal band (650–950 nm), transmit pump and idler\nF1, M3 · high reflectors    M4 · output coupler, 10 % of the signal (illustrative)', 10),
      text('legend', 300, 650, 'Only the 800 nm signal resonates. The crystal converts an illustrative 37.5 % of the pump, inspired by the\ndatasheet\'s listed output powers but not a measured operating point: no threshold or gain.', 10),
    ],
  };
}

// ---------------------------------------------------------------- 2 -------
const V_AXIS = 300;
const V_INCIDENCE_DEG = 15;
const V_M1 = { x: 330, y: V_AXIS }, V_CRYSTAL = { x: 400, y: V_AXIS }, V_M2 = { x: 470, y: V_AXIS };
const V_TO_M3 = dir(180 + 2 * V_INCIDENCE_DEG);
const V_ARM = 200;
const V_M3 = along(V_M2, V_TO_M3, V_ARM);
export const FOLDED_OPO_PATH = { M1: V_M1, M2: V_M2, M3: V_M3 };

export function foldedOpoScene() {
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', { x: 400, y: 260 }, { w: 800, h: 520, background: 'white' }),
      text('title', 30, 30, '# Optical parametric oscillator — folded cavity\nA textbook singly resonant OPO: one pump photon becomes one signal and one idler photon', 12),
      text('energy', 30, 88, '1 / 532 nm = 1 / 800 nm + 1 / 1588 nm      generated power: signal 66.5 %, idler 33.5 % (equal photon numbers)', 10),
      el('pump', 'pulsedlaser', { x: 170, y: V_AXIS }, {
        wavelength: 532, pulseWidthFs: 1e7, repRateMHz: 0.001, avgPowerW: 1,
        transformLimited: false, bandwidth: 0.03, pulseShape: 'gauss', beamMode: 'line',
      }, named('Q-switched 532 nm · 10 ns · 1 kHz')),
      el('M1', 'dichroic', V_M1, bandReflector, { rot: 0, ...named('M1 · input mirror', 'b') }),
      el('crystal', 'crystal', V_CRYSTAL, {
        convert: 'opo', aperture: 10, pumpWl: 532, signalWl: 800, pumpAcceptanceNm: 1,
        linewidthMode: 'signal', signalLinewidthCm: 5,
        outputPhase: 'unknown', durationFactor: 0.8, efficiency: 0.3, transmitPump: true,
      }, named('χ⁽²⁾ crystal', 'b')),
      el('M2', 'dichroic', V_M2, bandReflector, { rot: foldRot(dir(0), V_TO_M3), ...named('M2 · fold mirror', 'b') }),
      el('M3', 'mirror', V_M3, { length: 25.4, refl: 70, showTransmitted: true },
        { rot: foldRot(V_TO_M3, back(V_TO_M3)), ...named('M3 · output coupler', 'r') }),
      el('separator', 'dichroic', { x: 600, y: V_AXIS }, { dtype: 'longpass', cutoff: 1000, length: 25.4 },
        { rot: 135, ...named('separator', 't') }),
      el('pump-dump', 'beamdump', { x: 600, y: V_AXIS + 100 }, { aperture: 22 }, { rot: 90, ...named('residual pump') }),
      el('idler-detector', 'detector', { x: 720, y: V_AXIS }, { aperture: 26 }, named('idler · 1588 nm')),
      el('signal-detector', 'detector', along(V_M3, back(V_TO_M3), -130), { aperture: 26 },
        { rot: round(180 + 2 * V_INCIDENCE_DEG), ...named('signal · 800 nm', 'l') }),
      text('coatings', 60, 385, 'M1, M2 · reflect the signal band (650–950 nm), transmit pump and idler\nM3 · output coupler, 30 % of the signal', 10),
      text('legend', 30, 470, 'Only the signal resonates between M1 and M3. The pump makes one pass and leaves with the idler through M2.\nIllustrative settings: 30 % conversion, cavity-set 5 cm⁻¹ signal linewidth, output pulses 0.8 × the pump duration.', 10),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(DIR, { recursive: true });
  // The femtosecond PPLN draft this generator used to write is replaced.
  await rm(join(DIR, 'Synchronously pumped femtosecond OPO.json'), { force: true });
  for (const [name, scene] of [[SYNC_OPO_NAME, syncOpoScene()], [FOLDED_OPO_NAME, foldedOpoScene()]]) {
    const path = join(DIR, `${name}.json`);
    await writeFile(path, `${JSON.stringify(scene, null, 2)}\n`);
    console.log(`wrote ${path}`);
  }
  console.log({ CAVITY_LENGTH_MM, ARM_M3, M3, F1, M4, V_M3 });
}
