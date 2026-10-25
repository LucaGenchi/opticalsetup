// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The fluorophore spectra shipped for the fluorescence calculator: third-
// party data, so each file must carry its source, terms and credit, match
// the index, and keep the peaks its record lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FLUOROPHORE_LIBRARY, FLUOROPHORE_SOURCES, FLUOROPHORE_CATEGORIES, FLUOROPHORE_INPUTS_SHA256 } from '../sketch/js/fluorophore-library.js';

const DIR = new URL('../sketch/data/fluorophores/', import.meta.url).pathname;
const load = id => JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));
// Only sources whose terms allow redistribution with credit.
const ALLOWED = new Set(['FPbase-data']);
const range = c => [c.startNm, c.startNm + (c.values.length - 1) * c.stepNm];
const peakOf = c => c.startNm + c.values.indexOf(1000) * c.stepNm;

test('every fluorophore file is indexed, credited and well formed', () => {
  const files = readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  assert.deepEqual(files, FLUOROPHORE_LIBRARY.map(f => f.id).sort(), 'index and files agree');
  assert.ok(FLUOROPHORE_LIBRARY.length >= 70);
  for (const meta of FLUOROPHORE_LIBRARY) {
    const f = load(meta.id);
    assert.ok(ALLOWED.has(f.license) && FLUOROPHORE_SOURCES[f.source].license === f.license, `${f.id}: terms`);
    assert.ok(f.attribution.includes('FPbase') && /^https:\/\/www\.fpbase\.org\/protein\//.test(f.sourceUrl) && f.licenseUrl === 'https://www.fpbase.org/terms/', `${f.id}: credit`);
    assert.ok(f.changes, `${f.id}: changes stated`);
    // Credit: the protein's paper and the papers its curves cite, at least one.
    const papers = [...(f.reference ? [f.reference] : []), ...f.spectraReferences];
    assert.ok(papers.length && papers.every(r => r.doi && f.attribution.includes(r.citation) && f.attribution.includes(r.doi)), `${f.id}: original papers credited`);
    assert.ok(FLUOROPHORE_CATEGORIES.includes(f.category) && f.kind === 'protein', `${f.id}: classification`);
    for (const role of ['excitation', 'emission']) {
      const c = f[role];
      assert.equal(c.stepNm, 1);
      assert.ok(c.values.length >= 10 && c.values.every(v => Number.isInteger(v) && v >= 0), `${f.id} ${role}: integers ≥ 0`);
      assert.ok(Number.isInteger(c.fpbaseSpectrumId), `${f.id} ${role}: FPbase spectrum named`);
    }
    assert.deepEqual(meta.excitationRangeNm, range(f.excitation), `${f.id}: index range`);
    assert.deepEqual(meta.emissionRangeNm, range(f.emission), `${f.id}: index range`);
    assert.equal(meta.excitationType, f.excitation.type);
    // The emission curve peaks at 1000; the excitation curve is 1000 at the
    // band its extinction coefficient refers to, and may exceed it only
    // further than 5 nm away (a protein's 280 nm band).
    assert.equal(Math.max(...f.emission.values), 1000);
    assert.ok(Math.abs(peakOf(f.emission) - f.emMaxNm) <= 5, `${f.id}: emission peak ${peakOf(f.emission)} vs ${f.emMaxNm}`);
    const k = f.excitation.peakNm - f.excitation.startNm;
    assert.equal(f.excitation.values[k], 1000, `${f.id}: excitation scaled at its peak`);
    assert.ok(Math.abs(f.excitation.peakNm - f.exMaxNm) <= 5, `${f.id}: excitation peak ${f.excitation.peakNm} vs ${f.exMaxNm}`);
    f.excitation.values.forEach((v, i) => {
      if (v > 1000) assert.ok(Math.abs(f.excitation.startNm + i - f.exMaxNm) > 5, `${f.id}: above 1000 only away from the peak`);
    });
    assert.ok(f.extinctionM === null || f.extinctionM > 0);
    assert.ok(f.quantumYield === null || (f.quantumYield > 0 && f.quantumYield <= 1));
    assert.ok(f.lifetimeNs === null || f.lifetimeNs > 0);
    assert.equal(FLUOROPHORE_INPUTS_SHA256.filter(i => i.id === f.id).length, 3, `${f.id}: input hashes recorded`);
  }
});

test('well-known proteins keep the peaks their papers publish', () => {
  // Excitation / emission maxima as FPbase lists them from the cited papers.
  const PEAKS = { egfp: [488, 507], mcherry: [587, 610], tdtomato: [554, 581], mneongreen: [506, 517], mturquoise2: [434, 474], mscarlet: [569, 594] };
  for (const [id, [ex, em]] of Object.entries(PEAKS)) {
    const f = load(id);
    assert.deepEqual([f.exMaxNm, f.emMaxNm], [ex, em], id);
    assert.ok(Math.abs(f.excitation.peakNm - ex) <= 3 && Math.abs(peakOf(f.emission) - em) <= 3, `${id}: curves peak where listed`);
  }
  // EGFP: 55 900 M⁻¹ cm⁻¹, Φ 0.60 (Cormack et al. 1996).
  const egfp = load('egfp');
  assert.equal(egfp.extinctionM, 55900);
  assert.equal(egfp.quantumYield, 0.6);
  assert.equal(egfp.reference.doi, '10.1016/0378-1119(95)00685-0');
  // R-GECO1's curves are credited to the paper that measured them.
  assert.match(load('r-geco1-calcium-free').attribution, /Molina et al\. \(2019\), doi:10\.1016\/j\.bpj\.2019\.04\.007/);
  // A two-state indicator appears in both states, named for each.
  assert.ok(FLUOROPHORE_LIBRARY.some(f => f.id === 'jrgeco1a-calcium-saturated' && f.name === 'jRGECO1a (Ca²⁺-bound)'));
  assert.ok(FLUOROPHORE_LIBRARY.some(f => f.id === 'jrgeco1a-calcium-free'));
  // Records whose listed peaks disagree with their own curves are left out,
  // and so are proteins whose FPbase curve is another protein's.
  for (const id of ['dsred', 'mruby2', 'gcamp6f', 'megfp', 'memerald', 'mcitrine', 'ypet', 'eyfp', 'venus', 'cerulean', 'mclover3']) {
    assert.ok(!FLUOROPHORE_LIBRARY.some(f => f.id === id), id);
  }
});

test('no two fluorophores share a curve', () => {
  const seen = new Map();
  for (const { id } of FLUOROPHORE_LIBRARY) {
    const f = load(id);
    for (const role of ['excitation', 'emission']) {
      const key = `${f[role].startNm}:${f[role].values.join(',')}`;
      assert.ok(!seen.has(key), `${id} ${role} is the same curve as ${seen.get(key)}`);
      seen.set(key, `${id} ${role}`);
    }
  }
});
