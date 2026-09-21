import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { GOLDEN_DIR, goldenFor, sceneFiles, sceneFromFile } from '../tools/update-golden.mjs';

// Every bundled scene is traced and compared with its committed snapshot.
// A failure here is not necessarily a bug: it means a physics or drawing
// change moved a number somewhere. Look at the diff `node
// tools/update-golden.mjs` produces, decide whether it is the intended
// consequence of the change, and commit the updated snapshot with the reason
// in the PR description.

const REL_TOL = 1e-6;

function differences(expected, actual, path = '', out = []) {
  if (typeof expected === 'number' || typeof actual === 'number') {
    // A NaN is equal to nothing and an infinity makes the relative scale
    // infinite, so neither can be allowed into the tolerance comparison:
    // both would pass as "no difference".
    // Either side being non-finite is a difference, even if both are: a
    // committed snapshot can never hold one (they are recorded as markers),
    // so this keeps the comparator's own contract simple.
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
      out.push(`${path}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
      return out;
    }
    const scale = Math.max(Math.abs(expected), Math.abs(actual), 1e-12);
    if (Math.abs(expected - actual) > REL_TOL * scale) out.push(`${path}: ${expected} → ${actual}`);
    return out;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      out.push(`${path}: array ${JSON.stringify(expected)?.slice(0, 80)} → ${JSON.stringify(actual)?.slice(0, 80)}`);
      return out;
    }
    expected.forEach((v, i) => differences(v, actual[i], `${path}[${i}]`, out));
    return out;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      differences(expected[key], actual[key], path ? `${path}.${key}` : key, out);
    }
    return out;
  }
  if (expected !== actual) out.push(`${path}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
  return out;
}

// The snapshot records a non-finite number as a "non-finite:NaN" marker
// rather than as a number, so one appearing (or disappearing) is a visible
// difference rather than a silent pass.
test('golden: the live tracer produces no non-finite numbers', async () => {
  const { nonFiniteSeen } = await import('../tools/update-golden.mjs');
  const offenders = [];
  for (const { path, slug } of await sceneFiles()) {
    goldenFor(sceneFromFile(await readFile(path, 'utf8')));
    for (const where of nonFiniteSeen()) offenders.push(`${slug}: ${where}`);
  }
  assert.deepEqual(offenders.slice(0, 10), []);
});

const scenes = await sceneFiles();
assert.ok(scenes.length >= 20, 'expected the bundled examples and community scenes');

for (const { path, slug } of scenes) {
  test(`golden: ${slug}`, async () => {
    const expected = JSON.parse(await readFile(join(GOLDEN_DIR, `${slug}.json`), 'utf8').catch(() => {
      assert.fail(`no snapshot for ${slug}; run node tools/update-golden.mjs and commit test/golden/${slug}.json`);
    }));
    const actual = goldenFor(sceneFromFile(await readFile(path, 'utf8')));
    const diff = differences(expected, actual);
    assert.deepEqual(diff.slice(0, 20), [], `${diff.length} readout difference(s) versus test/golden/${slug}.json`);
  });
}

test('golden: every snapshot belongs to a scene that still exists', async () => {
  const { readdir } = await import('node:fs/promises');
  const slugs = new Set(scenes.map(s => s.slug));
  const orphans = (await readdir(GOLDEN_DIR)).filter(f => f.endsWith('.json') && !slugs.has(f.replace(/\.json$/, '')));
  assert.deepEqual(orphans, [], 'delete snapshots of removed scenes');
});

// --- Fault injection: does the reporter see what it claims to see? ---------
// A test over today's scenes cannot show that, because they are all clean.

test('golden: invalid numbers are reported wherever they occur', async () => {
  const { snapshot, nonFiniteSeen, drawableSummary, trackSummary, hitSummary } =
    await import('../tools/update-golden.mjs');
  const seen = fn => { fn(); return nonFiniteSeen(); };
  const probes = [
    ['a drawable with a NaN opacity', () => drawableSummary([{ type: 'path', color: '#fff', opacity: NaN, w: 1, pts: [{ x: 0, y: 0 }] }])],
    ['a dot with an infinite radius', () => drawableSummary([{ type: 'dots', color: '#fff', opacity: 1, dots: [{ x: 1, y: 2, r: Infinity, o: 1 }] }])],
    ['a coordinate sum that overflows', () => snapshot(Array(64).fill(1e308))],
    ['a track carrying a NaN gate duty', () => trackSummary([{ wl: 800, intensity: 1, pts: [], opls: [0, 1], pulse: { gates: [{ duty: NaN }] } }])],
    ['a hit whose nested pulse holds an infinity', () => hitSummary([{ x: 1, y: 2, pulse: { pathDelayNs: Infinity } }], 'writeHits')],
  ];
  for (const [label, fn] of probes) assert.ok(seen(fn).length > 0, `${label} must be reported`);
});

test('golden: nested pulse and gate contents reach the digests', async () => {
  const { trackSummary, hitSummary } = await import('../tools/update-golden.mjs');
  const track = (extra = {}) => [{
    wl: 800, intensity: 1, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], opls: [0, 10],
    gddTrace: [{ opl: 0, gdd: 0, linear: false }],
    groupDelayDifferenceTrace: [{ opl: 0, value: 0, linear: false }],
    pulse: { sourceId: 's', repRateMHz: 80, pulseWidthFs: 100, phaseNs: 0, gates: [{ duty: 0.5, frequencyMHz: 1 }], ...extra },
  }];
  const base = trackSummary(track())[0].digest;
  const gateChanged = trackSummary(track({ gates: [{ duty: 0.1, frequencyMHz: 1 }] }))[0].digest;
  assert.notEqual(gateChanged, base, 'a gate duty of 0.1 instead of 0.5 must change the digest');
  const flagged = track();
  flagged[0].groupDelayDifferenceTrace = [{ opl: 0, value: 0, linear: true }];
  assert.notEqual(trackSummary(flagged)[0].digest, base, "a group-delay event's interpolation flag must change the digest");
  const widened = trackSummary(track({ pulseWidthFs: 101 }))[0].digest;
  assert.notEqual(widened, base, 'a packet width must change the digest');
  const hit = pulse => hitSummary([{ stageId: 'a', x: 1, y: 2, pulse }], 'writeHits').digest;
  assert.notEqual(hit({ pathDelayNs: 2 }), hit({ pathDelayNs: 3 }), "a write hit's nested pulse record must change the digest");
});
