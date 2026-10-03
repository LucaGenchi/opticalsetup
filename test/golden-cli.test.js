// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('golden CLI: check uses numeric tolerance and rejects stale, missing, malformed and orphan snapshots', async () => {
  // Run the real CLI in a disposable tree, never mutate the committed goldens
  // while the scene tests may be reading them in another worker.
  const root = await mkdtemp(join(tmpdir(), 'opticalsetup-golden-'));
  try {
    await mkdir(join(root, 'tools'));
    await mkdir(join(root, 'Examples'));
    await mkdir(join(root, 'community-submissions'));
    await cp(new URL('../sketch/js/', import.meta.url), join(root, 'sketch/js'), { recursive: true });
    for (const name of ['update-golden.mjs', 'golden-compare.mjs']) {
      await cp(new URL(`../tools/${name}`, import.meta.url), join(root, 'tools', name));
    }
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'Examples', 'source.json'), JSON.stringify({
      app: 'optics2d', version: 1,
      elements: [{ id: 'laser', type: 'cwlaser', x: 0, y: 0, rot: 0, params: {} }], beams: [],
    }));
    const run = (...args) => {
      const result = spawnSync(process.execPath, ['tools/update-golden.mjs', ...args], {
        cwd: root, encoding: 'utf8', timeout: 30000,
      });
      assert.ifError(result.error);
      return result;
    };
    assert.equal(run().status, 0);
    const target = join(root, 'test/golden/examples-source.json');
    const original = await readFile(target, 'utf8');
    assert.equal(run('--check').status, 0);
    assert.equal(run().status, 0);
    assert.equal(await readFile(target, 'utf8'), original, 'regeneration is deterministic');

    const roundoff = JSON.parse(original);
    assert.ok(roundoff.drawables.sum[0] > 0);
    roundoff.drawables.sum[0] *= 1 + 1e-8;
    const close = JSON.stringify(roundoff);
    await writeFile(target, close);
    assert.equal(run('--check').status, 0, '--check must use the suite tolerance');
    assert.equal(await readFile(target, 'utf8'), close, '--check must not rewrite a snapshot');
    roundoff.drawables.sum[0] *= 2;
    await writeFile(target, JSON.stringify(roundoff));
    assert.equal(run('--check').status, 1, 'a meaningful difference is stale');
    await writeFile(target, '{');
    assert.equal(run('--check').status, 1, 'invalid JSON is stale');
    await rm(target);
    assert.equal(run('--check').status, 1, 'a missing snapshot is stale');
    await writeFile(target, original);

    await writeFile(join(root, 'test/golden/removed-scene.json'), '{}');
    const orphan = run('--check');
    assert.equal(orphan.status, 1);
    assert.match(orphan.stderr, /orphan:.*removed-scene/);
    assert.doesNotMatch(orphan.stdout, /snapshots are current/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
