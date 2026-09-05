import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { collectionSetupRequest } from '../sketch/js/collection-loader.js';
import { readCollectionSetups, reviewedPaperHandoff } from '../tools/2pp-collection-support.mjs';
import { createElement } from '../sketch/js/elements.js';

const request = query => collectionSetupRequest(new URLSearchParams(query));

test('collection aliases resolve to one native scene with explicit editable and locked modes', () => {
  for (const alias of ['paper', 'setup', 'collection']) {
    const query = `${alias}=pearre-2018`;
    assert.deepEqual(request(query), {
      id: 'pearre-2018', path: '../collections/2pp/setups/pearre-2018.json', editable: false,
    });
    assert.equal(request(query + '&edit=1').editable, true);
    assert.equal(request(query + '&collectionMode=edit').editable, true);
    for (const flag of ['embed=1', 'embed', 'locked=1', 'preview=1', 'collectionMode=preview']) {
      assert.equal(request(query + '&' + flag).editable, false);
      assert.equal(request(query + '&edit=1&' + flag).editable, false, 'preview wins conflicting flags');
    }
  }
});

test('invalid or conflicting collection IDs cannot become fetch paths or demo flags', () => {
  for (const query of ['', 'paper=', 'paper=../main', 'paper=%2Ffoo', 'paper=Uppercase',
    'paper=gu-2025&setup=yan-2015', 'paper=gu-2025&paper=yan-2015',
    'paper=' + 'a'.repeat(81), 'paper=gu-2025%0A']) assert.equal(request(query), null, query);
  assert.equal(request('paper=gu-2025&setup=gu-2025').id, 'gu-2025');
});

test('paper presets require an explicitly reviewed subset and never use scene or source defaults', () => {
  assert.equal(reviewedPaperHandoff({ settings: { wavelengthNm: 800, pulseDurationFs: 100 } }), null);
  assert.equal(reviewedPaperHandoff({ handoff: { basis: 'interpretation', verified: true, settings: { wavelengthNm: 800 } } }), null);
  const result = reviewedPaperHandoff({
    settings: { wavelengthNm: 800, sourcePowerMw: 4000 },
    handoff: { basis: 'paper', verified: true, settings: { wavelengthNm: 780, repetitionRateMHz: 0.001 } },
  });
  assert.deepEqual(result.imported.map(field => [field.key, field.value]), [['wavelengthNm', 780]]);
  assert.equal(new URL(result.url).searchParams.has('sourcePowerMw'), false);
  assert.equal(new URL(result.url).searchParams.has('repetitionRateMHz'), false);
});

test('collection discovery composes two authored scenes without rewriting them or generating siblings', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.2pp-fixture-', import.meta.url)));
  try {
    const papers = ['first-2020', 'second-2021', 'pending-2022'].map(id => ({ id }));
    assert.equal((await readCollectionSetups(directory, papers)).size, 0);
    await mkdir(join(directory, 'setups'));
    await mkdir(join(directory, 'research'));
    // Earlier setup branches stored metadata beside the native scenes.
    await writeFile(join(directory, 'setups', 'manifest.json'), JSON.stringify({ setups: [] }));
    const sceneText = JSON.stringify({ app: 'optics2d', version: 1, elements: [createElement('pulsedlaser', 0, 0)], beams: [] });
    for (const paper of papers.slice(0, 2)) {
      await writeFile(join(directory, 'setups', `${paper.id}.json`), sceneText);
      await writeFile(join(directory, 'research', `${paper.id}.md`), 'Evidence and three control experiments.');
    }
    const entries = await readCollectionSetups(directory, papers);
    assert.deepEqual([...entries.keys()], ['first-2020', 'second-2021']);
    assert.equal(await readFile(join(directory, 'setups', 'first-2020.json'), 'utf8'), sceneText);
    await assert.rejects(readFile(join(directory, 'setups', 'pending-2022.json')), /ENOENT/);
    await writeFile(join(directory, 'setups', 'unexpected-2023.json'), sceneText);
    await assert.rejects(readCollectionSetups(directory, papers), /Unknown 2PP paper setup/);
    await rm(join(directory, 'setups', 'unexpected-2023.json'));
    await rm(join(directory, 'research', 'second-2021.md'));
    await assert.rejects(readCollectionSetups(directory, papers), /ENOENT/);
    await writeFile(join(directory, 'research', 'second-2021.md'), 'Evidence restored.');
    await writeFile(join(directory, 'setups', 'second-2021.json'), '{"elements":[]}');
    await assert.rejects(readCollectionSetups(directory, papers), /scene has no elements/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
