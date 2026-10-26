// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { glassAbbe, glassGVD, glassGroupDelayDifferenceFs, glassGroupIndex, glassIndex, gaussianPulseDurationAfterGDD, sech2PulseDurationAfterGDD, AUTOCORRELATION_FACTORS } from '../sketch/js/glass.js';
import { transformLimitedBandwidthNm } from '../sketch/js/spectrum.js';
import { hollowCoreCoefficients, marcatiliLossDbPerM } from '../sketch/js/fiber.js';
import { propagateEnvelope, fieldMetrics } from '../sketch/js/pulse-field.js';
import { createElement, estimatedThinLensThicknessMm, thickLensCardinals } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { analyzerTransmission, linearStokes, retarder } from '../sketch/js/polarization.js';
import { finesseForReflectivity, reflectivityForFinesse } from '../sketch/js/etalon.js';
import { parametricGainCoefficient, parametricPair, parametricSmallSignalGain } from '../sketch/js/parametric.js';
import { allocateParametricAmplifier } from '../sketch/js/parametric-amplifier.js';
import { spectralFieldResult } from '../sketch/js/spectral-coherence.js';
import { coupledWaveConversion } from '../calculators/opa/coupled-wave.js';
import { fresnelTransmittances, throughFace } from '../sketch/js/fresnel.js';
import { materialDispersion, materialAbbe } from '../calculators/dispersion/materials.js';
import { DISPERSION_DEFAULTS, computeDispersion } from '../calculators/dispersion/dispersion-calculator.js';
import { CONVERSION_DEFAULTS, computeConversion } from '../calculators/nonlinear-conversion/conversion-calculator.js';
import { CRS_DEFAULTS, computeCrs, RESOLUTION_DEFAULTS, computeResolution } from '../calculators/coherent-raman/crs-calculator.js';
import {
  absorptionCrossSectionCm2, focusPeakIntensityWcm2, widefieldIntensityWcm2, moleculeRates, collectionFraction,
  spectrumValue, detectionFractions, detectorQe, excitationSource, sourceAverage, sourceTransmission,
  pulsedMoleculeRates, twoPhotonPulsedRates, notchMinimumWidthNm, focusSpectralFactor,
} from '../sketch/js/fluorescence.js';

// The quantitative models listed in docs/validation.md are checked against
// separately written reference implementations (validation/reference/*.py,
// plain Python) and, where they exist, against published values. Coverage is
// partial: that report also lists the models shipped without a check. The
// references write validation/expected/*.json; this file calls the
// JavaScript with the same inputs and demands agreement inside the tolerance
// each case states.
//
// A failure here means the app and the reference disagree. Fix whichever is
// wrong; never loosen a tolerance to make the test pass without saying why
// in the reference file.

const root = fileURLToPath(new URL('..', import.meta.url));
const expected = name => JSON.parse(readFileSync(new URL(`../validation/expected/${name}.json`, import.meta.url), 'utf8'));

const C_NM_PER_FS = 299.792458;

// How each reference case is answered by the app. Returns an object with the
// same keys as the case's `expected`.
const egfp = JSON.parse(readFileSync(new URL('../sketch/data/fluorophores/egfp.json', import.meta.url), 'utf8'));

const APP = {
  fresnel: ({ kind, ...inputs }) => {
    if (kind === 'transmittance') {
      return fresnelTransmittances(inputs.n1, inputs.n2, Math.cos(inputs.incidenceDeg * Math.PI / 180));
    }
    // kind === 'stokes': a pure state of azimuth a (from p) and ellipticity χ.
    const a = 2 * inputs.azimuthDeg * Math.PI / 180, chi = 2 * inputs.ellipticityDeg * Math.PI / 180;
    const stokes = { s1: Math.cos(chi) * Math.cos(a), s2: Math.cos(chi) * Math.sin(a), s3: Math.sin(chi) };
    const { T, stokes: out } = throughFace(stokes, { Ts: inputs.Ts, Tp: inputs.Tp });
    return { T, ...out };
  },
  // A traced scene: the reference's layout, read at its detector. The
  // reference states the GDD of the paths; a thin lens's estimated glass is a
  // separate model (estimatedThinLensThicknessMm) and is taken off again.
  'ray-path-phase': ({ source, elements, detectorId }) => {
    const laser = createElement('pulsedlaser', source.x, source.y);
    laser.rot = source.rot;
    Object.assign(laser.params, { beamMode: 'line', wavelength: source.wavelengthNm, transformLimited: false,
      bandwidth: source.bandwidthNm, pulseWidthFs: 1000 });
    const scene = elements.map(e => {
      const el = createElement(e.type, e.x, e.y);
      Object.assign(el, { id: e.id, rot: e.rot });
      Object.assign(el.params, e.params);
      return el;
    });
    traceScene([laser, ...scene]);
    const lensGlass = scene.filter(el => el.type === 'lens')
      .reduce((sum, el) => sum + glassGVD('nbk7', source.wavelengthNm) * estimatedThinLensThicknessMm(el.params), 0);
    const pulse = detectorReading(detectorId)?.pulse;
    return { gddFs2: pulse ? pulse.gddFs2 - lensGlass : NaN };
  },
  fluorescence: ({ kind, ...inputs }) => {
    if (kind === 'crossSection') return { crossSectionCm2: absorptionCrossSectionCm2(inputs.extinctionM) };
    if (kind === 'focus') return { intensityWcm2: focusPeakIntensityWcm2(inputs.powerW, inputs.wavelengthNm, inputs.na) };
    if (kind === 'widefield') return { intensityWcm2: widefieldIntensityWcm2(inputs.powerW, inputs.diameterUm) };
    if (kind === 'rates') return moleculeRates(inputs);
    if (kind === 'collection') return { fraction: collectionFraction(inputs.na, inputs.mediumIndex) };
    if (kind === 'excitation') return { relative: spectrumValue(egfp.excitation, inputs.nm) };
    if (kind === 'qe') return { qe: detectorQe({ type: 'preset', id: inputs.detector }, inputs.nm) };
    if (kind === 'sourceExcitation') return { relative: sourceAverage(excitationSource(inputs.source), nm => spectrumValue(egfp.excitation, nm)) };
    if (kind === 'sourceLeak') return { transmission: sourceTransmission(excitationSource(inputs.source), inputs.filters) };
    if (kind === 'notch') return { widthNm: notchMinimumWidthNm(inputs) };
    if (kind === 'focusFactor') return { factor: focusSpectralFactor(excitationSource(inputs.source), nm => spectrumValue(egfp.excitation, nm)) };
    if (kind === 'twoPhotonPulsed') {
      const { fluence, repRateMHz, ...rest } = inputs;
      return twoPhotonPulsedRates({ ...rest, repRateMHz, photonJ: 1, averageIntensityWcm2: fluence * repRateMHz * 1e6 });
    }
    if (kind === 'pulsed') {
      // The fluence as an average intensity at a unit photon energy.
      const { fluence, repRateMHz, ...rest } = inputs;
      return pulsedMoleculeRates({ ...rest, repRateMHz, photonJ: 1, averageIntensityWcm2: fluence * repRateMHz * 1e6 });
    }
    // kind === 'detection': EGFP's stored emission through the stack.
    return detectionFractions(egfp.emission, inputs.filters, inputs.qe === null ? { type: 'ideal' } : { type: 'flat', qe: inputs.qe });
  },
  'material-dispersion': ({ kind, material, wavelengthNm, ...inputs }) => {
    if (kind === 'point') return materialDispersion(material, wavelengthNm);
    if (kind === 'abbe') return { nd: materialDispersion(material, 587.5618)?.index, abbe: materialAbbe(material) };
    return computeDispersion({ ...DISPERSION_DEFAULTS, material, wavelengthNm, ...inputs });
  },
  'wavelength-conversion': ({ kind, ...inputs }) => {
    if (kind === 'crs') return computeCrs({ ...CRS_DEFAULTS, ...inputs });
    if (kind === 'resolution') return computeResolution({ ...RESOLUTION_DEFAULTS, ...inputs });
    const r = computeConversion({ ...CONVERSION_DEFAULTS, ...inputs });
    if (!r.ok) return r;
    // Flatten the waves to the reference's wave<i>Nm / THz / Ev keys.
    const flat = Object.fromEntries(r.waves.flatMap((w, i) => [[`wave${i}Nm`, w.wavelengthNm], [`wave${i}THz`, w.frequencyTHz], [`wave${i}Ev`, w.photonEv]]));
    return { ...flat, signalShare: r.signalShare, idlerShare: r.idlerShare, degeneracyNm: r.degeneracyNm, ramanShiftCm: r.ramanShiftCm };
  },
  'broadband-interference': ({ spec, terms }) => ({ power: spectralFieldResult(spec, terms)?.power }),
  sellmeier: ({ glass, wavelengthNm, loNm, hiNm, lengthMm }) => {
    if (loNm !== undefined) {
      // The data sheet's principal dispersion: the F and C line indices, not a delay.
      if (lengthMm === undefined) return { nFMinusNC: glassIndex(glass, loNm) - glassIndex(glass, hiNm) };
      return { groupDelayDifferenceFs: glassGroupDelayDifferenceFs(glass, loNm, hiNm, lengthMm) };
    }
    if (wavelengthNm === undefined) return { abbe: glassAbbe(glass) };
    return {
      index: glassIndex(glass, wavelengthNm),
      groupIndex: glassGroupIndex(glass, wavelengthNm),
      gvdFs2PerMm: glassGVD(glass, wavelengthNm),
    };
  },
  pulse: ({ shape, pulseWidthFs, wavelengthNm, gddFs2 }) => {
    if (gddFs2 !== undefined) {
      return { durationFs: shape === 'gauss' ? gaussianPulseDurationAfterGDD(pulseWidthFs, gddFs2) : sech2PulseDurationAfterGDD(pulseWidthFs, gddFs2) };
    }
    if (wavelengthNm !== undefined) {
      const bandwidthNm = transformLimitedBandwidthNm(pulseWidthFs, wavelengthNm, shape);
      return { bandwidthNm, tbp: bandwidthNm * C_NM_PER_FS * pulseWidthFs / wavelengthNm ** 2 };
    }
    return { factor: AUTOCORRELATION_FACTORS[shape] };
  },
  'argon-capillary': ({ coreDiameterUm, gasPressureBar, wavelengthNm, wallIndex }) => {
    if (gasPressureBar === undefined) {
      // The paper's worked example quotes the wall index directly; the app
      // takes silica's, which at 1 um is 1.4504 rather than the paper's 1.50,
      // so the published value is checked through the formula's index factor.
      const loss = marcatiliLossDbPerM(coreDiameterUm, wavelengthNm);
      if (wallIndex === undefined) return { lossDbPerM: loss };
      const silica = glassIndex('silica', wavelengthNm);
      const factor = nu => (nu * nu + 1) / (2 * Math.sqrt(nu * nu - 1));
      return { lossDbPerM: loss * factor(wallIndex) / factor(silica) };
    }
    const c = hollowCoreCoefficients({ coreDiameterUm, gasPressureBar, kerrEnabled: true }, wavelengthNm);
    return {
      gasBeta2Fs2PerM: c.gasBeta2, waveguideBeta2Fs2PerM: c.waveguideBeta2, beta2Fs2PerM: c.beta2Fs2PerM,
      groupIndex: c.groupIndex, gammaPerWM: c.gammaPerWM, effectiveAreaM2: c.effectiveAreaM2,
    };
  },
  nlse: ({ compressorGddFs2, ...params }) => {
    const r = propagateEnvelope({ beta2Fs2PerM: 0, gammaPerWM: 0, ...params });
    assert.ok(r.ok, r.reason);
    const out = {
      fwhmFs: r.metrics.fwhmFs, rmsFs: r.metrics.rmsFs, energyJ: r.metrics.energyJ,
      spectralRmsTHz: r.spectralRmsTHz, bIntegral: r.bIntegral,
    };
    if (compressorGddFs2 !== undefined) {
      out.compressedFwhmFs = fieldMetrics(r.field, r.field.referenceGddFs2 + compressorGddFs2).fwhmFs;
    }
    return out;
  },
  paraxial: ({ r1, r2, thickness, glass, dia, wavelengthNm, axisDeg, retardanceDeg, inputAngleDeg, finesse, quantity }) => {
    if (r1 !== undefined) {
      const c = thickLensCardinals({ r1, r2, thickness, glass, dia }, wavelengthNm);
      return { f: c.f, bfd: c.bfd };
    }
    if (retardanceDeg !== undefined) {
      const s = retarder(linearStokes(inputAngleDeg), axisDeg, retardanceDeg);
      return { s1: s.s1, s2: s.s2, s3: s.s3 };
    }
    if (axisDeg !== undefined) return { transmission: analyzerTransmission(linearStokes(inputAngleDeg), axisDeg) };
    const reflectivity = reflectivityForFinesse(finesse);
    if (quantity === 'airy') {
      // What the app's reflectivity means for a measured linewidth: the exact
      // Airy finesse, pi / (2 arcsin((1 - R) / (2 sqrt(R)))) for equal mirrors
      // (Ismail et al., Opt. Express 24, 16366 (2016), Eq. 32). The app states
      // the reflectivity finesse instead, which is the high-finesse limit.
      return { reflectivity, airyFinesse: Math.PI / (2 * Math.asin((1 - reflectivity) / (2 * Math.sqrt(reflectivity)))) };
    }
    return { reflectivity, finesse: finesseForReflectivity(reflectivity) };
  },
  opa: ({ kind, ...inputs }) => {
    if (kind === 'gamma') return { gammaPerM: parametricGainCoefficient(inputs) };
    if (kind === 'gain') return { gain: parametricSmallSignalGain(inputs).gain };
    if (kind === 'depleted') {
      const { gammaPerM, lengthM, deltaKPerM, seedPhotonRatio } = inputs;
      return { conversion: coupledWaveConversion({ gammaPerM, deltaKPerM, seedPhotonRatio, lengthsM: [lengthM] })[0] };
    }
    if (kind === 'photons') {
      // The allocator's generated increments for a small seed: idler and
      // pump debit per watt of signal gain.
      const c = allocateParametricAmplifier({ pump: { wl: inputs.pumpWl, powerW: 1 },
        seeds: [{ key: 's', wl: inputs.signalWl, powerW: 1e-9, gammaPerM: 1000 }], lengthM: 1e-3 }).channels[0];
      return { idlerWl: parametricPair(inputs.pumpWl, inputs.signalWl).idlerWl,
        idlerPerSignalW: c.idlerOutW / c.signalGainW, pumpPerSignalW: c.depletedPumpW / c.signalGainW };
    }
    // kind === 'pulsed': the allocator's average-power gain for a tiny seed
    // (undepleted), Gamma_peak L = 5 at 1 mm.
    const { gammaPeakL, pumpFwhmFs, seedFwhmFs, delayFs, repRateMHz } = inputs;
    const pulse = (widthFs, phaseNs = 0) => ({ repRateMHz, pulseWidthFs: widthFs, phaseNs });
    const seed = { key: 's', wl: 800, powerW: 1e-9, gammaPerM: gammaPeakL * 1000,
      ...(seedFwhmFs ? { pulse: pulse(seedFwhmFs, delayFs * 1e-6) } : {}) };
    return { gain: allocateParametricAmplifier({ pump: { wl: 532, powerW: 1e9, pulse: pulse(pumpFwhmFs) },
      seeds: [seed], lengthM: 1e-3 }).channels[0].achievedGain };
  },
};

for (const name of ['sellmeier', 'pulse', 'argon-capillary', 'nlse', 'paraxial', 'opa', 'broadband-interference', 'material-dispersion', 'wavelength-conversion', 'fluorescence', 'ray-path-phase', 'fresnel']) {
  const model = expected(name);
  for (const c of model.cases) {
    test(`${model.id}: ${c.name}`, () => {
      const actual = APP[name](c.inputs);
      for (const [key, want] of Object.entries(c.expected)) {
        const got = actual[key];
        assert.ok(Number.isFinite(got), `${key}: app returned ${got}`);
        const tolerance = c.tolerance[key];
        const scale = c.absolute ? 1 : Math.max(Math.abs(want), 1e-300);
        assert.ok(Math.abs(got - want) <= tolerance * scale,
          `${key}: app ${got}, reference ${want} (${c.absolute ? 'absolute' : 'relative'} tolerance ${tolerance}, difference ${Math.abs(got - want) / scale})`);
      }
    });
  }
}

// In CI the references are re-run, so a reference edited without
// regenerating its expected file (or a hand-edited expected file) fails.
// Locally this takes about a minute of pure-Python FFTs, so it only runs
// when asked for (CI=true, as GitHub Actions sets, or VALIDATE_PYTHON=1).
test('validation: expected files and docs/validation.md are current', { skip: !(process.env.CI || process.env.VALIDATE_PYTHON) && 'set VALIDATE_PYTHON=1 to re-run the Python references' }, () => {
  const result = spawnSync('python3', ['validation/run.py', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  // The convergence study too: the report quotes its numbers, so a reference
  // whose discretisation changed must not keep the old evidence.
  const study = spawnSync('python3', ['validation/convergence.py', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(study.status, 0, `${study.stdout}\n${study.stderr}`);
});

// same_study() must reject a non-finite value rather than let NaN/Infinity
// slip past its tolerance comparisons (abs(a - b) > tolerance is false for
// NaN, and can also be false for Infinity), and must reject a duplicate row
// key rather than silently keep only the last one.
const CORRUPTIONS = `
import copy
import math
import sys

sys.path.insert(0, 'validation')
import convergence as c

base = c.study()
row = base['studies'][0]

def corrupted(field, bad_value):
    mutated = copy.deepcopy(base)
    mutated['studies'][0] = dict(mutated['studies'][0])
    mutated['studies'][0][field] = bad_value
    return mutated

for field in ('value', 'refinedValue', 'relativeChange'):
    for bad in (math.nan, math.inf, -math.inf):
        mutated = corrupted(field, bad)
        assert c.same_study(base, mutated) is False, f'{field}={bad} was accepted as equal'
        assert c.same_study(mutated, base) is False, f'{field}={bad} was accepted as equal (swapped)'

negative = corrupted('relativeChange', -1.0)
assert c.same_study(base, negative) is False, 'a negative relativeChange was accepted'

duplicated = copy.deepcopy(base)
duplicated['studies'].append(dict(row))
try:
    c.same_study(base, duplicated)
    raise AssertionError('a duplicate row key did not raise')
except ValueError:
    pass

print('same_study negative cases: ok')
`;

test('validation: convergence same_study() rejects non-finite and duplicate rows', {
  skip: !(process.env.CI || process.env.VALIDATE_PYTHON) && 'set VALIDATE_PYTHON=1 to re-run the Python references',
}, () => {
  const result = spawnSync('python3', ['-c', CORRUPTIONS], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

// The CLI path itself, on a structurally incomplete file: an expected file
// whose studies were emptied out from under it must not read as current --
// same_study()'s key comparison should catch the mismatch and --check
// should exit nonzero, not report success.
test('validation: convergence.py --check exits nonzero on a corrupted expected file', {
  skip: !(process.env.CI || process.env.VALIDATE_PYTHON) && 'set VALIDATE_PYTHON=1 to re-run the Python references',
}, () => {
  const path = new URL('../validation/expected/convergence.json', import.meta.url);
  const original = readFileSync(path, 'utf8');
  const corrupted = JSON.stringify({ ...JSON.parse(original), studies: [] });
  try {
    writeFileSync(path, corrupted);
    const result = spawnSync('python3', ['validation/convergence.py', '--check'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'an emptied studies list should not read as current');
  } finally {
    writeFileSync(path, original);
  }
});
