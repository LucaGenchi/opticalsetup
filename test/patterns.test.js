// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { buildPatternFiles, loadPatterns } from '../tools/build-patterns.mjs';
import { parseSurvey, joinExamples } from '../tools/patterns/catalogue.mjs';
import { exampleScene, diagramSVG, validateExample } from '../tools/patterns/diagram.mjs';
import { registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { decodeSharePayload } from '../sketch/js/share.js';
import { readFilters, filterParams, matchesPattern } from '../patterns/assets/filter.js';

const entries = await loadPatterns();
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('all 162 survey patterns have a distinct authored example and stable route', () => {
  assert.equal(entries.length, 162);
  assert.equal(new Set(entries.map(entry => entry.function)).size, 19);
  assert.equal(new Set(entries.map(entry => entry.slug)).size, 162);
  assert.equal(new Set(entries.map(entry => entry.example.title)).size, 162);
  for (const entry of entries) assert.equal(validateExample(entry.example), entry.example);
  assert.throws(() => joinExamples(entries, []), /missing authored/);
  assert.throws(() => joinExamples(entries, [entries[0].example, entries[0].example]), /Duplicate/);
  assert.throws(() => parseSurvey('No entries'), /empty/);
});

test('generated pages, arrangement maps and downloads are current and deterministic', async () => {
  const files = await buildPatternFiles();
  assert.equal(files.size, 487);
  for (const [path, content] of files) assert.equal(await read(path), content, `${path}: rebuild patterns`);
  const folders = (await readdir(new URL('../patterns/', import.meta.url), { withFileTypes: true })).filter(item => item.isDirectory() && item.name !== 'assets').map(item => item.name).sort();
  assert.deepEqual(folders, entries.map(entry => entry.slug).sort(), 'orphaned generated article');
});

test('every published setup survives normalization and its share-link round trip', async () => {
  for (const entry of entries) {
    const raw = await read(`patterns/${entry.slug}/scene.json`);
    const scene = parseSketch(raw, registry);
    assert.deepEqual(parseSketch(scene, registry), scene, `${entry.id}: normalization must be stable`);
    const html = await read(`patterns/${entry.slug}/index.html`);
    const payload = /href="\.\.\/\.\.\/sketch\/#sketch=([gj]\.[A-Za-z0-9_-]+)"/.exec(html)?.[1];
    assert.ok(payload, `${entry.id}: missing share action`);
    assert.deepEqual(JSON.parse(await decodeSharePayload(payload)), JSON.parse(raw));
    for (const element of scene.elements) {
      assert.ok(registry[element.type], entry.id);
      assert.ok([element.x, element.y, element.rot].every(Number.isFinite), entry.id);
    }
    if (entry.example.mode === 'schematic') {
      assert.ok(scene.elements.every(element => ['textlabel', 'highlight'].includes(element.type)), `${entry.id}: schematic must not contain active optical elements`);
      assert.equal(traceScene(scene.elements, scene.beams).drawables.length, 0, `${entry.id}: annotations must not emit rays`);
      assert.ok(html.includes('does not run an optical simulation'));
    }
  }
});

test('diagram generation is repeatable, escaped and rejects malformed geometry', () => {
  const example = entries[0].example;
  assert.equal(diagramSVG(example), diagramSVG(example));
  assert.ok(!/NaN|Infinity|undefined/.test(diagramSVG(example)));
  const poisoned = structuredClone(example);
  poisoned.nodes[0].note = '<script>alert("x")</script>';
  assert.ok(!diagramSVG(poisoned).includes('<script>'));
  poisoned.nodes[0].x = NaN;
  assert.throws(() => diagramSVG(poisoned), /outside diagram/);
  const invalidEdge = structuredClone(example);
  invalidEdge.edges[0].to = 'missing';
  assert.throws(() => exampleScene({ ...invalidEdge, mode: 'schematic' }));
});

test('filters combine OR within fields and AND across fields, preserving URL state', () => {
  const patterns = entries.map(entry => ({ ...entry, mode: entry.example.mode }));
  const optics = patterns.filter(entry => matchesPattern(entry, { q: 'relay', discipline: ['Microscopy'] }));
  assert.ok(optics.some(entry => entry.id === 'IMG-01'));
  assert.ok(!optics.some(entry => entry.id === 'QUANT-01'));
  const fields = { q: '', function: ['Handling pulses and nonlinear interactions'], discipline: ['Terahertz optics'] };
  assert.ok(patterns.filter(entry => matchesPattern(entry, fields)).some(entry => entry.id === 'PULSE-10'));
  const any = { q: '', type: ['Optical layout', 'Pattern family'] };
  assert.ok(patterns.some(entry => matchesPattern(entry, any) && entry.type === 'Optical layout'));
  assert.ok(patterns.some(entry => matchesPattern(entry, any) && entry.type === 'Pattern family'));
  assert.equal(patterns.filter(entry => matchesPattern(entry, { q: 'a definitely nonexistent pattern zzz' })).length, 0);
  const state = readFilters(new URLSearchParams('q=pump-probe&discipline=Ultrafast+optics&discipline=Terahertz+optics&mode=schematic'));
  assert.deepEqual(readFilters(filterParams(state)), state);
});

test('every pattern route is discoverable and relative article links stay inside the published catalogue', async () => {
  const sitemap = await read('sitemap.xml');
  const ids = new Set(entries.map(entry => entry.slug));
  const hub = await read('patterns/index.html');
  assert.equal((hub.match(/data-pattern=/g) || []).length, 162);
  for (const entry of entries) {
    assert.ok(sitemap.includes(`/patterns/${entry.slug}/</loc>`), entry.id);
    const html = await read(`patterns/${entry.slug}/index.html`);
    for (const match of html.matchAll(/href="\.\.\/([a-z]+-\d{2})\/"/g)) assert.ok(ids.has(match[1]), `${entry.id}: broken relation ${match[1]}`);
    assert.ok(html.includes(`<link rel="canonical" href="https://opticalsetup.com/patterns/${entry.slug}/">`));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
  }
  for (const path of ['index.html', 'sketch/index.html', 'wiki/index.html', 'example-setups/index.html', 'calculators/index.html', 'community/index.html']) assert.ok((await read(path)).includes('/patterns/'), path);
});
