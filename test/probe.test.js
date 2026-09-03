import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorResponseNs } from '../sketch/js/detector-instruments.js';
import { traceAll } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';
import {
  probeAveragePowerW, formatPowerMw, probeDurationLabel, probeTimeWindowNs, probeSpectrumRange,
  slowestPeriodNs, syncedTimeWindowNs, formatTimeAxisNs,
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
  // the value is the whole card -- nothing captions what the probe is set to
  assert.doesNotMatch(svg, /average/);
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
    assert.doesNotMatch(svg(), /pulse duration/, 'no caption under the value');
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

// ---------------- detector timebase and sync ----------------

// One beam per row: a bare 80 MHz train, or the same train through a chopper.
function detectorRow(y, chopHz, params = {}, type = 'detector') {
  const laser = createElement('pulsedlaser', 0, y);
  laser.params.beamMode = 'line';
  const parts = [laser];
  if (chopHz) {
    const chopper = createElement('chopper', 80, y);
    Object.assign(chopper.params, { modulate: true, frequencyHz: chopHz });
    parts.push(chopper);
  }
  const detector = createElement(type, 300, y);
  Object.assign(detector.params, params);
  const screen = createElement('display', 420, y);
  Object.assign(screen.params, { sensorId: detector.id, screenOn: true });
  return { parts: [...parts, detector, screen], detector, screen };
}

const axisLabels = (screen, scene) =>
  [...registry.display.svg(screen, scene).matchAll(/font-size="3.4" fill="#5f7d8e">([^<]+)</g)].map(m => m[1]);

test('the slowest period is found in either shape of pulse record', () => {
  // the probe's single train...
  assert.equal(slowestPeriodNs({ repRateMHz: 80, gates: [] }), 12.5);
  // ...and a detector's aggregate, where the trains sit one level down
  assert.equal(slowestPeriodNs({ trains: [{ repRateMHz: 80, gates: [{ frequencyMHz: 1 }] }] }), 1000);
  assert.equal(slowestPeriodNs(null), 0);
});

test('an unsynced detector picks the window its own beam needs', () => {
  const bare = detectorRow(0, null);
  const chopped = detectorRow(200, 1e6);
  const scene = [...bare.parts, ...chopped.parts];
  traceAll(scene, []);
  assert.deepEqual(axisLabels(bare.screen, scene), ['0', '12.5 ns', '25 ns']);
  assert.deepEqual(axisLabels(chopped.screen, scene), ['0', '1 µs', '2 µs']);
});

test('synced detectors share one axis, wide enough for every member', () => {
  const bare = detectorRow(0, null, { sync: true });
  const chopped = detectorRow(200, 1e6, { sync: true });
  const scene = [...bare.parts, ...chopped.parts];
  traceAll(scene, []);
  // the widest window any member wanted, so nothing a member had to show
  // falls outside the shared axis
  assert.deepEqual(axisLabels(bare.screen, scene), ['0', '1 µs', '2 µs']);
  assert.deepEqual(axisLabels(chopped.screen, scene), ['0', '1 µs', '2 µs']);
  assert.match(registry.display.svg(bare.screen, scene), /SYNCED/);
});

test('an unsynced detector is not dragged onto a synced group\'s axis', () => {
  const loner = detectorRow(0, null, { sync: false });
  const a = detectorRow(200, 1e6, { sync: true });
  const b = detectorRow(400, 1e6, { sync: true });
  const scene = [...loner.parts, ...a.parts, ...b.parts];
  traceAll(scene, []);
  assert.deepEqual(axisLabels(loner.screen, scene), ['0', '12.5 ns', '25 ns']);
  assert.doesNotMatch(registry.display.svg(loner.screen, scene), /SYNCED/);
});

test('a sync group takes the earliest offset, so moving one moves them all', () => {
  const early = detectorRow(0, null, { sync: true, timeOffsetNs: 5 });
  const late = detectorRow(200, null, { sync: true, timeOffsetNs: 40 });
  const scene = [...early.parts, ...late.parts];
  traceAll(scene, []);
  const labels = axisLabels(late.screen, scene);
  assert.equal(labels[0], '5 ns', 'the group starts where the earliest member asked');
  assert.deepEqual(axisLabels(early.screen, scene), labels, 'and both draw the same axis');
});

test('the sync window is symmetric — it does not depend on which member is drawn', () => {
  const window = params => syncedTimeWindowNs(params.map(p => ({
    reading: { pulse: { repRateMHz: 80, gates: p.gates || [] } }, params: p,
  })));
  const forward = window([{ timeOffsetNs: 3 }, { timeSpanNs: 500 }]);
  const reversed = window([{ timeSpanNs: 500 }, { timeOffsetNs: 3 }]);
  assert.deepEqual(forward, reversed);
  assert.equal(forward.spanNs, 500);
  assert.equal(forward.startNs, 0, 'the earliest offset, and 0 is earlier than 3');
});

test('synced arms are drawn where the light actually arrives', () => {
  // One source, split, with one arm folded 50 mm further round. Synced, the
  // two displays share an origin, so the longer arm's train sits shifted
  // right by exactly its extra flight time -- 50 mm is 167 ps.
  const mk = (t, x, y, rot = 0, params = {}) => {
    const el = createElement(t, x, y); el.rot = rot; Object.assign(el.params, params); return el;
  };
  const build = sync => {
    const laser = mk('pulsedlaser', 98, 200, 0, { wavelength: 920, beamMode: 'beam', beamWidth: 3 });
    const bs = mk('bs', 350, 200, 270, { ratio: 0.5, size: 25.4 });
    const mirror = mk('mirror', 350, 250, 315, { length: 25.4 });
    const near = mk('detector', 469, 200, 0, { aperture: 26, sync });
    const far = mk('detector', 469, 250, 0, { aperture: 26, sync });
    const nearScreen = mk('display', 625, 150, 0, { sensorId: near.id, screenOn: true });
    const farScreen = mk('display', 625, 300, 0, { sensorId: far.id, screenOn: true });
    const scene = [laser, bs, mirror, near, far, nearScreen, farScreen];
    traceAll(scene, []);
    const lagOf = screen => Number(/data-scope-lag-ns="([^"]+)"/.exec(registry.display.svg(screen, scene))?.[1]);
    return { scene, nearScreen, farScreen, lagOf };
  };

  const synced = build(true);
  assert.equal(synced.lagOf(synced.nearScreen), 0, 'the earliest arm is the reference');
  assert.ok(Math.abs(synced.lagOf(synced.farScreen) - 0.16678) < 1e-4,
    `50 mm of extra arm is 167 ps, got ${synced.lagOf(synced.farScreen)} ns`);
  assert.match(registry.display.svg(synced.farScreen, synced.scene), /\+167 ps/,
    'and the number is named, since at a 25 ns timebase the shift is sub-pixel');

  // unsynced, each display measures from its own arrival and shows no lag
  const alone = build(false);
  assert.equal(alone.lagOf(alone.nearScreen), 0);
  assert.equal(alone.lagOf(alone.farScreen), 0);
  assert.doesNotMatch(registry.display.svg(alone.farScreen, alone.scene), /\+167 ps/);
});

test('the response time is a real parameter on both instruments, with sane bounds', () => {
  const spec = type => registry[type].params.find(p => p.key === 'riseTimeNs');
  // a typical fast lab photodiode, and a photomultiplier limited by the
  // spread in electron transit time -- slower, and floored higher
  assert.equal(spec('detector').def, 1);
  assert.equal(spec('pmt').def, 2);
  assert.equal(spec('detector').min, 0.01, 'the fastest packaged diodes reach ~10 ps');
  assert.equal(spec('pmt').min, 0.1, 'no photomultiplier is that fast');
  assert.equal(detectorResponseNs(createElement('detector', 0, 0)), 1);
  assert.equal(detectorResponseNs(createElement('pmt', 0, 0)), 2);
  // a scene saved before this existed still gets a sane response
  assert.equal(detectorResponseNs({ type: 'pmt', params: {} }), 2);
  assert.equal(detectorResponseNs({ type: 'detector', params: { riseTimeNs: 0 } }), 1);
});

test('a synced group is held to the slowest member, not the fastest', () => {
  // A shared axis is only honest at a resolution every member can deliver:
  // pairing a 50 ps diode with a 10 ns PMT cannot buy the PMT any speed.
  const mk = (t, x, y, params) => { const el = createElement(t, x, y); Object.assign(el.params, params); return el; };
  const beam = y => { const l = createElement('pulsedlaser', 0, y); l.params.beamMode = 'line'; return l; };
  const fast = mk('detector', 300, 0, { sync: true, riseTimeNs: 0.05, timeSpanNs: 1 });
  const slow = mk('pmt', 300, 100, { sync: true, riseTimeNs: 10, timeSpanNs: 1 });
  const screen = mk('display', 420, 0, { sensorId: fast.id, screenOn: true });
  // each needs its own beam: a member with nothing arriving has no trace to
  // share, and is left out of the group rather than constraining it
  const scene = [beam(0), beam(100), fast, slow, screen];
  traceAll(scene, []);
  const axis = [...registry.display.svg(screen, scene)
    .matchAll(/font-size="3.4" fill="#5f7d8e">([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(axis, ['0', '25 ns', '50 ns'],
    'the fast diode is held to the 10 ns PMT it is synced with');
});

test('a detector cannot resolve, or claim, a shift shorter than its own response', () => {
  // This is the point of the whole instrument distinction: a photodiode and a
  // scope cannot time two trains against each other to picoseconds. The
  // geometry knows the arms differ by 167 ps; this detector does not.
  const mk = (t, x, y, rot = 0, params = {}) => {
    const el = createElement(t, x, y); el.rot = rot; Object.assign(el.params, params); return el;
  };
  const bench = (riseTimeNs, timeSpanNs) => {
    const laser = mk('pulsedlaser', 98, 200, 0, { wavelength: 920, beamMode: 'beam', beamWidth: 3 });
    const bs = mk('bs', 350, 200, 270, { ratio: 0.5, size: 25.4 });
    const mirror = mk('mirror', 350, 250, 315, { length: 25.4 });
    const near = mk('detector', 469, 200, 0, { aperture: 26, sync: true, riseTimeNs, timeSpanNs });
    const far = mk('detector', 469, 250, 0, { aperture: 26, sync: true, riseTimeNs, timeSpanNs });
    const screen = mk('display', 625, 300, 0, { sensorId: far.id, screenOn: true });
    const scene = [laser, bs, mirror, near, far, screen];
    traceAll(scene, []);
    const svg = registry.display.svg(screen, scene);
    return {
      svg,
      mode: [...svg.matchAll(/fill="#67e8f9"[^>]*>([^<]+)</g)].map(m => m[1])[1],
      axis: [...svg.matchAll(/font-size="3.4" fill="#5f7d8e">([^<]+)</g)].map(m => m[1]),
    };
  };

  // a 1 ns photodiode: the lag is real but not measurable here, and asking
  // for a 1 ns window gets the 5 ns floor instead
  const ordinary = bench(1, 1);
  assert.match(ordinary.mode, /UNRESOLVED/);
  assert.deepEqual(ordinary.axis, ['0', '2.5 ns', '5 ns'], 'clamped to five response times');

  // a 50 ps fibre-coupled diode can see it, and says so without the caveat
  const fast = bench(0.05, 1);
  assert.match(fast.mode, /\+167 ps/);
  assert.doesNotMatch(fast.mode, /UNRESOLVED/);
  assert.deepEqual(fast.axis, ['0', '500 ps', '1 ns'], 'a fast detector keeps the window it was given');

  // a standard 10 ns PMT cannot even hold the automatic window
  assert.deepEqual(bench(10, 0).axis, ['0', '25 ns', '50 ns']);
});

test('pulses closer together than the response merge, as they would on a scope', () => {
  const trace = riseTimeNs => {
    const laser = createElement('pulsedlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'line', repRateMHz: 80 });
    const detector = createElement('detector', 300, 0);
    Object.assign(detector.params, { riseTimeNs });
    const screen = createElement('display', 420, 0);
    Object.assign(screen.params, { sensorId: detector.id, screenOn: true });
    const scene = [laser, detector, screen];
    traceAll(scene, []);
    const svg = registry.display.svg(screen, scene);
    const pts = /data-scope-trace="\d+" points="([^"]+)"/.exec(svg)[1].split(' ')
      .map(p => Number(p.split(',')[1]));
    // how far the curve swings between its peaks and troughs
    return Math.max(...pts) - Math.min(...pts);
  };
  // 12.5 ns apart: a 0.5 ns detector separates them cleanly
  assert.ok(trace(0.5) > 12, 'a fast detector resolves the individual pulses');
  // a 40 ns detector cannot follow an 80 MHz train at all -- it reads the
  // average, which is a nearly flat line
  assert.ok(trace(40) < 1, 'a slow detector integrates the train into a level');
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
