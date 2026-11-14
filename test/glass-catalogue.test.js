// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Step L1 of the Physics in 2D track: the larger glass catalogue, the names
// lens files use for it, and the model glass built from nd and Vd.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMON_GLASS_GROUP, GLASS_ALIASES, MATERIAL_RECORDS, MODEL_GLASS, canvasGlassRecords, findGlass, fitIndex, modelGlass,
} from '../sketch/js/materials/catalogue.js';
import { CATALOGUE_GLASS_ROWS, GLASS_MAKERS, glassId } from '../sketch/js/materials/glasses.js';
import { GLASSES, GLASS_OPTIONS, glassAbbe, glassGVD, glassGroupIndex, glassIndex, glassIndexUnbucketed } from '../sketch/js/glass.js';
import { MATERIAL_OPTIONS as LENS_DESIGN_OPTIONS, materialIndex } from '../calculators/lens-design/engine/materials.js';

const LINE_D = 587.5618;

test('L1: 74 catalogue glasses join the twelve, each from its maker\'s catalogue', () => {
  assert.equal(CATALOGUE_GLASS_ROWS.length, 74);
  const canvas = canvasGlassRecords();
  assert.equal(canvas.length, 12 + 74);
  assert.deepEqual(canvas.slice(0, 12).map(r => r.id),
    ['nbk7', 'silica', 'caf2', 'nfk51a', 'nsk16', 'f2', 'nsf5', 'nsf10', 'nsf11', 'nsf14', 'nsf57', 'nlasf9'],
    'the first twelve keep their ids and order');
  for (const row of CATALOGUE_GLASS_ROWS) {
    const record = MATERIAL_RECORDS.get(glassId(row.name));
    assert.ok(record, row.name);
    assert.equal(record.maker, GLASS_MAKERS[row.maker].name);
    assert.equal(record.datasetRecord, `specs/${row.maker}/optical/${row.name}.yml`);
    assert.equal(record.indexReference, 'air');
    // The label quotes the catalogue's numbers, and the fit reproduces them.
    assert.equal(record.label, `${row.name} (nd ${row.nd.toFixed(3)} / V ${row.vd.toFixed(1)})`);
    assert.ok(Math.abs(glassIndexUnbucketed(record.id, LINE_D) - row.nd) < 1e-5, `${row.name}: nd`);
    assert.ok(Math.abs(glassAbbe(record.id) - row.vd) < 0.01, `${row.name}: Vd`);
  }
});

test('L1: the menus group the glasses, common ones first, then one group per maker', () => {
  const groups = [];
  for (const [, , group] of GLASS_OPTIONS) if (groups.at(-1) !== group) groups.push(group);
  assert.deepEqual(groups, [COMMON_GLASS_GROUP, 'SCHOTT', 'OHARA', 'CDGM', 'HOYA'], 'each group is contiguous, in this order');
  assert.equal(GLASS_OPTIONS.filter(([, , g]) => g === COMMON_GLASS_GROUP).length, 12);
  // The lens designer offers the same glasses with the same groups.
  const designer = LENS_DESIGN_OPTIONS.filter(([id]) => GLASSES.has(id));
  assert.deepEqual(designer.map(([id, , g]) => [id, g]), GLASS_OPTIONS.map(([id, , g]) => [id, g]));
});

test('L1: a power-series fit (HOYA, CDGM H-ZLAF52) traces with analytic derivatives', () => {
  for (const id of ['efd10', 'mbacd5n', 'hzlaf52']) {
    assert.equal(MATERIAL_RECORDS.get(id).form, 'polynomial');
    for (const nm of [400, 587, 800, 1000]) {
      const n = glassIndexUnbucketed(id, nm);
      assert.equal(n, fitIndex(MATERIAL_RECORDS.get(id), nm), `${id} at ${nm} nm: canvas = catalogue`);
      assert.equal(materialIndex(id, nm), n, `${id} at ${nm} nm: lens designer = canvas`);
      assert.ok(Math.abs(glassIndex(id, nm) - n) < 1e-5, 'the cached value is the same curve');
      // GVD and group index from the analytic derivatives against a central
      // difference of the index (h = 0.05 nm).
      const h = 0.05, d1 = (glassIndexUnbucketed(id, nm + h) - glassIndexUnbucketed(id, nm - h)) / (2 * h * 1e-3);
      const d2 = (glassIndexUnbucketed(id, nm + h) - 2 * n + glassIndexUnbucketed(id, nm - h)) / (h * 1e-3) ** 2;
      const um = nm / 1000;
      assert.ok(Math.abs(glassGroupIndex(id, nm) - (n - um * d1)) < 1e-7, `${id} at ${nm} nm: group index`);
      const gvd = um ** 3 * d2 * 1e21 / (2 * Math.PI * 299792458 ** 2);
      assert.ok(Math.abs(glassGVD(id, nm) / gvd - 1) < 1e-4, `${id} at ${nm} nm: GVD ${glassGVD(id, nm)} vs ${gvd}`);
    }
  }
});

test('L1: a glass outside its fit is held at the edge on the canvas and declined by the catalogue', () => {
  // OHARA L-LAH53's fit ends at 700 nm, HOYA's at 1013.98 nm.
  assert.equal(glassIndex('llah53', 900), glassIndex('llah53', 700));
  assert.equal(fitIndex(MATERIAL_RECORDS.get('llah53'), 900), null);
  assert.equal(fitIndex(MATERIAL_RECORDS.get('efd10'), 1064), null);
  assert.ok(Number.isFinite(glassGVD('efd10', 1064)), 'the canvas still returns a finite GVD');
});

test('L1: lens-file names find their glass whatever the case, spaces or hyphens', () => {
  const cases = {
    'N-BK7': 'nbk7', NBK7: 'nbk7', 'n-bk7': 'nbk7', 'N BK7': 'nbk7',
    'S-LAH64': 'slah64', SLAH64: 'slah64', 's_lah64': 'slah64',
    'N-SF6HT': 'nsf6ht', 'N-SF6 HT': 'nsf6ht', 'H-K9L': 'hk9l', HK9L: 'hk9l', 'D-ZK3': 'dzk3',
    'E-FD10': 'efd10', TAFD5F: 'tafd5f', 'P-SF68': 'psf68', SF11: 'sf11', 'N-SF11': 'nsf11',
  };
  for (const [name, id] of Object.entries(cases)) {
    const found = findGlass(name);
    assert.equal(found?.id, id, name);
    assert.equal(found.via, 'name');
    assert.equal(found.record, MATERIAL_RECORDS.get(id));
  }
  // Names that are not a catalogue spelling reach a record through an alias.
  for (const [name, id] of [['BK7', 'nbk7'], ['Fused silica', 'silica'], ['F_SILICA', 'silica'], ['SiO2', 'silica'], ['CaF2', 'caf2']]) {
    assert.equal(findGlass(name)?.id, id, name);
    assert.equal(findGlass(name).via, 'alias', name);
  }
  for (const id of Object.values(GLASS_ALIASES)) assert.ok(GLASSES.has(id), `alias target ${id} is a canvas glass`);
  // Unknown glasses, and nothing, find nothing.
  for (const name of ['ECO-550', 'K-VC89', 'S-BSL8', '', null, undefined, '---']) assert.equal(findGlass(name), null, String(name));
  // Every catalogue glass is found by its own name.
  for (const row of CATALOGUE_GLASS_ROWS) assert.equal(findGlass(row.name)?.id, glassId(row.name), row.name);
});

test('L1: a model glass returns nd and Vd exactly and declines numbers no glass has', () => {
  const at = (fit, nm) => fitIndex(fit, nm);
  for (const [nd, vd] of [[1.5168, 64.17], [1.80518, 25.43], [1.43875, 94.95], [2.0033, 28.27]]) {
    const fit = modelGlass(nd, vd);
    assert.equal(fit.form, 'model');
    assert.ok(Math.abs(at(fit, LINE_D) - nd) < 1e-14, 'nd exact');
    const v = (at(fit, LINE_D) - 1) / (at(fit, 486.1327) - at(fit, 656.2725));
    assert.ok(Math.abs(v - vd) < 1e-9, `Vd exact: ${v}`);
    // Normal dispersion across the range.
    let last = Infinity;
    for (let nm = 365; nm <= 1014; nm += 1) {
      const n = at(fit, nm);
      assert.ok(n < last, `decreasing at ${nm} nm`);
      last = n;
    }
    assert.equal(at(fit, 364), null, 'outside the model range');
    assert.equal(at(fit, 1015), null);
  }
  for (const [nd, vd] of [[1, 60], [3, 60], [1.5, 5], [1.5, 200], [NaN, 60], [1.5, Infinity], ['x', 50]]) {
    assert.equal(modelGlass(nd, vd), null, `${nd}, ${vd}`);
  }
  assert.deepEqual([...MODEL_GLASS.range], [365, 1014]);
});

test('L1: the model glass stays within its stated error for the catalogue glasses', () => {
  // The validation reference checks the statistics; here every glass's
  // worst error over the main range is below the stated maximum.
  for (const record of canvasGlassRecords().filter(r => r.id !== 'silica' && r.id !== 'caf2')) {
    const nd = glassIndexUnbucketed(record.id, LINE_D), vd = glassAbbe(record.id), fit = modelGlass(nd, vd);
    const [lo, hi] = [Math.max(404.7, record.range[0]), Math.min(1014, record.range[1])];
    for (let i = 0; i <= 20; i++) {
      const nm = lo + (hi - lo) * i / 20;
      assert.ok(Math.abs(fitIndex(fit, nm) - glassIndexUnbucketed(record.id, nm)) <= MODEL_GLASS.error.main.max, `${record.id} at ${nm} nm`);
    }
  }
});
