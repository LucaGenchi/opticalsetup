// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ES modules on an import cycle initialise in whatever order the first import
// reaches them. A constant read at load time by one module and exported by the
// other is then undefined for one entry order only -- which a single test
// process never sees, because it loads everything once. Each entry point gets
// a fresh process here.
const root = fileURLToPath(new URL('..', import.meta.url));

for (const entry of ['raytrace', 'elements', 'parametric', 'state', 'pulses']) {
  test(`the workbench modules load when ${entry}.js is imported first`, () => {
    const result = spawnSync(process.execPath, [
      '--input-type=module', '-e', `await import('./sketch/js/${entry}.js');`,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, `importing ${entry}.js first failed:\n${result.stderr}`);
  });
}
