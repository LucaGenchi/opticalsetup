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
  const { signal, idler, state } = bench({ opo: { signalWl: 800 } });
  const waves = opoWaves({ pumpWl: 516, signalWl: 800 });
  assert.equal(state.state, 'converting');
  near(centre(signal), 800, 1, 'signal centre');
  near(centre(idler), 516 * 800 / (800 - 516), 2, 'idler centre');
  near(signal.signal, MAX_OPO_DEPLETION * waves.signalShare, 1e-6, 'signal power');
  near(idler.signal, MAX_OPO_DEPLETION * (1 - waves.signalShare), 1e-6, 'idler power');
});

test('the ports rotate with the body', () => {
  const { signal, idler } = bench({ opo: { signalWl: 800 }, rot: 90, laserAt: { x: 200, y: -100 } });
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

test('nothing comes out without a usable pump, and the readout says why', () => {
  const noProgram = bench({ opo: { tuneMode: 'steps', stepList: 'none, of, these' } });
  assert.equal(noProgram.state.state, 'noProgram');
  assert.equal(noProgram.signal, null);

  const tooShort = bench({ opo: { signalWl: 400 } });
  assert.equal(tooShort.state.state, 'invalid');
  assert.equal(tooShort.signal, null);
  const invalidText = registry.opo.params.find(p => p.key === 'opoState').readout(tooShort.box.params, tooShort.box);
  assert.match(invalidText, /longer than the 516 nm pump/);

  const zero = bench({ opo: { opoDepletion: 0 } });
  assert.equal(zero.state.state, 'converting');
  assert.equal(zero.signal, null, 'zero depletion generates nothing');
  const text = registry.opo.params.find(p => p.key === 'opoState').readout(zero.box.params, zero.box);
  assert.match(text, /pump depletion is 0/);
});

test('whatever pump arrives is used, with no wavelength settings', () => {
  for (const key of ['pumpWl', 'pumpAcceptanceNm', 'acceptanceDeg']) {
    assert.equal(registry.opo.params.some(p => p.key === key), false, `${key} should not be a setting`);
  }
  for (const wavelength of [355, 532, 1030]) {
    const { state, signal } = bench({ laser: { wavelength }, opo: { signalWl: 1100 } });
    assert.equal(state.state, 'converting', `${wavelength} nm pump`);
    near(state.pumpNm, wavelength, 1e-9, 'recorded pump');
    near(centre(signal), 1100, 2, `${wavelength} nm pump: signal`);
  }
  const text = registry.opo.params.find(p => p.key === 'opoState')
    .readout({ outputIdler: true }, { id: bench({ laser: { wavelength: 532 }, opo: { signalWl: 1100 } }).box.id });
  assert.match(text, /Pump 532 nm → signal 1100 nm · idler 1030 nm/);
});

test('each output leaves as a beam of its set diameter, whatever the pump width', () => {
  const port = opoPortLocal('signal');
  const signalStarts = result => [...new Set(result.drawables
    .filter(d => (d.type === 'path' || d.type === 'poly') && d.pts?.length > 1
      && Math.abs(d.pts[0].x - (200 + port.x)) < 1e-6 && Math.abs(d.pts[0].y - 100) < 7)
    .map(d => Math.round((d.pts[0].y - 100) * 1000) / 1000))];
  for (const laser of [{ beamMode: 'beam', beamWidth: 4 }, { beamMode: 'line' }]) {
    const { signal, idler, result } = bench({ laser, opo: { signalWl: 800, aperture: 8, signalBeamMm: 5, idlerBeamMm: 3 } });
    near(signal.signal + idler.signal, MAX_OPO_DEPLETION, 1e-6, `${laser.beamMode} pump: converted power`);
    const starts = signalStarts(result);
    assert.ok(starts.length > 1, `${laser.beamMode} pump: the signal collapsed to one ray`);
    near(Math.max(...starts) - Math.min(...starts), 5, 1e-6, `${laser.beamMode} pump: signal diameter`);
  }
  const line = bench({ opo: { signalWl: 800, signalBeamMm: 0 } });
  assert.equal(signalStarts(line.result).length, 1, 'a zero diameter is a single line');
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
      signalWl: 800, linewidthMode: 'both', signalLinewidthCm: 10, idlerLinewidthCm: 10,
      outputPhase, durationFactor: 1, opoDepletion: 0.6,
    };
    const boxed = bench({ opo: settings });

    const pump = createElement('pulsedlaser', 0, 100);
    Object.assign(pump.params, GREEN);
    const xtal = createElement('crystal', 200, 100);
    Object.assign(xtal.params, { convert: 'opo', transmitPump: false, pumpWl: 516, pumpAcceptanceNm: 1, ...settings });
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
  // The pump reaches the rear aperture through a shortpass dichroic; the
  // outputs go round three mirrors and that dichroic reflects them back into
  // the aperture, inside a pump window wide enough to accept them. The first
  // mirror taps half of each pass to a spectrometer.
  const pump = createElement('pulsedlaser', 0, 100);
  Object.assign(pump.params, GREEN);
  const combiner = createElement('dichroic', 100, 100);
  combiner.rot = 135;
  Object.assign(combiner.params, { dtype: 'shortpass', cutoff: 600, length: 40 });
  const box = createElement('opo', 250, 100);
  Object.assign(box.params, { signalWl: 1100, aperture: 30 });
  const m1 = createElement('mirror', 400, 100); m1.rot = 45; m1.params.length = 80; m1.params.refl = 50;
  const m2 = createElement('mirror', 400, 0); m2.rot = 135; m2.params.length = 80;
  const m3 = createElement('mirror', 100, 0); m3.rot = 45; m3.params.length = 80;
  const tap = createElement('detector', 520, 100);
  tap.params.aperture = 80;
  traceScene([pump, combiner, box, m1, m2, m3, tap]);
  // Without the guard the returning 1100 nm signal would be taken as a pump
  // and read as an invalid signal.
  const reading = opoReading(box.id);
  assert.equal(reading.state, 'converting');
  assert.equal(reading.signalWl, 1100);
  assert.ok(!detectorReading(tap.id).spectrum.some(s => s.power > 1e-6 && s.wavelength > 3000), 'a cascade idler appeared');
});

test('no pump, or a pump that misses the aperture, gives no reading and no output', () => {
  const lonely = createElement('opo', 200, 100);
  traceScene([lonely]);
  assert.equal(opoReading(lonely.id), null);

  const missed = bench({ laserAt: { x: 0, y: 100 + 3 + 4 } }); // 6 mm aperture, 7 mm off axis
  assert.equal(missed.state, null);
  assert.equal(missed.signal, null);
});

test('the fixed 20° input acceptance is inclusive at its edge', () => {
  const run = rot => {
    const box = createElement('opo', 200, 0);
    box.rot = rot;
    box.params.aperture = 30;
    // Aim the horizontal pump at the centre of the tilted rear aperture.
    const rear = toWorld(box, -46, 0);
    const pump = createElement('pulsedlaser', rear.x - 150, rear.y);
    Object.assign(pump.params, GREEN);
    traceScene([pump, box]);
    return opoReading(box.id);
  };
  assert.equal(run(-20).state, 'converting');
  const rejected = run(-20.5);
  assert.equal(rejected.state, 'rejected');
  near(rejected.angleDeg, 20.5, 1e-6, 'reported angle');
});

test('a beam wider than the aperture converts only the part that got in', () => {
  const { signal, idler, result } = bench({ laser: { beamMode: 'beam', beamWidth: 20 }, opo: { signalWl: 800, aperture: 6, signalBeamMm: 4 } });
  const converted = signal.signal + idler.signal;
  assert.ok(converted > 0.05 && converted < 0.6 * MAX_OPO_DEPLETION, `accepted power ${converted}`);
  const port = opoPortLocal('signal');
  const starts = result.drawables.filter(d => (d.type === 'path' || d.type === 'poly') && d.pts?.length > 1
    && Math.abs(d.pts[0].x - (200 + port.x)) < 1e-6 && Math.abs(d.pts[0].y - 100) < 7).map(d => d.pts[0].y - 100);
  assert.ok(starts.length > 0 && starts.every(y => Math.abs(y) <= 2 + 1e-6), `signal leaves outside its 4 mm beam: ${starts}`);
});

test('the idler port and body grow with the beams so the outputs stay apart and inside', () => {
  const box = createElement('opo', 0, 0);
  Object.assign(box.params, { aperture: 30, signalBeamMm: 30, idlerBeamMm: 30 });
  const idler = opoPortLocal('idler', box.params);
  assert.ok(idler.y - 15 >= 15, 'the two 30 mm beams overlap');
  const h = registry.opo.size_(box).h - 4;
  assert.ok(idler.y + 15 <= h / 2, `idler beam reaches ${idler.y + 15} mm beyond the ${h / 2} mm half-height`);
});

test('degeneracy uses the signal port for both equal and unequal widths', () => {
  const unequal = bench({ opo: { signalWl: 1032, outputIdler: true } });
  assert.equal(unequal.state.waves.merged, null);
  assert.equal(unequal.state.waves.degenerate, true);
  assert.equal(unequal.idler, null);
  const equal = bench({ opo: { signalWl: 1032, linewidthMode: 'both', signalLinewidthCm: 10, idlerLinewidthCm: 10, outputIdler: false } });
  assert.ok(equal.state.waves.merged);
  near(equal.signal.signal, MAX_OPO_DEPLETION, 1e-6, 'merged power on the signal port');
});

test('outputs keep the pump train timing and take no path inside the box', () => {
  const { signal, result } = bench({ laser: { pulsePhaseNs: 3 }, opo: { signalWl: 800 } });
  assert.ok(signal.pulse.trains.every(t => t.phaseNs === 3), 'train phase lost');
  const pumpTrack = result.pulseTracks.find(t => Math.round(t.pulse.centerWavelengthNm) === 516);
  const signalTrack = result.pulseTracks.find(t => Math.round(t.pulse.centerWavelengthNm) === 800);
  near(signalTrack.opls[0], pumpTrack.opls[pumpTrack.opls.length - 1], 1e-9, 'optical path at the ports equals the pump path at the aperture');
});

test('the steps readout names the step and the generated waves', () => {
  const { box } = bench({ opo: { tuneMode: 'steps', stepList: '780, 820', stepDwellS: 2 }, time: 2.5 });
  const text = registry.opo.params.find(p => p.key === 'opoState').readout(box.params, box);
  assert.match(text, /^Step 2 of 2: Pump 516 nm → signal 820 nm · idler 1392 nm/);
});
