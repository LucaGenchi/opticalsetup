// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The palette search: what an optics user types (acronyms, the start of a
// name, a compound written three ways, one letter off) has to find the
// component, and the component they meant has to come first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, getElementMeta, registry } from '../sketch/js/elements.js';
import { DESCRIPTIONS } from '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';
import {
  MATCH, componentSearchDocument, matchQuality, normalizeSearchText, prepareSearchDocument, rankSearch, searchWords,
} from '../sketch/js/search.js';

const visible = Object.entries(registry).filter(([, def]) => !def.hidden);

// The documents the palette builds: label and description as listed, the
// detector instruments' own description where they override the registry.
const documents = visible.map(([type, def]) => {
  const meta = getElementMeta(type, createElement(type).params);
  const description = def.description || DESCRIPTIONS[type] || meta.description;
  return prepareSearchDocument(componentSearchDocument(type, def, { description, status: meta.status }));
});
const top = query => rankSearch(documents, query).map(result => result.doc.id);

test('text is folded so accents, subscripts and case never decide a match', () => {
  assert.deepEqual(searchWords('Etalon (Fabry–Pérot)'), ['etalon', 'fabry', 'perot']);
  assert.equal(normalizeSearchText('CaF₂'), 'caf2');
  assert.deepEqual(searchWords('λ/2 waveplate'), ['λ', '2', 'waveplate']);
});

test('match levels: whole name, word, word start, inside, one letter off', () => {
  const entries = text => prepareSearchDocument({ label: text }).fields.label;
  assert.equal(matchQuality('mirror', entries('Mirror')), MATCH.whole);
  assert.equal(matchQuality('halfwave', entries('half-wave')), MATCH.whole);
  assert.equal(matchQuality('mirror', entries('D-shaped mirror')), MATCH.exact);
  assert.equal(matchQuality('len', entries('Thin convex lens')), MATCH.prefix);
  assert.equal(matchQuality('splitter', entries('Beamsplitter')), MATCH.inside);
  assert.equal(matchQuality('dicroic', entries('Dichroic mirror')), MATCH.fuzzy);
  // one deletion or one insertion is forgiven too, two changes are not
  assert.equal(matchQuality('dichoic', entries('Dichroic mirror')), MATCH.fuzzy);
  assert.equal(matchQuality('dichrroic', entries('Dichroic mirror')), MATCH.fuzzy);
  assert.equal(matchQuality('dicrhoic', entries('Dichroic mirror')), MATCH.none);
  assert.equal(matchQuality('dikroik', entries('Dichroic mirror')), MATCH.none);
});

test('short words never match inside another word', () => {
  const entries = text => prepareSearchDocument({ label: text }).fields.label;
  assert.equal(matchQuality('nd', entries('Optical window')), MATCH.none);
  assert.equal(matchQuality('bs', entries('Absorbs incident rays')), MATCH.none);
  // and a four-letter word is too short to be forgiven a wrong letter
  assert.equal(matchQuality('lems', entries('Thin convex lens')), MATCH.none);
});

test('every visible component carries search aliases', () => {
  const missing = visible.filter(([, def]) => !def.aliases?.length).map(([type]) => type);
  assert.deepEqual(missing, []);
});

test('every component comes first when searched by its own label', () => {
  for (const [type, def] of visible) assert.equal(top(def.label)[0], type, `"${def.label}"`);
});

test('common lab names and acronyms find the component they mean, first', () => {
  const expected = {
    pbs: 'pbs', hwp: 'hwp', qwp: 'qwp', 'half wave': 'hwp', halfwave: 'hwp', 'half-wave': 'hwp', 'λ/2': 'hwp',
    oap: 'oap', nd: 'filter', 'nd filter': 'filter', 'neutral density': 'filter', 'power meter': 'powermeter',
    iris: 'slit', pinhole: 'slit', hene: 'cwlaser', bbo: 'crystal', pd: 'detector', ccd: 'camera',
    dicroic: 'dichroic', objectiv: 'objective', microscope: 'objective', 'corner cube': 'retroreflector',
    faraday: 'isolator', beamsplitter: 'bs', fabry: 'etalon', galvo: 'galvo', led: 'ledsource',
  };
  for (const [query, type] of Object.entries(expected)) assert.equal(top(query)[0], type, `"${query}" → ${top(query).slice(0, 3)}`);
});

test('the start of a name is enough, and lenses outrank a mention in a description', () => {
  const lenses = new Set(visible.filter(([, def]) => / lens|^lens/i.test(def.label)).map(([type]) => type));
  assert.ok(lenses.has(top('len')[0]), `len → ${top('len')[0]}`);
  assert.ok(lenses.has(top('lens')[0]), `lens → ${top('lens')[0]}`);
  assert.ok(top('mir').slice(0, 5).every(type => /mirror/i.test(registry[type].label)), `mir → ${top('mir').slice(0, 5)}`);
});

test('a name typed out in full beats words that recur in other names', () => {
  // "polarizing" also occurs in the plain beamsplitter's "non-polarizing"
  // alias, and "beamsplitter" is that one's whole label
  assert.equal(top('polarizing beamsplitter')[0], 'pbs');
  assert.equal(top('polarizing beam splitter')[0], 'pbs');
  assert.equal(top('non-polarizing beamsplitter')[0], 'bs');
  assert.equal(top('beam splitter')[0], 'bs');
});

test('a shared acronym lists both components ahead of anything else', () => {
  assert.deepEqual(new Set(top('dm').slice(0, 2)), new Set(['dm', 'dichroic']));
});

test('an empty or unknown query lists nothing', () => {
  assert.deepEqual(top(''), []);
  assert.deepEqual(top('   '), []);
  assert.deepEqual(top('xyzzy'), []);
  // every word must match: a real word next to nonsense finds nothing
  assert.deepEqual(top('mirror xyzzy'), []);
});

test('Enter in the search hands the keyboard to the canvas, so R and Escape reach the placement', () => {
  const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
  const handler = main.slice(main.indexOf("search.addEventListener('keydown'")).split('\n  });')[0];
  assert.ok(handler.includes('activate(first)'), 'Enter places the best match');
  assert.ok(handler.indexOf("$('canvas').focus(") > handler.indexOf('activate(first)'), 'and then focuses the canvas');
});
