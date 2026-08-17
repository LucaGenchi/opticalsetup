import test from 'node:test';
import assert from 'node:assert/strict';

import { C_MM_PER_NS, pointAtOpticalPath, pulseGateTransmission, pulseMarkers, pulseTransmissionAt } from '../sketch/js/pulses.js';

const track = {
  pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
  opls: [0, 100, 200],
  pulse: { repRateMHz: 1000, pulseWidthFs: 100, phaseNs: 0 },
};

test('optical-path interpolation crosses polyline boundaries without invalid coordinates', () => {
  assert.deepEqual(pointAtOpticalPath(track, 50), { x: 50, y: 0, angle: 0 });
  assert.deepEqual(pointAtOpticalPath(track, 150), { x: 100, y: 50, angle: 90 });
  assert.equal(pointAtOpticalPath(track, 250), null);
});

test('physical pulse markers use c times period and wrap deterministically', () => {
  const longTrack = { ...track, pts: [{ x: 0, y: 0 }, { x: 700, y: 0 }], opls: [0, 700] };
  const atZero = pulseMarkers(longTrack, 0, { mode: 'physical' });
  assert.equal(atZero.length, 3);
  assert.ok(Math.abs(atZero[1].opl - C_MM_PER_NS) < 1e-9);
  const shifted = pulseMarkers(longTrack, 0.5, { mode: 'physical' });
  assert.ok(Math.abs(shifted[0].opl - C_MM_PER_NS * 0.5) < 1e-9);
  assert.ok(shifted.every(m => Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.widthMm)));
});

test('schematic markers remain visible and bounded for extreme pulse settings', () => {
  const extreme = { ...track, pulse: { repRateMHz: 0.001, pulseWidthFs: 1e9, phaseNs: -1e6 } };
  const markers = pulseMarkers(extreme, 1e9, { mode: 'schematic' });
  assert.ok(markers.length <= 80);
  assert.ok(markers.every(m => Number.isFinite(m.x) && Number.isFinite(m.y)));
});

test('dense physical trains are sampled across the path instead of only at its far end', () => {
  const dense = {
    pts: [{ x: 0, y: 0 }, { x: 6000, y: 0 }],
    opls: [0, 6000],
    pulse: { repRateMHz: 1e6, pulseWidthFs: 1, phaseNs: 0 },
  };
  const markers = pulseMarkers(dense, 0, { mode: 'physical' });
  assert.ok(markers.length > 60 && markers.length <= 80);
  assert.ok(markers[0].opl < 100);
  assert.ok(markers.at(-1).opl > 5000);
});

test('pulse gating respects aligned and opposed gate phases', () => {
  const first = { opl: 0, frequencyMHz: 1, duty: 0.5, phaseNs: 0 };
  const aligned = { repRateMHz: 80, phaseNs: 0, gates: [first, { ...first }] };
  const opposed = { repRateMHz: 80, phaseNs: 0, gates: [first, { ...first, phaseNs: 500 }] };
  assert.ok(Math.abs(pulseGateTransmission(aligned, 800) - 0.5) < 1e-9);
  assert.equal(pulseGateTransmission(opposed, 800), 0);
});

test('sinusoidal AOM modulation grades pulse intensity instead of imposing a half-cycle blackout', () => {
  const pulse = {
    pulseWidthFs: 100,
    gates: [{ opl: 0, frequencyMHz: 1, phaseNs: 0, shape: 'sine', depth: 1 }],
  };
  assert.ok(Math.abs(pulseTransmissionAt(pulse, 0) - 1) < 1e-12);
  assert.ok(Math.abs(pulseTransmissionAt(pulse, 250) - 0.5) < 1e-12);
  assert.ok(Math.abs(pulseTransmissionAt(pulse, 500)) < 1e-12);
  assert.ok(pulseTransmissionAt(pulse, 375) > 0 && pulseTransmissionAt(pulse, 375) < 0.5);
});

test('gate averaging spans very slow allowed gate cycles', () => {
  const slowGate = {
    repRateMHz: 1e6,
    phaseNs: 0,
    gates: [{ opl: 0, frequencyMHz: 0.000001, duty: 0.5, phaseNs: 0 }],
  };
  assert.ok(Math.abs(pulseGateTransmission(slowGate) - 0.5) < 0.01);
});

test('gate averaging spans the beat period of nearly synchronized clocks', () => {
  const nearSync = {
    repRateMHz: 1,
    phaseNs: 0,
    gates: [{ opl: 0, frequencyMHz: 1.0001, duty: 0.5, phaseNs: 0 }],
  };
  assert.ok(Math.abs(pulseGateTransmission(nearSync) - 0.5) < 0.02);
});

test('finite pulse duration is clipped by a temporal gate', () => {
  const gate = { opl: 0, frequencyMHz: 1, duty: 0.5, phaseNs: 0 };
  const narrow = { repRateMHz: 1, pulseWidthFs: 100, phaseNs: 0, gates: [gate] };
  const broad = { ...narrow, pulseWidthFs: 800e6 };
  assert.equal(pulseGateTransmission(narrow), 1);
  assert.ok(Math.abs(pulseGateTransmission(broad) - 0.5) < 0.03);
});
