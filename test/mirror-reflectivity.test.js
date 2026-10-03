// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';

const paths = elements => traceAll(elements).filter(d => d.type === 'path');

const MIRROR_TYPES = ['mirror', 'galvo', 'retroreflector', 'cmirrorx', 'cmirror', 'oap'];

test('every mirror-category element has a reflectivity param defaulting to 100%, with the transmitted-beam toggle hidden until it drops below 100%', () => {
  for (const type of MIRROR_TYPES) {
    const el = createElement(type);
    assert.equal(el.params.refl, 100, `${type} should default to 100% reflectivity`);
    assert.equal(el.params.showTransmitted, false, `${type} should default the transmitted-beam toggle to off`);
    const showSpec = registry[type].params.find(p => p.key === 'showTransmitted');
    assert.ok(showSpec, `${type} should expose a showTransmitted param`);
    assert.equal(showSpec.show({ refl: 100 }), false, `${type}'s toggle should stay hidden at 100% reflectivity`);
    assert.equal(showSpec.show({ refl: 90 }), true, `${type}'s toggle should appear once reflectivity drops below 100%`);
  }
});

// The transmitted-beam toggle (key showTransmitted, label "Trace transmitted
// beam") decides whether a partial mirror's leak exists at all. Off, the
// default, the leak simply leaves the setup: nothing is drawn behind the
// mirror and nothing reaches a detector there. On, the leak is drawn and
// traced like any other beam. Before PR #193 "off" only hid a leak that was
// still traced; Luca chose the new meaning for saved scenes too.
test('a partial mirror with its transmitted beam off loses the leak: nothing drawn, nothing read behind it', () => {
  for (const type of ['mirror', 'cmirror', 'cmirrorx']) {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'line';
    const mirror = createElement(type, 150, 0);
    mirror.rot = 45;
    mirror.params.refl = 80;
    const detector = createElement('detector', 300, 0);

    const off = paths([laser, mirror, detector]);
    assert.ok(!off.some(p => p.pts.some(pt => pt.x > 150 + 1e-6)), `${type}: nothing drawn through the mirror`);
    assert.equal(detectorReading(detector.id), null, `${type}: nothing traced through the mirror`);

    mirror.params.showTransmitted = true;
    const on = paths([laser, mirror, detector]);
    assert.ok(on.some(p => p.pts.some(pt => pt.x > 150 + 1e-6)), `${type}: the leak is drawn once switched on`);
    assert.ok(Math.abs(detectorReading(detector.id).signal - 0.2) < 1e-9, `${type}: and a detector behind reads it`);
  }
});

test('a leak switched on is traced and drawn however weak, through further optics too', () => {
  for (const type of ['mirror', 'cmirror', 'cmirrorx']) for (const reflectivity of [98.1, 99, 99.5, 99.9]) {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'line';
    const mirror = createElement(type, 150, 0);
    mirror.rot = 45;
    mirror.params.refl = reflectivity;
    mirror.params.showTransmitted = true;
    const filter = createElement('filter', 225, 0);
    filter.params.ftype = 'nd';
    filter.params.trans = 1;
    const detector = createElement('detector', 300, 0);

    const drawn = paths([laser, mirror, filter, detector]);
    const reading = detectorReading(detector.id);
    assert.ok(reading, `${type} at ${reflectivity}%: the leak reaches the detector past the filter`);
    assert.ok(Math.abs(reading.signal - (1 - reflectivity / 100)) < 1e-9);
    assert.ok(drawn.some(p => p.pts.some(pt => pt.x > 225 + 1e-6)), `${type} at ${reflectivity}%: and is drawn there`);
  }
});

test('a fully reflective mirror is unaffected: no leak traced or drawn', () => {
  const laser = createElement('cwlaser', 0, 0);
  const mirror = createElement('mirror', 150, 0);
  mirror.rot = 45;
  const detector = createElement('detector', 300, 0);

  traceAll([laser, mirror, detector]);
  assert.equal(detectorReading(detector.id), null, 'a 100%-reflective mirror should leak nothing');
});

test('every laser source has an Average power (W) parameter', () => {
  for (const type of ['cwlaser', 'pulsedlaser', 'sclaser']) {
    const laser = createElement(type);
    assert.ok(Number.isFinite(laser.params.avgPowerW), `${type} avgPowerW`);
    assert.ok(laser.params.avgPowerW > 0, `${type} avgPowerW > 0`);
    const spec = registry[type].params.find(p => p.key === 'avgPowerW');
    assert.ok(spec, `${type} registry should declare avgPowerW`);
    assert.equal(spec.label, 'Average power (W)');
  }
});
