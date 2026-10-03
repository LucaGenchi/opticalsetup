// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPatternFiles, loadPatterns, obsoletePatternFiles } from '../tools/build-patterns.mjs';
import { parseSurvey, joinExamples, slugify } from '../tools/patterns/catalogue.mjs';
import { exampleScene, setupSVG, validateExample } from '../tools/patterns/diagram.mjs';
import { brandMark } from '../tools/patterns/brand.mjs';
import { registry } from '../sketch/js/elements.js';
import { state, parseSketch } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import { decodeSharePayload } from '../sketch/js/share.js';
import { readFilters, filterParams, matchesPattern } from '../patterns/assets/filter.js';

const entries = await loadPatterns();
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const available = entries.filter(e => e.example.mode === 'rays');
const unavailable = entries.filter(e => e.example.mode === 'unavailable');

test('every survey pattern has a unique article and an explicit capability decision', () => {
  assert.equal(entries.length, 162);
  assert.equal(new Set(entries.map(e => e.function)).size, 19);
  assert.equal(new Set(entries.map(e => e.slug)).size, 162);
  assert.ok(available.length > 7 && unavailable.length > 0);
  for (const entry of entries) assert.equal(validateExample(entry.example), entry.example);
  assert.throws(() => joinExamples(entries, []), /missing authored/);
  assert.throws(() => joinExamples(entries, [entries[0].example, entries[0].example]), /Duplicate/);
  assert.throws(() => parseSurvey('No entries'), /empty/);
});

test('generated articles, native previews, aliases and function hubs stay current', async () => {
  const files = await buildPatternFiles();
  assert.equal(files.size, 1 + 19 + 162 * 2 + available.length * 2);
  for (const [path, content] of files) assert.equal(await read(path), content, `${path}: rebuild patterns`);
  assert.deepEqual(await obsoletePatternFiles(files), [], 'obsolete mockups or scenes must not remain published');
});

test('preview, download and canvas link contain the same actual OpticalSetup scene', async () => {
  for (const entry of available) {
    const raw = await read(`patterns/${entry.slug}/scene.json`);
    const scene = parseSketch(raw, registry);
    assert.deepEqual(parseSketch(scene, registry), scene, `${entry.id}: normalization is stable`);
    assert.deepEqual(scene, parseSketch(exampleScene(entry.example), registry));
    const html = await read(`patterns/${entry.slug}/index.html`);
    const payload = /href="\.\.\/\.\.\/sketch\/#sketch=([gj]\.[A-Za-z0-9_-]+)"/.exec(html)?.[1];
    assert.ok(payload, `${entry.id}: missing share action`);
    assert.deepEqual(JSON.parse(await decodeSharePayload(payload)), JSON.parse(raw));
    for (const el of scene.elements) {
      assert.ok(registry[el.type], entry.id);
      assert.ok([el.x, el.y, el.rot].every(Number.isFinite), entry.id);
    }
    const previous = { elements: state.elements, beams: state.beams };
    try {
      state.elements = scene.elements; state.beams = scene.beams;
      const native = buildSVG({ whiteBg: true });
      const preview = (await read(`patterns/${entry.slug}/preview.svg`)).trimEnd();
      // Only accessible metadata differs from the app's actual optical export.
      assert.equal(preview.replace(/\n<!-- SPDX[\s\S]*?<\/desc>/, ''), native, entry.id);
    } finally { Object.assign(state, previous); }
  }
});

test('unsupported patterns explain missing capabilities and never offer mockup setups', async () => {
  for (const entry of unavailable) {
    const html = await read(`patterns/${entry.slug}/index.html`);
    assert.ok(html.includes('<h2>No setup available</h2>'));
    assert.ok(!html.includes('data-embed-src=') && !html.includes('download=') && !html.includes('src="preview.svg"'));
    assert.throws(() => exampleScene(entry.example), /unavailable|scene|setup/i);
    await assert.rejects(read(`patterns/${entry.slug}/scene.json`), { code: 'ENOENT' });
    await assert.rejects(read(`patterns/${entry.slug}/preview.svg`), { code: 'ENOENT' });
  }
});

test('native previews escape metadata and generation restores the workbench state', () => {
  const example = structuredClone(available[0].example);
  const before = { elements: state.elements, beams: state.beams };
  assert.equal(setupSVG(example), setupSVG(example));
  example.title = '<script>alert("x")</script>';
  assert.ok(!setupSVG(example).includes('<script>'));
  assert.equal(state.elements, before.elements);
  assert.equal(state.beams, before.beams);
  assert.throws(() => validateExample({ ...example, mode: 'schematic' }), /real setup|unavailable/);
  assert.throws(() => validateExample({ ...example, mode: 'unavailable' }), /scene/);
});

test('filters combine OR within fields and AND across fields, preserving shareable state', () => {
  const patterns = entries.map(e => ({ ...e, mode: e.example.mode }));
  assert.ok(patterns.filter(e => matchesPattern(e, { q: 'relay', discipline: ['Microscopy'] })).some(e => e.id === 'IMG-01'));
  assert.equal(patterns.filter(e => matchesPattern(e, { q: 'nonexistent-pattern-zzz' })).length, 0);
  assert.equal(patterns.filter(e => matchesPattern(e, { mode: ['rays'] })).length, available.length);
  assert.equal(patterns.filter(e => matchesPattern(e, { mode: ['unavailable'] })).length, unavailable.length);
  const state = readFilters(new URLSearchParams('q=pump-probe&discipline=Ultrafast+optics&discipline=Terahertz+optics&mode=unavailable'));
  assert.deepEqual(readFilters(filterParams(state)), state);
});

test('canonical pages expose honest structured data, crawlable relationships and established branding', async () => {
  const sitemap = await read('sitemap.xml');
  const hub = await read('patterns/index.html');
  assert.equal((hub.match(/data-pattern=/g) || []).length, 162);
  assert.ok(hub.includes(brandMark()));
  const wiki = await read('wiki/index.html');
  assert.ok(wiki.includes(brandMark()), 'the patterns logo must match the established wiki brand');
  assert.ok(!(await read('patterns/assets/patterns.css')).includes(':root'), 'inherit the established site palette');
  const paths = new Set(entries.map(e => e.slug));
  for (const entry of entries) {
    assert.ok(sitemap.includes(`/patterns/${entry.slug}/</loc>`), entry.id);
    assert.ok(!sitemap.includes(`/patterns/${entry.id.toLowerCase()}/</loc>`), 'do not index aliases');
    const html = await read(`patterns/${entry.slug}/index.html`);
    for (const match of html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(paths.has(match[1]), `${entry.id}: broken relation ${match[1]}`);
    assert.ok(html.includes(`<link rel="canonical" href="https://opticalsetup.com/patterns/${entry.slug}/">`));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    const graph = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)[1])['@graph'];
    assert.equal(graph[0]['@type'], 'TechArticle');
    assert.equal(graph[0].headline, entry.title);
    assert.equal(graph[1]['@type'], 'BreadcrumbList');
    assert.equal(graph[1].itemListElement.at(-1).item, graph[0].url);
    assert.ok(html.includes('twitter:card'));
    const alias = await read(`patterns/${entry.id.toLowerCase()}/index.html`);
    assert.ok(alias.includes('noindex,follow') && alias.includes(`url=../${entry.slug}/`));
  }
  for (const name of new Set(entries.map(e => e.function))) {
    const path = `patterns/functions/${slugify(name)}/`;
    assert.ok(sitemap.includes(`/${path}</loc>`));
    const html = await read(path + 'index.html');
    assert.ok(html.includes('CollectionPage') && html.includes('BreadcrumbList'));
  }
  for (const path of ['index.html', 'sketch/index.html', 'wiki/index.html', 'example-setups/index.html', 'calculators/index.html', 'community/index.html']) assert.ok((await read(path)).includes('/patterns/'), path);
});
