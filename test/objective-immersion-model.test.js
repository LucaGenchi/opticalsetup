import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateLegacyObjectiveParams,
  normalizeObjectiveParams,
  OBJECTIVE_MEDIA,
  objectiveMaximumNA,
  objectiveMediumIndex,
  objectiveMediumKey,
  objectiveNumericalAperture,
  OBJECTIVE_NA_DEFAULT,
} from '../sketch/js/objective.js';

test('objective media carry the fixed index, cap, and rendering metadata in one catalogue', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(OBJECTIVE_MEDIA).map(([key, value]) => [key, {
      index: value.index,
      maxNA: value.maxNA,
      fill: value.fill,
    }])),
    {
      air: { index: 1, maxNA: 0.85, fill: null },
      water: { index: 1.333, maxNA: 1.27, fill: '#8fd3ed' },
      oil: { index: 1.518, maxNA: 1.49, fill: '#c9a227' },
      custom: { index: null, maxNA: null, fill: '#9fc8bd' },
      legacy: { index: null, maxNA: 1.49, fill: null },
    },
  );
  assert.equal(OBJECTIVE_MEDIA.legacy.unresolved, true);
  assert.equal(OBJECTIVE_MEDIA.legacy.selectable, false);
});

test('medium keys accept catalogue values, infer unresolved old high NA, and reject malformed values', () => {
  for (const immersion of Object.keys(OBJECTIVE_MEDIA)) {
    assert.equal(objectiveMediumKey({ immersion }), immersion);
  }
  assert.equal(objectiveMediumKey({}), 'air');
  assert.equal(objectiveMediumKey({ na: 1 }), 'air');
  assert.equal(objectiveMediumKey({ na: 1.0001 }), 'legacy');
  assert.equal(objectiveMediumKey({ immersion: 'saline', na: 1.4 }), 'air');
  assert.equal(objectiveMediumKey(null), 'air');
  assert.equal(objectiveMediumKey([]), 'air');
});

test('medium indices use presets, keep legacy unresolved, and bound a custom value', () => {
  assert.equal(objectiveMediumIndex({ immersion: 'air' }), 1);
  assert.equal(objectiveMediumIndex({ immersion: 'water' }), 1.333);
  assert.equal(objectiveMediumIndex({ immersion: 'oil' }), 1.518);
  assert.equal(objectiveMediumIndex({ immersion: 'legacy' }), null);
  assert.equal(objectiveMediumIndex({ immersion: 'custom', immersionIndex: 0.8 }), 1);
  assert.equal(objectiveMediumIndex({ immersion: 'custom', immersionIndex: 1.41 }), 1.41);
  assert.equal(objectiveMediumIndex({ immersion: 'custom', immersionIndex: 2.4 }), 2);
  assert.equal(objectiveMediumIndex({ immersion: 'custom', immersionIndex: Number.NaN }), 1.333);
});

test('each objective medium supplies the effective numerical-aperture ceiling', () => {
  assert.equal(objectiveMaximumNA({ immersion: 'air' }), 0.85, 'the practical dry ceiling, not the physical n=1 limit');
  assert.equal(objectiveMaximumNA({ immersion: 'water' }), 1.27);
  assert.equal(objectiveMaximumNA({ immersion: 'oil' }), 1.49);
  assert.equal(objectiveMaximumNA({ immersion: 'legacy' }), 1.49);
  assert.equal(objectiveMaximumNA({ immersion: 'custom', immersionIndex: 1.2 }), 1.2);
  assert.equal(objectiveMaximumNA({ immersion: 'custom', immersionIndex: 1.9 }), 1.49);
});

test('objective NA is clamped against the selected medium and remains finite at malformed boundaries', () => {
  assert.equal(objectiveNumericalAperture({ immersion: 'air', na: 1.4 }), 0.85);
  assert.equal(objectiveNumericalAperture({ immersion: 'water', na: 1.4 }), 1.27);
  assert.equal(objectiveNumericalAperture({ immersion: 'oil', na: 1.4 }), 1.4);
  assert.equal(objectiveNumericalAperture({ immersion: 'custom', immersionIndex: 1.12, na: 1.4 }), 1.12);
  assert.equal(objectiveNumericalAperture({ immersion: 'oil', na: -10 }), 0.05);
  assert.equal(objectiveNumericalAperture({ immersion: 'oil', na: Infinity }), OBJECTIVE_NA_DEFAULT);
  assert.equal(objectiveNumericalAperture({ na: 1.4 }), 1.4, 'missing medium preserves old high NA as unresolved');
});

test('objective normalization returns an independent copy with valid medium, index, and NA', () => {
  const raw = {
    immersion: 'custom',
    immersionIndex: 0.4,
    na: 1.3,
    magnification: 40,
  };
  const normalized = normalizeObjectiveParams(raw);

  assert.notEqual(normalized, raw);
  assert.deepEqual(normalized, {
    immersion: 'custom',
    immersionIndex: 1,
    na: 1,
    efl: 5,
    workingDistance: 5,
    frontAperture: 10,
  });
  assert.deepEqual(raw, {
    immersion: 'custom',
    immersionIndex: 0.4,
    na: 1.3,
    magnification: 40,
  });

  assert.deepEqual(normalizeObjectiveParams({ immersion: 'bogus', immersionIndex: Infinity, na: 1.4 }), {
    immersion: 'air',
    immersionIndex: 1.333,
    na: 0.85,
    efl: 10,
    workingDistance: 10,
    frontAperture: 20,
  });
  assert.deepEqual(normalizeObjectiveParams({ na: 1.4 }), {
    immersion: 'legacy',
    immersionIndex: 1.333,
    na: 1.4,
    efl: 10,
    workingDistance: 10,
    frontAperture: 20,
  });
  assert.deepEqual(normalizeObjectiveParams(null), {
    immersion: 'air',
    immersionIndex: 1.333,
    na: 0.4,
    efl: 10,
    workingDistance: 10,
    frontAperture: 20,
  });
});

test('legacy migration marks the missing medium without changing the saved NA', () => {
  const dry = { magnification: 20, na: 1, transEff: 90 };
  const unresolved = { magnification: 20, na: 1.4, transEff: 90 };

  assert.deepEqual(migrateLegacyObjectiveParams(dry), {
    ...dry, efl: 10, workingDistance: 10, frontAperture: 20, immersion: 'air',
  });
  assert.deepEqual(migrateLegacyObjectiveParams(unresolved), {
    ...unresolved, efl: 10, workingDistance: 10, frontAperture: 20, immersion: 'legacy',
  });
  assert.equal(Object.hasOwn(dry, 'immersion'), false);
  assert.equal(Object.hasOwn(unresolved, 'immersion'), false);

  const beyondCurrentRange = migrateLegacyObjectiveParams({ na: 1.7 });
  assert.equal(beyondCurrentRange.na, 1.7, 'migration classifies evidence but does not rewrite it');
  assert.equal(beyondCurrentRange.immersion, 'legacy');
});

test('focal/aperture migration classifies the derived NA and preserves an authored medium', () => {
  assert.deepEqual(migrateLegacyObjectiveParams({ f: 20, aperture: 40 }), {
    f: 20,
    aperture: 40,
    magnification: 10,
    efl: 20,
    na: 1,
    workingDistance: 20,
    frontAperture: 40,
    immersion: 'air',
  });
  assert.deepEqual(migrateLegacyObjectiveParams({ f: 20, aperture: 48 }), {
    f: 20,
    aperture: 48,
    magnification: 10,
    efl: 20,
    na: 1.2,
    workingDistance: 20,
    frontAperture: 48,
    immersion: 'legacy',
  });
  assert.deepEqual(migrateLegacyObjectiveParams({ f: 20, aperture: 48, immersion: 'oil' }), {
    f: 20,
    aperture: 48,
    magnification: 10,
    efl: 20,
    na: 1.2,
    workingDistance: 20,
    frontAperture: 48,
    immersion: 'oil',
  });
});
