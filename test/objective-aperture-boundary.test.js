import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { objectivePupilFill, traceScene } from '../sketch/js/raytrace.js';
import {
  objectiveBackFocalPlaneX, objectiveBarrelHalfHeight, objectiveEffectiveFocalLength,
  objectiveLensPlaneX, objectivePupilRadius, objectiveStopX,
} from '../sketch/js/objective.js';
import { toLocal, toWorld } from '../sketch/js/util.js';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7,
  message || `${actual} should equal ${expected}`);

function objective(params = {}, rotation = 0) {
  const element = createElement('objective', 200, 100);
  Object.assign(element.params, params);
  element.rot = rotation;
  return element;
}

// One native pulsed line, positioned by its intended crossing of a local
// plane. Moving the source along that line also accounts for its output tip.
function sourceThrough(element, planeX, height, slope = 0, forward = true) {
  const x = planeX + (forward ? -100 : 100);
  const position = toWorld(element, x, height + slope * (x - planeX));
  const source = createElement('pulsedlaser', position.x, position.y);
  source.rot = element.rot + Math.atan(slope) * 180 / Math.PI + (forward ? 0 : 180);
  Object.assign(source.params, { beamMode: 'line', bandwidth: 0, transformLimited: false });
  return source;
}

function traced(element, source, resin = false) {
  const elements = [source, element];
  if (resin) {
    const position = toWorld(element,
      objectiveLensPlaneX(element.params) + objectiveEffectiveFocalLength(element.params), 0);
    const sample = createElement('stage', position.x, position.y);
    sample.rot = element.rot + 90;
    Object.assign(sample.params, { specimenType: 'resin', voxelPreview: true, transmission: 0 });
    elements.push(sample);
  }
  const scene = traceScene(elements, []);
  const paths = scene.drawables.filter(drawable => drawable.type === 'path');
  assert.equal(paths.length, 1, 'one isolated line ray gives one trace');
  const points = paths[0].pts.map(point => toLocal(element, point.x, point.y));
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  return { scene, points };
}

test('collimated pupil-edge rays retain their working-distance focus and transmission', () => {
  for (const params of [
    {},
    { immersion: 'water', na: 1.0, workingDistance: 0.3 },
    { efl: 2, immersion: 'oil', na: 1.4, workingDistance: 0.13, frontAperture: 6 },
    { efl: 2, workingDistance: 12, frontAperture: 8, na: 0.5 },
  ]) {
    for (const rotation of [0, 37]) {
      const element = objective({ ...params, transEff: 75 }, rotation);
      for (const sign of [-1, 1]) {
        const source = sourceThrough(element, objectiveStopX(element.params),
          sign * objectivePupilRadius(element.params));
        const { scene, points } = traced(element, source, true);
        assert.equal(scene.writeHits.length, 1);
        close(points.at(-1).y, 0, 'an exactly filled pupil still focuses on axis');
        close(scene.writeHits[0].intensity, 0.75);
      }
    }
  }
});

test('a ray admitted near either pupil edge cannot walk past the objective unrefracted', () => {
  for (const params of [{}, { efl: 2, workingDistance: 12, frontAperture: 8, na: 0.5 }]) {
    for (const rotation of [0, 37]) {
      const element = objective(params, rotation);
      const stop = objectiveStopX(element.params);
      const lens = objectiveLensPlaneX(element.params);
      for (const sign of [-1, 1]) {
        const height = sign * (objectivePupilRadius(element.params) - 0.05);
        // This formerly missed the finite lens and wrote a full-power voxel
        // at y = +/-4.95 mm for the default objective, without any refraction.
        const outward = traced(element, sourceThrough(element, stop, height, sign * 0.05), true);
        assert.equal(outward.scene.writeHits.length, 0, 'pupil walk-off must not write resin');
        assert.ok(outward.points.at(-1).x > stop && outward.points.at(-1).x < lens,
          'the unsupported ray ends at the finite acceptance boundary');

        const inward = traced(element, sourceThrough(element, stop, height, -sign * 0.01), true);
        assert.equal(inward.scene.writeHits.length, 1, 'a ray remaining inside the bore is refracted');
        close(inward.points.at(-1).y, -sign * 0.01 * objectiveEffectiveFocalLength(element.params));
      }
    }
  }
});

test('the acceptance boundary catches rays that would also miss the outer barrel at the lens plane', () => {
  const element = objective();
  const stop = objectiveStopX(element.params);
  const lens = objectiveLensPlaneX(element.params);
  const slope = 2;
  assert.ok(slope * (lens - stop) > objectiveBarrelHalfHeight(element.params));
  for (const sign of [-1, 1]) {
    const { points } = traced(element, sourceThrough(element, stop, 0, sign * slope));
    assert.ok(points.at(-1).x > stop && points.at(-1).x < lens);
  }
});

test('back-focal-plane conjugacy survives in both propagation directions', () => {
  for (const params of [{},
    { efl: 2, workingDistance: 0.13, immersion: 'oil', na: 1.4, frontAperture: 6 },
    { efl: 2, workingDistance: 12, na: 0.5, frontAperture: 8 },
  ]) for (const rotation of [0, 37]) {
    const element = objective(params, rotation);
    const bfp = objectiveBackFocalPlaneX(element.params);
    const lens = objectiveLensPlaneX(element.params);
    for (const sign of [-1, 1]) {
      const forward = traced(element, sourceThrough(element, bfp, 0, sign * 0.2));
      assert.equal(forward.points.length, 3);
      close(forward.points[1].x, lens);
      close(forward.points[1].y, forward.points[2].y,
        'rays diverging from the BFP leave collimated');

      const reverseHeight = sign * 0.8 * objectivePupilRadius(element.params);
      const reverse = traced(element, sourceThrough(element, lens, reverseHeight, 0, false));
      assert.equal(reverse.points.length, 3);
      const a = reverse.points[1], b = reverse.points[2];
      close(a.x, lens);
      assert.ok(b.x < bfp - 100, 'the reverse ray clears the finite pupil and bore');
      close(a.y + (b.y - a.y) * (bfp - a.x) / (b.x - a.x), 0,
        'sample-side collimated light focuses at the BFP');
    }
  }
});

test('high-NA and long-WD objectives preserve a centred scan pupil and report fill at that plane', () => {
  for (const [params, beamRadius, angleDeg] of [
    [{ efl: 2, workingDistance: 0.13, immersion: 'oil', na: 1.4, frontAperture: 6 }, 2.7, 1.6],
    [{ efl: 2, workingDistance: 12, na: 0.5, frontAperture: 8 }, 0.8, 4],
    [{ efl: 40, workingDistance: 20, na: 0.2, frontAperture: 20 }, 6, 0.4],
  ]) for (const rotation of [0, 37]) for (const sign of [-1, 0, 1]) {
    const element = objective({ ...params, transEff: 75 }, rotation);
    const bfp = objectiveBackFocalPlaneX(element.params);
    const focal = objectiveEffectiveFocalLength(element.params);
    const slope = Math.tan(sign * angleDeg * Math.PI / 180);
    const sources = Array.from({ length: 9 }, (_, index) => sourceThrough(element, bfp,
      beamRadius * (index - 4) / 4, slope));
    const position = toWorld(element, objectiveLensPlaneX(element.params) + focal, 0);
    const sample = createElement('stage', position.x, position.y);
    sample.rot = rotation + 90;
    Object.assign(sample.params, { specimenType: 'resin', voxelPreview: true, transmission: 0 });
    const scene = traceScene([...sources, element, sample]);
    assert.equal(scene.writeHits.length, 9, 'all nine rays within the finite envelope reach the focus');
    for (const hit of scene.writeHits) {
      close(toLocal(element, hit.x, hit.y).y, focal * slope);
      close(hit.intensity, 0.75);
    }
    close(objectivePupilFill(element.id).beamDiameter, 2 * beamRadius,
      'a centred pupil keeps its true fill while its bundle walks across the equivalent lens');
  }
});

test('pupil readout includes rejected bore rays and reverse rays at their actual pupil coordinates', () => {
  const element = objective({ efl: 2, workingDistance: 0.13, immersion: 'oil', na: 1.4, frontAperture: 6 });
  const bfp = objectiveBackFocalPlaneX(element.params);
  const radius = objectivePupilRadius(element.params);
  const blocked = traced(element, sourceThrough(element, bfp, radius - 0.05, 0.1), true);
  assert.equal(blocked.scene.writeHits.length, 0);
  close(objectivePupilFill(element.id).beamDiameter, 2 * (radius - 0.05),
    'a bore rejection must not erase an admitted pupil sample');

  traced(element, sourceThrough(element, bfp, radius + 0.2));
  assert.ok(objectivePupilFill(element.id).fill > 1, 'the pupil annulus still reports overfill');

  traced(element, sourceThrough(element, objectiveLensPlaneX(element.params), 0.8 * radius, 0, false));
  close(objectivePupilFill(element.id).beamDiameter, 0,
    'a reverse collimated line focuses at the centre of the BFP');
});

test('pupil overfill still stops at the annulus and light outside the objective remains untouched', () => {
  for (const params of [{}, { efl: 2, workingDistance: 12, frontAperture: 8, na: 0.5 }]) {
    const element = objective(params);
    const stop = objectiveStopX(element.params);
    for (const sign of [-1, 1]) {
      const blocked = traced(element,
        sourceThrough(element, stop, sign * (objectivePupilRadius(element.params) + 0.2)));
      close(blocked.points.at(-1).x, stop);

      const height = sign * (objectiveBarrelHalfHeight(element.params) + 1);
      const outside = traced(element, sourceThrough(element, stop, height));
      assert.equal(outside.points.length, 2, 'the finite objective adds no outside interaction');
      assert.ok(outside.points.at(-1).x > objectiveLensPlaneX(element.params) + 100);
      close(outside.points.at(-1).y, height);
    }
  }
});
