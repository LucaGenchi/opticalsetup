// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { state } from '../sketch/js/state.js';
import { createElement } from '../sketch/js/elements.js';

for (const reducedMotion of [true, false]) {
  test(`Play/Pause controls galvo motion with Reduced Motion ${reducedMotion}`, async () => {
    const frames = new Map();
    let nextFrame = 0;
    const layers = new Map();
    const listeners = new Map();
    globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
    globalThis.document = {
      addEventListener: (name, fn) => listeners.set(name, fn),
      dispatchEvent: () => {},
    };
    globalThis.requestAnimationFrame = fn => { frames.set(++nextFrame, fn); return nextFrame; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);
    const svg = {
      innerHTML: '',
      querySelector: id => {
        if (!layers.has(id)) layers.set(id, { innerHTML: '', setAttribute() {} });
        return layers.get(id);
      },
      getBoundingClientRect: () => ({ width: 1000, height: 700 }),
    };
    state.embedMode = true;
    state.showGrid = false;
    state.selection = null;
    state.beams = [];
    state.elements = [createElement('galvo', 200, 100)];
    Object.assign(state.elements[0].params, { scanMode: 'triangle', scanAmplitude: 1, scanFrequencyHz: 500 });
    const canvas = await import(`../sketch/js/canvas.js?reduced=${reducedMotion}`);
    canvas.initCanvas(svg, null);
    canvas.setMechanicsMode(true);
    canvas.renderAll();
    assert.equal(canvas.getPulsePlayback().playing, !reducedMotion);
    assert.equal(canvas.getPulsePlayback().hasPulses, false);
    assert.equal(canvas.getPulsePlayback().hasMotion, true, 'CW-only scanning must expose playback');
    assert.equal(frames.size, reducedMotion ? 0 : 1, 'Reduced Motion prevents autoplay');
    const initial = layers.get('#elementLayer').innerHTML;
    canvas.setPulsePlaying(true);
    assert.equal(frames.size, 1, 'explicit Play schedules mechanical motion even with Reduced Motion');
    function tick(time) {
      const callbacks = [...frames.values()]; frames.clear();
      for (const fn of callbacks) fn(time);
    }
    tick(100); tick(150);
    const moved = layers.get('#elementLayer').innerHTML;
    assert.notEqual(moved, initial, 'the rendered mirror must rotate');
    canvas.setPulsePlaying(false);
    assert.equal(frames.size, 0, 'Pause cancels mechanical motion');
    canvas.renderAll();
    assert.equal(layers.get('#elementLayer').innerHTML, moved, 'Pause retains the mirror position');
    canvas.setPulsePlaying(true);
    tick(10000);
    assert.equal(layers.get('#elementLayer').innerHTML, moved, 'resume must not include paused time');
    tick(10050);
    assert.notEqual(layers.get('#elementLayer').innerHTML, moved);
    canvas.setPulsePlaying(false);
    canvas.resetPulseTime();
    assert.equal(layers.get('#elementLayer').innerHTML, initial, 'Reset restores the mechanical phase too');
    assert.equal(frames.size, 0);

    // Reproduce the reported scene: a numeric scan clock driven by pulses,
    // even when the selected scale draws the high repetition rate as CW.
    state.elements.unshift(createElement('pulsedlaser', 0, 100));
    canvas.setPulseSpeed(1e6);
    canvas.renderAll();
    const pulsedInitial = layers.get('#elementLayer').innerHTML;
    assert.equal(canvas.getPulsePlayback().hasPulses, true);
    canvas.setPulsePlaying(true);
    assert.equal(frames.size, 2, 'pulse and mechanical loops both start');
    tick(20000); tick(20050);
    assert.equal(canvas.getPulsePlayback().timeNs, 50000);
    const pulsedMoved = layers.get('#elementLayer').innerHTML;
    assert.notEqual(pulsedMoved, pulsedInitial, 'pulses advance the rendered galvo on the shared clock');
    canvas.setPulsePlaying(false);
    assert.equal(frames.size, 0, 'Pause cancels both loops');
    canvas.renderAll();
    assert.equal(layers.get('#elementLayer').innerHTML, pulsedMoved);
    assert.equal(canvas.getPulsePlayback().timeNs, 50000);
    canvas.setPulsePlaying(true);
    listeners.get('visibilitychange')();
    tick(30000);
    assert.equal(canvas.getPulsePlayback().timeNs, 50000, 'visibility changes do not skip time');
    assert.equal(layers.get('#elementLayer').innerHTML, pulsedMoved);
    canvas.setPulsePlaying(false);
    canvas.resetPulseTime();
    assert.equal(canvas.getPulsePlayback().timeNs, 0);
    assert.equal(layers.get('#elementLayer').innerHTML, pulsedInitial);
  });
}
