// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// tools/build-examples.mjs keeps the bundled examples in the service worker's
// offline list through syncExamplePrecache(). These tests pin what it may
// change (the example entries and the cache generation, nothing else) and
// that a new example therefore leaves the app's release hash alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncExamplePrecache } from '../tools/example-precache.mjs';
import { schemeOf, CURRENT_SCHEME } from '../tools/release-lib.mjs';
import { examples } from '../sketch/js/examples-data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const worker = readFileSync(join(ROOT, 'sketch/service-worker.js'), 'utf8');
const manifestPaths = examples.map(example => example.path);
const NEW_EXAMPLE = '../Examples/Beam%20Routing/A%20new%20example.json';

const precache = source => JSON.parse(/const PRECACHE_PATHS = (\[[\s\S]*?\]);/.exec(source)[1]);
const generation = source => Number(/^const CACHE_NAME = .*?v(\d+)`;$/m.exec(source)[1]);
const notExamples = paths => paths.filter(path => !path.startsWith('../Examples/'));

test('the committed worker already lists every example, so a rebuild changes nothing', () => {
  const result = syncExamplePrecache(worker, manifestPaths);
  assert.equal(result.changed, false);
  assert.equal(result.source, worker);
  // Order alone is not a change.
  assert.equal(syncExamplePrecache(worker, [...manifestPaths].reverse()).changed, false);
});

test('a new example is listed once and the cache generation goes up by one', () => {
  const added = syncExamplePrecache(worker, [...manifestPaths, NEW_EXAMPLE]);
  assert.equal(added.changed, true);
  const paths = precache(added.source);
  assert.equal(paths.filter(path => path === NEW_EXAMPLE).length, 1);
  assert.equal(generation(added.source), generation(worker) + 1);
  // App modules and icons keep their entries and order.
  assert.deepEqual(notExamples(paths), notExamples(precache(worker)));
  // Running it again is a no-op: no second bump.
  const again = syncExamplePrecache(added.source, [...manifestPaths, NEW_EXAMPLE]);
  assert.equal(again.changed, false);
  assert.equal(again.source, added.source);
});

test('a removed or renamed example leaves the list', () => {
  const [first, ...rest] = manifestPaths;
  const removed = syncExamplePrecache(worker, rest);
  assert.equal(removed.changed, true);
  assert.ok(!precache(removed.source).includes(first));
  assert.equal(generation(removed.source), generation(worker) + 1);

  const renamed = syncExamplePrecache(worker, [NEW_EXAMPLE, ...rest]);
  assert.equal(renamed.changed, true);
  assert.ok(precache(renamed.source).includes(NEW_EXAMPLE));
  assert.ok(!precache(renamed.source).includes(first));
});

test('everything outside the list and the generation is untouched', () => {
  const { source } = syncExamplePrecache(worker, [...manifestPaths, NEW_EXAMPLE]);
  const blank = text => text
    .replace(/^const PRECACHE_PATHS = \[[\s\S]*?^\];$/m, '')
    .replace(/^(const CACHE_NAME = .*?)v\d+(`;)$/m, '$1$2');
  assert.equal(blank(source), blank(worker));
});

test('a new example keeps the app hash: the release normalisation sees no change', () => {
  const normalize = schemeOf(CURRENT_SCHEME).rendererNormalize['sketch/service-worker.js'];
  const { source } = syncExamplePrecache(worker, [...manifestPaths, NEW_EXAMPLE]);
  assert.equal(normalize(source), normalize(worker));
});

test('it refuses inputs it cannot handle safely', () => {
  assert.throws(() => syncExamplePrecache('const x = 1;\n', manifestPaths), /PRECACHE_PATHS/);
  assert.throws(() => syncExamplePrecache(worker.replace(/v\d+`;/, 'pwa`;'), manifestPaths), /CACHE_NAME/);
  assert.throws(() => syncExamplePrecache(worker, ['./js/main.js']), /not an example path/);
});
