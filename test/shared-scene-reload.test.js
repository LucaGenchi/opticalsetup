import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildShareURL, clearSharedSceneURL, shareURLForScene, sharedSceneFromURL } from '../sketch/js/share.js';
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

test('a share URL describes the scene as it settles, not as it was clicked', async () => {
  // Compressing the payload is asynchronous, so an edit can land between
  // reading the scene and installing the fragment. The URL must describe the
  // edited scene, not the one the click started with.
  const scenes = ['first', 'edited-during-compression'];
  let reads = 0;
  const readScene = () => scenes[Math.min(reads++, scenes.length - 1)];
  const build = async text => `https://example.org/sketch/#sketch=${text}`;
  const moved = await shareURLForScene(readScene, build);
  assert.equal(moved.scene, 'edited-during-compression');
  assert.match(moved.url, /edited-during-compression$/);
  assert.equal(moved.settled, true, 'a scene that settles must be safe to install');

  // A scene still moving on the second read must not be parked in history: a
  // stale fragment there outlives the edit and wins on the next reload.
  let tick = 0;
  const neverSettles = await shareURLForScene(() => `scene-${tick++}`, build);
  assert.equal(neverSettles.settled, false);

  const still = await shareURLForScene(() => 'unchanged', build);
  assert.equal(still.settled, true);
  assert.match(still.url, /unchanged$/);
});

test('the share handler only writes history once the scene has settled', async () => {
  // Structural: the guard lives inside a DOM click handler, so assert the
  // shape rather than reimplementing it. Installing the fragment
  // unconditionally is the regression that matters.
  const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
  const handler = main.slice(main.indexOf("$('btnShare').addEventListener"));
  const install = handler.indexOf("history.replaceState");
  assert.ok(install > -1, 'the share handler still installs the snapshot');
  assert.match(handler.slice(0, install), /shareURLForScene\(/,
    'the share URL must be built through shareURLForScene, which settles the scene');
  assert.match(handler.slice(Math.max(0, install - 60), install), /if \(settled\)/,
    'history must only be written when the scene settled');
});
