// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The wiki and calculators hubs search their pages with the palette's own
// ranking, from a JSON index the generators write into the hub page. These
// read the committed pages, so they test what the site actually serves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { prepareSearchDocument, rankSearch } from '../sketch/js/search.js';
import { calculators } from '../tools/calculators-content.mjs';

function hub(path) {
  const html = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const json = html.match(/<script type="application\/json" id="hubSearchIndex">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json, `${path} carries a search index`);
  const keys = [...html.matchAll(/data-search-key="([^"]+)"/g)].map(match => match[1]);
  const docs = JSON.parse(json);
  return { html, json, keys, docs, prepared: docs.map(doc => prepareSearchDocument(doc)) };
}
const wiki = hub('wiki/index.html');
const calc = hub('calculators/index.html');
const top = (page, query) => rankSearch(page.prepared, query).map(result => result.doc.id);

test('every hub card has exactly one search document, and every document a card', () => {
  for (const page of [wiki, calc]) {
    assert.deepEqual([...page.docs.map(doc => doc.id)].sort(), [...page.keys].sort());
    assert.equal(new Set(page.keys).size, page.keys.length, 'card keys are unique');
  }
  assert.equal(calc.keys.length, calculators.length);
});

test('no text in an index can close its script element', () => {
  for (const page of [wiki, calc]) assert.ok(!page.json.includes('<'), 'the index escapes "<"');
});

test('the hub search starts hidden and loads the shared search client', () => {
  for (const page of [wiki, calc]) {
    assert.match(page.html, /<div class="hub-search" data-hub-search[^>]* hidden>/);
    assert.match(page.html, /<script type="module" src="\.\.\/sketch\/js\/hub-search\.js"><\/script>/);
  }
});

test('the wiki finds component pages by acronym and lab name, as the palette does', () => {
  const expected = { pbs: 'pbs', iris: 'slit', ccd: 'camera', fibre: 'fiber', hwp: 'hwp', 'power meter': 'powermeter', oap: 'oap' };
  for (const [query, type] of Object.entries(expected)) assert.equal(top(wiki, query)[0], type, `"${query}" → ${top(wiki, query).slice(0, 3)}`);
});

test('the calculators hub finds a page by quantity, acronym or setup', () => {
  const expected = {
    'prism pair': 'dispersion-compensation', confocal: 'point-scanning', shg: 'nonlinear-conversion',
    smf: 'fiber-coupling', mtf: 'lens-design', telescope: 'imaging', srs: 'coherent-raman', gfp: 'fluorescence',
    sellmeier: 'dispersion', opcpa: 'opa', lensmaker: 'thin-thick-lens', raman: 'coherent-raman',
  };
  for (const [query, slug] of Object.entries(expected)) assert.equal(top(calc, query)[0], slug, `"${query}" → ${top(calc, query).slice(0, 3)}`);
  assert.deepEqual(new Set(top(calc, 'gdd').slice(0, 2)), new Set(['dispersion', 'dispersion-compensation']));
  assert.deepEqual(top(calc, 'xyzzy'), []);
});
