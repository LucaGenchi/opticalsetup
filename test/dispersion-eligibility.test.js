// When the dispersed-duration model may answer, and when it must decline.
//
// The model derives a duration from bandwidth and accumulated GDD, which
// needs the pulse's spectral phase and the spectrum the GDD acted on. Where
// either is not known -- a phase declared unknown, a sampled envelope whose
// field is gone, a spectrum a filter reshaped, paths of different dispersion
// meeting at one detector -- it declines with a reason instead of handing the
// configured duration back as if it were a prediction.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import {
  DISPERSION_UNAVAILABLE, PATHS_DISAGREE, pulseDurationAcrossPaths, pulseDurationAfterDispersion,
} from '../sketch/js/glass.js';
import { FAN_COVERAGE } from '../sketch/js/raytrace.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';

const close = (actual, expected, tolerance, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} is not within ${tolerance} of ${expected}`);

// 200 fs, 10 nm at 800 nm: tau0 = 94.145 fs and a +5991.7 fs² chirp magnitude.
const CHIRPED = {
  pulseWidthFs: 200, bandwidthNm: 10, centerWavelengthNm: 800, pulseShape: 'gauss', transformLimited: false,
};

test('the helper declines exactly the probes that exposed the gap', () => {
  // With a named sign, −5991.7 fs² compresses the pulse to its limit.
  close(pulseDurationAfterDispersion({ ...CHIRPED, inputChirp: 'positive' }, -5991.7).durationFs, 94.145, 0.01);
  // Unknown phase, a sampled envelope and a field issue must all decline
  // rather than return that same Gaussian answer.
  const probes = [
    [{ ...CHIRPED, inputChirp: 'positive', spectralPhase: 'unknown' }, DISPERSION_UNAVAILABLE.unknownPhase],
    [{ ...CHIRPED, inputChirp: 'unknown' }, DISPERSION_UNAVAILABLE.unknownPhase],
    [{ ...CHIRPED }, DISPERSION_UNAVAILABLE.unknownPhase],
    [{ ...CHIRPED, inputChirp: 'positive', pulseShape: 'sampled' }, DISPERSION_UNAVAILABLE.sampled],
    [{ ...CHIRPED, inputChirp: 'positive', fieldIssue: 'Pulse exceeds the numerical time window.' },
      'Pulse exceeds the numerical time window.'],
    [{ ...CHIRPED, inputChirp: 'positive', spectrumReshaped: true }, DISPERSION_UNAVAILABLE.reshaped],
  ];
  for (const [pulse, model] of probes) {
    const result = pulseDurationAfterDispersion(pulse, -5991.7);
    assert.equal(result.durationFs, null, JSON.stringify(pulse));
    assert.equal(result.available, false);
    assert.equal(result.model, model);
  }
});

test('with no dispersion on the path an unknown phase still reports its configured duration', () => {
  const result = pulseDurationAfterDispersion({ ...CHIRPED, inputChirp: 'unknown' }, 0, 0);
  assert.equal(result.durationFs, 200);
  assert.equal(result.available, true);
  assert.match(result.model, /^Configured duration · zero net modeled dispersion/);
});

test('a duration shorter than its bandwidth allows is not dispersed into an invented answer', () => {
  const impossible = { pulseWidthFs: 50, bandwidthNm: 1, centerWavelengthNm: 800, transformLimited: false, inputChirp: 'positive' };
  assert.equal(pulseDurationAfterDispersion(impossible, 5000).durationFs, null);
  assert.equal(pulseDurationAfterDispersion(impossible, 5000).model, DISPERSION_UNAVAILABLE.belowLimit);
  assert.equal(pulseDurationAfterDispersion(impossible, 0).durationFs, 50);
});

test('paths that disagree on the duration decline; paths that agree answer', () => {
  const pulse = { pulseWidthFs: 100, bandwidthNm: 0, centerWavelengthNm: 800, transformLimited: true };
  const agree = pulseDurationAcrossPaths(pulse, [{ gddFs2: 4465 }, { gddFs2: 4466 }]);
  close(agree.durationFs, 159.2, 0.2);
  const disagree = pulseDurationAcrossPaths(pulse, [{ gddFs2: 0 }, { gddFs2: 4465 }]);
  assert.equal(disagree.durationFs, null);
  assert.equal(disagree.model, PATHS_DISAGREE);
});

// --- On the bench ------------------------------------------------------------

function laser(params) {
  const source = createElement('pulsedlaser', 0, 0);
  Object.assign(source.params, { wavelength: 800, beamMode: 'line', ...params });
  return source;
}
function continuum() {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 400, scMax: 900, pulseWidthFs: 500 });
  return source;
}
function rod(x, rodlen = 100) {
  const glass = createElement('glassrod', x, 0);
  Object.assign(glass.params, { rodlen, dia: 20, material: 'nbk7' });
  return glass;
}
function bandpass(x, center, band) {
  const filter = createElement('filter', x, 0);
  Object.assign(filter.params, { ftype: 'bandpass', center, band });
  return filter;
}
function compressor(x, gddFs2) {
  const element = createElement('pulsecompressor', x, 0);
  element.params.gddFs2 = gddFs2;
  return element;
}
function read(elements) {
  const det = createElement('detector', 700, 0);
  det.params.aperture = 40;
  traceScene([...elements, det]);
  return detectorReading(det.id)?.pulse;
}

// Light whose phase nobody authored: an OPO signal declared "spectral phase
// unknown". The laser itself no longer offers Unknown.
function unknownPhaseSource(x = 200) {
  const pump = laser({ wavelength: 516, pulseWidthFs: 2000, transformLimited: true });
  const crystal = createElement('crystal', x, 0);
  Object.assign(crystal.params, { convert: 'opo', pumpWl: 516, signalWl: 800, outputPhase: 'unknown', transmitPump: false });
  return [pump, crystal];
}
const signalTrain = pulse => pulse.trains.find(t => Math.abs(t.centerWavelengthNm - 800) < 5);

test('unknown phase is unavailable after glass; a signed laser GDD disperses either way', () => {
  const unknown = signalTrain(read([...unknownPhaseSource(), rod(350)]));
  assert.equal(unknown.stretchedPulseWidthFs, null);
  assert.equal(unknown.dispersionModel, DISPERSION_UNAVAILABLE.unknownPhase);
  // 200 fs / 10 nm at 800 nm is ±5991.7 fs² of chirp, now authored directly.
  const chirped = sign => laser({ transformLimited: false, bandwidth: 10, inputChirp: sign, chirpGddFs2: 5991.7 });
  const positive = read([chirped('positive'), rod(300)]);
  const negative = read([chirped('negative'), rod(300)]);
  close(positive.pulseWidthFs, 200, 0.01, 'emitted');
  close(positive.stretchedPulseWidthFs, 322.0, 0.5);
  close(negative.stretchedPulseWidthFs, 104.3, 0.5);
  assert.match(negative.dispersionModel, /negative chirp 5,992 fs²/);
});

test('a filtered continuum is timed from the band that survives, wherever the filter stands', () => {
  const full = read([continuum(), rod(350)]);
  assert.ok(full.stretchedPulseWidthFs > 20000);
  // A filter changes amplitude, not phase: the same filter before or after
  // the same glass leaves the same pulse.
  const before = read([continuum(), bandpass(200, 650, 300), rod(350)]);
  const after = read([continuum(), rod(250), bandpass(450, 650, 300)]);
  for (const sliced of [before, after]) {
    assert.match(sliced.dispersionModel, /^Filtered continuum · linear-chirp estimate/);
    assert.ok(sliced.stretchedPulseWidthFs > 0 && sliced.stretchedPulseWidthFs < full.stretchedPulseWidthFs,
      'narrower than the full band, which the glass stretches across 500 nm');
  }
  close(before.stretchedPulseWidthFs, after.stretchedPulseWidthFs, 0.05 * after.stretchedPulseWidthFs, 'before vs after');
});

test('a compressor takes back the glass on a filtered continuum, not the source\'s own sweep', () => {
  const after = read([continuum(), rod(250), bandpass(450, 650, 300)]);
  const compressed = read([continuum(), rod(250), bandpass(450, 650, 300), compressor(550, -after.totalGddFs2)]);
  assert.ok(compressed.stretchedPulseWidthFs < after.stretchedPulseWidthFs, 'the glass comes back out');
  // 500-800 nm is 0.46 of the 400-900 nm continuum's frequency span: that
  // share of its 500 fs sweep has no sign to undo.
  const share = (1 / 500 - 1 / 800) / (1 / 400 - 1 / 900);
  assert.ok(compressed.stretchedPulseWidthFs >= 500 * share, 'the source part stays');
  close(compressed.totalGddFs2, 0, 1e-6);
});

test('attenuation that leaves the spectrum intact keeps the duration', () => {
  const plain = read([laser({ pulseWidthFs: 100, transformLimited: true }), rod(300)]);
  const nd = createElement('filter', 150, 0);
  Object.assign(nd.params, { ftype: 'nd', trans: 0.3 });
  const attenuated = read([laser({ pulseWidthFs: 100, transformLimited: true }), nd, rod(300)]);
  close(attenuated.stretchedPulseWidthFs, plain.stretchedPulseWidthFs, 1e-9);
  // A bandpass far wider than the pulse's band transmits it evenly too.
  const wide = read([laser({ pulseWidthFs: 100, transformLimited: true }), bandpass(150, 800, 200), rod(300)]);
  close(wide.stretchedPulseWidthFs, plain.stretchedPulseWidthFs, 1e-9);
  // A narrow one cuts into it: the pulse is timed from the 5 nm that pass,
  // which alone allow no less than about 190 fs.
  const narrow = read([laser({ pulseWidthFs: 100, transformLimited: true }), bandpass(150, 800, 5), rod(300)]);
  assert.match(narrow.dispersionModel, /^Filtered spectrum · numerical transform/);
  assert.ok(narrow.transformLimitFs > 180 && narrow.stretchedPulseWidthFs >= narrow.transformLimitFs);
});

test('one beam split across glass and air into a single detector is unavailable', () => {
  const source = laser({ pulseWidthFs: 100, transformLimited: true, beamMode: 'beam', beamWidth: 12 });
  const half = createElement('glassrod', 300, 4);
  Object.assign(half.params, { rodlen: 100, dia: 6, material: 'nbk7' });
  const split = read([source, half]);
  assert.equal(split.stretchedPulseWidthFs, null);
  assert.equal(split.dispersionModel, PATHS_DISAGREE);
  const whole = read([laser({ pulseWidthFs: 100, transformLimited: true, beamMode: 'beam', beamWidth: 12 }), rod(300)]);
  close(whole.stretchedPulseWidthFs, 159.1, 0.2);
});

test('a detector screen says the duration is unavailable instead of drawing the configured width', async () => {
  await import('../sketch/js/detector-instruments.js');
  const { registry } = await import('../sketch/js/elements.js');
  const { traceAll } = await import('../sketch/js/raytrace.js');
  const [pump, crystal] = unknownPhaseSource(150);
  const meter = createElement('autocorrelator', 500, 0);
  meter.params.aperture = 34;
  const screen = createElement('display', 650, 0);
  Object.assign(screen.params, { sensorId: meter.id, screenOn: true });
  // A dichroic passes the 800 nm signal and turns the idler away, so the
  // screen reads one unknown-phase train.
  const splitter = createElement('dichroic', 400, 0);
  Object.assign(splitter.params, { dtype: 'shortpass', cutoff: 1000 });
  const scene = [pump, crystal, rod(300), splitter, meter, screen];
  traceAll(scene, []);
  const svg = registry.display.svg(screen, scene);
  assert.doesNotMatch(svg, /data-autocorrelation=/, 'no trace built on a width nobody predicted');
  assert.match(svg, /DURATION UNAVAILABLE/);
  assert.match(svg, /UNAVAILABLE/);
  assert.doesNotMatch(svg, /2000 fs|2,000 fs/, 'the configured width is not presented as what arrives');
});

// --- Second review round ----------------------------------------------------

test('opposite chirps on separate paths do not cancel into a pulse neither carries', () => {
  // The reviewer's reproduction: equal widths, opposite GDD.
  const p = { pulseWidthFs: 100, centerWavelengthNm: 800, transformLimited: true, pulseShape: 'gauss' };
  close(pulseDurationAfterDispersion(p, 5000).durationFs, 170.9330879517715, 1e-9);
  close(pulseDurationAfterDispersion(p, -5000).durationFs, 170.9330879517715, 1e-9);
  const split = pulseDurationAcrossPaths(p, [{ gddFs2: 5000 }, { gddFs2: -5000 }]);
  assert.equal(split.durationFs, null);
  assert.equal(split.model, PATHS_DISAGREE);
  assert.equal(pulseDurationAcrossPaths({ ...p, pulseShape: 'sech2' }, [{ gddFs2: 5000 }, { gddFs2: -5000 }]).durationFs, null);
  // A few fs² across a thick lens's aperture is still one pulse.
  close(pulseDurationAcrossPaths(p, [{ gddFs2: 4460 }, { gddFs2: 4470 }]).durationFs,
    pulseDurationAfterDispersion(p, 4465).durationFs, 0.05);
});

function notch(x, center, band) {
  const element = createElement('dichroic', x, 0);
  Object.assign(element.params, { dtype: 'notch', center, band });
  return element;
}

test('a passband or notch between sample points is still detected, before or after the glass', () => {
  // The reviewer's bench: 651 nm, 1 nm lies off every sampling grid point.
  for (const center of [650, 651, 651.37]) {
    // Detected, so timed from the 1 nm that passes: about 1.2 ps, its sinc
    // transform limit, and not the full band's 20 ps.
    for (const [label, pulse] of [
      ['directly', read([continuum(), bandpass(200, center, 1)])],
      ['before glass', read([continuum(), bandpass(200, center, 1), rod(350)])],
      ['after glass', read([continuum(), rod(250), bandpass(450, center, 1)])],
    ]) {
      assert.ok(pulse, `bandpass ${center} nm ${label}: light arrives`);
      assert.match(pulse.dispersionModel, /^Filtered continuum/, `bandpass ${center} nm ${label}`);
      close(pulse.stretchedPulseWidthFs, 1250, 60, `bandpass ${center} nm ${label}`);
    }
  }
  // A notch removes a 1 nm slice from the transmitted continuum.
  const notched = read([continuum(), rod(250), notch(450, 651.37, 1)]);
  assert.match(notched.dispersionModel, /^Filtered continuum/);
  // A notch well outside a narrow pulse's band leaves it alone.
  const plain = read([laser({ pulseWidthFs: 100, transformLimited: true }), rod(300)]);
  const farNotch = read([laser({ pulseWidthFs: 100, transformLimited: true }), notch(150, 651.37, 1), rod(300)]);
  close(farNotch.stretchedPulseWidthFs, plain.stretchedPulseWidthFs, 1e-9);
});

test('a detector catching only part of a grating fan declines; one catching the fan answers', () => {
  const at = aperture => {
    const source = laser({ pulseWidthFs: 10, transformLimited: true });
    const grating = createElement('grating', 200, 0);
    Object.assign(grating.params, { lines: 600, orders: '1' });
    // Along the first order's centre sample, 300 mm from the grating.
    const angle = Math.atan2(2880, -5264);
    const det = createElement('detector', 200 + 300 * Math.cos(angle), 300 * Math.sin(angle));
    det.rot = angle * 180 / Math.PI;
    det.params.aperture = aperture;
    traceScene([source, grating, det]);
    return detectorReading(det.id)?.pulse;
  };
  const whole = at(60);
  assert.ok(Number.isFinite(whole.stretchedPulseWidthFs), whole.dispersionModel);
  const slice = at(6);
  assert.equal(slice.stretchedPulseWidthFs, null);
  assert.equal(slice.dispersionModel, DISPERSION_UNAVAILABLE.partialFan);
  assert.ok(FAN_COVERAGE > 0.9 && FAN_COVERAGE < 1);
});

test('a continuum the crystal generates carries its own record: timed to the pump, duration not modelled', () => {
  const pump = laser({ wavelength: 1035, pulseWidthFs: 270, transformLimited: true, repRateMHz: 2 });
  const crystal = createElement('crystal', 200, 0);
  Object.assign(crystal.params, { convert: 'sc', scMedium: 'yag', scRange: 'estimate', transmitPump: false });
  const pulse = read([pump, crystal, rod(400)]);
  assert.ok(pulse, 'the continuum reaches the detector');
  assert.equal(pulse.stretchedPulseWidthFs, null, 'the pump\'s 270 fs is not the continuum\'s duration');
  assert.equal(pulse.dispersionModel, DISPERSION_UNAVAILABLE.generated);
  // Unfiltered, undispersed: still not modelled, not "configured".
  const bare = read([laser({ wavelength: 1035, pulseWidthFs: 270, transformLimited: true, repRateMHz: 2 }), (() => {
    const c = createElement('crystal', 200, 0);
    Object.assign(c.params, { convert: 'sc', scMedium: 'yag', scRange: 'estimate', transmitPump: false });
    return c;
  })()]);
  assert.equal(bare.stretchedPulseWidthFs, null);
  assert.equal(bare.repRateMHz, 2, 'still timed to the pump');
});

// --- Third review round ----------------------------------------------------

test('a filter crossing part of a beam gives the same answer whichever half arrives first', () => {
  // The reviewer's reproduction: a 6 mm bandpass at y = −4 or +4 across a
  // 12 mm beam. Mirror-image partial filtering must agree.
  const partly = (y, filterParams) => {
    const source = laser({ pulseWidthFs: 100, transformLimited: true, beamMode: 'beam', beamWidth: 12 });
    const filter = createElement('filter', 200, y);
    Object.assign(filter.params, { length: 6, ...filterParams });
    const det = createElement('detector', 500, 0);
    det.params.aperture = 40;
    traceScene([source, filter, det]);
    return detectorReading(det.id).pulse;
  };
  const halves = [-4, 4].map(y => partly(y, { ftype: 'bandpass', center: 800, band: 5 }));
  for (const pulse of halves) assert.match(pulse.dispersionModel, /^Filtered spectrum/);
  close(halves[0].stretchedPulseWidthFs, halves[1].stretchedPulseWidthFs, 1e-6, 'mirror images agree');
  // Controls: uniform attenuation across part of the beam, and no filter.
  for (const y of [-4, 4]) close(partly(y, { ftype: 'nd', trans: 0.5 }).stretchedPulseWidthFs, 100, 1e-9);
  const plain = read([laser({ pulseWidthFs: 100, transformLimited: true, beamMode: 'beam', beamWidth: 12 })]);
  close(plain.stretchedPulseWidthFs, 100, 1e-9);
});
