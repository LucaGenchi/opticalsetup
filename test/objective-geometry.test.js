import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OBJECTIVE_CLEAR_APERTURE_MM,
  objectiveFocalLength,
  objectiveNumericalAperture,
  objectivePupilDiameter,
} from '../sketch/js/objective.js';

test('objective geometry stays fixed across magnification and NA changes', () => {
  const cases = [
    { magnification: 10, na: 0.25 },
    { magnification: 20, na: 1.0 },
    { magnification: 40, na: 1.3 },
    { magnification: 100, na: 1.49 },
  ];

  for (const params of cases) {
    assert.equal(objectivePupilDiameter(params), OBJECTIVE_CLEAR_APERTURE_MM);
  }
});

test('objective optical parameters still change independently of geometry', () => {
  assert.equal(objectiveFocalLength({ magnification: 20, na: 0.5 }), 10);
  assert.equal(objectiveFocalLength({ magnification: 40, na: 0.5 }), 5);
  assert.equal(objectiveNumericalAperture({ magnification: 20, na: 0.5 }), 0.5);
  assert.equal(objectiveNumericalAperture({ magnification: 20, na: 1.3 }), 1.3);
  assert.equal(objectivePupilDiameter({ magnification: 20, na: 0.5 }), OBJECTIVE_CLEAR_APERTURE_MM);
  assert.equal(objectivePupilDiameter({ magnification: 40, na: 1.3 }), OBJECTIVE_CLEAR_APERTURE_MM);
});
