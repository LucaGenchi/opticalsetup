import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';
import {
  probeAveragePowerW, formatPowerMw, probeDurationLabel, probeTimeWindowNs, probeSpectrumRange,
} from '../sketch/js/probe.js';

// A source of the given type on a line beam, with a probe downstream of it.
function bench(type, params = {}, probeParams = {}) {
  const source = createElement(type, 0, 0);
  source.params.beamMode = 'line';
  Object.assign(source.params, params);
  const probe = createElement('probe', 150, 0);
  Object.assign(probe.params, probeParams);
  const scene = [source, probe];
  traceAll(scene, []);
  return { scene, source, probe, svg: () => registry.probe.svg(probe, scene) };
}

// ---------------- average power ----------------

test('the probe quotes the source power scaled by what survived the path', () => {
  const { scene, probe } = bench('cwlaser', { avgPowerW: 0.2 }, { prop: 'power' });
  const svg = registry.probe.svg(probe, scene);
  assert.match(svg, /200 mW/, 'an unobstructed beam carries the whole configured power');
  assert.match(svg, /average/);
});

test('an attenuator on the way is reflected in the reading', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.avgPowerW = 0.2;
  const nd = createElement('filter', 80, 0);
  Object.assign(nd.params, { ftype: 'nd', trans: 0.25 });
  const probe = createElement('probe', 150, 0);
  probe.params.prop = 'power';
  const scene = [laser, nd, probe];
  traceAll(scene, []);
  assert.match(registry.probe.svg(probe, scene), /50(\.0)? mW/,
    '25% of 200 mW is 50 mW at the probe');
});

test('power is null when nothing upstream declares any', () => {
  assert.equal(probeAveragePowerW({ sourceId: 'e1', intensity: 1 }, [{ id: 'e1', params: {} }]), null);
  assert.equal(probeAveragePowerW({ sourceId: null, intensity: 1 }, []), null);
  assert.equal(probeAveragePowerW(null, []), null);
});

test('power formatting steps through the units it is likely to meet', () => {
  assert.equal(formatPowerMw(0.2), '200 mW');
  assert.equal(formatPowerMw(2), '2.00 W');
  assert.equal(formatPowerMw(1e-6), '1.00 µW');
  assert.equal(formatPowerMw(0), '0 mW');
  assert.equal(formatPowerMw(null), '—');
});

// ---------------- pulse duration ----------------

test('pulse duration names what each kind of source actually has', () => {
  assert.equal(probeDurationLabel({ pulse: null }, 'cwlaser'), 'CW source');
  assert.equal(probeDurationLabel({ pulse: { pulseWidthFs: 150 } }, 'pulsedlaser'), '150 fs');
  assert.equal(probeDurationLabel({ pulse: { pulseWidthFs: 2500 } }, 'pulsedlaser'), '2.50 ps');
  // A supercontinuum's train carries a nominal width, but the app does not
  // model the temporal structure nonlinear broadening produces -- quoting
  // that number would be inventing a measurement.
  assert.equal(probeDurationLabel({ pulse: { pulseWidthFs: 100 } }, 'sclaser'), 'Undefined');
});

test('the duration card reads from the real source on the bench', () => {
  for (const [type, expected] of [['cwlaser', /CW source/], ['pulsedlaser', /150 fs/], ['sclaser', /Undefined/]]) {
    const { svg } = bench(type, {}, { prop: 'duration' });
    assert.match(svg(), expected, `${type} should report ${expected}`);
  }
});

// ---------------- intensity over time ----------------

test('the default window is two periods of the slowest thing on the beam', () => {
  // bare 80 MHz train: 12.5 ns period, so 25 ns -- three pulses on screen
  const bare = probeTimeWindowNs({ pulse: { repRateMHz: 80, gates: [] } });
  assert.equal(bare.spanNs, 25);
  assert.equal(bare.auto, true);

  // a 1 MHz intensity modulation is far slower than the train, and is what
  // the window should follow instead
  const modulated = probeTimeWindowNs({ pulse: { repRateMHz: 80, gates: [{ frequencyMHz: 1 }] } });
  assert.equal(modulated.spanNs, 2000, 'two periods of the 1 MHz modulation');

  // an explicit interval wins, and the offset moves the window
  const manual = probeTimeWindowNs({ pulse: { repRateMHz: 80, gates: [] } },
    { timeSpanNs: 5, timeOffsetNs: 100 });
  assert.deepEqual({ startNs: manual.startNs, spanNs: manual.spanNs, auto: manual.auto },
    { startNs: 100, spanNs: 5, auto: false });
});

test('a bare 80 MHz train puts three pulses in the default window', () => {
  const { svg } = bench('pulsedlaser', {}, { prop: 'time' });
  const drawn = Number(/data-probe-time="(\d+)"/.exec(svg())?.[1] ?? 0);
  assert.equal(drawn, 3, `two periods should show three pulses, got ${drawn}`);
  assert.match(svg(), /80 MHz/);
});

test('a CW beam draws a flat line and says so', () => {
  const { svg } = bench('cwlaser', {}, { prop: 'time' });
  assert.match(svg(), /data-probe-time="cw"/);
  assert.match(svg(), />CW</);
});

test('a supercontinuum shows its train, since it has a repetition rate', () => {
  const { svg } = bench('sclaser', {}, { prop: 'time' });
  const drawn = Number(/data-probe-time="(\d+)"/.exec(svg())?.[1] ?? 0);
  assert.ok(drawn >= 3, `an SC source pulses like any other train, got ${drawn}`);
});

test('the time offset moves the window without changing its width', () => {
  const early = bench('pulsedlaser', {}, { prop: 'time', timeSpanNs: 12.5, timeOffsetNs: 0 });
  const late = bench('pulsedlaser', {}, { prop: 'time', timeSpanNs: 12.5, timeOffsetNs: 50 });
  assert.match(early.svg(), />0</, 'the window starts at zero');
  assert.match(late.svg(), />50 ns</);
  assert.match(late.svg(), />62.5 ns</, 'the far edge follows the offset');
});

test('an intensity modulation sets the window, and dense trains fill instead of spiking', () => {
  const chopped = frequencyHz => {
    const laser = createElement('pulsedlaser', 0, 0);
    laser.params.beamMode = 'line';
    const chopper = createElement('chopper', 80, 0);
    Object.assign(chopper.params, { modulate: true, frequencyHz });
    const probe = createElement('probe', 200, 0);
    probe.params.prop = 'time';
    const scene = [laser, chopper, probe];
    traceAll(scene, []);
    return registry.probe.svg(probe, scene);
  };

  // 1 kHz chopper: two periods is 2 ms, which at 80 MHz holds 160 000 pulses.
  // Drawing them individually would be both untrue (the trace caps long
  // before that) and unreadable, so the beam is filled under its envelope.
  const slow = chopped(1000);
  assert.match(slow, /data-probe-time="dense"/);
  assert.match(slow, />2 ms</, 'the axis follows the modulation, in readable units');
  assert.doesNotMatch(slow, /e\+/, 'never exponent notation on the axis');

  // 20 MHz chopper: two periods is 100 ns, and the individual pulses of an
  // 80 MHz train are separable there, so they are drawn.
  const fast = chopped(20e6);
  assert.match(fast, />100 ns</);
  const drawn = Number(/data-probe-time="(\d+)"/.exec(fast)?.[1] ?? 0);
  assert.ok(drawn >= 8 && drawn <= 10, `expected the individual pulses, got ${drawn}`);
});

test('the time axis stays readable across six orders of magnitude', () => {
  const spanned = timeSpanNs => {
    const { svg } = bench('pulsedlaser', {}, { prop: 'time', timeSpanNs });
    return /text-anchor="end" font-size="4.6" fill="#666">([^<]+)</.exec(svg())?.[1];
  };
  assert.equal(spanned(0.5), '500 ps');
  assert.equal(spanned(25), '25 ns');
  assert.equal(spanned(2000), '2 µs');
  assert.equal(spanned(2e6), '2 ms');
});

// ---------------- spectrum range ----------------

test('the automatic spectrum window spans what clears a thousandth of the peak', () => {
  const line = probeSpectrumRange({ wl: 532, bw: 0, spec: null });
  assert.deepEqual([line.lo, line.hi], [527, 537], 'a bare line gets the minimum span');
  assert.equal(line.auto, true);
});

test('a fixed spectrum range is used exactly, and ignored when incoherent', () => {
  const fixed = probeSpectrumRange({ wl: 532 }, { rangeMode: 'manual', specMin: 400, specMax: 700 });
  assert.deepEqual([fixed.lo, fixed.hi, fixed.auto], [400, 700, false]);
  // min above max is not a range; fall back rather than draw a mirrored axis
  const bad = probeSpectrumRange({ wl: 532, bw: 0, spec: null },
    { rangeMode: 'manual', specMin: 700, specMax: 400 });
  assert.equal(bad.auto, true);
});
