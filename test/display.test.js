import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, displayCableSVG, getElementMeta, registry, resolveDisplaySensor,
} from '../sketch/js/elements.js';
import { buildSVG } from '../sketch/js/export.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { state } from '../sketch/js/state.js';

const invalidNumber = /(?:NaN|undefined|Infinity)/;

test('sensor display resolves only a linked detector and draws a finite data cable', () => {
  const detector = createElement('detector', 300, 0);
  detector.label = 'Transmission PD';
  const display = createElement('display', 420, 90);
  display.params.sensorId = detector.id;
  const elements = [detector, display];

  assert.equal(resolveDisplaySensor(display, elements), detector);
  assert.equal(registry.display.surfaces(display).length, 0, 'the display must not interact with rays');
  const cable = displayCableSVG(display, elements);
  assert.match(cable, new RegExp(`data-sensor-link="${detector.id}"`));
  assert.doesNotMatch(cable, invalidNumber);

  display.params.sensorId = display.id;
  assert.equal(resolveDisplaySensor(display, elements), null);
  assert.equal(displayCableSVG(display, elements), '');
});

test('sensor display mirrors live photodetector output and handles a missing signal', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.wavelength = 532;
  const detector = createElement('detector', 300, 0);
  detector.label = 'Sample PD';
  const display = createElement('display', 390, 80);
  display.params.sensorId = detector.id;
  const elements = [laser, detector, display];

  traceAll(elements);
  assert.equal(detectorReading(detector.id).signal, 1);
  const active = registry.display.svg(display, elements);
  assert.match(active, /SAMPLE PD/);
  assert.match(active, /100% rel\./);
  assert.match(active, /532 nm/);
  assert.doesNotMatch(active, invalidNumber);

  laser.y = 80;
  traceAll(elements);
  const idle = registry.display.svg(display, elements);
  assert.match(idle, /NO SIGNAL/);
  assert.match(idle, /0 relative ray weight/);
});

test('sensor display renders a linked camera profile and reports connection state honestly', () => {
  const laser = createElement('laser', 0, 0);
  const camera = createElement('camera', 300, 0);
  camera.params.pixels = 12;
  const display = createElement('display', 420, 80);

  assert.equal(getElementMeta('display', display.params).tier, 'configurable');
  assert.match(registry.display.svg(display, [laser, camera, display]), /UNPLUGGED/);

  display.params.sensorId = camera.id;
  traceAll([laser, camera, display]);
  const linked = registry.display.svg(display, [laser, camera, display]);
  assert.equal(getElementMeta('display', display.params).tier, 'simulated');
  assert.match(linked, /CAMERA/);
  assert.match(linked, /<rect x="-33/);

  display.params.sensorId = 'removed-sensor';
  assert.match(registry.display.svg(display, [display]), /LINK LOST/);
  assert.equal(getElementMeta('display', display.params, { element: display, elements: [display] }).tier, 'configurable');
});

test('sensor display and its data cable are preserved in deterministic SVG export', () => {
  const laser = createElement('laser', 0, 0);
  const detector = createElement('detector', 300, 0);
  const display = createElement('display', 390, 80);
  display.params.sensorId = detector.id;
  state.elements = [laser, detector, display];
  state.beams = [];

  const svg = buildSVG();
  assert.match(svg, new RegExp(`data-sensor-link="${detector.id}"`));
  assert.match(svg, /100% rel\./);
  assert.match(svg, /SENSOR DISPLAY/);
  assert.doesNotMatch(svg, invalidNumber);
});
