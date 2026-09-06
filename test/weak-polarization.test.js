import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

for (const type of ['polarizer', 'pbs']) {
  for (const sourceType of ['cwlaser', 'pulsedlaser']) {
    test(`${sourceType} retains weak ${type} transmission and blocks exact crossing`, () => {
      const laser = createElement(sourceType, 0, 0);
      Object.assign(laser.params, { beamMode: 'line', pol: 85 });
      const optic = createElement(type, 150, 0);
      const detector = createElement('detector', 300, 0);
      const reflected = createElement('detector', 150, -150);
      reflected.rot = 270;
      const scene = [laser, optic, detector, reflected];
      traceAll(scene, []);
      const expected = Math.cos(85 * Math.PI / 180) ** 2;
      assert.ok(Math.abs(detectorReading(detector.id)?.signal - expected) < 1e-9);
      if (type === 'pbs') assert.ok(Math.abs(detectorReading(reflected.id)?.signal - (1 - expected)) < 1e-9);
      laser.params.pol = 90;
      traceAll(scene, []);
      assert.ok(!detectorReading(detector.id), 'exactly crossed port remains dark');
    });
  }
}

for (const sourceType of ['cwlaser', 'pulsedlaser']) {
  for (const type of ['polarizer', 'pbs']) {
    test(`${sourceType} keeps a weak port after switching EOM and ${type}`, () => {
      const source = createElement(sourceType, 0, 0);
      Object.assign(source.params, { pol: 85, beamMode: 'line' });
      const eom = createElement('eom', 110, 0);
      Object.assign(eom.params, { modulate: true, driveMode: 'switching', switchMode: 'custom', a: 85, retardanceLow: 0, retardanceHigh: 180 });
      const optic = createElement(type, 180, 0);
      const detector = createElement('detector', 300, 0);
      traceAll([source, eom, optic, detector], []);
      assert.ok(Math.abs(detectorReading(detector.id)?.signal - Math.cos(85 * Math.PI / 180) ** 2) < 1e-8);
    });
  }
}

test('a sized beam keeps every sample through a long polarizer stack', () => {
  // Retained-weak children are charged against a source-wide budget of 256.
  // A polarizer emits exactly one child, so it continues a ray rather than
  // widening the tree -- but it takes the branching path because its output
  // carries a tag. Charging it there spent a slot per sample per stage: a
  // 25-ray beam through 16 polarizers exhausted the budget and silently
  // dropped the later samples, reporting 92% of the expected signal, and 68%
  // after 20. A line source never showed it, having only one sample to spend.
  for (const [count, mode] of [[16, 'beam'], [20, 'beam'], [20, 'line']]) {
    const source = createElement('cwlaser', 0, 0);
    Object.assign(source.params, { beamMode: mode, beamWidth: 3, pol: 0 });
    const scene = [source];
    for (let i = 0; i < count; i++) {
      const polarizer = createElement('polarizer', 80 + i * 40, 0);
      polarizer.params.pangle = 45 * (i + 1);
      scene.push(polarizer);
    }
    const detector = createElement('detector', 80 + count * 40 + 60, 0);
    detector.params.aperture = 60;
    scene.push(detector);
    traceAll(scene);

    const reading = detectorReading(detector.id);
    const expected = Math.pow(0.5, count);
    assert.ok(reading, `${mode} beam must survive ${count} polarizers`);
    assert.ok(Math.abs(reading.signal - expected) / expected < 1e-9,
      `${count} polarizers in ${mode} mode: expected ${expected}, got ${reading.signal}`);
  }
});
