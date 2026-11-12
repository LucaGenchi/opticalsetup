// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The data rule's third clause, "access stated" (docs/adding-physics.md), for
// the spectra the app ships: every Raman reference spectrum and every
// fluorophore record cites primary sources whose access status is listed in
// sketch/js/source-access.js, and that table lists nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACCESS_STATUSES, OPEN_ACCESS_STATUSES, SOURCE_ACCESS, SOURCE_ACCESS_CHECKED, dataRuleProblems, isOpenAccess, sourceAccess, sourceKey,
} from '../sketch/js/source-access.js';
import { CATALOGUE_DATASET, MATERIAL_REFERENCES } from '../sketch/js/materials/catalogue.js';
import { SPECTRUM_SOURCES } from '../calculators/coherent-raman/spectra-index.js';
import { FLUOROPHORE_SOURCES } from '../sketch/js/fluorophore-library.js';

const read = dir => readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const RAMAN = read(new URL('../calculators/coherent-raman/spectra/', import.meta.url).pathname);
const FLUOROPHORES = read(new URL('../sketch/data/fluorophores/', import.meta.url).pathname);
const doi = value => (value ? `https://doi.org/${value}` : null);

// The papers a fluorophore record credits: the protein's own, and those its
// curves cite. A curve that cites none is one FPbase records no source for.
const fluorophoreSources = f => [
  doi(f.reference?.doi), ...f.spectraReferences.map(r => doi(r.doi)),
  ...['excitation', 'emission', 'twoPhoton'].map(role => doi(f[role]?.reference?.doi)),
].filter(Boolean);

test('access: the table holds only known statuses and is dated', () => {
  assert.match(SOURCE_ACCESS_CHECKED.date, /^\d{4}-\d{2}-\d{2}$/);
  for (const [key, status] of Object.entries(SOURCE_ACCESS)) {
    assert.ok(ACCESS_STATUSES.has(status), `${key}: ${status}`);
    if (/^10\./.test(key)) assert.equal(key, key.toLowerCase(), `${key}: DOIs are stored in lower case`);
  }
  assert.equal(sourceKey('https://doi.org/10.1364/OME.8.001410'), '10.1364/ome.8.001410');
  assert.equal(sourceAccess('https://doi.org/10.1364/OME.8.001410'), 'gold');
  assert.equal(isOpenAccess('https://doi.org/10.1364/AO.2.001103'), false);
  assert.equal(sourceAccess('https://doi.org/10.9999/unknown'), null);
  assert.ok(!OPEN_ACCESS_STATUSES.has('closed'));
});

test('access: every Raman reference spectrum cites a licensed source with an access status', () => {
  for (const spectrum of RAMAN) {
    const source = SPECTRUM_SOURCES[spectrum.source];
    assert.ok(source, `${spectrum.id}: source ${spectrum.source}`);
    assert.deepEqual(dataRuleProblems({ licence: spectrum.license, sources: [source.paper] }), [], spectrum.id);
  }
});

test('access: every fluorophore record cites a licensed source with an access status', () => {
  assert.deepEqual(dataRuleProblems({ licence: FLUOROPHORE_SOURCES.fpbase.license, sources: [FLUOROPHORE_SOURCES.fpbase.paper] }), [], 'FPbase');
  for (const f of FLUOROPHORES) {
    assert.deepEqual(dataRuleProblems({ licence: f.license, sources: fluorophoreSources(f) }), [], f.id);
  }
});

test('access: the table lists no source that nothing cites', () => {
  const cited = new Set([
    CATALOGUE_DATASET.source,
    ...Object.values(MATERIAL_REFERENCES).flatMap(r => [r.source, r.fit?.source]),
    ...Object.values(SPECTRUM_SOURCES).map(s => s.paper),
    FLUOROPHORE_SOURCES.fpbase.paper,
    ...FLUOROPHORES.flatMap(fluorophoreSources),
  ].filter(Boolean).map(sourceKey));
  assert.deepEqual(Object.keys(SOURCE_ACCESS).filter(key => !cited.has(key)), []);
});
