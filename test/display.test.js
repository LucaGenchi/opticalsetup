import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  cameraProfileSVG, cameraReadingState, createElement, displayActionUpdate, displayCableSVG, displayDensity, getElementMeta, getSize, registry,
  resolveDisplaySensor,
} from '../sketch/js/elements.js';
import { buildSVG } from '../sketch/js/export.js';
import { initInspector, renderInspector } from '../sketch/js/inspector.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';

const invalidNumber = /(?:NaN|undefined|Infinity)/;

function inspectorHTMLFor(sensor, elements) {
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  state.elements = elements;
  state.beams = [];
  state.selection = { kind: 'element', id: sensor.id };
  state.demoMode = false;
  initInspector(panel);
  renderInspector();
  return panel.innerHTML;
}

function machZehnderScene() {
  const fixture = new URL('../Examples/Optics%20Bench/Mach%E2%80%93Zehnder%20interferometer.json', import.meta.url);
  return parseSketch(readFileSync(fixture, 'utf8'), registry);
}

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
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
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
  assert.match(active, />1\.00</);
  assert.match(active, />Σw</);
  assert.match(active, /λ532 nm/);
  assert.doesNotMatch(active, /% rel\./);
  assert.doesNotMatch(active, invalidNumber);

  laser.y = 80;
  traceAll(elements);
  const idle = registry.display.svg(display, elements);
  assert.match(idle, /NO SIGNAL/);
  assert.match(idle, /Σw 0\.00/);
});

test('sensor display renders a linked camera profile and reports connection state honestly', () => {
  const laser = createElement('cwlaser', 0, 0);
  const camera = createElement('camera', 300, 0);
  camera.params.pixels = 12;
  const display = createElement('display', 420, 80);

  assert.equal(getElementMeta('display', display.params).tier, 'configurable');
  assert.match(registry.display.svg(display, [laser, camera, display]), /SELECT INPUT/);

  display.params.sensorId = camera.id;
  traceAll([laser, camera, display]);
  const linked = registry.display.svg(display, [laser, camera, display]);
  assert.equal(getElementMeta('display', display.params).tier, 'simulated');
  assert.match(linked, /CAMERA/);
  assert.match(linked, /data-camera-profile-curve/);
  assert.match(linked, /data-camera-profile-fill/);
  assert.doesNotMatch(linked, /data-profile-bin=|data-camera-pixel=/);

  display.params.sensorId = 'removed-sensor';
  assert.match(registry.display.svg(display, [display]), /LINK LOST/);
  assert.equal(getElementMeta('display', display.params, { element: display, elements: [display] }).tier, 'configurable');
});

test('sensor display adapts information density and exposes direct instrument controls', () => {
  const laser = createElement('cwlaser', 0, 0);
  const camera = createElement('camera', 300, 0);
  const display = createElement('display', 420, 80);
  display.params.sensorId = camera.id;
  traceAll([laser, camera, display]);

  // The exposed "Display scale" range (0.25–1.5) is deliberately an octave
  // below the 0.5–3 range displayDensity()'s thresholds are tuned against —
  // every raw value is doubled before it drives rendered size or density
  // (see displayRenderScale()), so the default (1) renders at what used to
  // require manually dialing the old control up to 2.
  display.params.displayScale = 0.3; // effective 0.6 -> compact
  const compact = registry.display.svg(display, [laser, camera, display]);
  assert.match(compact, /data-display-density="compact"/);
  assert.match(compact, /data-display-action="power"/);
  assert.match(compact, /data-display-action="input"/);
  assert.match(compact, /data-display-action="view"/);

  display.params.displayScale = 0.6; // effective 1.2 -> standard
  assert.match(registry.display.svg(display, [laser, camera, display]), /data-display-density="standard"/);
  display.params.displayScale = 1.5; // effective 3.0 (max) -> expanded
  const expanded = registry.display.svg(display, [laser, camera, display]);
  assert.match(expanded, /data-display-density="expanded"/);
  assert.match(expanded, /\+½ sensor/);

  assert.equal(displayDensity(0.5), 'compact');
  assert.equal(displayDensity(1), 'standard');
  assert.equal(displayDensity(3), 'expanded');
});

test('a new sensor display defaults to twice the old baseline size', () => {
  const display = createElement('display', 0, 0);
  assert.equal(display.params.displayScale, 1);
  assert.deepEqual(getSize(display), { w: 196, h: 144 }); // 98x72 * 2
  assert.match(registry.display.svg(display, [display]), /<g transform="scale\(2\)"/);
});

test('display buttons cycle power, view, and available sensor inputs without inspector state', () => {
  const detector = createElement('detector', 200, 0);
  detector.label = 'Reference PD';
  const camera = createElement('camera', 300, 0);
  const display = createElement('display', 420, 80);
  const elements = [detector, camera, display];

  let action = displayActionUpdate(display, 'input', elements);
  assert.deepEqual(action.updates, { sensorId: detector.id });
  Object.assign(display.params, action.updates);
  action = displayActionUpdate(display, 'input', elements);
  assert.deepEqual(action.updates, { sensorId: camera.id });
  Object.assign(display.params, action.updates);
  action = displayActionUpdate(display, 'input', elements);
  assert.deepEqual(action.updates, { sensorId: '' });

  action = displayActionUpdate(display, 'view', elements);
  assert.deepEqual(action.updates, { displayView: 'spectrum' });
  Object.assign(display.params, action.updates);
  action = displayActionUpdate(display, 'view', elements);
  assert.deepEqual(action.updates, { displayView: 'detail' });

  action = displayActionUpdate(display, 'power', elements);
  assert.deepEqual(action.updates, { screenOn: false });
  Object.assign(display.params, action.updates);
  assert.match(registry.display.svg(display, elements), /STANDBY/);
});

test('camera reading retains wavelength composition while the display renders one continuous trace', () => {
  const green = createElement('cwlaser', 0, -20);
  green.params.wavelength = 532;
  const red = createElement('cwlaser', 0, 20);
  red.params.wavelength = 650;
  const camera = createElement('camera', 300, 0);
  camera.params.ch = 100;
  camera.params.pixels = 8;
  const display = createElement('display', 420, 80);
  display.params.sensorId = camera.id;
  const elements = [green, red, camera, display];

  traceAll(elements);
  const reading = detectorReading(camera.id);
  const occupied = reading.profile.map((value, index) => value > 1e-12 ? index : -1).filter(index => index >= 0);
  const colors = occupied.map(index => reading.profileColors[index]);
  assert.equal(reading.spectrum.length, 2);
  assert.equal(new Set(colors).size, 2, 'green and red hits should not collapse to one overall camera color');

  const svg = registry.display.svg(display, elements);
  assert.equal((svg.match(/data-camera-profile-curve/g) || []).length, 1);
  assert.equal((svg.match(/data-camera-profile-fill/g) || []).length, 1);
  assert.doesNotMatch(svg, /data-profile-bin=|data-camera-pixel=/);
  assert.doesNotMatch(svg, /% rel\./);
});

test('a coherently cancelled camera is an empty measurement on its display and in the inspector', () => {
  const scene = machZehnderScene();
  traceAll(scene.elements);
  const camera = scene.elements.find(element => element.type === 'camera' && detectorReading(element.id)?.dark);
  assert.ok(camera, 'the authored interferometer should expose one dark output camera');
  const reading = detectorReading(camera.id);
  assert.equal(cameraReadingState(reading).kind, 'cancellation');

  const display = scene.elements.find(element => element.type === 'display' && element.params.sensorId === camera.id);
  assert.ok(display);
  display.params.displayScale = 0.6;
  for (const view of ['main', 'detail']) {
    display.params.displayView = view;
    const svg = registry.display.svg(display, scene.elements);
    assert.match(svg, /COHERENT CANCELLATION/);
    assert.doesNotMatch(svg, /BEAM Ø|POINT HIT|No detected field|λ0 nm/);
  }

  display.params.displayView = 'spectrum';
  const spectrum = registry.display.svg(display, scene.elements);
  assert.match(spectrum, /data-spectrum-points="0"/);
  assert.match(spectrum, /COHERENT CANCELLATION/);
  assert.doesNotMatch(spectrum, /data-spectrum-sample=/);

  const inspector = inspectorHTMLFor(camera, scene.elements);
  assert.match(inspector, /Coherent cancellation/);
  assert.match(inspector, /Exact coherent cancellation leaves an empty sensor profile/);
  assert.doesNotMatch(inspector, /Receiving light|<dt>Spectrum<|<dt>Polarization<|<dt>Spot span</);
});

test('phase-unavailable and partial camera states are concise while ordinary deposition stays quiet', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 6;
  const lens = createElement('lens', 180, 0);
  lens.params.f = 300;
  const camera = createElement('camera', 300, 0);
  const display = createElement('display', 420, 80);
  display.params.sensorId = camera.id;
  const elements = [laser, lens, camera, display];
  traceAll(elements);

  const unavailable = cameraReadingState(detectorReading(camera.id));
  assert.equal(unavailable.kind, 'phase-unavailable');
  assert.equal(unavailable.displayStatus, 'PHASE UNAVAILABLE');
  assert.equal(unavailable.reason, 'Carrier phase is not modeled through lens.');
  assert.match(registry.display.svg(display, elements), /PHASE UNAVAILABLE/);
  display.params.displayScale = 0.3;
  display.params.displayView = 'detail';
  assert.match(registry.display.svg(display, elements), /PHASE UNAVAILABLE/,
    'the compact display must retain the phase state in every view');
  const unavailableInspector = inspectorHTMLFor(camera, elements);
  assert.match(unavailableInspector, /Deposited · phase unavailable/);
  assert.match(unavailableInspector, /Carrier phase is not modeled through lens\./);
  assert.doesNotMatch(unavailableInspector, /excludedHits|fallbackReason/);

  const partial = cameraReadingState({
    profileMode: 'coherent',
    coherentPaths: 2,
    interference: {
      applied: true,
      partial: true,
      pathCount: 2,
      phaseIssues: ['carrier phase is not modeled through lens'],
      fallbackReason: null,
    },
  });
  assert.equal(partial.kind, 'partial');
  assert.equal(partial.displayStatus, 'PHASE UNAVAILABLE');
  assert.equal(partial.badge, 'PARTIAL');
  assert.match(partial.label, /^Partial/);

  traceAll([laser, camera, display]);
  const ordinary = cameraReadingState(detectorReading(camera.id));
  assert.equal(ordinary.kind, 'deposited');
  assert.equal(ordinary.label, '');
  const ordinaryDisplay = registry.display.svg(display, [laser, camera, display]);
  const ordinaryInspector = inspectorHTMLFor(camera, [laser, camera, display]);
  assert.doesNotMatch(ordinaryDisplay + ordinaryInspector, /PHASE UNAVAILABLE|PARTIAL/);
});

test('camera profile renderer preserves sampled extrema without bar artifacts or non-finite SVG', () => {
  const svg = cameraProfileSVG({
    profile: [0, 1, Number.NaN, 1, 0],
    profileMode: 'coherent',
    color: '#22c55e',
  }, { x: 0, width: 100, baseline: 30, height: 24 });

  assert.match(svg, /data-camera-profile="coherent"/);
  assert.equal((svg.match(/data-camera-profile-curve/g) || []).length, 1);
  assert.equal((svg.match(/data-camera-profile-fill/g) || []).length, 1);
  assert.doesNotMatch(svg, /<rect|data-profile-bin=/);
  assert.doesNotMatch(svg, invalidNumber);
  assert.match(svg, /M 0\.00,30\.00 L 0\.00,30\.00 L 10\.00,30\.00 L 30\.00,6\.00 L 50\.00,30\.00/,
    'piecewise-linear path must pass through the measured dark and bright pixels');
});

test('a long sensor name never shares a text baseline with the readout mode label', () => {
  const laser = createElement('cwlaser', 0, 0);
  const detector = createElement('detector', 300, 0);
  detector.label = ''; // falls back to the registry label, "Photodetector"
  const display = createElement('display', 420, 0);
  display.params.sensorId = detector.id;
  const elements = [laser, detector, display];

  traceAll(elements);
  const svg = registry.display.svg(display, elements);
  const ys = [...svg.matchAll(/<text x="-36" y="(-?[\d.]+)"[^>]*>(PHOTODETECTOR|REL SIGNAL)</g)]
    .map(m => Number(m[1]));
  assert.equal(ys.length, 2, 'both the sensor name and the mode label should render');
  assert.notEqual(ys[0], ys[1], 'the name and mode label must sit on different lines, not one shared baseline');
});

test('elliptical polarization is abbreviated, not truncated, in the sensor display', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.pol = 0;
  const qwp = createElement('qwp', 150, 0);
  qwp.params.a = 100;
  const detector = createElement('detector', 300, 0);
  const display = createElement('display', 420, 0);
  display.params.sensorId = detector.id;
  const elements = [laser, qwp, detector, display];

  traceAll(elements);
  const reading = detectorReading(detector.id);
  assert.match(reading.polarization, /^Elliptical \d+°$/);

  const svg = registry.display.svg(display, elements);
  assert.match(svg, /ELLIP \d+°/, 'the degree value should survive abbreviation, not be cut off mid-number');
  assert.doesNotMatch(svg, />ELLIP\s*</, 'the abbreviated label must not drop the angle entirely');
});

test('sensor display and its data cable are preserved in deterministic SVG export', () => {
  const laser = createElement('cwlaser', 0, 0);
  const detector = createElement('detector', 300, 0);
  const display = createElement('display', 390, 80);
  display.params.sensorId = detector.id;
  state.elements = [laser, detector, display];
  state.beams = [];

  const svg = buildSVG();
  assert.match(svg, new RegExp(`data-sensor-link="${detector.id}"`));
  assert.match(svg, />1\.00</);
  assert.match(svg, />Σw</);
  assert.match(svg, /data-display-action="power"/);
  assert.doesNotMatch(svg, invalidNumber);
});
