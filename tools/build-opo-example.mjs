// Generates the two OPO examples: `node tools/build-opo-example.mjs`.
//
// Both are singly resonant: every cavity mirror is a band reflector that
// returns the ~800 nm signal and transmits the 532 nm pump and 1588 nm idler,
// which is what real OPO mirror coatings do. Every fold is at a 12° angle of
// incidence, near normal as cavity mirrors are used, so the beam folds back
// on itself rather than glancing off.
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
// 2. OPTICAL PARAMETRIC OSCILLATOR, RING CAVITY. A synchronously pumped
//    singly resonant OPO in a bow-tie ring of four plane band reflectors,
//    each at a 12° angle of incidence. A signal pulse that leaves the crystal
//    must come round to meet the next pump pulse, so the ring's perimeter is
//    c / f_rep = 3747.41 mm at 80 MHz — the same condition as the linear
//    cavity, where the light covers the arm twice. M2 is an output coupler
//    reflecting 80 % of the signal band while transmitting pump and idler, so
//    signal, idler and residual pump leave together. Illustrative settings:
//    532 nm, 6 ps, 80 MHz pump; signal with the pump's frequency (wavenumber)
//    FWHM (a heuristic);
//    30 % conversion.
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../Examples/Nonlinear Optics/', import.meta.url));
export const SYNC_OPO_NAME = 'Synchronously pumped picosecond OPO';
export const RING_OPO_NAME = 'Optical parametric oscillator — ring cavity, element by element';

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
// A bow-tie ring: M1 and M2 either side of the crystal, M3 and M4 above. The
// signal runs M2 → M3 → M4 → M1 → crystal, crossing itself between the top
// and bottom pairs, and circulates in the pump's direction. The perimeter is
// g + 2·span/cos(24°) + (2·span − g) = span·(2/cos 24° + 2) whatever the
// gap g between M1 and M2, so the span follows from the pump period.
const RING_AXIS = 560;
const RING_GAP = 300;
export const RING_PERIMETER_MM = 2 * CAVITY_LENGTH_MM;
const RING_SPAN = RING_PERIMETER_MM / (2 / Math.cos(TURN * DEG) + 2);
const RING_RISE = RING_SPAN * Math.tan(TURN * DEG);      // 12° incidence at every mirror
const RING_M2 = { x: RING_SPAN + 80, y: RING_AXIS };
const RING_M1 = { x: RING_M2.x - RING_GAP, y: RING_AXIS };
const RING_CRYSTAL = { x: RING_M1.x + RING_GAP / 2, y: RING_AXIS };
const RING_M3 = { x: RING_M2.x - RING_SPAN, y: RING_AXIS - RING_RISE };
const RING_M4 = { x: RING_M1.x + RING_SPAN, y: RING_AXIS - RING_RISE };
export const RING_OPO_PATH = { M1: RING_M1, M2: RING_M2, M3: RING_M3, M4: RING_M4 };
const unit = (a, b) => { const x = b.x - a.x, y = b.y - a.y, l = Math.hypot(x, y); return { x: x / l, y: y / l }; };
const RIGHT = dir(0);

export function ringOpoScene() {
  const toM3 = unit(RING_M2, RING_M3), toM1 = unit(RING_M4, RING_M1);
  const out = RING_M2.x + 150;
  return {
    app: 'optics2d', version: 1,
    elements: [
      el('frame', 'figureframe', { x: 850, y: 430 }, { w: 1700, h: 860, background: 'white' }),
      text('title', 30, 30, '# Optical parametric oscillator — ring cavity\nA synchronously pumped singly resonant OPO: one pump photon becomes one signal and one idler photon', 12),
      text('energy', 30, 88, '1 / 532 nm = 1 / 800 nm + 1 / 1588 nm      generated power: signal 66.5 %, idler 33.5 % (equal photon numbers)', 10),
      text('sync-note', RING_M3.x + 780, RING_M3.y - 70, `Ring perimeter ${RING_PERIMETER_MM.toFixed(1)} mm: round-trip time = 1 / ${REP_RATE_MHZ} MHz = ${(1e3 / REP_RATE_MHZ).toFixed(1)} ns,\nso each signal pulse comes round to meet the next pump pulse`, 10),
      el('pump', 'pulsedlaser', { x: RING_M1.x - 220, y: RING_AXIS }, {
        wavelength: 532, pulseWidthFs: 6000, repRateMHz: REP_RATE_MHZ, avgPowerW: 4,
        transformLimited: true, pulseShape: 'gauss', beamMode: 'line',
      }, named('532 nm · 6 ps · 80 MHz')),
      el('M1', 'dichroic', RING_M1, bandReflector, { rot: foldRot(toM1, RIGHT), ...named('M1', 'b') }),
      el('crystal', 'crystal', RING_CRYSTAL, {
        convert: 'opo', aperture: 10, pumpWl: 532, signalWl: 800, pumpAcceptanceNm: 1,
        linewidthMode: 'pump', outputPhase: 'unknown', durationFactor: 1, efficiency: 0.3, transmitPump: true,
      }, named('nonlinear crystal', 'b')),
      el('M2', 'dichroic', RING_M2, { ...bandReflector, bandRefl: 80 }, { rot: foldRot(RIGHT, toM3), ...named('M2 · output coupler', 'b') }),
      el('M3', 'dichroic', RING_M3, bandReflector, { rot: foldRot(toM3, RIGHT), ...named('M3', 't') }),
      el('M4', 'dichroic', RING_M4, bandReflector, { rot: foldRot(RIGHT, toM1), ...named('M4', 't') }),
      el('idler-separator', 'dichroic', { x: out, y: RING_AXIS }, { dtype: 'longpass', cutoff: 1000, length: 25.4 },
        { rot: 135, ...named('longpass 1000 nm', 't') }),
      el('idler-detector', 'detector', { x: out + 170, y: RING_AXIS }, { aperture: 26 }, named('idler · 1588 nm')),
      el('pump-separator', 'dichroic', { x: out, y: RING_AXIS + 100 }, { dtype: 'shortpass', cutoff: 650, length: 25.4 },
        { rot: 135, ...named('shortpass 650 nm', 'l') }),
      el('signal-detector', 'detector', { x: out + 170, y: RING_AXIS + 100 }, { aperture: 26 }, named('signal · 800 nm')),
      el('pump-dump', 'beamdump', { x: out, y: RING_AXIS + 190 }, { aperture: 22 }, { rot: 90, ...named('residual pump') }),
      text('coatings', 60, RING_AXIS + 120, 'M1–M4 · reflect the signal band (650–950 nm), transmit pump and idler\nM2 · output coupler: reflects 80 % of the signal band', 10),
      text('legend', 30, RING_AXIS + 250, 'Only the signal resonates, circulating in the pump\'s direction; signal, idler and residual pump leave together through M2.\nIllustrative settings: 30 % conversion, signal with the pump\'s frequency width, output pulses as long as the pump\'s.', 10),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(DIR, { recursive: true });
  // Earlier drafts this generator wrote are replaced.
  for (const old of ['Synchronously pumped femtosecond OPO', 'Optical parametric oscillator — folded cavity, element by element']) {
    await rm(join(DIR, `${old}.json`), { force: true });
  }
  for (const [name, scene] of [[SYNC_OPO_NAME, syncOpoScene()], [RING_OPO_NAME, ringOpoScene()]]) {
    const path = join(DIR, `${name}.json`);
    await writeFile(path, `${JSON.stringify(scene, null, 2)}\n`);
    console.log(`wrote ${path}`);
  }
  console.log({ CAVITY_LENGTH_MM, ARM_M3, M3, F1, M4, RING_OPO_PATH });
}
