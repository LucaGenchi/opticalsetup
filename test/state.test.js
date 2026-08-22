import test from 'node:test';
import assert from 'node:assert/strict';

import { registry, createElement } from '../sketch/js/elements.js';
import {
  state, changed, parseSketch, deserialize, replaceScene, pushUndo, undo, redo, canUndo, canRedo,
} from '../sketch/js/state.js';

const file = (elements = [], beams = []) => JSON.stringify({ app: 'optics2d', version: 1, elements, beams });

test('sketch loading fills defaults and normalizes unsafe values', () => {
  const raw = createElement('pulsedlaser', 10, 20);
  raw.rot = -90;
  raw.params = {
    wavelength: 99, beamWidth: 999, color: 'red', temporalMode: 'pulsed',
    repRateMHz: 1e12, pulseWidthFs: 0, pulsePhaseNs: 1e12,
  };
  const scene = parseSketch(file([raw], [{
    id: 'fiber', kind: 'fiber', pts: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }],
    width: 99, color: 'invalid', out0: { mode: 'focus', na: 2, focal: 1, dia: 99 },
  }]), registry);

  const laser = scene.elements[0];
  assert.equal(laser.rot, 270);
  assert.equal(laser.params.wavelength, 100);
  assert.equal(laser.params.beamWidth, 60);
  assert.equal(laser.params.color, '#e02020');
  assert.equal(laser.params.autoColor, true);
  assert.equal(laser.params.temporalMode, 'pulsed');
  assert.equal(laser.params.repRateMHz, 1000000);
  assert.equal(laser.params.pulseWidthFs, 1);
  assert.equal(laser.params.pulsePhaseNs, 1000000);

  const fiber = scene.beams[0];
  assert.deepEqual(fiber.pts, [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  assert.equal(fiber.width, 20);
  assert.equal(fiber.color, '#e8a800');
  assert.equal(fiber.inputNA, 0.22);
  assert.equal(fiber.groupIndex, 1.468);
  assert.equal(fiber.lossDbPerM, 0.2);
  assert.deepEqual(fiber.out0, { mode: 'focus', na: 0.95, focal: 2, dia: 30 });
});

test('sketch loading rejects data that would crash the canvas', () => {
  assert.throws(() => parseSketch('{', registry), SyntaxError);
  assert.throws(() => parseSketch(JSON.stringify({ elements: 'nope' }), registry), /valid optics sketch/);
  assert.throws(() => parseSketch(file([{ type: 'unknown', x: 0, y: 0, params: {} }]), registry), /unknown element/);
  assert.throws(() => parseSketch(file([{ type: '__proto__', x: 0, y: 0, params: {} }]), registry), /unknown element/);
  assert.throws(() => parseSketch(file([{ type: 'laser', x: null, y: 0, params: {} }]), registry), /invalid coordinates/);
  assert.throws(() => parseSketch(file([], [{ kind: 'fiber', pts: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }])), /distinct points/);
  assert.throws(() => parseSketch(JSON.stringify({ app: 'optics2d', version: 2, elements: [] }), registry), /Unsupported sketch version/);
});

// ---------------- legacy `laser` -> three source types ----------------
// Sketches saved before the split — including every shared link, which encodes
// the whole scene in a URL — still name the old all-in-one `laser` type.

test('a legacy continuous-wave laser loads as the CW source', () => {
  const raw = { type: 'laser', x: 0, y: 0, params: { wavelength: 633, avgPowerW: 0.5, beamWidth: 4 } };
  const [loaded] = parseSketch(file([raw]), registry).elements;
  assert.equal(loaded.type, 'cwlaser');
  assert.equal(loaded.params.temporalMode, 'cw');
  assert.equal(loaded.params.wavelength, 633);
  assert.equal(loaded.params.avgPowerW, 0.5);
  assert.equal(loaded.params.beamWidth, 4);
});

test('a legacy pulsed laser loads as the pulsed source, keeping its own spectral width', () => {
  const band = { type: 'laser', x: 0, y: 0, params: { temporalMode: 'pulsed', bwMode: 'band', bandwidth: 40, pulseWidthFs: 120 } };
  const [loadedBand] = parseSketch(file([band]), registry).elements;
  assert.equal(loadedBand.type, 'pulsedlaser');
  assert.equal(loadedBand.params.transformLimited, false, 'the old default was off');
  assert.equal(loadedBand.params.bandwidth, 40);
  assert.equal(loadedBand.params.pulseWidthFs, 120);

  // A monochromatic pulsed laser still stored an unused bandwidth alongside
  // bwMode:'mono'. Folding bwMode in is what stops that stale number from
  // suddenly counting against a source that now always honours bandwidth.
  const mono = { type: 'laser', x: 0, y: 0, params: { temporalMode: 'pulsed', bwMode: 'mono', bandwidth: 40 } };
  const [loadedMono] = parseSketch(file([mono]), registry).elements;
  assert.equal(loadedMono.type, 'pulsedlaser');
  assert.equal(loadedMono.params.bandwidth, 0);
});

test('a legacy laser set to supercontinuum loads as the SC source with the band it used to trace', () => {
  const raw = { type: 'laser', x: 0, y: 0, params: { bwMode: 'sc', temporalMode: 'pulsed' } };
  const [loaded] = parseSketch(file([raw]), registry).elements;
  assert.equal(loaded.type, 'sclaser');
  assert.equal(loaded.params.scMin, 430);
  assert.equal(loaded.params.scMax, 870);
});

test('legacy lasers without any temporal fields remain continuous-wave sources', () => {
  const raw = { type: 'laser', x: 0, y: 0, params: { wavelength: 532 } };
  const [loaded] = parseSketch(file([raw]), registry).elements;
  assert.equal(loaded.type, 'cwlaser');
  assert.equal(loaded.params.temporalMode, 'cw');
});

test('legacy objective focal lengths migrate to magnification and numerical aperture', () => {
  const objective = createElement('objective', 100, 0);
  objective.params = { f: 20, aperture: 24, transEff: 90 };

  const scene = parseSketch(file([objective]), registry);
  const [loadedObjective] = scene.elements;
  assert.deepEqual(loadedObjective.params, {
    efl: 20,
    workingDistance: 20,
    immersion: 'air',
    immersionIndex: 1.333,
    na: 0.6,
    showAcceptance: false,
    transEff: 90,
    frontAperture: 24,
  });
  assert.equal(registry.objective.surfaces(loadedObjective)[0].data.f, 20);
  assert.equal(Object.hasOwn(loadedObjective.params, 'f'), false);
  assert.equal(Object.hasOwn(loadedObjective.params, 'aperture'), false);
});

test('objective medium and NA normalize together while unresolved old high-NA scenes remain honest', () => {
  const water = createElement('objective', 0, 0);
  water.params = { magnification: 20, immersion: 'water', na: 1.4, transEff: 90 };
  const oldHighNA = createElement('objective', 50, 0);
  oldHighNA.params = { magnification: 60, na: 1.4, transEff: 95 };

  const [loadedWater, loadedLegacy] = parseSketch(file([water, oldHighNA]), registry).elements;
  assert.equal(loadedWater.params.immersion, 'water');
  assert.equal(loadedWater.params.na, 1.27);
  assert.equal(loadedLegacy.params.immersion, 'legacy');
  assert.equal(loadedLegacy.params.na, 1.4);
});

test('sketches from before the LED/lamp -> Point source merge no longer load', () => {
  // No back-compat is kept at this stage: an old element type is simply an
  // unknown type, same as any other invalid sketch reference.
  assert.throws(() => parseSketch(file([{ type: 'led', x: 0, y: 0, params: {} }]), registry), /unknown element/);
  assert.throws(() => parseSketch(file([{ type: 'lamp', x: 0, y: 0, params: {} }]), registry), /unknown element/);
});

test('duplicate object ids are repaired during import', () => {
  const a = createElement('cwlaser', 0, 0);
  const b = createElement('lens', 100, 0);
  b.id = a.id;
  const scene = parseSketch(file([a, b]), registry);
  assert.notEqual(scene.elements[0].id, scene.elements[1].id);
});

test('sensor display links survive save loading while malformed ids are bounded', () => {
  const detector = createElement('detector', 100, 0);
  const display = createElement('display', 200, 50);
  display.params.sensorId = detector.id;
  delete display.params.screenOn;
  delete display.params.displayView;
  let scene = parseSketch(file([detector, display]), registry);
  assert.equal(scene.elements[1].params.sensorId, detector.id);
  assert.equal(scene.elements[1].params.screenOn, true);
  assert.equal(scene.elements[1].params.displayView, 'main');

  display.params.sensorId = 'x'.repeat(500);
  scene = parseSketch(file([detector, display]), registry);
  assert.equal(scene.elements[1].params.sensorId.length, 128);

  display.params.sensorId = { unsafe: true };
  scene = parseSketch(file([detector, display]), registry);
  assert.equal(scene.elements[1].params.sensorId, '');
});

test('legacy camera rows are discarded and coherent interference defaults on', () => {
  const camera = createElement('camera', 100, 0);
  delete camera.params.interference;
  camera.params.rows = 24;

  let scene = parseSketch(file([camera]), registry);
  assert.equal(scene.elements[0].params.interference, true);
  assert.equal(Object.hasOwn(scene.elements[0].params, 'rows'), false);
  assert.equal(scene.elements[0].params.pixels, 24);

  camera.params.interference = false;
  scene = parseSketch(file([camera]), registry);
  assert.equal(scene.elements[0].params.interference, false);
});

test('pre-checkbox sample mode strings fall back to current schema defaults', () => {
  // No migration is kept at this stage: 'trans'/'block' aren't valid `mode`
  // options anymore, so they're treated like any other invalid enum value.
  const sample = createElement('sample', 0, 0);
  sample.params = { mode: 'block' };
  const stage = createElement('stage', 20, 0);
  stage.params = { mode: 'trans' };
  const scene = parseSketch(file([sample, stage]), registry);
  assert.deepEqual(scene.elements.map(el => [el.params.mode, el.params.transmitExc, el.params.transmission]), [
    ['none', true, 0.8], ['none', true, 0.8],
  ]);
});

test('DMD no longer accepts the superseded layer-based shaping fields', () => {
  const dmd = createElement('dmd', 100, 0);
  dmd.params = {
    length: 40,
    zeroOrder: true,
    zeroFrac: 0.25,
    layers: [{ type: 'steer', angle: 8 }],
  };
  const [loaded] = parseSketch(file([dmd]), registry).elements;
  assert.equal(Object.hasOwn(loaded.params, 'zeroOrder'), false);
  assert.equal(Object.hasOwn(loaded.params, 'layers'), false);
  const data = registry.dmd.surfaces(loaded)[0].data;
  assert.equal(data.length, 40);
  assert.equal(Object.hasOwn(data, 'layers'), false);
});

test('scene replacement remains undoable when requested by the caller', () => {
  const first = { elements: [createElement('cwlaser', 0, 0)], beams: [] };
  const second = { elements: [createElement('lens', 100, 0)], beams: [] };
  deserialize(file(first.elements), { definitions: registry, resetHistory: true });
  assert.equal(canUndo(), false);
  pushUndo();
  replaceScene(second);
  assert.equal(canUndo(), true);
  undo();
  assert.equal(state.elements[0].type, 'cwlaser');
  assert.equal(canRedo(), true);
  redo();
  assert.equal(state.elements[0].type, 'lens');
});

test('interactive demo edits never replace the workbench autosave', () => {
  const previousStorage = globalThis.localStorage;
  const writes = [];
  globalThis.localStorage = { setItem: (...args) => writes.push(args) };
  try {
    state.demoMode = true;
    changed();
    assert.equal(writes.length, 0);

    state.demoMode = false;
    changed();
    assert.equal(writes.length, 1, 'normal workbench edits still autosave');
  } finally {
    state.demoMode = false;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
