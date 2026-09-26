// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { polygonScannerState } from './polygon-scanner.js';

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

// The fastest scale at which pulse packets are drawn moving. Light covers
// 0.3 mm per simulated nanosecond, so at 1 µs/s a packet crosses the bench
// at 0.3 m/s -- about two seconds across a 60 cm setup. At 10 µs/s it would
// cross in a fifth of a second and at 100 µs/s in a single frame: a flicker
// that is uncomfortable to watch, not an animation. Above this scale the
// packets are drawn as the steady beam instead, whichever way the scale was
// set; choppers, galvos and the like still animate.
export const MAX_PACKET_SCALE = 1e3;

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

// True when packets at this scale would move too fast to watch comfortably.
export function packetsTooFast(scaleNsPerSecond) {
  return Number.isFinite(scaleNsPerSecond) && scaleNsPerSecond > MAX_PACKET_SCALE;
}

// True when packets should be replaced by a CW-style steady beam: too fast
// to watch, or a period too far from the scale to read as pulses.
export function pulsesReadAsCW(periodNs, scaleNsPerSecond) {
  if (!Number.isFinite(periodNs) || periodNs <= 0) return false;
  if (!Number.isFinite(scaleNsPerSecond) || scaleNsPerSecond <= 0) return false;
  if (packetsTooFast(scaleNsPerSecond)) return true;
  const ratio = periodNs / scaleNsPerSecond;
  return ratio > CW_FALLBACK_RATIO || ratio < 1 / CW_FALLBACK_RATIO;
}

// The repetition-rate tiers for pulsed sources, never faster than
// MAX_PACKET_SCALE. A train slower than 20 kHz (a period over 50 µs) cannot
// read as pulses at any comfortable scale: it asks for no scale, and its
// packets are drawn as the steady beam.
const SLOWEST_PACKET_RATE_HZ = 1e9 / (CW_FALLBACK_RATIO * MAX_PACKET_SCALE); // 20 kHz
function laserScaleFor(maxRepRateHz) {
  if (maxRepRateHz > 50e6) return 10;                              // >50 MHz        -> 10 ns/s
  if (maxRepRateHz >= SLOWEST_PACKET_RATE_HZ) return MAX_PACKET_SCALE; // 20 kHz–50 MHz -> 1 µs/s
  return null;                                                     // <20 kHz: none
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
    case 'polygonscanner':
      return p.scanMode !== 'static' && polygonScannerState(p).rpm > 0
        ? polygonScannerState(p).lineRateHz : null;
    case 'galvo':
      return p.scanMode && p.scanMode !== 'static' ? Math.max(0.01, p.scanFrequencyHz || 1) : null;
    case 'chopper':
      return p.modulate ? Math.max(0.1, p.frequencyHz || 1000) : null;
    case 'aom':
      return p.modulate && p.modFreqMHz > 0 ? p.modFreqMHz * 1e6 : null;
    case 'aod':
      return p.scanMode && p.scanMode !== 'static' && p.scanFreqKHz > 0 ? p.scanFreqKHz * 1e3 : null;
    case 'phasemodulator':
      return p.driveMode && p.driveMode !== 'static' && p.freqMHz > 0 ? p.freqMHz * 1e6 : null;
    case 'eom':
      return p.modulate && p.driveMode === 'switching' && p.switchFreqMHz > 0 ? p.switchFreqMHz * 1e6 : null;
    case 'delayline':
      // Equal endpoints are a supported way of holding still. Reporting a
      // drive for one would put the whole scene into Mechanics mode, and
      // suppress the pulse packet layer, on behalf of a stage that is not
      // going anywhere.
      // Computed here rather than imported: this module is deliberately
      // standalone, and the rule is one line.
      return p.moveMode === 'linear' && p.freqHz > 0
        && Math.abs((Number(p.delayMaxMm) || 0) - (Number(p.delayMinMm) || 0)) > 0
        ? p.freqHz : null;
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
  polygonscanner: 'polygon scanning',
  chopper: 'the chopper',
  aom: 'AOM modulation',
  aod: 'AOD scanning',
  delayline: 'the delay-line sweep',
  phasemodulator: 'phase modulation',
  eom: 'EOM switching',
  stage: 'the piezo stage',
  retroreflector: 'the delay line',
};

// Elements whose motion never runs on the simulated clock at all — see
// canvas.js's galvoAnimationSeconds()/setMechanicsMode() — so no numeric
// scale can make them "correct." Their presence recommends the dedicated
// Mechanics mode outright, in place of a numeric pick.
const ILLUSTRATIVE_ONLY_TYPES = new Set(['stage', 'retroreflector', 'delayline']);

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
