// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The shared material catalogue (step A3a of the Physics in 2D track): every
// record states what the data rule asks, the canvas, the dispersion
// calculator and the lens designer evaluate the same indices, and a glass
// element never lists a birefringent crystal.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOGUE_DATASET, MATERIAL_RECORDS, MATERIAL_REFERENCES, VERDET_DATASETS, VERDET_REFERENCES,
  canvasGlassRecords, fitIndex, materialProvenance, principalFits, verdetConstant,
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
      assert.ok(['sellmeier', 'gas', 'tabulated'].includes(fit.form), `${record.id}: form`);
      assert.ok(fit.range[0] > 0 && fit.range[1] > fit.range[0], `${record.id}: range`);
      assert.ok(typeof fit.conditions === 'string' && fit.conditions.length > 0, `${record.id}: conditions`);
      assert.ok(['air', 'vacuum', 'unstated'].includes(fit.indexReference), `${record.id}: index reference`);
      assert.match(fit.datasetRecord, /\.yml$/, `${record.id}: the dataset record it was compared with`);
      const values = fit.form === 'tabulated' ? fit.points.flat() : fit.terms.flat();
      assert.ok(values.length && values.every(Number.isFinite), `${record.id}: coefficients`);
    }
    const provenance = materialProvenance(record);
    for (const key of ['dataset', 'licence', 'reference', 'access']) assert.ok(provenance[key], `${record.id}: provenance ${key}`);
    if (record.verdet) {
      const v = record.verdet, dataset = VERDET_DATASETS[v.dataset], reference = VERDET_REFERENCES[v.reference];
      assert.deepEqual(dataRuleProblems({ licence: dataset?.licence, sources: [dataset?.source, reference?.source] }), [], `${record.id}: Verdet data rule`);
      for (const key of ['model', 'range', 'temperatureK', 'sample', 'conditions', 'signConvention']) assert.ok(v[key], `${record.id}: Verdet ${key}`);
      assert.ok(v.sign === 1 || v.sign === -1, `${record.id}: Verdet sign`);
    }
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
    const nm = Math.max(589.3, record.ordinary.range[0], record.extraordinary.range[0]);
    const no = fitIndex(record.ordinary, nm), ne = fitIndex(record.extraordinary, nm);
    assert.equal(record.opticalSign, ne > no ? 'positive' : 'negative', `${record.id}: n_o ${no}, n_e ${ne}`);
  }
});

test('catalogue: fitIndex evaluates every form, and nothing outside the domain of a fit', () => {
  // The same arithmetic as the calculator's, so the two agree exactly.
  for (const [id, entry] of MATERIALS) {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const nm = entry.range[0] + (entry.range[1] - entry.range[0]) * f;
      assert.equal(fitIndex(entry, nm), materialIndexDerivatives(id, nm).n, `${id} at ${nm} nm`);
    }
  }
  const tgg = MATERIAL_RECORDS.get('tgg');
  for (const [nm, n] of tgg.points) assert.equal(fitIndex(tgg, nm), n, `TGG node at ${nm} nm`);
  for (const nm of [404, 1177, NaN, Infinity, -1]) assert.equal(fitIndex(tgg, nm), null, `TGG at ${nm} nm`);
  const calcite = MATERIAL_RECORDS.get('calcite');
  assert.equal(fitIndex(calcite.ordinary, 203.9), null);
  assert.equal(fitIndex(calcite.ordinary, 2172.1), null);
  assert.equal(fitIndex({ form: 'unknown', range: [0, 1e9] }, 500), null);
});

test('catalogue: the Verdet constant is signed, ranged and only where a source gives it', () => {
  const tgg = MATERIAL_RECORDS.get('tgg');
  assert.ok(verdetConstant(tgg, 633) < 0, 'TGG is negative');
  assert.ok(Math.abs(verdetConstant(tgg, 633) + 130.6) < 0.05);
  assert.ok(Math.abs(verdetConstant(tgg, 1064) + 37.5) < 0.05);
  // Larger in magnitude towards the transition at 239 nm.
  assert.ok(Math.abs(verdetConstant(tgg, 532)) > Math.abs(verdetConstant(tgg, 1064)));
  for (const nm of [499, 1101, NaN]) assert.equal(verdetConstant(tgg, nm), null, `outside 500-1100 nm: ${nm}`);
  assert.equal(verdetConstant(MATERIAL_RECORDS.get('silica'), 633), null, 'fused silica has no Verdet data in the catalogue');
  assert.equal(verdetConstant(null, 633), null);
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
  // Every fit the calculator lists reaches it with its own coefficients.
  // The records added in A3b are not listed anywhere yet: they become
  // selectable in P2, P3, P4 and P6.
  const NOT_LISTED_YET = ['calcite', 'yvo4', 'tgg'];
  for (const record of MATERIAL_RECORDS.values()) {
    if (NOT_LISTED_YET.includes(record.id)) {
      assert.ok(principalFits(record).every(({ ray }) => !MATERIALS.has(ray ? `${record.id}-${ray[0]}` : record.id)), `${record.id}: not listed yet`);
      continue;
    }
    for (const { ray, fit } of principalFits(record)) {
      const id = ray ? `${record.id}-${ray === 'ordinary' ? 'o' : 'e'}` : record.id;
      const entry = MATERIALS.get(id);
      assert.ok(entry, `${id}: listed by the calculator`);
      assert.deepEqual(entry.terms, fit.terms, `${id}: coefficients`);
      assert.deepEqual(entry.range, fit.range, `${id}: range`);
      assert.equal(entry.A ?? 0, fit.A ?? 0, `${id}: constant`);
    }
  }
  assert.equal(MATERIALS.size, [...MATERIAL_RECORDS.values()].filter(record => !NOT_LISTED_YET.includes(record.id))
    .reduce((sum, record) => sum + principalFits(record).length, 0));
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
    for (const suffix of ['o', 'e']) {
      const entry = MATERIALS.get(`${record.id}-${suffix}`);
      if (entry) assert.equal(entry.birefringent, true, `${record.id}-${suffix}: marked birefringent`);
    }
  }
});
