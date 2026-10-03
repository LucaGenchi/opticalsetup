// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// What the beam probe reports, separated from how it draws. Each function
// takes a probe reading (raytrace.js probeAt) and returns a number or a label,
// so the rules can be tested without an SVG or a DOM.

import { spectrumSamples, spectrumSupport, spectrumWeight as spectrumWeightOf } from './spectrum.js';

// The power reading adds up what crosses the probe's sampling area, the way
// a power meter adds up what reaches its face (raytrace.js, probePowerAt):
// for each originating source, the fraction of its emitted power that
// arrives, times the watts it is configured for. Light from a source with no
// power setting cannot be put in watts; with nothing else there, there is no
// reading.
//
// A reading from a single ray (probeAt) is still accepted: the ray launches
// at intensity 1 and is multiplied down by everything it passes through, so
// its source's watts times that fraction is its beam's power.
export function probeAveragePowerW(reading, elements = []) {
  if (Array.isArray(reading?.sourceFractions)) {
    let watts = 0, attributed = 0;
    for (const { sourceId, fraction } of reading.sourceFractions) {
      const source = elements.find(el => el?.id === sourceId);
      const configured = Number(source?.params?.avgPowerW);
      if (!Number.isFinite(configured) || configured < 0 || !(fraction >= 0)) continue;
      watts += configured * fraction;
      attributed++;
    }
    return attributed ? watts : null;
  }
  if (!reading?.sourceId) return null;
  const source = elements.find(el => el?.id === reading.sourceId);
  const configured = Number(source?.params?.avgPowerW);
  if (!Number.isFinite(configured) || configured < 0) return null;
  const fraction = Number(reading.intensity);
  if (!Number.isFinite(fraction) || fraction < 0) return null;
  return configured * fraction;
}

export function formatPowerMw(watts) {
  if (!Number.isFinite(watts)) return '—';
  const mw = watts * 1000;
  if (mw === 0) return '0 mW';
  // Each unit starts where the one below would round to 1000 at three
  // significant figures: 999.6 mW is "1.00 W", never "1.00e+3 mW".
  if (mw >= 999.5) return `${(mw / 1000).toPrecision(3)} W`;
  if (mw >= 0.9995) return `${mw.toPrecision(3)} mW`;
  if (mw >= 0.9995e-3) return `${(mw * 1000).toPrecision(3)} µW`;
  return `${mw.toExponential(1)} mW`;
}

// Report the pulse duration at the probe, with the dispersion accumulated up
// to that point. Supercontinuum duration is an independent source input, not
// inferred from its spectrum. When the tracer cannot state a duration there,
// the probe says so rather than quoting the configured width.
export function probeDurationLabel(reading, sourceType) {
  if (!reading) return '—';
  if (!reading.pulse) return 'CW source';
  if (reading.pulse.durationIssue) return 'Unavailable';
  const fs = Number(reading.pulse.durationFs ?? reading.pulse.pulseWidthFs);
  if (!Number.isFinite(fs) || fs <= 0) return 'Undefined';
  if (fs >= 1e6) return `${(fs / 1e6).toPrecision(3)} ns`;
  if (fs >= 1000) return `${(fs / 1000).toPrecision(3)} ps`;
  return `${fs < 100 ? fs.toPrecision(3) : Math.round(fs)} fs`;
}

// The slowest period on a beam, in ns: the repetition period, or a slower
// intensity modulation riding on it. Accepts either shape of pulse record --
// the probe's single train, or a detector's aggregate with its trains array --
// because both displays answer the same question about the same light.
export function slowestPeriodNs(pulse) {
  if (!pulse) return 0;
  const trains = Array.isArray(pulse.trains) && pulse.trains.length ? pulse.trains : [pulse];
  const rates = trains.map(t => Number(t?.repRateMHz)).filter(r => Number.isFinite(r) && r > 0);
  const repPeriod = rates.length ? Math.max(...rates.map(r => 1000 / r)) : 0;
  const gatePeriods = trains
    .flatMap(t => (Array.isArray(t?.gates) ? t.gates : []))
    .map(g => Number(g?.frequencyMHz))
    .filter(f => Number.isFinite(f) && f > 0)
    .map(f => 1000 / f);
  return Math.max(repPeriod, ...(gatePeriods.length ? gatePeriods : [0]));
}

// A signed time-axis label that stays readable from picoseconds to
// milliseconds without ever falling back to exponent notation -- a chopper
// runs at kilohertz while the train it gates runs at megahertz, so one axis
// has to cross six orders of magnitude.
export function formatTimeAxisNs(ns) {
  if (!Number.isFinite(ns) || ns === 0) return '0';
  const abs = Math.abs(ns);
  const [value, unit] = abs >= 1e6 ? [ns / 1e6, 'ms']
    : abs >= 1000 ? [ns / 1000, 'µs']
      : abs >= 1 ? [ns, 'ns']
        : [ns * 1000, 'ps'];
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toPrecision(3));
  return `${rounded} ${unit}`;
}

// The default time window: two periods of the slowest thing happening on this
// beam. With nothing but the train itself that is two repetition periods, so
// three pulses land on screen; with an intensity modulation on top, it is two
// periods of the modulation, which is the thing you actually want to see.
export function probeTimeWindowNs(reading, params = {}) {
  const manual = Number(params.timeSpanNs);
  const offset = Number(params.timeOffsetNs);
  const startNs = Number.isFinite(offset) ? offset : 0;
  if (Number.isFinite(manual) && manual > 0) return { startNs, spanNs: manual, auto: false };
  const slowest = slowestPeriodNs(reading?.pulse);
  // A CW beam with no modulation at all has no timescale of its own; a
  // nanosecond of flat line is as good a window as any other.
  return { startNs, spanNs: slowest > 0 ? 2 * slowest : 1, auto: true };
}

// One window for a group of detectors, so their traces can be read against
// each other. It is the widest window any member would have picked alone, at
// the earliest offset any member asked for -- which guarantees nothing a
// member wanted to show falls outside the shared axis, and makes the result
// independent of which detector you happen to be drawing. Moving the offset
// on any one of them moves the whole group, which is what sync should feel
// like.
export function syncedTimeWindowNs(members) {
  const list = (members || []).filter(Boolean);
  const windows = list.map(m => probeTimeWindowNs(m.reading, m.params || {}));
  if (!windows.length) return null;
  return {
    startNs: Math.min(...windows.map(w => w.startNs)),
    spanNs: Math.max(...windows.map(w => w.spanNs)),
    // A shared origin is the whole point: with one common zero, light that
    // took the longer route is drawn where it actually arrives, so the two
    // trains sit apart on screen by exactly their path difference.
    originNs: Math.min(...list.map(m => arrivalDelayNs(m.reading))),
    synced: true,
    members: windows.length,
  };
}

// When the light reaching this detector was emitted versus when it got here.
// Both displays measure from the same instant only if this is accounted for.
export function arrivalDelayNs(reading) {
  const delay = Number(reading?.pulse?.earliestPathDelayNs);
  return Number.isFinite(delay) ? delay : 0;
}

// The wavelength axis, on the spectrometer's own principle: span whatever
// clears a thousandth of the peak, rather than a fixed number of standard
// deviations, so a narrow line and a broad band are both framed by what they
// actually contain.
const DISPLAY_FLOOR = 1e-3;
const MIN_SPAN_NM = 10;

export function probeSpectrumRange(reading, params = {}) {
  const lo = Number(params.specMin), hi = Number(params.specMax);
  if (params.rangeMode === 'manual' && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
    return { lo, hi, auto: false };
  }
  const centre = Number(reading?.wl) || 0;
  const samples = reading?.spec ? (spectrumSamples(reading.spec, 96) || []) : [];
  const peak = samples.reduce((best, s) => Math.max(best, s.weight || 0), 0);
  const above = peak > 0 ? samples.filter(s => s.weight >= peak * DISPLAY_FLOOR) : [];
  if (!above.length) {
    // No sampled spectrum: a bare line, framed by its own bandwidth.
    const half = Math.max(MIN_SPAN_NM / 2, (Number(reading?.bw) || 0));
    return { lo: centre - half, hi: centre + half, auto: true };
  }
  let low = Math.min(...above.map(s => s.wl));
  let high = Math.max(...above.map(s => s.wl));
  const pad = Math.max(0.5, (high - low) * 0.06);
  low -= pad; high += pad;
  if (high - low < MIN_SPAN_NM) {
    const mid = (low + high) / 2;
    low = mid - MIN_SPAN_NM / 2; high = mid + MIN_SPAN_NM / 2;
  }
  return { lo: low, hi: high, auto: true };
}

// ---------------- several beams in the sampling circle ----------------
// raytrace.js probeBeamsAt lists the beams crossing the probe's circle; when
// there are two or more, the spectrum, wavelength, polarization and time
// views describe all of them instead of the nearest one.

// What each beam weighs when several are drawn together: its watts when
// every beam's source has a power setting, or else its fraction of its own
// source's power, which only compares beams of equally powerful sources.
export function probeBeamWeights(beams, elements = []) {
  const watts = beams.map(beam => {
    const source = elements.find(el => el?.id === beam.originId);
    const configured = Number(source?.params?.avgPowerW);
    return Number.isFinite(configured) && configured >= 0 ? configured * beam.power : null;
  });
  if (watts.every(w => w !== null)) return { weights: watts, absolute: true };
  return { weights: beams.map(beam => beam.power), absolute: false };
}

// The wavelength window that frames every beam: the union of the windows each
// would pick alone, or the fixed range when one is set.
export function probeSpectrumRangeAll(beams, params = {}) {
  const ranges = beams.map(beam => probeSpectrumRange(beam, params));
  if (!ranges.length) return probeSpectrumRange(null, params);
  if (!ranges[0].auto) return ranges[0];
  const lo = Math.min(...ranges.map(r => r.lo)), hi = Math.max(...ranges.map(r => r.hi));
  // Margin on both sides, so a line at either end is not drawn on the axis.
  const pad = (hi - lo) * 0.06;
  return { lo: lo - pad, hi: hi + pad, auto: true };
}

// The summed spectral density of several beams on `count` points across
// [lo, hi], each beam weighted by `weights` (see probeBeamWeights): power per
// nanometre, so a narrow line stands taller than a broad band of the same
// power. A line narrower than the plot can show -- a monochromatic laser, or
// a lamp's lines -- is drawn with the plot's own resolution, 1/120 of the
// window, as a spectrometer draws a line with its instrument width.
export function combinedSpectrumSamples(beams, weights, lo, hi, count = 160) {
  const span = Math.max(1e-6, hi - lo);
  const sigma = span / 120;
  const gauss = (x, s) => Math.exp(-0.5 * (x / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const densities = beams.map(beam => {
    const spec = beam.spec;
    if (spec?.kind === 'lines') {
      const total = spec.lines.reduce((sum, l) => sum + Math.max(0, l.w), 0) || 1;
      return wl => spec.lines.reduce((sum, l) => sum + Math.max(0, l.w) / total * gauss(wl - l.nm, sigma), 0);
    }
    const width = Number(beam.bw) || 0;
    if (!spec || width < 2.355 * sigma) {
      // Unresolved at this scale: a line of the plot's resolution, at the
      // beam's centre, or a Gaussian of its own width when it has one.
      const s = Math.max(sigma, width / 2.355);
      return wl => gauss(wl - beam.wl, s);
    }
    // Normalised by the integral of the very function it is evaluated with,
    // so each beam's density integrates to its own weight (Andrea, #192:
    // spectrumSamples() is normalised differently, and a 0.1 W band came out
    // as 40 W against a line).
    const [from, to] = spectrumSupport(spec);
    const steps = 2000, dx = (to - from) / steps;
    let area = 0;
    for (let i = 0; i <= steps; i++) {
      area += (i === 0 || i === steps ? 0.5 : 1) * Math.max(0, spectrumWeightOf(spec, from + i * dx));
    }
    area *= dx;
    return area > 0 ? wl => Math.max(0, spectrumWeightOf(spec, wl)) / area : () => 0;
  });
  const points = [];
  for (let i = 0; i < count; i++) {
    const wl = lo + span * i / (count - 1);
    points.push({ wl, weight: densities.reduce((sum, d, k) => sum + (weights[k] || 0) * d(wl), 0) });
  }
  return points;
}

// Whether the pulsed beams in the circle arrive together. Trains at one
// repetition rate have a fixed delay, taken within one period (the nearest
// pulse of the other train) and measured at the centre of the circle; they
// are "synced" when every pulse lands within half a pulse duration of the
// first. Trains at different rates drift through each other: no fixed delay.
// Continuous beams are always there and take no part. Null with fewer than
// two pulsed beams.
export function probeTimingSummary(beams) {
  const pulsed = beams.filter(beam => beam.pulse?.repRateMHz > 0 && Number.isFinite(beam.arrivalNs));
  if (pulsed.length < 2) return null;
  const rate = pulsed[0].pulse.repRateMHz;
  if (pulsed.some(beam => Math.abs(beam.pulse.repRateMHz - rate) > 1e-9 * rate)) {
    return { state: 'rates', beams: pulsed.map(beam => ({ beam, delayNs: null })) };
  }
  const period = 1000 / rate;
  const folded = pulsed.map(beam => {
    const d = ((beam.arrivalNs - pulsed[0].arrivalNs) % period + period) % period;
    return d > period / 2 ? d - period : d;
  });
  const first = Math.min(...folded);
  const list = pulsed.map((beam, i) => ({ beam, delayNs: folded[i] - first })).sort((p, q) => p.delayNs - q.delayNs);
  const widthNs = beam => Math.max(0, beam.pulse.durationFs ?? beam.pulse.pulseWidthFs ?? 0) * 1e-6;
  const spread = list.at(-1).delayNs;
  const synced = spread <= Math.max(...pulsed.map(widthNs)) / 2;
  // Where the tracer cannot state a pulse's duration here, "synced" is judged
  // against the width the source emits, and says so.
  const estimated = pulsed.some(beam => !Number.isFinite(beam.pulse.durationFs));
  return { state: synced ? 'synced' : 'delayed', periodNs: period, beams: list, estimated };
}

// The one-line verdict the time view prints above its traces.
export function probeTimingLabel(summary) {
  if (!summary) return '';
  if (summary.state === 'rates') return 'different rep. rates: not synced';
  if (summary.state === 'synced') return summary.estimated ? 'synced (by source widths)' : 'synced';
  const name = entry => `${Math.round(entry.beam.wl)} nm`;
  const [lead, ...rest] = summary.beams;
  const sameColour = summary.beams.every(entry => Math.round(entry.beam.wl) === Math.round(lead.beam.wl));
  if (rest.length === 1) {
    return sameColour ? `delayed ${formatTimeAxisNs(rest[0].delayNs)}`
      : `${name(rest[0])} ${formatTimeAxisNs(rest[0].delayNs)} after ${name(lead)}`;
  }
  return `delays ${rest.map(entry => `${sameColour ? '' : `${name(entry)} `}+${formatTimeAxisNs(entry.delayNs)}`).join(', ')}`;
}
