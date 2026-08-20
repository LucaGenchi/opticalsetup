// Canvas simulation time scale: how many simulated nanoseconds elapse per
// real wall-clock second. One shared clock drives pulse packets, chopper
// gating, AOM/EOM modulation, and galvo scanning, so those elements stay
// mutually synchronized at every scale.
//
// The piezo stage and the retroreflector delay line are deliberately NOT on
// this clock: their real periods are seconds (up to ~1e10 ns), far above the
// 1 ms/s ceiling here, so driving them from simulated time would freeze them
// on screen. They keep an illustrative wall-clock animation instead.

export const TIME_SCALES = [
  { ns: 1, label: '1 ns/s' },
  { ns: 10, label: '10 ns/s' },
  { ns: 100, label: '100 ns/s' },
  { ns: 1e3, label: '1 µs/s' },
  { ns: 1e4, label: '10 µs/s' },
  { ns: 1e5, label: '100 µs/s' },
  { ns: 1e6, label: '1 ms/s' },
];

export const MIN_TIME_SCALE = TIME_SCALES[0].ns;
export const MAX_TIME_SCALE = TIME_SCALES[TIME_SCALES.length - 1].ns;

// A packet stream only reads as "pulsed" when its period is within a couple
// of orders of magnitude of the time scale. Far outside that, the packets
// either crawl (period >> scale, nothing arrives) or smear into a continuous
// stream (period << scale) — both of which look like plain CW light, so the
// renderer drops the packet overlay and leaves the steady traced beam.
export const CW_FALLBACK_RATIO = 50;

export function snapTimeScale(desiredNsPerSecond) {
  if (!Number.isFinite(desiredNsPerSecond) || desiredNsPerSecond <= 0) return 10;
  const clamped = Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, desiredNsPerSecond));
  let best = TIME_SCALES[0];
  let bestDistance = Infinity;
  for (const scale of TIME_SCALES) {
    // nearest in log space: scales are decades apart, so a ratio-based
    // distance picks the decade a period actually belongs to.
    const distance = Math.abs(Math.log(scale.ns / clamped));
    if (distance < bestDistance) { bestDistance = distance; best = scale; }
  }
  return best.ns;
}

export function pulsePeriodNs(repRateMHz) {
  const mhz = Number(repRateMHz);
  if (!Number.isFinite(mhz) || mhz <= 0) return null;
  return 1000 / mhz; // 1 MHz -> 1000 ns
}

// True when packets should be replaced by a CW-style steady beam.
export function pulsesReadAsCW(periodNs, scaleNsPerSecond) {
  if (!Number.isFinite(periodNs) || periodNs <= 0) return false;
  if (!Number.isFinite(scaleNsPerSecond) || scaleNsPerSecond <= 0) return false;
  const ratio = periodNs / scaleNsPerSecond;
  return ratio > CW_FALLBACK_RATIO || ratio < 1 / CW_FALLBACK_RATIO;
}

// The repetition-rate tiers requested for pulsed sources.
function laserScaleFor(maxRepRateHz) {
  if (maxRepRateHz > 50e6) return 10;      // >50 MHz    -> 10 ns/s
  if (maxRepRateHz >= 500e3) return 1e3;   // 500 kHz–50 MHz -> 1 µs/s
  return 1e5;                              // <500 kHz   -> 100 µs/s
}

// Aim for roughly two real seconds per cycle, then snap to a listed scale.
function motionScaleFor(freqHz) {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return null;
  return snapTimeScale((1e9 / freqHz) / 2);
}

// Characteristic drive frequency (Hz) of each time-varying element, or null
// when it is static. EOM retardance and the mechanical delay line's extra
// optical path are constants, not waveforms, so they never appear here.
export function elementDriveHz(el) {
  if (!el || !el.params) return null;
  const p = el.params;
  switch (el.type) {
    case 'pulsedlaser':
    case 'sclaser':
      return p.temporalMode === 'pulsed' && p.repRateMHz > 0 ? p.repRateMHz * 1e6 : null;
    case 'galvo':
      return p.scanMode && p.scanMode !== 'static' ? Math.max(0.01, p.scanFrequencyHz || 1) : null;
    case 'chopper':
      return p.modulate ? Math.max(0.1, p.frequencyHz || 1000) : null;
    case 'aom':
      return p.modulate && p.modFreqMHz > 0 ? p.modFreqMHz * 1e6 : null;
    case 'eom':
      return p.modulate && p.driveMode === 'switching' && p.switchFreqMHz > 0 ? p.switchFreqMHz * 1e6 : null;
    case 'stage':
      if (!p.pzMode || p.pzMode === 'static') return null;
      // the slower of the two active axes governs what you need to watch
      return Math.max(0.01, Math.min(
        p.pzMode === 'z' ? Infinity : (p.pzFreqXY || 0.15),
        p.pzMode === 'xy' ? Infinity : (p.pzFreqZ || 0.1),
      ));
    case 'retroreflector':
      return p.moveMode === 'linear' ? Math.max(0.01, p.freqHz || 0.2) : null;
    default:
      return null;
  }
}

const MOTION_LABELS = {
  galvo: 'galvo scanning',
  chopper: 'the chopper',
  aom: 'AOM modulation',
  eom: 'EOM switching',
  stage: 'the piezo stage',
  retroreflector: 'the delay line',
};

// Elements whose motion never runs on the simulated clock at all — see
// canvas.js's galvoAnimationSeconds()/setMechanicsMode() — so no numeric
// scale can make them "correct." Their presence recommends the dedicated
// Mechanics mode outright, in place of a numeric pick.
const ILLUSTRATIVE_ONLY_TYPES = new Set(['stage', 'retroreflector']);

// Pick the scale that keeps the slowest moving thing on the table watchable.
// Returns either a numeric scale or the Mechanics mode, plus what drove the
// choice, so the UI can explain itself when it auto-adjusts.
export function recommendedTimeScale(elements = []) {
  const list = Array.isArray(elements) ? elements : [];

  const illustrativeDriver = list.find(el => ILLUSTRATIVE_ONLY_TYPES.has(el?.type) && elementDriveHz(el) !== null);
  if (illustrativeDriver) {
    return { mechanics: true, scaleNsPerSecond: null, driver: MOTION_LABELS[illustrativeDriver.type] };
  }

  let best = null;
  const consider = (scale, driver) => {
    if (!Number.isFinite(scale)) return;
    if (!best || scale > best.scaleNsPerSecond) best = { scaleNsPerSecond: scale, driver, mechanics: false };
  };

  const repRates = list.map(el => (el?.type === 'pulsedlaser' || el?.type === 'sclaser') ? elementDriveHz(el) : null)
    .filter(Number.isFinite);
  if (repRates.length) consider(laserScaleFor(Math.max(...repRates)), 'the pulsed source');

  for (const el of list) {
    if (el?.type === 'pulsedlaser' || el?.type === 'sclaser') continue;
    const hz = elementDriveHz(el);
    if (!Number.isFinite(hz)) continue;
    consider(motionScaleFor(hz), MOTION_LABELS[el.type] || 'the animated element');
  }

  return best || { scaleNsPerSecond: 10, driver: null, mechanics: false };
}
