// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { registry } from '../sketch/js/elements.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';
import '../sketch/js/detector-instruments.js';
import { WIKI_TYPES } from '../sketch/js/wiki-types.js';
import { wikiEntries, wikiToolSubjects } from '../tools/wiki-content.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('every visible component and fiber tool has a built, discoverable wiki article', async () => {
  const expected = [...Object.keys(registry).filter(type => !registry[type].hidden),
    ...wikiToolSubjects.map(tool => tool.type)].sort();
  assert.deepEqual(wikiEntries.map(entry => entry.type).sort(), expected);
  assert.deepEqual([...WIKI_TYPES].sort(), expected);
  const hub = await read('wiki/index.html');
  const sitemap = await read('sitemap.xml');
  for (const entry of wikiEntries) {
    const html = await read(`wiki/${entry.type}/index.html`);
    assert.ok(hub.includes(`href="../wiki/${entry.type}/"`), entry.type);
    assert.ok(sitemap.includes(`/wiki/${entry.type}/</loc>`), entry.type);
    assert.ok(html.includes(`class="tagline">${esc(entry.summary)}</p>`), entry.type);
    assert.ok(hub.includes(`class="desc">${esc(entry.summary)}</span>`), entry.type);
    const words = entry.summary.split(/\s+/).length;
    assert.ok(words >= 10 && words <= 28 && entry.summary.length <= 190, entry.type);
    for (const match of html.matchAll(/href="(?:\.\.\/\.\.\/wiki\/|\.\.\/)([a-z]+)\/"/g)) {
      assert.ok(WIKI_TYPES.has(match[1]), `${entry.type} links to absent article ${match[1]}`);
    }
  }
});

// The generator pre-renders formulas with KaTeX, a dev dependency (npm ci).
// CI installs it, so there a page edited by hand instead of through
// wiki-content.mjs fails; on a bare checkout without it the check skips
// with its reason.
const root = fileURLToPath(new URL('..', import.meta.url));
const katexInstalled = (() => {
  try { return spawnSync(process.execPath, ['-e', "import('katex').then(() => process.exit(0), () => process.exit(1))"], { cwd: root }).status === 0; } catch { return false; }
})();
test('the committed wiki pages match their generator', { skip: !katexInstalled && 'KaTeX is not installed (npm install); the page generator cannot run' }, () => {
  const result = spawnSync(process.execPath, ['tools/build-wiki.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
