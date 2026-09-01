import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import {
  phaseModulatorDrive, phaseModulatorOpdMm, phaseModulatorPeakOpdMm,
} from '../sketch/js/electro-optic.js';

const MZ = readFileSync('Examples/Optics Bench/Mach–Zehnder interferometer.json', 'utf8');

// The modulator dropped into one arm of the bundled interferometer.
function inOneArm(params, simulationTimeNs = null) {
  const scene = parseSketch(MZ);
  const modulator = createElement('phasemodulator', 520, 200);
  Object.assign(modulator.params, { aperture: 12, ...params });
  if (simulationTimeNs !== null) modulator._simulationTimeNs = simulationTimeNs;
  scene.elements.push(modulator);
  traceAll(scene.elements);
  return scene.elements
    .filter(el => el.type === 'camera')
    .map(camera => detectorReading(camera.id).signal);
}

test('a phase modulator is invisible on its own, whatever it is driven to', () => {
  // It writes phase and nothing else: no absorption, no deflection, no
  // polarization change. A detector staring straight at it sees no difference.
  for (const depthDeg of [0, 90, 180, 360, -270]) {
    const laser = createElement('cwlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'beam', beamWidth: 8 });
    const modulator = createElement('phasemodulator', 150, 0);
    Object.assign(modulator.params, { depthDeg, aperture: 12 });
    const detector = createElement('detector', 300, 0);
    detector.params.aperture = 30;
    traceAll([laser, modulator, detector]);
    assert.ok(Math.abs(detectorReading(detector.id).signal - 1) < 1e-9,
      `a ${depthDeg}° drive changed the intensity on its own`);
  }
});

test('in one arm of an interferometer it is a full-depth amplitude modulator', () => {
  // This is the Mach-Zehnder modulator: phase in one arm, read out as
  // intensity at the output. The transfer function is cos²(Δφ/2).
  for (const [depthDeg, expected] of [[0, 1], [45, 0.853553], [90, 0.5], [135, 0.146447], [180, 0]]) {
    const [bright, dark] = inOneArm({ depthDeg });
    assert.ok(Math.abs(bright - expected) < 1e-4,
      `a ${depthDeg}° drive gave ${bright.toFixed(6)}, expected cos²(Δφ/2) = ${expected}`);
    assert.ok(Math.abs(bright + dark - 1) < 1e-9, 'the two ports must still sum to the input');
  }
  // A full wave of drive brings it back to where it started.
  assert.ok(Math.abs(inOneArm({ depthDeg: 360 })[0] - 1) < 1e-4);
});

test('a driven modulator modulates on the simulation clock', () => {
  // 180° peak depth at 1 MHz: one period is 1000 ns, and a sine drive starts
  // at zero, so the output starts bright.
  const at = ns => inOneArm({ depthDeg: 180, driveMode: 'sine', freqMHz: 1 }, ns)[0];
  assert.ok(Math.abs(at(0) - 1) < 1e-4, 'a sine drive starts at zero phase');
  assert.ok(Math.abs(at(250) - 0) < 1e-4, 'a quarter period in, full drive, fully dark');
  assert.ok(Math.abs(at(500) - 1) < 1e-4, 'back through zero');
  assert.ok(Math.abs(at(750) - 0) < 1e-4, 'and dark again on the negative swing');
});

test('the drive waveforms are the waveforms they claim to be', () => {
  const params = { driveMode: 'sine', freqMHz: 1 };
  assert.ok(Math.abs(phaseModulatorDrive(params, 0)) < 1e-12);
  assert.ok(Math.abs(phaseModulatorDrive(params, 250e-9) - 1) < 1e-9);
  assert.ok(Math.abs(phaseModulatorDrive(params, 750e-9) + 1) < 1e-9);

  const square = { driveMode: 'square', freqMHz: 1 };
  assert.equal(phaseModulatorDrive(square, 100e-9), 1);
  assert.equal(phaseModulatorDrive(square, 600e-9), -1);

  // A static drive holds full depth rather than sitting at zero.
  assert.equal(phaseModulatorDrive({ driveMode: 'static' }, 12345), 1);
});

test('the crystal writes a fixed path, so the phase it makes scales with 1/λ', () => {
  // A Pockels cell fixes Δn·L, not the phase. A modulator calibrated for a
  // half wave at 532 nm writes only a quarter wave at 1064 nm.
  const params = { depthDeg: 180, designWavelength: 532 };
  const peakMm = phaseModulatorPeakOpdMm(params);
  assert.ok(Math.abs(peakMm - 532e-6 / 2) < 1e-12, 'half a wave of path at the design wavelength');
  const wavesAt = wl => peakMm / (wl * 1e-6);
  assert.ok(Math.abs(wavesAt(532) - 0.5) < 1e-9);
  assert.ok(Math.abs(wavesAt(1064) - 0.25) < 1e-9, 'half the phase at twice the wavelength');
  // And the path itself does not depend on the wavelength being used.
  assert.equal(phaseModulatorOpdMm(params, 0), peakMm);
});

test('the modulator keeps the arm coherent rather than falling back', () => {
  const scene = parseSketch(MZ);
  const modulator = createElement('phasemodulator', 520, 200);
  Object.assign(modulator.params, { depthDeg: 90, aperture: 12 });
  scene.elements.push(modulator);
  traceAll(scene.elements);
  const camera = scene.elements.filter(el => el.type === 'camera')[0];
  const reading = detectorReading(camera.id);
  assert.equal(reading.interference?.applied, true);
  assert.deepEqual(reading.interference.phaseIssues, [],
    'a uniform phase must not break the carrier the recombination needs');
});

test('it sits with the electro-optic family in the palette', () => {
  assert.equal(registry.phasemodulator.category, 'Modulators');
  assert.equal(registry.phasemodulator.paletteGroup, 'Electro-optic');
  assert.ok(registry.phasemodulator.paletteOrder > registry.eom.paletteOrder);
});
