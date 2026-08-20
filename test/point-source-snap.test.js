// Regression coverage for the feedback-round-1 features re-applied on top of
// the direct-manipulation branch: unified evanescent point source,
// concave-lens outline, and surface-aware snap anchors.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';

test('point source rays fade evanescently unless a nearby lens collects them', () => {
  const src = createElement('pointsource', 0, 0);
  src.params.nrays = 4;
  src.params.spread = 360;

  const alone = traceAll([src]);
  const maxAlone = Math.max(...alone.filter(d => d.pts).flatMap(d => d.pts.map(p => Math.hypot(p.x, p.y))));
  assert.ok(Math.abs(maxAlone - 110) < 1e-6, `unattended rays fade at 110mm, got ${maxAlone}`);

  const lens = createElement('lens', 100, 0);
  lens.params.f = 50;
  lens.params.dia = 200;
  const collected = traceAll([src, lens]);
  const maxCollected = Math.max(...collected.filter(d => d.pts).flatMap(d => d.pts.map(p => Math.hypot(p.x, p.y))));
  assert.ok(maxCollected > 1000, `lens-collected rays propagate on, got ${maxCollected}`);
});

test('point source emission angle restricts the fan without duplicate full-circle samples', () => {
  const full = registry.pointsource.source({ params: { spread: 360, nrays: 8 } });
  assert.equal(full.length, 8);
  const angles = full.map(r => Math.atan2(r.dy, r.dx).toFixed(6));
  assert.equal(new Set(angles).size, 8, 'no duplicated -180/+180 sample');
  assert.ok(full.every(r => r.evan && r.evanLen === 110));

  const cone = registry.pointsource.source({ params: { spread: 60, nrays: 5 } });
  assert.ok(cone.every(r => Math.abs(Math.atan2(r.dy, r.dx)) <= (30 + 1e-9) * Math.PI / 180));
});

test('led and lamp were fully removed, superseded by Point source', () => {
  assert.equal(Object.hasOwn(registry, 'led'), false);
  assert.equal(Object.hasOwn(registry, 'lamp'), false);
  assert.ok(!registry.pointsource.hidden, 'pointsource is visible');
  // still searchable under their old names
  assert.ok(registry.pointsource.aliases.includes('led'));
  assert.ok(registry.pointsource.aliases.includes('lamp'));
});

test('concave lens outline curves on the vertical refracting faces', () => {
  const el = createElement('lensc');
  const path = registry.lensc.svg(el);
  // both vertical faces are quadratic curves through the mid-plane (x≈0
  // control points), rather than curves along the top/bottom edges
  const d = path.match(/d="([^"]+)"/)[1];
  assert.match(d, /L [\d.+-]+,[\d.+-]+ Q [\d.+-]+,0 /, 'vertical face uses a Q through y-axis midpoint');
  assert.ok(!/Q [\d.+-]+,[\d.+-]*[1-9][\d.]* [\d.+-]+,-?\d/.test(d.split('Z')[0].split('Q')[0]), 'no top-edge curvature');
});

test('optically active elements carry surface-aware snap anchors', () => {
  const expected = {
    cwlaser: { x: 52, y: 0 },
    pulsedlaser: { x: 52, y: 0 },
    objective: { x: 16, y: 0 },
    slm: { x: -9, y: 0 },
    dmd: { x: -9, y: 0 },
    detector: { x: -19, y: 0 },
    pmt: { x: -25, y: 0 },
    camera: { x: -22, y: 0 },
    eye: { x: -15, y: 0 },
  };
  for (const [type, pt] of Object.entries(expected)) {
    assert.deepEqual(registry[type].snapPt, pt, `${type} snapPt`);
  }
  // the supercontinuum laser inherits the same exit-aperture anchor
  assert.deepEqual(registry.sclaser.snapPt, { x: 52, y: 0 });
});
