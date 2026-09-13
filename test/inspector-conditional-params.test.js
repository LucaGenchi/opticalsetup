import test from 'node:test';
import assert from 'node:assert/strict';
import { registry } from '../sketch/js/elements.js';
import { REBUILD_ON_COMMIT_KEYS } from '../sketch/js/inspector.js';
// Register the element families that attach themselves to the registry, so
// this audit covers the detectors, etalon and VIPA too and not just the
// components declared in elements.js.
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';

// Every param key a show() predicate reads off the params object, resolved
// back to the element it belongs to. A predicate is a plain function, so the
// keys it consults are read out of its source -- crude, but it is the only
// place that dependency is written down.
function conditionalDependencies(params) {
  const deps = new Map();
  for (const spec of params) {
    if (typeof spec.show !== 'function') continue;
    const body = spec.show.toString();
    const arg = (body.match(/^\(?\s*([A-Za-z_$][\w$]*)/) || [])[1];
    if (!arg) continue;
    for (const ref of body.matchAll(new RegExp(`\\b${arg}\\.([A-Za-z_$][\\w$]*)`, 'g'))) {
      const key = ref[1];
      // Only keys that are themselves editable params of the same element can
      // be committed by the user and so need to trigger a rebuild.
      if (!params.some(p => p.key === key)) continue;
      if (!deps.has(key)) deps.set(key, new Set());
      deps.get(key).add(spec.key);
    }
  }
  return deps;
}

// An element carrying a readout or derived param is rebuilt on every commit
// regardless (the catch-all at the end of applyInput), so its conditional
// controls can never be left stale.
const rebuildsOnAnyCommit = params =>
  params.some(p => p.type === 'readout' || p.type === 'derived');

test('every conditional control has something that rebuilds the panel for it', () => {
  const stale = [];
  for (const [type, def] of Object.entries(registry)) {
    const params = def.params || [];
    if (rebuildsOnAnyCommit(params)) continue;
    for (const [key, gated] of conditionalDependencies(params)) {
      if (REBUILD_ON_COMMIT_KEYS.includes(key)) continue;
      stale.push(`${type}: committing '${key}' shows/hides ${[...gated].map(k => `'${k}'`).join(', ')}`
        + ' but triggers no rebuild — add it to REBUILD_ON_COMMIT_KEYS');
    }
  }
  assert.deepEqual(stale, [], `\n${stale.join('\n')}\n`);
});

// The two cases this audit was written for, pinned by name so a regression
// names itself rather than only failing the sweep above.
test('the AOM waveform and the retroreflector motion mode both rebuild', () => {
  assert.ok(REBUILD_ON_COMMIT_KEYS.includes('modShape'),
    "switching the AOM waveform hides 'On fraction' and reveals 'Modulation depth'");
  assert.ok(REBUILD_ON_COMMIT_KEYS.includes('moveMode'),
    "switching the retroreflector to periodic motion reveals 'Travel range' and 'Frequency'");

  const aom = registry.aom.params;
  assert.ok(aom.find(p => p.key === 'chopDuty').show({ modulate: true, modShape: 'square' }));
  assert.ok(!aom.find(p => p.key === 'chopDuty').show({ modulate: true, modShape: 'sine' }));
  assert.ok(aom.find(p => p.key === 'modDepth').show({ modulate: true, modShape: 'sine' }));

  const retro = registry.retroreflector.params;
  for (const key of ['travel', 'freqHz']) {
    const spec = retro.find(p => p.key === key);
    assert.ok(!spec.show({ moveMode: 'static' }), `${key} is hidden while static`);
    assert.ok(spec.show({ moveMode: 'linear' }), `${key} is shown once the stage moves`);
  }
});

test('no key is listed twice', () => {
  assert.equal(new Set(REBUILD_ON_COMMIT_KEYS).size, REBUILD_ON_COMMIT_KEYS.length);
});
