import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, getVisualBounds, registry } from '../sketch/js/elements.js';
import { buildSVG } from '../sketch/js/export.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import {
  recordSampleArrivalDetail, resetSampleArrivalDetails, sampleArrivalDetailBounds,
  sampleArrivalDetailOptions, sampleArrivalDetailReading, sampleArrivalDetailSVG,
} from '../sketch/js/sample-arrival-detail.js';

const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const saved = elements => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });

function bench() {
  const source = createElement('pulsedlaser', 100, -120);
  source.rot = 90;
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 3, transformLimited: false, bandwidth: 0 });
  const galvo = createElement('galvo', 100, 0);
  galvo.rot = 135;
  Object.assign(galvo.params, { scanMode: 'static', commandAngle: 0 });
  const lens = createElement('lens', 150, 0);
  lens.params.f = 20;
  const stage = createElement('stage', 170, 0);
  stage.rot = 90;
  Object.assign(stage.params, { specimenType: 'resin', showArrivalDetail: true, transmission: 0 });
  return { source, galvo, lens, stage, elements: [source, galvo, lens, stage] };
}

test('the serial inset retains all samples, shows galvo micrometre motion and broadens with actual defocus', () => {
  const { galvo, stage, elements } = bench();
  traceScene(elements);
  let reading = sampleArrivalDetailReading(stage.id);
  assert.equal(reading.channels.length, 1);
  assert.equal(reading.channels[0].sampleCount, 25, 'the centre reference alone cannot represent defocus');
  close(reading.channels[0].minUm, 0);
  close(reading.channels[0].maxUm, 0);

  for (const command of [-0.025, 0.025]) {
    galvo.params.commandAngle = command;
    traceScene(elements);
    const [channel] = sampleArrivalDetailReading(stage.id).channels;
    const expected = 20000 * Math.tan(2 * command * Math.PI / 180);
    close(channel.minUm, expected);
    close(channel.maxUm, expected);
    assert.match(sampleArrivalDetailSVG(stage), /Fixed ±100 µm/);
  }

  galvo.params.commandAngle = 0;
  stage.x += 1;
  traceScene(elements);
  reading = sampleArrivalDetailReading(stage.id);
  close(reading.channels[0].minUm, -75);
  close(reading.channels[0].maxUm, 75);
  assert.equal(reading.channels[0].positionsUm.length, 25);
  const svg = sampleArrivalDetailSVG(stage);
  assert.equal((svg.match(/class="sample-arrival-tick"/g) || []).length, 25);
  assert.match(svg, /data-span-um="150.00"/);
  assert.doesNotMatch(svg, /<circle/, 'the inset does not add a centroid or fake sharp spot');
});

test('source-off and disabled insets clear all stale arrival data', () => {
  const { source, stage, elements } = bench();
  traceScene(elements);
  assert.equal(sampleArrivalDetailReading(stage.id).channels.length, 1);
  source.params.enabled = false;
  traceScene(elements);
  assert.deepEqual(sampleArrivalDetailReading(stage.id).channels, []);
  assert.match(sampleArrivalDetailSVG(stage), /No arrivals/);
  assert.doesNotMatch(sampleArrivalDetailSVG(stage), /class="sample-arrival-(tick|support)"/);

  source.params.enabled = true;
  stage.params.showArrivalDetail = false;
  traceScene(elements);
  assert.deepEqual(sampleArrivalDetailReading(stage.id).channels, []);
  assert.equal(sampleArrivalDetailSVG(stage), '');
});

test('source sampling changes do not change channel count or full serial support', () => {
  const original = registry.pulsedlaser.source;
  try {
    for (const count of [9, 25, 49]) {
      registry.pulsedlaser.source = el => Array.from({ length: count }, (_, i) => ({
        x: 52, y: -el.params.beamWidth / 2 + el.params.beamWidth * i / (count - 1),
        dx: 1, dy: 0, sample: i, sampleGrid: 'edges',
      }));
      const { stage, elements } = bench();
      stage.x += 1;
      traceScene(elements);
      const reading = sampleArrivalDetailReading(stage.id);
      assert.equal(reading.channels.length, 1);
      assert.equal(reading.channels[0].sampleCount, count);
      close(reading.channels[0].maxUm - reading.channels[0].minUm, 150);
    }
  } finally { registry.pulsedlaser.source = original; }
});

test('native array paths remain separate channels and no mount hit is reported as a specimen arrival', () => {
  const source = createElement('pulsedlaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 24, transformLimited: false, bandwidth: 0 });
  const array = createElement('microlensarray', 100, 0);
  Object.assign(array.params, { length: 24, count: 3, f: 40 });
  const stage = createElement('stage', 140, 0);
  stage.rot = 90;
  Object.assign(stage.params, { aperture: 100, specimenType: 'resin', showArrivalDetail: true });
  traceScene([source, array, stage]);
  const channels = sampleArrivalDetailReading(stage.id).channels;
  assert.equal(channels.length, 3);
  assert.ok(channels.every(channel => channel.sampleCount > 1));
  for (const channel of channels) close(channel.maxUm - channel.minUm, 0);

  source.params.beamMode = 'line';
  source.y = 30; // stage aperture ends at 25 mm; its mount continues to 37 mm
  stage.params.aperture = 50;
  traceScene([source, stage]);
  assert.deepEqual(sampleArrivalDetailReading(stage.id).channels, []);
});

test('inset settings round-trip, stay optional for old files and bound malformed geometry', () => {
  const old = createElement('stage');
  old.params = {};
  const [loadedOld] = parseSketch(saved([old]), registry).elements;
  assert.equal(loadedOld.params.showArrivalDetail, false);
  assert.equal(loadedOld.params.arrivalDetailFontSize, 18);
  assert.equal(sampleArrivalDetailSVG(loadedOld), '');

  const { stage } = bench();
  Object.assign(stage.params, { arrivalDetailRangeUm: 80, arrivalDetailOffsetX: -450,
    arrivalDetailOffsetY: -250, arrivalDetailWidth: 320, arrivalDetailHeight: 180, arrivalDetailFontSize: 26 });
  const [loaded] = parseSketch(saved([stage]), registry).elements;
  assert.deepEqual(sampleArrivalDetailOptions(loaded.params), sampleArrivalDetailOptions(stage.params));
  assert.equal(loaded.params.arrivalDetailFontSize, 26);

  const malformed = { showArrivalDetail: true, arrivalDetailRangeUm: 0,
    arrivalDetailOffsetX: Infinity, arrivalDetailOffsetY: -1e99,
    arrivalDetailWidth: NaN, arrivalDetailHeight: 0 };
  const options = sampleArrivalDetailOptions(malformed);
  assert.equal(options.arrivalDetailRangeUm, 1);
  assert.equal(options.arrivalDetailOffsetX, 45);
  assert.equal(options.arrivalDetailOffsetY, -5000);
  assert.equal(options.arrivalDetailWidth, 220);
  assert.equal(options.arrivalDetailHeight, 110);
  assert.doesNotMatch(sampleArrivalDetailSVG({ ...stage, params: malformed }), /NaN|Infinity/);
});

test('larger inset typography preserves world placement, outer bounds and the fixed transverse scale', () => {
  const { stage } = bench();
  Object.assign(stage.params, { arrivalDetailOffsetX: 90, arrivalDetailOffsetY: -210,
    arrivalDetailWidth: 320, arrivalDetailHeight: 190 });
  resetSampleArrivalDetails();
  recordSampleArrivalDetail(stage, { x: stage.x, y: 0.05 }, { sourceId: 'source', intensity: 1 });
  const before = sampleArrivalDetailBounds(stage);
  for (const requested of [12, 18, 26, 36, Infinity, NaN, -10]) {
    stage.params.arrivalDetailFontSize = requested;
    const svg = sampleArrivalDetailSVG(stage);
    assert.deepEqual(sampleArrivalDetailBounds(stage), before);
    assert.match(svg, /rotate\(-90\) translate\(90 -210\)/);
    assert.match(svg, /Fixed ±100 µm/);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    const scale = Number(svg.match(/sample-arrival-detail-layout" transform="scale\(([^)]+)\)/)[1]);
    const [, width, height] = svg.match(/<rect width="([^"]+)" height="([^"]+)"/).map(Number);
    close(width * scale, 320);
    close(height * scale, 190);
    assert.ok(width >= 210 - 1e-9 && height >= 110 - 1e-9);
    const tickX = Number(svg.match(/class="sample-arrival-tick" d="M ([^ ]+)/)[1]);
    close((tickX - 18) / (width - 36), 0.75, 5e-5,
      'the real +50 µm arrival stays three quarters across the ±100 µm field');
    if (requested === 26) close(scale * 18, 26);
  }
  Object.assign(stage.params, { arrivalDetailWidth: 210, arrivalDetailHeight: 110, arrivalDetailFontSize: 36 });
  assert.match(sampleArrivalDetailSVG(stage), /sample-arrival-detail-layout" transform="scale\(1\)"/,
    'the smallest panel caps enlarged type instead of overflowing');
});

test('the same native inset stays upright and inside fitted static and animated exports', () => {
  const { stage, elements } = bench();
  Object.assign(stage.params, { arrivalDetailOffsetX: 500, arrivalDetailOffsetY: -350 });
  state.elements = elements; state.beams = [];
  const svg = buildSVG();
  const inset = sampleArrivalDetailSVG(stage);
  assert.ok(svg.includes(inset), 'export uses the same native SVG as the canvas element');
  assert.match(inset, /transform="rotate\(-90\) translate\(500 -350\)"/);
  const visual = getVisualBounds(stage), card = sampleArrivalDetailBounds(stage);
  assert.ok(visual.x0 <= card.x0 && visual.x1 >= card.x1 && visual.y0 <= card.y0 && visual.y1 >= card.y1);
  const [x, y, w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(x <= card.x0 && x + w >= card.x1 && y <= card.y0 && y + h >= card.y1);

  Object.assign(stage.params, { pzMode: 'z', pzTravelZ: 2, pzFreqZ: 0.1 });
  const animated = buildSVG({ animation: { seconds: 5, playback: { mechanicsMode: true } } });
  const [channel] = sampleArrivalDetailReading(stage.id).channels;
  assert.ok(channel.maxUm - channel.minUm > 100, 'the exported moving-stage pose is retraced');
  assert.match(animated, /Fixed ±100 µm/);
  assert.doesNotMatch(animated, /NaN|Infinity/);
});

test('off-field and over-budget data are explicit, finite and never create clamped fake arrivals', () => {
  const { stage } = bench();
  resetSampleArrivalDetails();
  const ray = { sourceId: 'source', intensity: 1 };
  recordSampleArrivalDetail(stage, { x: stage.x, y: 1 }, ray);
  let svg = sampleArrivalDetailSVG(stage);
  assert.match(svg, /data-outside-field="true"/);
  assert.doesNotMatch(svg, /class="sample-arrival-tick"/);
  recordSampleArrivalDetail(stage, { x: NaN, y: 0 }, ray);
  recordSampleArrivalDetail(stage, { x: stage.x, y: 0 }, { ...ray, intensity: 0 });
  assert.equal(sampleArrivalDetailReading(stage.id).channels[0].sampleCount, 1);

  resetSampleArrivalDetails();
  for (let i = 0; i < 1100; i++) recordSampleArrivalDetail(stage, { x: stage.x, y: i / 1e6 }, ray);
  let reading = sampleArrivalDetailReading(stage.id);
  assert.equal(reading.channels[0].positionsUm.length, 1024);
  assert.equal(reading.channels[0].samplesTruncated, true);
  close(reading.channels[0].maxUm, 1.099, 1e-9);
  assert.match(sampleArrivalDetailSVG(stage), /ticks omitted at the display budget/);
  for (let i = 0; i < 140; i++) recordSampleArrivalDetail(stage, { x: stage.x, y: 0 }, { ...ray, arrivalPath: `order${i}` });
  reading = sampleArrivalDetailReading(stage.id);
  assert.equal(reading.channels.length, 128);
  assert.equal(reading.channelsTruncated, true);
  svg = sampleArrivalDetailSVG(stage);
  assert.match(svg, /128\+ physical channels/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.ok((svg.match(/class="sample-arrival-channel"/g) || []).length <= 8);
});
