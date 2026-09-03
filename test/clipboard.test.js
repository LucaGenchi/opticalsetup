import test from 'node:test';
import assert from 'node:assert/strict';

import { copyableSelection, pasteObjects } from '../sketch/js/clipboard.js';

const el = (id, type, over = {}) => ({ id, type, x: 100, y: 100, rot: 0, params: {}, ...over });
let counter = 0;
// A distinct prefix, so a 'reassigned' id can never coincidentally equal
// the original one it replaced.
const newId = pre => `${pre}new${++counter}`;
const fresh = () => { counter = 0; };

test('a selection is copied by value, not by reference', () => {
  const source = el('e1', 'lens');
  const copied = copyableSelection({ els: [source], beams: [] });
  copied.els[0].x = 999;
  copied.els[0].params.f = 50;
  assert.equal(source.x, 100, 'editing the clipboard must not reach the bench');
  assert.deepEqual(source.params, {});
});

test('singletons are refused at copy time and at paste time', () => {
  const isSingleton = type => type === 'onlyone';
  // nothing but a singleton -> nothing to copy
  assert.equal(copyableSelection({ els: [el('e1', 'onlyone')], beams: [] }, isSingleton), null);
  // alongside something copyable it is dropped, not carried
  const copied = copyableSelection({ els: [el('e1', 'onlyone'), el('e2', 'lens')], beams: [] }, isSingleton);
  assert.deepEqual(copied.els.map(e => e.type), ['lens']);

  // and one already on the bench cannot be pasted again
  fresh();
  const pasted = pasteObjects({ els: [el('e9', 'onlyone'), el('e8', 'lens')], beams: [] },
    { newId, isSingleton, hasType: type => type === 'onlyone' });
  assert.deepEqual(pasted.els.map(e => e.type), ['lens']);
});

test('pasting reassigns ids and offsets the copies', () => {
  fresh();
  const pasted = pasteObjects({ els: [el('e1', 'lens')], beams: [] }, { newId, offset: 30 });
  assert.notEqual(pasted.els[0].id, 'e1', 'the copy must not share the original id');
  assert.match(pasted.els[0].id, /^enew\d+$/);
  assert.equal(pasted.els[0].x, 130);
  assert.equal(pasted.els[0].y, 130);
});

test('a beam is offset point by point', () => {
  fresh();
  const beam = { id: 'b1', kind: 'fiber', pts: [{ x: 0, y: 0 }, { x: 50, y: 20 }] };
  const pasted = pasteObjects({ els: [], beams: [beam] }, { newId, offset: 30 });
  assert.deepEqual(pasted.beams[0].pts, [{ x: 30, y: 30 }, { x: 80, y: 50 }]);
  assert.equal(beam.pts[0].x, 0, 'the original is untouched');
});

test('a screen copied with its detector follows the copy, not the original', () => {
  // This is the one that fails silently: without the remap the pasted screen
  // still reads the original detector, which looks like a working paste right
  // up until the two disagree.
  fresh();
  const detector = el('e1', 'photodetector');
  const screen = el('e2', 'display', { params: { sensorId: 'e1' } });
  const pasted = pasteObjects({ els: [detector, screen], beams: [] }, { newId });
  const [newDetector, newScreen] = pasted.els;
  assert.notEqual(newDetector.id, 'e1');
  assert.equal(newScreen.params.sensorId, newDetector.id);
  assert.equal(screen.params.sensorId, 'e1', 'the original link is untouched');
});

test('a screen copied without its detector keeps pointing at the original', () => {
  // Deliberate: the detector is still on the bench, so the copy reading it is
  // the only sensible outcome. Blanking the link would silently break it.
  fresh();
  const screen = el('e2', 'display', { params: { sensorId: 'e1' } });
  const pasted = pasteObjects({ els: [screen], beams: [] }, { newId });
  assert.equal(pasted.els[0].params.sensorId, 'e1');
});

test('an empty or absent clipboard pastes nothing', () => {
  assert.equal(pasteObjects(null, { newId }), null);
  assert.equal(pasteObjects({ els: [], beams: [] }, { newId }), null);
});
