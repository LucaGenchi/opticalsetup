// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A community page may state exactly the reuse terms its own submission
// recorded: the grant its author gave, or none at all. These run the page
// generator against fixtures for both cases, because the published
// submissions are all of one kind and cannot show the other branch works.
import test from 'node:test';
import assert from 'node:assert/strict';

import { hubHTML, licenseOf, pageHTML } from '../tools/build-community.mjs';

const ENTRY = {
  slug: 'demo-setup',
  name: 'Demo setup',
  description: 'A description its author wrote.',
  reference: null,
  author: { github: 'someone', profile: 'https://github.com/someone' },
  source: { issue: 'https://github.com/LucaGenchi/opticalsetup/issues/7', submittedAt: '2026-09-01T00:00:00.000Z' },
  license: null,
};
const GRANTED = {
  ...ENTRY,
  license: { content: 'CC-BY-4.0', evidence: 'https://github.com/LucaGenchi/opticalsetup/issues/7', text: 'I publish them under CC BY 4.0' },
};

test('a granted submission says so, with a credit line and a link to the grant', () => {
  const page = pageHTML(GRANTED);
  assert.match(page, /CC BY 4\.0/);
  assert.match(page, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(page, /issues\/7/, 'the grant is linked');
  assert.match(page, /From "Demo setup" by @someone/, "a credit line ready to paste");
  assert.match(page, /Adapted from/, 'and how to credit it if changed');
  // The contributor's own text is marked off inside the file as well.
  assert.match(page, /SPDX-SnippetBegin[\s\S]*SPDX-License-Identifier: CC-BY-4\.0[\s\S]*A description its author wrote[\s\S]*SPDX-SnippetEnd/);
});

test('a submission with no recorded grant claims nothing', () => {
  const page = pageHTML(ENTRY);
  assert.match(page, /No further reuse terms were recorded/);
  assert.doesNotMatch(page, /CC BY/, 'it must not imply a licence nobody gave');
  assert.match(page, /No reuse grant was recorded[\s\S]*A description its author wrote[\s\S]*end of contributed text/,
    'and its text is marked off as the contributor\'s, outside this file\'s GPL notice');
});

test('the hub speaks for the collection, not for each setup', () => {
  const hub = hubHTML([ENTRY, GRANTED]);
  assert.match(hub, /Each setup states its own terms|state their own terms/);
  // Both descriptions appear in cards, each inside its own boundary.
  assert.match(hub, /SPDX-SnippetBegin/, 'the granted card carries its snippet boundary');
  assert.match(hub, /No reuse grant was recorded/, 'the ungranted card says so');
});

test('an unknown or unevidenced licence stops the build', () => {
  assert.equal(licenseOf({ license: null }, 'x.json'), null);
  assert.throws(() => licenseOf({ license: { content: 'CC-BY-NC-4.0', evidence: 'u' } }, 'x.json'), /unknown license/);
  assert.throws(() => licenseOf({ license: { content: 'CC-BY-4.0' } }, 'x.json'), /evidence/);
});
