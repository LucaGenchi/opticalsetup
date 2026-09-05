import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, resonantScannerAngleAt } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { elementDriveHz } from '../sketch/js/timescale.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

function reflectedDirectionAt(timeSeconds) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 780 });
  const scanner = createElement('resonantscanner', 100, 0);
  Object.assign(scanner.params, {
    centerAngle: 0,
    scanAmplitude: 2,
    resonanceFrequencyKHz: 1,
    scanPhaseDeg: 0,
  });
  scanner._animationTimeS = timeSeconds;
  const path = traceAll([laser, scanner]).find(drawable => drawable.type === 'path' && drawable.pts.length >= 3);
  assert.ok(path, 'the ray should strike and leave the resonant mirror');
  const a = path.pts.at(-2), b = path.pts.at(-1);
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

test('resonant scanner follows its mechanical sine at the configured kHz rate', () => {
  const p = { centerAngle: 3, scanAmplitude: 2, resonanceFrequencyKHz: 1, scanPhaseDeg: 0 };
  closeTo(resonantScannerAngleAt(p, 0), 3);
  closeTo(resonantScannerAngleAt(p, 0.00025), 5);
  closeTo(resonantScannerAngleAt(p, 0.0005), 3);
  closeTo(resonantScannerAngleAt(p, 0.00075), 1);
  closeTo(elementDriveHz({ type: 'resonantscanner', params: p }), 1000);
});

test('resonant scanner changes the computed reflected direction by twice its mechanical sweep', () => {
  const positive = reflectedDirectionAt(0.00025);
  const negative = reflectedDirectionAt(0.00075);
  const delta = ((positive - negative + 540) % 360) - 180;
  closeTo(Math.abs(delta), 8, 1e-7);
});

test('malformed and extreme resonant inputs normalize to finite bounded values', () => {
  const raw = {
    app: 'optics2d', version: 1, beams: [], elements: [{
      id: 'scanner', type: 'resonantscanner', x: 0, y: 0, rot: 0,
      params: {
        length: Infinity, centerAngle: 999, scanAmplitude: -4,
        resonanceFrequencyKHz: 0, usableFraction: 9, scanPhaseDeg: NaN,
      },
    }],
  };
  const scanner = parseSketch(JSON.stringify(raw), registry).elements[0];
  assert.equal(scanner.params.centerAngle, 30);
  assert.equal(scanner.params.scanAmplitude, 0);
  assert.equal(scanner.params.resonanceFrequencyKHz, 0.1);
  assert.equal(scanner.params.usableFraction, 1);
  assert.ok(Number.isFinite(resonantScannerAngleAt(scanner.params, Infinity)));
});
