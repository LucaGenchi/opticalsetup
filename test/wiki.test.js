import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
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
    assert.ok(words >= 18 && words <= 28 && entry.summary.length <= 190, entry.type);
    for (const match of html.matchAll(/href="(?:\.\.\/\.\.\/wiki\/|\.\.\/)([a-z]+)\/"/g)) {
      assert.ok(WIKI_TYPES.has(match[1]), `${entry.type} links to absent article ${match[1]}`);
    }
  }
});
