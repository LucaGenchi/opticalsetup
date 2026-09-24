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
import { thickLensCardinals } from '../sketch/js/elements.js';
import { analyzerTransmission, linearStokes, retarder } from '../sketch/js/polarization.js';
import { finesseForReflectivity, reflectivityForFinesse } from '../sketch/js/etalon.js';

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
const APP = {
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
};

for (const name of ['sellmeier', 'pulse', 'argon-capillary', 'nlse', 'paraxial']) {
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

// The CLI path itself: a non-finite result must fail generation loudly
// rather than write invalid JSON (Python's json module accepts NaN/Infinity
// by default, which is not valid JSON) or report success.
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
