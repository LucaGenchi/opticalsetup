import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, getElementMeta } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';
import {
  MASK_MAX_FRAMES, MASK_MAX_SIDE, normalizeMaskFrames, migrateProgrammableMaskParams,
  programmableMaskFrame, sampleProgrammableFrame, programmableFrameSVG,
  programmableMaskPlaying, programmableMaskEffects, programmableSpectralAngle,
} from '../sketch/js/programmable-mask.js';
import { REBUILD_ON_COMMIT_KEYS } from '../sketch/js/inspector.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const save = elements => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });
const load = elements => parseSketch(save(elements), registry).elements;
const sample = (p, type, y, t = 0, column) => sampleProgrammableFrame(programmableMaskFrame(p, type, t), y, column);

test('custom frames bound all dimensions and fail closed for malformed pixel values', () => {
  const huge = Array.from({ length: 25 }, () => Array.from({ length: 50 }, () => Array(50).fill(0.8)));
  const grids = normalizeMaskFrames(huge, 'dmd');
  assert.equal(grids.length, MASK_MAX_FRAMES);
  assert.equal(grids[0].length, MASK_MAX_SIDE);
  assert.equal(grids[0][0].length, MASK_MAX_SIDE);
  assert.equal(grids[0][0][0], 1);
  assert.deepEqual(normalizeMaskFrames([[NaN, Infinity, -1, 2, '1', 0.49, 0.5]], 'dmd'), [[[0, 0, 0, 1, 0, 0, 1]]]);
  assert.deepEqual(normalizeMaskFrames([[0.25], [0.5, 0.75]], 'slm'), [[[0.25, 0], [0.5, 0.75]]]);
  assert.deepEqual(normalizeMaskFrames('{bad JSON'), []);
  assert.deepEqual(normalizeMaskFrames(' '.repeat(120001)), []);
});

test('the same frame supports binary DMD, SLM intensity transmission and display-only phase', () => {
  const p = { length: 40, maskPattern: 'custom', maskFrames: [[0.25, 0.75], [0, 1]], maskSlice: 0 };
  assert.equal(sample(p, 'dmd', -10).transmission, 0);
  assert.equal(sample(p, 'dmd', -10, 0, 1).transmission, 1);
  assert.equal(sample({ ...p, maskMode: 'amplitude' }, 'slm', -10).transmission, 0.25);
  const phase = sample({ ...p, maskMode: 'phase' }, 'slm', -10);
  assert.equal(phase.transmission, 1);
  assert.equal(phase.phaseCycles, 0.25);
  for (const y of [NaN, Infinity, -21, 21]) assert.equal(sample(p, 'dmd', y).transmission, 0);
  assert.equal(sample(p, 'dmd', 20, 0, 1).value, 1);
});

test('legacy pitch and duty preserve the old DMD cross-section at arbitrary physical coordinates', () => {
  for (const length of [10, 37, 100]) for (const pitch of [1, 8, 17.5, 40]) for (const duty of [0, 0.03, 0.5, 0.97, 1]) {
    const p = { length, pitch, duty };
    for (let i = 0; i < 211; i++) {
      const y = -length / 2 + length * (i + 0.17) / 212;
      const h = y + length / 2 + pitch / 2;
      const expected = Number(((h % pitch) + pitch) % pitch / pitch < duty);
      assert.equal(sample(p, 'dmd', y).value, expected, JSON.stringify({ p, y }));
    }
  }
});

test('legacy branch fields convert to one schema with no paper-specific layers', () => {
  const old = (type, params) => ({ ...createElement(type), params });
  const [saha, somers, ouyang, gittard, gu] = load([
    old('dmd', { spectralDispersion: true, dispersionReferenceNm: 800, dispersionSlopeDegPer100Nm: 8 }),
    old('dmd', { sequence: true, sequenceHz: 2, disperseSpectrum: true, carrierLinesPerMm: 92.6, carrierOrder: -1, designWavelengthNm: 800 }),
    old('dmd', { pattern: 'hologram', focusCount: 5, focusSpan: 7, scanAngle: 2 }),
    old('slm', { layers: [{ type: 'focusgrid', n: 4, f: 80 }] }),
    old('slm', { layers: [{ type: 'amplitude', levels: '0.25,1,0' }, { type: 'steer', angle: 0 }] }),
  ]);
  assert.equal(saha.params.spectralMode, 'linear');
  assert.equal(saha.params.dispersionSlopeDegPer100Nm, 8);
  assert.equal(somers.params.spectralMode, 'carrier');
  assert.equal(somers.params.maskPattern, 'slices');
  assert.equal(somers.params.maskRateHz, 2);
  assert.equal(somers.params.maskPlayback, true);
  assert.equal(somers.params.carrierOrder, -1);
  assert.equal(ouyang.params.holographicOrders, true);
  assert.equal(ouyang.params.focusCount, 5);
  assert.equal(gittard.params.layers[0].type, 'focusgrid');
  assert.equal(gu.params.maskMode, 'amplitude');
  assert.ok(gu.params.layers.every(layer => layer.type !== 'amplitude'));
  near(sample(gu.params, 'slm', -15).transmission, 0.25);
  near(sample(gu.params, 'slm', 0).transmission, 1);
  near(sample(gu.params, 'slm', 15).transmission, 0);
  assert.deepEqual(load([saha, somers, ouyang, gittard, gu]), [saha, somers, ouyang, gittard, gu]);
});

test('overlaid legacy SLM masks preserve their exact intensity product at distinct band edges', () => {
  const p = migrateProgrammableMaskParams({ length: 40, layers: [
    { type: 'amplitude', levels: '0.2,0.8' }, { type: 'amplitude', levels: '0.5,1,0.1' },
  ] }, 'slm');
  for (const [y, expected] of [[-19, 0.1], [-5, 0.2], [5, 0.8], [19, 0.08]]) {
    near(sample(p, 'slm', y).transmission, expected);
  }
});

test('frame playback is discrete, bounded, deterministic and independent of optical effects', () => {
  const p = { maskPattern: 'slices', maskPlayback: true, maskRateHz: 2, maskFrame: 1 };
  const f0 = programmableMaskFrame(p, 'dmd', 0);
  assert.deepEqual(programmableMaskFrame(p, 'dmd', 0.499), f0);
  assert.equal(programmableMaskFrame(p, 'dmd', 0.5).index, 2);
  assert.notDeepEqual(programmableMaskFrame(p, 'dmd', 0.5).grid, f0.grid);
  assert.deepEqual(programmableMaskFrame(p, 'dmd', 2), f0);
  assert.deepEqual(programmableMaskFrame(p, 'dmd', NaN), f0);
  assert.deepEqual(programmableMaskFrame({ ...p, holographicOrders: true, focusCount: 8, spectralMode: 'linear' }, 'dmd', 0), f0);
  assert.ok(programmableMaskPlaying({ type: 'dmd', params: p }));
  assert.ok(!programmableMaskPlaying({ type: 'dmd', params: { ...p, maskPattern: 'stripes' } }));
  assert.ok(!programmableMaskPlaying({ type: 'slm', params: { ...p, maskPattern: 'custom', maskFrames: [[[1]]] } }));
});

test('native icons contain a two-dimensional pixel panel and the current frame never translates', () => {
  for (const type of ['dmd', 'slm']) {
    const el = createElement(type);
    Object.assign(el.params, { maskPattern: 'slices', maskPlayback: true, maskRateHz: 1 });
    const first = registry[type].svg({ ...el, _animationTimeS: 0 });
    const second = registry[type].svg({ ...el, _animationTimeS: 1 });
    assert.match(first, /data-mask-frame="0"/);
    assert.match(second, /data-mask-frame="1"/);
    assert.match(first, /data-mask-pixel="0,0"/);
    assert.match(first, /data-mask-pixel="15,15"/);
    assert.notEqual(first, second);
    const positions = svg => [...svg.matchAll(/data-mask-pixel="([^"]+)" x="([^"]+)" y="([^"]+)"/g)].map(m => m.slice(1));
    assert.deepEqual(positions(first), positions(second));
    assert.ok(!/NaN|Infinity/.test(first + second));
  }
  assert.ok(programmableFrameSVG(programmableMaskFrame()).length < 100000);
});

function testBench(type = 'slm') {
  const source = createElement('pulsedlaser', 0, 0);
  Object.assign(source.params, { beamMode: 'line', wavelength: 800, transformLimited: false, bandwidth: 20 });
  const mask = createElement(type, 100, 0);
  Object.assign(mask.params, { length: 40, transmissive: true, maskPattern: 'uniform', maskLevel: 1 });
  const detector = createElement('spectrometer', 200, 0);
  detector.params.aperture = 180;
  return { source, mask, detector };
}

test('SLM phase pixels do not invent a field; grayscale is intensity transmission without squaring', () => {
  const { source, mask, detector } = testBench();
  mask.params.maskLevel = 0.25;
  mask.params.maskMode = 'phase';
  traceScene([source, mask, detector]);
  near(detectorReading(detector.id).signal, 1);
  mask.params.maskMode = 'amplitude';
  traceScene([source, mask, detector]);
  near(detectorReading(detector.id).signal, 0.25);
  mask.params.maskLevel = 1e-7;
  traceScene([source, mask, detector]);
  near(detectorReading(detector.id).signal, 1e-7, 1e-13);
  mask.params.maskLevel = 0;
  traceScene([source, mask, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('holographic orders preserve tiny nonzero power and the residual zero order', () => {
  const { source, mask, detector } = testBench();
  Object.assign(mask.params, { maskMode: 'amplitude', maskLevel: 1e-7,
    holographicOrders: true, focusCount: 8, focusSpan: 10, zeroOrder: true, zeroFrac: 0.01 });
  const result = traceScene([source, mask, detector]);
  near(detectorReading(detector.id).signal, 0.01 + 0.99e-7, 1e-12);
  const leaving = result.pulseTracks.filter(track => Math.abs(track.pts[0].x - 91) < 1e-8);
  assert.equal(leaving.length, 9);
  assert.ok(leaving.every(track => track.intensity > 0));
});

test('all-aperture focus orders branch every input ray and retain broadband and GDD state', () => {
  const { source, mask, detector } = testBench();
  source.params.transformLimited = true;
  const originalBandwidth = traceScene([source]).pulseTracks[0].bw;
  const compressor = createElement('pulsecompressor', 75, 0);
  compressor.params.gddFs2 = 1000;
  Object.assign(mask.params, { layers: [{ type: 'focusgrid', n: 4, f: 80 }] });
  const result = traceScene([source, compressor, mask, detector]);
  near(detectorReading(detector.id).signal, 1);
  const leaving = result.pulseTracks.filter(track => Math.abs(track.pts[0].x - 91) < 1e-8);
  assert.equal(leaving.length, 4);
  assert.ok(leaving.every(track => track.bw === originalBandwidth));
  assert.ok(leaving.every(track => track.gddTrace[0].gdd === 1000));
});

test('linear and carrier spectral proxies conserve power, keep the band and do not add pulse GDD', () => {
  for (const spectralMode of ['linear', 'carrier']) {
    const { source, mask, detector } = testBench();
    source.params.transformLimited = true;
    Object.assign(mask.params, { spectralMode, holographicOrders: true, focusCount: 3, focusSpan: 4 });
    const result = traceScene([source, mask, detector]);
    const reading = detectorReading(detector.id);
    near(reading.signal, 1);
    assert.ok(reading.bandMin < 800 && reading.bandMax > 800);
    const leaving = result.pulseTracks.filter(track => Math.abs(track.pts[0].x - 91) < 1e-8);
    assert.ok(leaving.length > 3);
    assert.ok(leaving.every(track => track.gddTrace[0].gdd === 0));
    const effects = programmableMaskEffects(mask.params);
    near(programmableSpectralAngle(effects, 800), 0);
    assert.ok(programmableSpectralAngle(effects, 790) < 0);
    assert.ok(programmableSpectralAngle(effects, 810) > 0);
  }
});

test('coarsened spectral cells survive stacked focus orders and a downstream filter', () => {
  const { source, mask, detector } = testBench();
  Object.assign(source.params, { wavelength: 600, bandwidth: 400 });
  Object.assign(mask.params, { spectralMode: 'linear', dispersionReferenceNm: 600, dispersionSlopeDegPer100Nm: 1,
    holographicOrders: true, focusCount: 8, focusSpan: 2, layers: [{ type: 'focusgrid', n: 3, f: 3000 }] });
  const filter = createElement('filter', 160, 0);
  Object.assign(filter.params, { ftype: 'longpass', cutoff: 650, length: 100 });
  traceScene([source, mask, filter, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading && reading.signal > 0 && reading.signal < 1);
  assert.ok(reading.bandMin >= 650 - 1e-6);
  assert.ok(reading.bandMax > 650);
});

test('unsafe mask and effect values normalize to finite bounded traces and stable save/reload', () => {
  for (const type of ['dmd', 'slm']) {
    const { source, mask } = testBench(type);
    Object.assign(mask.params, { length: 1e100, tilt: NaN, maskPattern: 'custom', maskMode: 'amplitude',
      maskFrames: [[-1, Infinity, 1e90], [0.4]], maskFrame: 1e50, maskRateHz: -1, maskSlice: 1e80,
      holographicOrders: true, focusCount: 10000, focusSpan: Infinity, scanAngle: NaN,
      spectralMode: 'carrier', carrierLinesPerMm: 1e50, carrierOrder: -10000, designWavelengthNm: -5 });
    const normalized = load([source, mask]);
    const result = traceScene(normalized);
    assert.ok(result.drawables.every(draw => !draw.pts || draw.pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
    assert.ok(!/NaN|Infinity/.test(registry[type].svg(normalized[1])));
    assert.deepEqual(load(normalized), normalized);
    assert.deepEqual(traceScene(load(normalized)), result);
  }
});

test('programmable mode switches rebuild the inspector and capability text states model limits', () => {
  for (const key of ['maskPattern', 'maskPlayback', 'maskMode', 'spectralMode', 'holographicOrders']) {
    assert.ok(REBUILD_ON_COMMIT_KEYS.includes(key));
  }
  for (const type of ['dmd', 'slm']) {
    const params = createElement(type).params;
    const meta = getElementMeta(type, params);
    assert.match(meta.note, /intensity transmission/);
    assert.match(meta.note, /do not solve CGH/);
  }
});
