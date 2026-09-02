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


test('the interferometric behaviour needs a source the tracer can phase, and says so', () => {
  // Coherent recombination is only reconstructed for a sized monochromatic CW
  // laser. With any other source the two arms are added as intensities, so
  // both ports sit at half the light and the modulator does nothing at all --
  // which the wiki has to state, or the element looks broken on a bench that
  // happens to use a pulsed source.
  const withSource = mutate => {
    const readings = [0, 90, 180].map(depthDeg => {
      const scene = parseSketch(MZ);
      mutate(scene);
      const modulator = createElement('phasemodulator', 520, 200);
      Object.assign(modulator.params, { depthDeg, aperture: 12 });
      scene.elements.push(modulator);
      traceAll(scene.elements);
      const camera = scene.elements.filter(el => el.type === 'camera')[0];
      return detectorReading(camera.id);
    });
    return {
      signals: readings.map(r => (r ? r.signal : 0)),
      applied: readings[1]?.interference?.applied === true,
    };
  };

  // The one source that works: full swing.
  const sized = withSource(() => {});
  assert.equal(sized.applied, true);
  assert.ok(Math.abs(sized.signals[0] - 1) < 1e-4);
  assert.ok(Math.abs(sized.signals[2] - 0) < 1e-4);

  // And the ones that do not: flat at half, at every drive.
  const cases = {
    'a CW laser in Simple line mode': scene => {
      scene.elements.find(el => el.type === 'cwlaser').params.beamMode = 'line';
    },
    'a CW laser with bandwidth': scene => {
      const laser = scene.elements.find(el => el.type === 'cwlaser');
      laser.params.bwMode = 'band';
      laser.params.bandwidth = 5;
    },
    'a pulsed laser': scene => {
      const index = scene.elements.findIndex(el => el.type === 'cwlaser');
      const laser = scene.elements[index];
      const pulsed = createElement('pulsedlaser', laser.x, laser.y);
      Object.assign(pulsed.params, {
        beamMode: 'beam', beamWidth: laser.params.beamWidth, wavelength: 532, pulseWidthFs: 200,
      });
      scene.elements[index] = pulsed;
    },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const { signals, applied } = withSource(mutate);
    assert.equal(applied, false, `${label} should not reconstruct a coherent field`);
    for (const [index, signal] of signals.entries()) {
      assert.ok(Math.abs(signal - 0.5) < 1e-9,
        `with ${label}, drive ${[0, 90, 180][index]}° gave ${signal.toFixed(4)}, not a flat half`);
    }
  }
});
