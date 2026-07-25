import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canvasSource = await readFile(new URL('../sketch/js/canvas.js', import.meta.url), 'utf8');

test('newly drawn fibers propagate beams by default', () => {
  assert.match(
    canvasSource,
    /kind: 'fiber', pts, color: '#e8a800', width: 4, propagate: true,/,
  );
});
