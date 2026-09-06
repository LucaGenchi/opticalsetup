import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, getVisualBounds } from '../sketch/js/elements.js';
import { state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';

function bounds() {
  const [x, y, w, h] = buildSVG().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

test('automatic export bounds include distant authored beams and fibers', () => {
  state.elements = [createElement('cwlaser', 0, 0)];
  state.beams = [
    { id: 'arrow', kind: 'beam', pts: [{ x: 900, y: 700 }, { x: 1200, y: 900 }], width: 2, color: '#e02020', arrow: true },
    { id: 'fiber', kind: 'fiber', pts: [{ x: -900, y: -700 }, { x: -1200, y: -900 }], width: 4, color: '#e8a800' },
  ];
  const b = bounds();
  for (const beam of state.beams) for (const p of beam.pts) {
    assert.ok(p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1,
      `authored point ${p.x},${p.y} must remain inside the export crop`);
  }
});

test('unterminated traced rays still have a bounded contribution to export', () => {
  state.elements = [createElement('cwlaser', 0, 0)]; state.beams = [];
  const b = bounds();
  assert.ok(b.x1 < 300 && b.x0 > -300, 'a runaway ray must not expand the figure indefinitely');
});

test('an explicit figure frame still crops distant manual artwork', () => {
  const frame = createElement('figureframe', 0, 0);
  state.elements = [frame];
  state.beams = [{ id: 'arrow', kind: 'beam', pts: [{ x: 900, y: 700 }, { x: 1200, y: 900 }], width: 2, color: '#e02020', arrow: true }];
  assert.deepEqual(bounds(), getVisualBounds(frame, { includeLabel: false }));
});

test('coordinates near the float limit still produce a finite figure', () => {
  // Nothing clips authored points to the element box any more, so a
  // hand-edited or corrupted sketch can reach `max - min` directly. Points at
  // opposite ends of the float range overflow that subtraction to Infinity,
  // and the SVG and PNG exports inherit a non-finite size.
  state.elements = [createElement('cwlaser', 0, 0)];
  state.beams = [{
    id: 'huge', kind: 'beam', width: 2, color: '#e02020',
    pts: [{ x: -1e308, y: 0 }, { x: 1e308, y: 10 }],
  }];
  const svg = buildSVG();
  const box = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(box.every(Number.isFinite), `export dimensions must be finite, got ${box.join(' ')}`);
  assert.ok(box[2] > 0 && box[3] > 0, 'and positive');
  assert.doesNotMatch(svg, /Infinity|NaN/, 'no non-finite number may reach the markup');

  // Elements carry only a finiteness check on import, so the same window has
  // to catch them: on their own they define the ray clamp box, and two at
  // opposite extremes overflow it just as readily.
  state.elements = [createElement('cwlaser', -1e308, 0), createElement('cwlaser', 1e308, 0)];
  state.beams = [];
  const wide = buildSVG().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(wide.every(Number.isFinite), `element extremes must stay finite, got ${wide.join(' ')}`);
});
