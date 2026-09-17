import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, opoPortLocal, registry } from '../sketch/js/elements.js';
import { detectorReading, opoReading, traceScene } from '../sketch/js/raytrace.js';
import { MAX_OPO_DEPLETION, opoSignalAt, opoWaves, parseWavelengthList } from '../sketch/js/parametric.js';
import { parseSketch } from '../sketch/js/state.js';
import { toWorld } from '../sketch/js/util.js';

const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

const GREEN = { wavelength: 516, pulseWidthFs: 2000, repRateMHz: 80, beamMode: 'line' };

// pump -> OPO -> a wide detector on each front port
function bench({ opo = {}, laser = {}, rot = 0, time, source = 'pulsedlaser', laserAt = { x: 0, y: 100 }, extra = [] } = {}) {
  const pump = createElement(source, laserAt.x, laserAt.y);
  pump.rot = rot;
  Object.assign(pump.params, GREEN, laser);
  const box = createElement('opo', 200, 100);
  Object.assign(box.params, opo);
  box.rot = rot;
  if (time !== undefined) box._animationTimeS = time;
  const at = role => { const l = opoPortLocal(role); return toWorld(box, l.x + 120, l.y); };
  const signal = createElement('detector', at('signal').x, at('signal').y);
  const idler = createElement('detector', at('idler').x, at('idler').y);
  for (const det of [signal, idler]) { det.params.aperture = 10; det.rot = rot; }
  const result = traceScene([pump, box, signal, idler, ...extra]);
  const read = det => detectorReading(det.id);
  return { box, result, signal: read(signal), idler: read(idler), state: opoReading(box.id) };
}
const centre = reading => {
  const total = reading.spectrum.reduce((sum, s) => sum + s.power, 0);
  return reading.spectrum.reduce((sum, s) => sum + s.wavelength * s.power, 0) / total;
};

test('an accepted pump leaves as signal on the axis and idler on the port below, by Manley–Rowe', () => {
  const { signal, idler, state } = bench({ opo: { pumpWl: 516, signalWl: 800 } });
  const waves = opoWaves({ pumpWl: 516, signalWl: 800 });
  assert.equal(state.state, 'converting');
  near(centre(signal), 800, 1, 'signal centre');
  near(centre(idler), 516 * 800 / (800 - 516), 2, 'idler centre');
  near(signal.signal, MAX_OPO_DEPLETION * waves.signalShare, 1e-6, 'signal power');
  near(idler.signal, MAX_OPO_DEPLETION * (1 - waves.signalShare), 1e-6, 'idler power');
});

test('the ports rotate with the body', () => {
  const { signal, idler } = bench({ opo: { pumpWl: 516, signalWl: 800 }, rot: 90, laserAt: { x: 200, y: -100 } });
  assert.ok(signal && signal.signal > 0.5, 'no signal on the rotated signal port');
  assert.ok(idler && idler.signal > 0.2, 'no idler on the rotated idler port');
});

test('switching the idler port off removes its power; the signal is unchanged', () => {
  const on = bench({ opo: { signalWl: 800 } });
  const off = bench({ opo: { signalWl: 800, outputIdler: false } });
  assert.equal(off.idler, null);
  near(off.signal.signal, on.signal.signal, 1e-9, 'signal power');
});

test('at degeneracy both waves leave through the signal port, with the idler toggle ignored', () => {
  for (const outputIdler of [true, false]) {
    const { signal, idler } = bench({ opo: { signalWl: 1032, outputIdler } });
    assert.equal(idler, null, 'nothing on the idler port at degeneracy');
    near(signal.signal, MAX_OPO_DEPLETION, 1e-6, 'all converted power on the signal port');
    near(centre(signal), 1032, 1, 'degenerate wavelength');
  }
});

test('nothing comes out without an accepted pump, and the readout says why', () => {
  const outOfWindow = bench({ opo: { pumpWl: 532 } });
  assert.equal(outOfWindow.state.state, 'outOfWindow');
  assert.equal(outOfWindow.signal, null);

  const noProgram = bench({ opo: { tuneMode: 'steps', stepList: 'none, of, these' } });
  assert.equal(noProgram.state.state, 'noProgram');
  assert.equal(noProgram.signal, null);

  const tooShort = bench({ opo: { signalWl: 400 } });
  assert.equal(tooShort.state.state, 'invalid');
  assert.equal(tooShort.signal, null);

  const zero = bench({ opo: { opoDepletion: 0 } });
  assert.equal(zero.state.state, 'converting');
  assert.equal(zero.signal, null, 'zero depletion generates nothing');
  const text = registry.opo.params.find(p => p.key === 'opoState').readout(zero.box.params, zero.box);
  assert.match(text, /pump depletion is 0/);
});

test('a pump beyond the angular acceptance is rejected', () => {
  const pump = createElement('pulsedlaser', 0, 0);
  Object.assign(pump.params, GREEN);
  const box = createElement('opo', 200, 0);
  box.rot = -10; // the body axis is 10° away from the pump
  box.params.acceptanceDeg = 2;
  box.params.aperture = 20;
  traceScene([pump, box]);
  const reading = opoReading(box.id);
  assert.equal(reading.state, 'rejected');
  near(reading.angleDeg, 10, 1e-6, 'reported angle');
  box.params.acceptanceDeg = 12;
  traceScene([pump, box]);
  assert.equal(opoReading(box.id).state, 'converting');
});

test('a finite beam keeps its sampled weights and its width', () => {
  const { signal, idler, result } = bench({ laser: { beamMode: 'beam', beamWidth: 4 }, opo: { signalWl: 800, aperture: 8 } });
  near(signal.signal + idler.signal, MAX_OPO_DEPLETION, 1e-6, 'converted power');
  // The drawn rays that start at the signal port, in the box's frame.
  const port = opoPortLocal('signal');
  const signalPaths = result.drawables.filter(d => d.type === 'path' && d.pts?.length > 1
    && Math.abs(d.pts[0].x - (200 + port.x)) < 1e-6 && Math.abs(d.pts[0].y - 100) < 5);
  const heights = [...new Set(signalPaths.map(d => Math.round(d.pts[0].y * 1000) / 1000))];
  assert.ok(heights.length > 1, 'the beam collapsed to one ray');
  near(Math.max(...heights) - Math.min(...heights), 4, 0.5, 'output width');
});

test('sweep and steps are pure functions of time with exact boundaries', () => {
  const sweep = { tuneMode: 'sweep', sweepMinNm: 750, sweepMaxNm: 950, sweepPeriodS: 8 };
  assert.equal(opoSignalAt(sweep, 0).signalWl, 750);
  assert.equal(opoSignalAt(sweep, 4).signalWl, 950);
  assert.equal(opoSignalAt(sweep, 8).signalWl, 750);
  assert.equal(opoSignalAt(sweep, 2).signalWl, 850);
  assert.equal(opoSignalAt(sweep, -3).signalWl, 750, 'negative time clamps to the origin');
  assert.equal(opoSignalAt({ ...sweep, sweepMaxNm: 750 }, 3).signalWl, 750, 'a collapsed range is fixed');

  const steps = { tuneMode: 'steps', stepList: '780, 800, 800, 820', stepDwellS: 2 };
  assert.deepEqual([0, 1.999, 2, 4, 6, 8].map(t => opoSignalAt(steps, t).signalWl), [780, 780, 800, 800, 820, 780]);
  assert.deepEqual(parseWavelengthList('780; 800 x -5 NaN 820'), { values: [780, 800, 820], ignored: 3 });
  assert.equal(opoSignalAt({ tuneMode: 'steps', stepList: '' }, 0).signalWl, null);

  // The traced output follows the program, and the saved signal is untouched.
  const traced = bench({ opo: { ...steps, signalWl: 800 }, time: 6 });
  near(centre(traced.signal), 820, 1, 'signal at t = 6 s');
  assert.equal(traced.box.params.signalWl, 800);
});

test('the element survives a save and reload with its tuning program', () => {
  const box = createElement('opo', 10, 20);
  Object.assign(box.params, { tuneMode: 'steps', stepList: '780, 820', stepDwellS: 1.5, outputIdler: false, outputPhase: 'positiveChirp' });
  const reloaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [box] }), registry).elements[0];
  for (const key of ['tuneMode', 'stepList', 'stepDwellS', 'outputIdler', 'outputPhase', 'opoDepletion']) {
    assert.deepEqual(reloaded.params[key], box.params[key], key);
  }
});

test('the box converts exactly as a crystal in OPO mode does, for all three pulse choices', () => {
  for (const outputPhase of ['transformLimited', 'unknown', 'positiveChirp']) {
    const settings = {
      pumpWl: 516, signalWl: 800, pumpAcceptanceNm: 1, linewidthMode: 'both', signalLinewidthCm: 10, idlerLinewidthCm: 10,
      outputPhase, durationFactor: 1, opoDepletion: 0.6,
    };
    const boxed = bench({ opo: settings });

    const pump = createElement('pulsedlaser', 0, 100);
    Object.assign(pump.params, GREEN);
    const xtal = createElement('crystal', 200, 100);
    Object.assign(xtal.params, { convert: 'opo', transmitPump: false, ...settings });
    const det = createElement('detector', 400, 100);
    det.params.aperture = 10;
    traceScene([pump, xtal, det]);
    const crystal = detectorReading(det.id);

    near(boxed.signal.signal + boxed.idler.signal, crystal.signal, 1e-9, `${outputPhase}: power`);
    const trains = reading => reading.pulse.trains.map(t => ({
      wl: Math.round(t.centerWavelengthNm), width: t.pulseWidthFs, gdd: t.gddFs2, stretched: t.stretchedPulseWidthFs,
    })).sort((a, b) => a.wl - b.wl);
    const boxTrains = [...trains(boxed.signal), ...trains(boxed.idler)].sort((a, b) => a.wl - b.wl);
    const crystalTrains = trains(crystal);
    assert.equal(boxTrains.length, crystalTrains.length, `${outputPhase}: train count`);
    boxTrains.forEach((t, i) => {
      assert.equal(t.wl, crystalTrains[i].wl, `${outputPhase}: wavelength`);
      near(t.width, crystalTrains[i].width, 1e-6, `${outputPhase}: duration`);
      near(t.gdd, crystalTrains[i].gdd, 1e-6, `${outputPhase}: GDD`);
    });
  }
});

test('light the box generated is never converted by it again', () => {
  // A mirror behind the front ports sends the outputs straight back into the box.
  const mirror = createElement('mirror', 330, 107);
  mirror.params.length = 60;
  const { state } = bench({ opo: { signalWl: 800 }, extra: [mirror] });
  assert.equal(state.state, 'converting');
});
