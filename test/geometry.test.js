import test from 'node:test';
import assert from 'node:assert/strict';

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { registry, createElement, getElementMeta, getSize } from '../sketch/js/elements.js';
import { buildSVG, exportPNG, exportSVG } from '../sketch/js/export.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { C_MM_PER_NS } from '../sketch/js/pulses.js';
import { pulseTimelineHTML, shouldUseSlider } from '../sketch/js/inspector.js';
import { state, parseSketch } from '../sketch/js/state.js';
import { distinctPoints } from '../sketch/js/util.js';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../Examples');
async function loadExampleFiles() {
  const categories = await readdir(EXAMPLES_DIR, { withFileTypes: true });
  const files = [];
  for (const cat of categories.filter(d => d.isDirectory())) {
    const dir = join(EXAMPLES_DIR, cat.name);
    for (const file of (await readdir(dir)).filter(f => f.toLowerCase().endsWith('.json'))) {
      files.push({ name: file.replace(/\.json$/i, ''), path: join(dir, file) });
    }
  }
  return files;
}

const invalidNumber = /(?:NaN|undefined|Infinity)/;

test('every registered element renders and traces with valid defaults', () => {
  for (const [type, def] of Object.entries(registry)) {
    const el = createElement(type, 100, 100);
    const size = getSize(el);
    assert.ok(Number.isFinite(size.w) && size.w > 0, `${type} width`);
    assert.ok(Number.isFinite(size.h) && size.h > 0, `${type} height`);
    assert.doesNotMatch(def.svg(el), invalidNumber, `${type} SVG`);
    for (const drawable of traceAll([el], [])) {
      for (const p of drawable.pts || drawable.dots || []) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${type} trace point`);
      }
    }
  }
});

test('inspector sliders are limited to bounded, practical adjustment ranges', () => {
  assert.equal(shouldUseSlider({ min: 1, max: 60, step: 0.5 }), true, 'beam width is quick to tune');
  assert.equal(shouldUseSlider({ min: 0, max: 1, step: 0.05 }), true, 'normalized transmission is quick to tune');
  assert.equal(shouldUseSlider({ min: 100, max: 12000, step: 1 }), false, 'wavelength keeps a precise number field');
  assert.equal(shouldUseSlider({ min: 0.001, max: 1000000, step: 1 }), false, 'large repetition-rate spans stay numeric');
  assert.equal(shouldUseSlider({ min: 0, max: 359, step: 1, slider: true }), true, 'rotation explicitly opts into a slider');
  assert.equal(shouldUseSlider({ min: 0, max: 1 }), false, 'incomplete schemas never create a slider');
});

test('small custom mirrors never emit NaN hatch coordinates', () => {
  for (const type of ['mirror', 'cmirror', 'cmirrorx']) {
    const el = createElement(type);
    el.params.length = 1;
    assert.doesNotMatch(registry[type].svg(el), invalidNumber);
  }
});

test('dependent geometry stays valid at allowed parameter extremes', () => {
  const slit = createElement('slit');
  slit.params.length = 1;
  slit.params.gap = 60;
  assert.doesNotMatch(registry.slit.svg(slit), /\b(?:width|height|r|rx|ry)="-/);
  assert.deepEqual(registry.slit.surfaces(slit), []);

  const arrow = createElement('arrowann');
  arrow.params.len = 10;
  arrow.params.width = 8;
  const size = getSize(arrow);
  assert.ok(size.h >= 30, 'the hit/export bounds contain the thick arrowhead');
});

test('grating order parsing is deduplicated and bounded', () => {
  const grating = createElement('grating');
  grating.params.orders = [...Array(50).keys(), ...Array(50).keys()].join(',');
  const orders = registry.grating.surfaces(grating)[0].data.orders;
  assert.equal(orders.length, 21);
  assert.equal(new Set(orders).size, orders.length);
});

test('component metadata distinguishes simulated, setup-dependent, and diagram-only elements', () => {
  assert.equal(getElementMeta('lens', createElement('lens').params).tier, 'simulated');
  assert.equal(getElementMeta('glassrod', createElement('glassrod').params).tier, 'simulated');
  assert.equal(getElementMeta('microscope', createElement('microscope').params).tier, 'simulated');
  assert.equal(getElementMeta('textlabel', createElement('textlabel').params).tier, 'diagram');
  const eom = createElement('eom');
  assert.equal(getElementMeta('eom', eom.params).tier, 'configurable');
  eom.params.modulate = true;
  assert.equal(getElementMeta('eom', eom.params).tier, 'simulated');
  assert.equal(registry.glassrod.surfaces(createElement('glassrod')).length, 4);
  assert.equal(registry.microscope.surfaces(createElement('microscope')).length, 8);
});

test('glass rods refract through their faces and return an exiting ray to air', () => {
  const laser = createElement('laser', 0, 0);
  const rod = createElement('glassrod', 180, 0);
  rod.rot = 10;
  const paths = traceAll([laser, rod]).filter(d => d.type === 'path');
  const ray = paths.find(d => d.pts.length >= 4);
  assert.ok(ray, 'ray records entry and exit at the rod faces');
  const slope = (a, b) => (b.y - a.y) / (b.x - a.x);
  assert.ok(Math.abs(slope(ray.pts[1], ray.pts[2])) > 0.01, 'ray bends inside the glass');
  assert.ok(Math.abs(slope(ray.pts.at(-2), ray.pts.at(-1))) < 1e-6, 'parallel faces return the ray to its incident direction');
});

test('microscope assembly applies both internal lenses and blocks outside its aperture', () => {
  const laser = createElement('laser', 0, 5);
  const microscope = createElement('microscope', 200, 0);
  const paths = traceAll([laser, microscope]).filter(d => d.type === 'path');
  const ray = paths.find(d => d.pts.length >= 4);
  assert.ok(ray, 'ray crosses objective and tube lens');
  const middleSlope = (ray.pts[2].y - ray.pts[1].y) / (ray.pts[2].x - ray.pts[1].x);
  const exitSlope = (ray.pts.at(-1).y - ray.pts.at(-2).y) / (ray.pts.at(-1).x - ray.pts.at(-2).x);
  assert.ok(Math.abs(middleSlope) > 0.1, 'objective bends the off-axis ray');
  assert.ok(Math.abs(exitSlope) < 1e-6, 'default afocal pair recollimates the ray');

  laser.y = 20;
  microscope.params.aperture = 10;
  const blocked = traceAll([laser, microscope]).filter(d => d.type === 'path')[0];
  assert.ok(blocked.pts.at(-1).x < 200, 'housing stops rays outside the clear aperture');
});

test('detectors report qualitative signal, spectrum, polarization, and spot span', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 8;
  laser.params.wavelength = 488;
  laser.params.pol = 30;
  const detector = createElement('detector', 250, 0);
  traceAll([laser, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading);
  assert.ok(Math.abs(reading.signal - 1) < 1e-9);
  assert.equal(reading.samples, 25);
  assert.equal(Math.round(reading.wavelength), 488);
  assert.equal(reading.polarization, 'Linear 30°');
  assert.ok(reading.spotSpan > 7);

  detector.y = 200;
  traceAll([laser, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('detector signal follows upstream attenuation', () => {
  const laser = createElement('laser', 0, 0);
  const splitter = createElement('bs', 150, 0);
  splitter.params.ratio = 0.35;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, splitter, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.35) < 1e-9);
});

test('pulsed lasers produce optical-path tracks and physical detector arrival times', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = 80;
  laser.params.pulseWidthFs = 120;
  const detector = createElement('detector', 52 + C_MM_PER_NS + 19, 0);
  const scene = traceScene([laser, detector]);
  assert.ok(scene.pulseTracks.length > 0);
  assert.deepEqual(scene.pulseTracks[0].pulse, {
    sourceId: laser.id, repRateMHz: 80, pulseWidthFs: 120, phaseNs: 0,
  });
  const reading = detectorReading(detector.id);
  assert.ok(reading.pulse);
  assert.ok(Math.abs(reading.pulse.earliestPathDelayNs - 1) < 1e-9);
  assert.equal(reading.pulse.phaseNs, 0);
  assert.equal(reading.pulse.mixed, false);
});

test('detectors distinguish mixed pulse trains instead of inventing one setting', () => {
  const fast = createElement('laser', 0, 0);
  fast.params.temporalMode = 'pulsed';
  fast.params.repRateMHz = 80;
  const slow = createElement('laser', 0, 0);
  slow.params.temporalMode = 'pulsed';
  slow.params.repRateMHz = 10;
  slow.params.pulsePhaseNs = 2;
  const detector = createElement('detector', 300, 0);
  traceAll([fast, slow, detector]);
  const pulse = detectorReading(detector.id).pulse;
  assert.equal(pulse.sources, 2);
  assert.equal(pulse.mixed, true);
  assert.equal(pulse.repRateMHz, null);
  assert.equal(pulse.phaseNs, null);
});

test('detector timeline is generated from repetition rate, phase, and path delay', () => {
  const pulse = {
    trains: [{ repRateMHz: 80, pulseWidthFs: 100, phaseNs: 0 }],
    repRateMHz: 80, pulseWidthFs: 100, phaseNs: 0,
    earliestPathDelayNs: 1,
    arrivalSpreadPs: 0,
  };
  const base = pulseTimelineHTML(pulse, '#ff0000');
  const shifted = pulseTimelineHTML({
    ...pulse,
    trains: [{ ...pulse.trains[0], phaseNs: 3 }],
    phaseNs: 3,
  }, '#ff0000');
  const slower = pulseTimelineHTML({
    ...pulse,
    trains: [{ ...pulse.trains[0], repRateMHz: 10 }],
    repRateMHz: 10,
  }, '#ff0000');
  assert.match(base, /37\.50 ns arrival window/);
  assert.notEqual(base, shifted);
  assert.notEqual(base, slower);
  assert.doesNotMatch(base, invalidNumber);
});

test('pulsed scenes export as deterministic static SVGs without animation markup', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  state.elements = [laser, createElement('mirror', 200, 0)];
  state.beams = [];
  const first = buildSVG();
  const second = buildSVG();
  assert.equal(first, second);
  assert.doesNotMatch(first, /pulseLayer|requestAnimationFrame/);
});

test('fiber relaunch adds configured group delay and finite loss', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  const fiber = {
    id: 'timed-fiber', kind: 'fiber', pts: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
    color: '#e8a800', width: 4, propagate: true, groupIndex: 1.5, lossDbPerM: 3,
    out0: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
    out1: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
  };
  const scene = traceScene([laser], [fiber]);
  const relaunched = scene.pulseTracks.find(track => track.opls[0] > 100);
  assert.ok(relaunched, 'a timed track starts at the output connector');
  assert.ok(Math.abs(relaunched.opls[0] - (48 + 150 + 2)) < 1e-9);
  assert.ok(relaunched.intensity < 1);
});

test('glass group index adds the expected pulse arrival delay', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  const detector = createElement('detector', 369, 0); // front face at x=350
  traceAll([laser, detector]);
  const airArrival = detectorReading(detector.id).pulse.earliestPathDelayNs;
  const rod = createElement('glassrod', 180, 0);
  rod.params.rodlen = 60;
  rod.params.ior = 1.52;
  traceAll([laser, rod, detector]);
  const glassArrival = detectorReading(detector.id).pulse.earliestPathDelayNs;
  assert.ok(Math.abs((glassArrival - airArrival) - 60 * 0.52 / C_MM_PER_NS) < 1e-9);
});

test('every Examples/**/*.json file parses, traces, and exports without invalid geometry', async () => {
  const files = await loadExampleFiles();
  assert.ok(files.length > 0, 'at least one example file exists');
  for (const { name, path } of files) {
    const scene = parseSketch(await readFile(path, 'utf-8'), registry);
    state.elements = scene.elements;
    state.beams = scene.beams || [];
    assert.doesNotThrow(() => traceAll(state.elements, state.beams), name);
    const svg = buildSVG();
    assert.match(svg, /^<svg /, name);
    assert.doesNotMatch(svg, invalidNumber, name);
  }
});

test('speckle dot drawables are included in export bounds', () => {
  state.elements = [createElement('laser', 0, 0), createElement('diffuser', 100, 0)];
  state.beams = [];
  const svg = buildSVG();
  assert.match(svg, /<circle /);
  assert.doesNotMatch(svg, invalidNumber);
});

test('invisible blockers bound rays without appearing in the export', () => {
  state.elements = [createElement('laser', 0, 0), createElement('blocker', 1000, 0)];
  state.beams = [];
  const svg = buildSVG();
  const viewBox = svg.match(/viewBox="([^\"]+)"/)[1].split(' ').map(Number);
  assert.ok(viewBox[2] > 900, 'the ray endpoint at the blocker remains in bounds');
  assert.doesNotMatch(svg, /✂/, 'the invisible blocker itself is omitted');
});

test('long labels and probe cards are inside fitted export bounds', () => {
  const laser = createElement('laser', 0, 0);
  laser.label = 'A very long optical source label that must remain fully visible in an exported figure';
  laser.showLabel = true;
  state.elements = [laser, createElement('probe', 200, 0)];
  state.beams = [];
  const svg = buildSVG();
  const viewBox = svg.match(/viewBox="([^\"]+)"/)[1].split(' ').map(Number);
  assert.ok(viewBox[2] > 500, 'label width contributes to export bounds');
  assert.ok(viewBox[3] > 100, 'probe card height contributes to export bounds');
});

test('SVG and PNG exports reach the browser download trigger', async () => {
  state.elements = [createElement('laser', 0, 0), createElement('diffuser', 100, 0)];
  state.beams = [];
  const originals = {
    document: globalThis.document, Image: globalThis.Image, URL: globalThis.URL,
    alert: globalThis.alert, setTimeout: globalThis.setTimeout,
  };
  const downloads = [];
  const canvases = [];
  const context = { scales: [], draws: 0, scale(x, y) { this.scales.push([x, y]); }, drawImage() { this.draws++; } };
  try {
    globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };
    globalThis.setTimeout = fn => { fn(); return 0; };
    globalThis.alert = message => assert.fail(message);
    globalThis.document = {
      body: { appendChild() {} },
      createElement(tag) {
        if (tag === 'a') return { href: '', download: '', click() { downloads.push(this.download); }, remove() {} };
        if (tag === 'canvas') {
          const canvas = {
            width: 0, height: 0, getContext: () => context,
            toBlob: callback => callback(new Blob(['png'], { type: 'image/png' })),
          };
          canvases.push(canvas);
          return canvas;
        }
        throw new Error(`Unexpected element: ${tag}`);
      },
    };
    globalThis.Image = class {
      set src(_value) { queueMicrotask(() => this.onload()); }
    };

    exportSVG();
    exportPNG(3);
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(downloads, ['optical-setup.svg', 'optical-setup.png']);
    assert.equal(canvases.length, 1);
    assert.ok(canvases[0].width > 0 && canvases[0].height > 0);
    assert.deepEqual(context.scales, [[3, 3]]);
    assert.equal(context.draws, 1);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('consecutive duplicate drawing points are removed', () => {
  assert.deepEqual(distinctPoints([
    { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 5 },
  ]), [{ x: 0, y: 0 }, { x: 10, y: 5 }]);
});

test('legacy fibers with repeated end points cannot create non-finite rays', () => {
  const laser = createElement('laser', 0, 0);
  const fiber = {
    id: 'fiber', kind: 'fiber', color: '#e8a800', width: 4, propagate: true,
    pts: [{ x: 150, y: 0 }, { x: 150, y: 0 }, { x: 250, y: 0 }],
  };
  const drawables = traceAll([laser], [fiber]);
  for (const drawable of drawables) {
    for (const p of drawable.pts || drawable.dots || []) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
  }
});
