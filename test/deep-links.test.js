import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { examples } from '../sketch/js/examples-data.js';
import { exampleIndexFromQuery, slugifyLabel } from '../sketch/js/util.js';

test('example labels have stable URL-safe slugs', () => {
  assert.equal(
    slugifyLabel('NIF — one shot from master oscillator to target'),
    'nif-one-shot-from-master-oscillator-to-target',
  );
  assert.equal(slugifyLabel('  Mach–Zehnder interferometer  '), 'mach-zehnder-interferometer');
});

test('an example deep link resolves by label rather than list position', () => {
  assert.equal(exampleIndexFromQuery(examples, 'nif-one-shot-from-master-oscillator-to-target'), 0);
  assert.equal(exampleIndexFromQuery(examples, 'does-not-exist'), -1);
  assert.equal(exampleIndexFromQuery(examples, ''), -1);
});

test('the NIF preview command starts the generic server at the deep link', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['preview-nif'], /serve\.mjs/);
  assert.match(pkg.scripts['preview-nif'], /--entry=\/sketch\/\?example=nif-one-shot-from-master-oscillator-to-target/);
});
