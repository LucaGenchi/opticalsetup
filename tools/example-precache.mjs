// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps the bundled examples in the service worker's offline list.
//
// sketch/service-worker.js precaches every file the app needs offline,
// including each scene under Examples/ (the "../Examples/…" entries of
// PRECACHE_PATHS). tools/build-examples.mjs calls syncExamplePrecache() with
// the paths it has just written to the manifest, so adding, renaming or
// removing an example needs no hand edit of the worker.
//
// Only the example entries are touched; app modules and icons stay listed by
// hand, in their order. When the set of examples changes, the example entries
// are rewritten in manifest order and the cache generation (the `vN` in
// CACHE_NAME) goes up by one, so installed copies download the new list. When
// the set is unchanged the source is returned as it was, so running the
// generator again changes nothing.
//
// Both edits stay inside what tools/release-lib.mjs blanks for the renderer
// hash (the PRECACHE_PATHS list and the cache generation), so a new example
// remains a patch release.

const LIST = /^const PRECACHE_PATHS = \[\n([\s\S]*?)\n\];$/m;
const GENERATION = /^(const CACHE_NAME = .*?v)(\d+)(`;)$/m;
const EXAMPLE_PREFIX = '../Examples/';

export function syncExamplePrecache(source, examplePaths) {
  const list = LIST.exec(source);
  if (!list) throw new Error('service-worker.js: no PRECACHE_PATHS list in the expected format');
  if (!GENERATION.test(source)) throw new Error('service-worker.js: no CACHE_NAME ending in a vN generation');
  for (const path of examplePaths) {
    if (!path.startsWith(EXAMPLE_PREFIX)) throw new Error(`not an example path: ${path}`);
  }

  const entries = JSON.parse(`[${list[1]}]`);
  const current = entries.filter(path => path.startsWith(EXAMPLE_PREFIX));
  const wanted = [...new Set(examplePaths)];
  const sameSet = current.length === wanted.length && wanted.every(path => current.includes(path));
  if (sameSet) return { source, changed: false };

  const kept = entries.filter(path => !path.startsWith(EXAMPLE_PREFIX));
  const body = [...kept, ...wanted].map(path => `  ${JSON.stringify(path)}`).join(',\n');
  const updated = source
    .replace(LIST, () => `const PRECACHE_PATHS = [\n${body}\n];`)
    .replace(GENERATION, (_, head, number, tail) => `${head}${Number(number) + 1}${tail}`);
  return { source: updated, changed: true };
}
