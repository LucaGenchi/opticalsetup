// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isEmbeddedShareURL, buildShareURL, sharedSceneFromURL } from '../sketch/js/share.js';
import { state, parseSketch, replaceScene, changed } from '../sketch/js/state.js';
import { registry } from '../sketch/js/elements.js';

test('a shared pattern frame cannot replace an existing workbench autosave', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const ownBench = JSON.stringify({ elements: [{ id: 'personal', type: 'mirror', x: 55, y: 80 }], beams: [] });
  let stored = ownBench;
  let writes = 0;
  globalThis.localStorage = { getItem: () => stored, setItem: (_, value) => { writes++; stored = value; } };
  t.after(() => {
    state.embedMode = false;
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  const scene = await readFile(new URL('../patterns/img-01/scene.json', import.meta.url), 'utf8');
  const url = await buildShareURL(scene, 'https://opticalsetup.com/sketch/?embed=1');
  state.embedMode = isEmbeddedShareURL(url);
  assert.equal(state.embedMode, true);
  replaceScene(parseSketch(await sharedSceneFromURL(url), registry), { resetHistory: true });
  state.elements[0].x += 10;
  changed();
  assert.equal(writes, 0);
  assert.equal(stored, ownBench);
  assert.ok(await sharedSceneFromURL(url), 'embed keeps its source on reload');
});

test('embed isolation recognizes damaged share links and leaves ordinary links editable', async () => {
  assert.equal(isEmbeddedShareURL('https://example.org/sketch/?embed=1#sketch=g.broken'), true);
  assert.equal(isEmbeddedShareURL('https://example.org/sketch/#sketch=g.broken'), false);
  assert.equal(isEmbeddedShareURL('https://example.org/sketch/?embed=0#sketch=g.broken'), false);
  assert.equal(isEmbeddedShareURL('https://example.org/sketch/?embed=1#help'), false);
  const main = await readFile(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
  const classify = main.indexOf('isEmbeddedShareURL(location.href)');
  assert.ok(classify > 0 && classify < main.indexOf("initCanvas($('canvas')"), 'isolate before binding editing handlers');
  assert.ok(main.includes('else if (!isEmbed && !loadAutosave(registry))'), 'damaged frame must not expose autosaved scene');
});
