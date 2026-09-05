import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildShareURL, clearSharedSceneURL, sharedSceneFromURL } from '../sketch/js/share.js';
import { registry, createElement } from '../sketch/js/elements.js';
import { state, changed, onChange, parseSketch, replaceScene, loadAutosave, serialize } from '../sketch/js/state.js';

test('opening, editing, and sharing a scene never reimports an old snapshot on reload', async t => {
  const storage = new Map();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  globalThis.localStorage = {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  };
  const source = createElement('cwlaser', 100, 200);
  let href = await buildShareURL(JSON.stringify({ elements: [source], beams: [] }), 'https://example.org/sketch/?lang=en');
  const savedHistory = { marker: 'preserved' };
  const navigation = { state: savedHistory, replaceState(data, title, url) { assert.equal(data, savedHistory); href = url; } };
  const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
  const binding = main.match(/onChange\(\(\) => \{[\s\S]*?\}\);/)[0];
  // Exercise the actual bootstrap listener with drawing stubbed out.
  vm.runInNewContext(binding, {
    state, onChange, clearSharedSceneURL: () => clearSharedSceneURL(href, navigation),
    renderAll() {}, syncToolbar() {}, refreshMeasurements() {}, autoAdjustTimeScale() {}, announceIllustrativeMotion() {},
  });
  replaceScene(parseSketch(await sharedSceneFromURL(href), registry), { resetHistory: true });
  assert.equal(href, 'https://example.org/sketch/?lang=en');
  state.elements[0].x = 250; changed();
  assert.equal(await sharedSceneFromURL(href), null);
  assert.equal(loadAutosave(registry), true);
  assert.equal(state.elements[0].x, 250);

  // The Share action puts a new snapshot in the address bar. The next edit
  // must retire that snapshot too, rather than restoring it on reload.
  href = await buildShareURL(serialize(), href);
  replaceScene({ elements: [], beams: [] });
  assert.equal(await sharedSceneFromURL(href), null);
  assert.equal(loadAutosave(registry), true);
  assert.deepEqual(state.elements, []);
});

test('ordinary URL fragments are preserved', () => {
  const navigation = { replaceState() { assert.fail('ordinary fragments must not be changed'); } };
  clearSharedSceneURL('https://example.org/sketch/#help', navigation);
  clearSharedSceneURL('https://example.org/sketch/?lang=en', navigation);
});
