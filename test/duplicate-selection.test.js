import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { registry, createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { state, replaceScene, pushUndo, undo, findSelected } from '../sketch/js/state.js';
import { copyableSelection, pasteObjects } from '../sketch/js/clipboard.js';

// Run the actual UI command with rendering stubbed out. This exercises the
// duplicate action, including selection and undo, rather than only paste.
const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
const command = name => main.slice(main.indexOf(`function ${name}(`)).split('\n}\n')[0] + '\n}';
let serial = 0;
const context = vm.createContext({
  state, registry, findSelected, pushUndo, copyableSelection, pasteObjects,
  isSingleton: type => Boolean(registry[type]?.singleton),
  newId: prefix => `${prefix}copy${++serial}`, changed() {}, renderInspector() {},
});
vm.runInContext(`${command('selectionContents')}\n${command('duplicateSelected')}`, context);
const duplicate = () => vm.runInContext('duplicateSelected()', context);

test('duplicating a detector with its screen preserves the copied connection and undo', () => {
  const detector = createElement('detector', 100, 100);
  const screen = createElement('display', 300, 100);
  screen.params.sensorId = detector.id;
  const fiber = { id: 'fiber', kind: 'fiber', pts: [{ x: 50, y: 100 }, { x: 80, y: 100 }] };
  replaceScene({ elements: [detector, screen], beams: [fiber] }, { resetHistory: true });
  state.selection = { kind: 'multi', els: [screen.id, detector.id], beams: ['fiber'] };
  duplicate();
  const copies = state.elements.slice(2);
  const copiedDetector = copies.find(el => el.type === 'detector');
  const copiedScreen = copies.find(el => el.type === 'display');
  assert.equal(copiedScreen.params.sensorId, copiedDetector.id);
  assert.equal(screen.params.sensorId, detector.id);
  assert.equal(copiedDetector.x, 130);
  assert.equal(state.beams[1].pts[0].x, 80);
  assert.equal(state.selection.els.length, 2);
  undo();
  assert.equal(state.elements.length, 2);
  assert.equal(state.beams.length, 1);
});

test('duplicating a screen alone retains its original detector', () => {
  const detector = createElement('detector', 100, 100);
  const screen = createElement('display', 300, 100);
  screen.params.sensorId = detector.id;
  replaceScene({ elements: [detector, screen], beams: [] }, { resetHistory: true });
  state.selection = { kind: 'element', id: screen.id };
  duplicate();
  assert.equal(state.elements[2].params.sensorId, detector.id);
  assert.equal(state.selection.id, state.elements[2].id);
});

test('duplicate ignores singleton-only selections and locked demos', () => {
  const singleton = Object.keys(registry).find(type => registry[type].singleton);
  assert.ok(singleton);
  const el = createElement(singleton, 0, 0);
  replaceScene({ elements: [el], beams: [] }, { resetHistory: true });
  state.selection = { kind: 'element', id: el.id };
  duplicate();
  assert.equal(state.elements.length, 1);
  state.demoMode = true;
  try {
    state.selection = { kind: 'multi', els: [el.id], beams: [] };
    duplicate();
    assert.equal(state.elements.length, 1);
  } finally { state.demoMode = false; }
});
