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
