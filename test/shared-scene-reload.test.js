import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildShareURL, clearSharedSceneURL, sharedSceneFromURL } from '../sketch/js/share.js';
import { registry, createElement } from '../sketch/js/elements.js';
import { state, changed, onChange, parseSketch, replaceScene, loadAutosave, serialize } from '../sketch/js/state.js';

// The listener under test lives in main.js's bootstrap. Locating it by matching
// the source formatting broke the moment anyone reformatted or wrapped the
// call, and could silently match a different block; anchor on the marker
// comment instead and balance the parentheses to find the end.
function sceneChangeListener() {
  const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
  const marker = main.indexOf('// [scene-change-listener]');
  assert.notEqual(marker, -1,
    'main.js must keep the [scene-change-listener] marker this test anchors on');
  const start = main.indexOf('onChange(', marker);
  assert.notEqual(start, -1, 'the marker must sit directly above the onChange call');
  let depth = 0;
  for (let i = start; i < main.length; i++) {
    if (main[i] === '(') depth++;
    else if (main[i] === ')' && --depth === 0) return `${main.slice(start, i + 1)};`;
  }
  throw new Error('unbalanced parentheses in the scene-change listener');
}

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
  const binding = sceneChangeListener();
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

test('the scene-change listener reads only state flags that exist', () => {
  // A renamed flag leaves a guard reading undefined, which is falsy, so
  // `if (!state.gone)` silently becomes "always true" and the guard stops
  // guarding. That is what happened to state.demoMode when it became
  // state.embedMode: nothing failed, the condition just stopped meaning
  // anything. Neither the behavioural test above nor a type-free runtime
  // catches it, because undefined and false behave identically there.
  const binding = sceneChangeListener();
  const read = [...binding.matchAll(/state\.([A-Za-z_$][\w$]*)/g)].map(match => match[1]);
  assert.ok(read.length > 0, 'the listener is expected to consult at least one state flag');
  for (const property of read) {
    assert.ok(Object.hasOwn(state, property),
      `main.js reads state.${property}, which does not exist on state — `
      + 'a renamed flag leaves a guard that is always true');
  }
  assert.ok(read.includes('embedMode'),
    'the share-URL retirement must stay gated on embedMode');
});
