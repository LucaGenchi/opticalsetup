// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { examples } from '../sketch/js/examples-data.js';

// Renaming an example writes its page under the new slug and leaves the old
// directory behind, still served and still linking to a scene that no longer
// exists. Every built example page must belong to an example that is still in
// the manifest.
test('every built example page still has an example behind it', () => {
  const root = fileURLToPath(new URL('../example-setups/', import.meta.url));
  // Only built pages count; example-setups/ also holds shared assets.
  const built = readdirSync(root)
    .filter(name => statSync(join(root, name)).isDirectory() && existsSync(join(root, name, 'index.html')));
  const slugs = new Set(examples.map(example => example.slug));
  assert.ok(slugs.size > 0, 'the example manifest is empty');
  const orphans = built.filter(slug => !slugs.has(slug));
  assert.deepEqual(orphans, [],
    `built example pages with no example in the manifest: ${orphans.join(', ')} — delete the directory after a rename`);
});
