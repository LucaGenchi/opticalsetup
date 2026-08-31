import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, registry, getVisualBounds, getElementMeta,
  dataPortDirection, findFreePlacement,
  pmtGain, pmtDarkInput, pmtGainFromLog,
} from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { pmtVerdict } from '../sketch/js/detector-measurements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { formatSignal } from '../sketch/js/util.js';

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// ---------------- detector screen placement ----------------

test('a data port points where the element is actually facing', () => {
  const pmt = createElement('pmt', 0, 0);
  assert.deepEqual(
    Object.values(dataPortDirection(pmt)).map(v => Math.round(v)), [1, 0]);

  pmt.rot = 90;
  const turned = dataPortDirection(pmt);
  assert.ok(Math.abs(turned.x) < 1e-9);
  assert.equal(Math.round(turned.y), 1);

  pmt.rot = 180;
  assert.equal(Math.round(dataPortDirection(pmt).x), -1);
});

test('a new screen lands clear of every element, even in a crowded sketch', () => {
  const elements = [createElement('cwlaser', 0, 0)];
  for (let i = 1; i <= 6; i++) elements.push(createElement('lens', i * 90, 0));
  const pmt = createElement('pmt', 640, 0);
  // Box the sensor in on the side its cable leaves from, so the search has to
  // give up on the preferred direction and find another opening.
  elements.push(pmt, createElement('mirror', 790, 0),
    createElement('camera', 790, 110), createElement('detector', 790, -110));

  const screen = createElement('display', 0, 0);
  const spot = findFreePlacement(screen, elements, pmt, dataPortDirection(pmt));
  screen.x = spot.x;
  screen.y = spot.y;

  const placed = getVisualBounds(screen);
  const clashes = elements.filter(el => overlaps(placed, getVisualBounds(el)));
  assert.deepEqual(clashes.map(el => el.type), [],
    `screen at ${spot.x},${spot.y} overlaps ${clashes.map(el => el.type).join(', ')}`);
});

test('with room to spare the screen goes to the side the cable leaves from', () => {
  const pmt = createElement('pmt', 300, 200);
  const screen = createElement('display', 0, 0);
  const spot = findFreePlacement(screen, [pmt], pmt, dataPortDirection(pmt));
  assert.ok(spot.x > pmt.x, 'expected the screen downstream of the data port');
  assert.equal(spot.y, pmt.y);
  // Clear of the sensor, but not flung across the bench.
  assert.ok(spot.x - pmt.x > 60 && spot.x - pmt.x < 260, `unexpected gap: ${spot.x - pmt.x}`);
});

test('every detector-category instrument can drive a screen', () => {
  const drivable = Object.entries(registry)
    .filter(([, def]) => def.category === 'Detectors' && def.readoutKind)
    .map(([type]) => type);
  assert.ok(drivable.length >= 9);
  for (const type of drivable) {
    const sensor = createElement(type, 200, 0);
    const screen = createElement('display', 0, 0);
    const spot = findFreePlacement(screen, [sensor], sensor, dataPortDirection(sensor));
    assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.y), `${type} produced no placement`);
  }
});

// ---------------- PMT gain, dark floor, saturation ----------------

test('PMT gain and dark floor survive a sketch saved before they existed', () => {
  // A legacy PMT carries a small linear gain and no darkInput at all.
  assert.equal(pmtGain({ gain: 10 }), 10);
  assert.equal(pmtDarkInput({}), 1e-5);
  assert.equal(pmtDarkInput({ darkInput: 0 }), 1e-5);
  assert.equal(pmtGain({}), 1e4);
  // And a corrupt value cannot poison the trace with NaN.
  assert.equal(pmtGain({ gain: 'nonsense' }), 1e4);
  assert.equal(pmtDarkInput({ darkInput: -1 }), 1e-5);
});

test('the gain slider walks whole decades', () => {
  assert.equal(pmtGainFromLog(0), 1);
  assert.equal(pmtGainFromLog(4), 1e4);
  assert.equal(pmtGainFromLog(6), 1e6);
  assert.equal(pmtGainFromLog(99), 1e7, 'gain must clamp to the modelled ceiling');
});

// The dim case a PMT exists for: specimen fluorescence, which carries a tiny
// radiometric power while staying visible on the canvas. The emission is
// evanescent, so — exactly as on a real microscope — it only reaches a
// detector once a collecting lens picks it up. Excitation transmission is off
// so the readout is the emission alone rather than leftover pump light.
function dimSignalScene(overrides = {}) {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 10;
  laser.params.wavelength = 488;
  const stage = createElement('stage', 200, 0);
  stage.rot = 90;
  stage.params.specimenType = 'linear';
  stage.params.transmitExc = false;
  stage.params.channels = [{
    kind: 'fluor', wl: 520, eff: 0.1, epi: false, epiRatio: 0.15, autoWl: false,
    autoColor: true, color: '#22c55e', material: 'lipid', fluorophore: 'custom',
    retardance: 90, axis: 45, transferEff: 0.1, requireOverlap: true,
  }];
  const lens = createElement('lens', 240, 0);
  lens.params.f = 40;
  lens.params.dia = 50;
  const pmt = createElement('pmt', 400, 0);
  pmt.params.aperture = 120;
  Object.assign(pmt.params, overrides);
  return { elements: [laser, stage, lens, pmt], pmt };
}

test('gain lifts a faint specimen signal into a readable range', () => {
  const { elements, pmt } = dimSignalScene({ gain: 1, saturation: 1e7 });
  traceAll(elements);
  const raw = detectorReading(pmt.id);
  assert.ok(raw, 'the specimen emission must reach the photocathode at all');
  assert.ok(raw.signal < 0.01, `expected a faint signal, got ${raw.signal}`);
  // Faint enough that a plain two-decimal readout would print "0.00".
  assert.equal(raw.signal.toFixed(2), '0.00');
  assert.notEqual(formatSignal(raw.signal), '0.00');

  pmt.params.gain = 1e5;
  traceAll(elements);
  const amplified = detectorReading(pmt.id);
  assert.ok(amplified.outputSignal > 1,
    `gain should lift ${amplified.signal} into a readable output, got ${amplified.outputSignal}`);
});

test('gain never changes the signal-to-dark ratio, because it multiplies both', () => {
  const { elements, pmt } = dimSignalScene({ saturation: 1e7, darkInput: 1e-6 });
  const ratios = [];
  for (const decades of [1, 2, 3, 4, 5, 6]) {
    pmt.params.gain = pmtGainFromLog(decades);
    traceAll(elements);
    const reading = detectorReading(pmt.id);
    ratios.push(reading.snr);
    // The amplified dark floor tracks the amplified signal exactly.
    assert.ok(Math.abs(reading.darkOutput / reading.outputSignal - 1 / reading.snr) < 1e-9);
  }
  const spread = Math.max(...ratios) - Math.min(...ratios);
  assert.ok(spread < 1e-9, `SNR moved with gain: ${ratios.join(', ')}`);
});

test('collecting less light, unlike turning up gain, does change detectability', () => {
  const { elements, pmt } = dimSignalScene({ gain: 1e5, saturation: 1e9 });
  traceAll(elements);
  const signal = detectorReading(pmt.id).signal;

  // Floor well below the signal: measurable.
  pmt.params.darkInput = signal / 100;
  traceAll(elements);
  assert.equal(pmtVerdict(detectorReading(pmt.id)).key, 'linear');

  // Floor just under it: only marginally above the noise.
  pmt.params.darkInput = signal / 2;
  traceAll(elements);
  assert.equal(pmtVerdict(detectorReading(pmt.id)).key, 'marginal');

  // Floor above it: the tube's own dark current is bigger than the signal.
  pmt.params.darkInput = signal * 4;
  traceAll(elements);
  const buried = detectorReading(pmt.id);
  assert.equal(pmtVerdict(buried).key, 'buried');
  assert.ok(buried.snr < 1);

  // ...and no amount of gain rescues it.
  pmt.params.gain = 1e7;
  traceAll(elements);
  assert.equal(pmtVerdict(detectorReading(pmt.id)).key, 'buried');
});

test('saturation clips the output and is reported ahead of anything else', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 10;
  const pmt = createElement('pmt', 300, 0);
  const elements = [laser, pmt];

  traceAll(elements);
  const wideOpen = detectorReading(pmt.id);
  assert.equal(wideOpen.outputSignal, pmt.params.saturation);
  assert.equal(wideOpen.saturated, true);
  // Saturation outranks a healthy signal-to-dark ratio: the number is no
  // longer trustworthy, so that is what the instrument must say first.
  assert.ok(wideOpen.snr > 100);
  assert.equal(pmtVerdict(wideOpen).key, 'saturated');

  pmt.params.gain = 1;
  pmt.params.saturation = 1e6;
  traceAll(elements);
  const linear = detectorReading(pmt.id);
  assert.equal(linear.saturated, false);
  assert.equal(pmtVerdict(linear).key, 'linear');
});

test('only the PMT gets a PMT verdict', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  const plain = createElement('detector', 300, 0);
  traceAll([laser, plain]);
  assert.equal(pmtVerdict(detectorReading(plain.id)), null);
});

test('the PMT explains that gain is not sensitivity', () => {
  const note = getElementMeta('pmt', createElement('pmt').params).note;
  assert.match(note, /never improves the signal-to-dark ratio/i);
  assert.match(note, /collect more light/i);
});
