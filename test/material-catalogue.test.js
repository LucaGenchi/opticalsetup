// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The shared material catalogue (step A3a of the Physics in 2D track): every
// record states what the data rule asks, the canvas, the dispersion
// calculator and the lens designer evaluate the same indices, and a glass
// element never lists a birefringent crystal.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOGUE_DATASET, MATERIAL_RECORDS, MATERIAL_REFERENCES, canvasGlassRecords, materialProvenance, principalFits,
} from '../sketch/js/materials/catalogue.js';
import { ACCESS_STATUSES, dataRuleProblems, sourceAccess } from '../sketch/js/source-access.js';
import { GLASSES, GLASS_OPTIONS, glassIndexUnbucketed } from '../sketch/js/glass.js';
import { MATERIALS, materialIndexDerivatives } from '../calculators/dispersion/materials.js';
import { MATERIAL_OPTIONS as LENS_DESIGN_OPTIONS, materialIndex } from '../calculators/lens-design/engine/materials.js';

const recordSources = record => {
  const reference = MATERIAL_REFERENCES[record.reference];
  return reference ? [reference.source, reference.fit?.source] : [];
};

test('catalogue: every record states its range, conditions, dataset, licence, reference and access', () => {
  assert.equal(CATALOGUE_DATASET.licence, 'CC0-1.0');
  assert.ok(ACCESS_STATUSES.has(sourceAccess(CATALOGUE_DATASET.source)), 'the dataset paper has an access status');
  assert.match(CATALOGUE_DATASET.comparedAt.commit, /^[0-9a-f]{40}$/);
  for (const record of MATERIAL_RECORDS.values()) {
    assert.ok(['isotropic', 'uniaxial'].includes(record.kind), `${record.id}: kind`);
    assert.deepEqual(dataRuleProblems({ licence: CATALOGUE_DATASET.licence, sources: recordSources(record) }), [], `${record.id}: data rule`);
    const fits = principalFits(record);
    assert.equal(fits.length, record.kind === 'uniaxial' ? 2 : 1);
    for (const { fit } of fits) {
      assert.ok(['sellmeier', 'gas'].includes(fit.form), `${record.id}: form`);
      assert.ok(fit.range[0] > 0 && fit.range[1] > fit.range[0], `${record.id}: range`);
      assert.ok(typeof fit.conditions === 'string' && fit.conditions.length > 0, `${record.id}: conditions`);
      assert.ok(['air', 'vacuum', 'unstated'].includes(fit.indexReference), `${record.id}: index reference`);
      assert.match(fit.datasetRecord, /\.yml$/, `${record.id}: the dataset record it was compared with`);
      assert.ok(fit.terms.length && fit.terms.flat().every(Number.isFinite), `${record.id}: coefficients`);
    }
    const provenance = materialProvenance(record);
    for (const key of ['dataset', 'licence', 'reference', 'access']) assert.ok(provenance[key], `${record.id}: provenance ${key}`);
  }
});

test('catalogue: a record without a licence, a primary source or an access status is reported', () => {
  assert.deepEqual(dataRuleProblems({ licence: '', sources: ['https://doi.org/10.1364/AO.2.001103'] }), ['no licence']);
  assert.deepEqual(dataRuleProblems({ licence: 'CC0-1.0', sources: [] }), ['no primary source']);
  assert.deepEqual(dataRuleProblems({ licence: 'CC0-1.0', sources: ['https://doi.org/10.9999/not-listed'] }),
    ['no access status for https://doi.org/10.9999/not-listed']);
});

test('catalogue: the optical sign of each uniaxial record matches its fits', () => {
  for (const record of MATERIAL_RECORDS.values()) {
    if (record.kind !== 'uniaxial') continue;
    const no = materialIndexDerivatives(`${record.id}-o`, 589.3).n, ne = materialIndexDerivatives(`${record.id}-e`, 589.3).n;
    assert.equal(record.opticalSign, ne > no ? 'positive' : 'negative', `${record.id}: n_o ${no}, n_e ${ne}`);
  }
});

test('catalogue: canvas, dispersion calculator and lens designer return identical indices', () => {
  let compared = 0;
  for (const record of canvasGlassRecords()) {
    const [lo, hi] = record.range;
    for (let i = 0; i <= 64; i++) {
      const nm = lo + (hi - lo) * i / 64;
      const canvas = glassIndexUnbucketed(record.id, nm);
      assert.ok(Number.isFinite(canvas));
      assert.equal(materialIndexDerivatives(record.id, nm).n, canvas, `${record.id} at ${nm} nm: calculator`);
      assert.equal(materialIndex(record.id, nm), canvas, `${record.id} at ${nm} nm: lens designer`);
      compared++;
    }
  }
  assert.equal(compared, 12 * 65);
  // Every catalogue fit reaches the calculator with its own coefficients.
  for (const record of MATERIAL_RECORDS.values()) {
    for (const { ray, fit } of principalFits(record)) {
      const id = ray ? `${record.id}-${ray === 'ordinary' ? 'o' : 'e'}` : record.id;
      const entry = MATERIALS.get(id);
      assert.ok(entry, `${id}: listed by the calculator`);
      assert.deepEqual(entry.terms, fit.terms, `${id}: coefficients`);
      assert.deepEqual(entry.range, fit.range, `${id}: range`);
      assert.equal(entry.A ?? 0, fit.A ?? 0, `${id}: constant`);
    }
  }
  assert.equal(MATERIALS.size, [...MATERIAL_RECORDS.values()].reduce((sum, record) => sum + principalFits(record).length, 0));
});

test('catalogue: elements that trace one index list only isotropic records', () => {
  const canvasIds = canvasGlassRecords().map(record => record.id);
  assert.deepEqual([...GLASSES.keys()], canvasIds);
  assert.deepEqual(GLASS_OPTIONS.map(([id]) => id), canvasIds);
  for (const id of canvasIds) assert.equal(MATERIAL_RECORDS.get(id).kind, 'isotropic', `${id}: isotropic`);
  const lensDesignGlasses = LENS_DESIGN_OPTIONS.map(([id]) => id).filter(id => id !== 'air' && id !== 'constant');
  assert.deepEqual(lensDesignGlasses, canvasIds);
  for (const record of MATERIAL_RECORDS.values()) {
    if (record.kind === 'isotropic') continue;
    assert.ok(!GLASSES.has(record.id), `${record.id}: not a canvas glass`);
    // In the calculator a uniaxial crystal is two principal entries, each
    // marked birefringent, never one entry with a single index.
    assert.ok(!MATERIALS.has(record.id), `${record.id}: no single-index entry`);
    for (const suffix of ['o', 'e']) assert.equal(MATERIALS.get(`${record.id}-${suffix}`).birefringent, true);
  }
});
