import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [canvasSource, stylesheet] = await Promise.all([
  readFile(new URL('../sketch/js/canvas.js', import.meta.url), 'utf8'),
  readFile(new URL('../sketch/css/style.css', import.meta.url), 'utf8'),
]);

test('pointer-focused canvas suppresses the full-workbench focus border', () => {
  assert.match(
    canvasSource,
    /svg\.classList\.add\('pointer-focused'\);\s*svg\.focus\(\{ preventScroll: true \}\);/,
  );
  assert.match(
    stylesheet,
    /#canvas\.pointer-focused:focus-visible\s*\{\s*outline:\s*none;\s*\}/,
  );
});

test('keyboard interaction restores the canvas focus cue', () => {
  assert.match(
    canvasSource,
    /window\.addEventListener\('keydown', e => \{\s*svg\.classList\.remove\('pointer-focused'\);/,
  );
  assert.match(
    stylesheet,
    /#canvas:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\);/s,
  );
});
