// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// GNU recommends a short licence notice in every source file, so a copy that
// travels on its own still says what it is. These tests keep that true as
// files are added, and keep the licence itself available to the app offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCE_DIRS = ['sketch/js', 'sketch/css', 'css', 'tools', 'scripts', 'test', 'skills'];
const SINGLE_FILES = ['index.html', 'sketch/index.html', 'serve.mjs'];
const EXTENSIONS = ['.js', '.mjs', '.css', '.html'];

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const relative = `${dir}/${entry}`;
    if (statSync(join(ROOT, relative)).isDirectory()) out.push(...sourceFiles(relative));
    else if (EXTENSIONS.some(extension => entry.endsWith(extension))) out.push(relative);
  }
  return out;
}

test('every source file carries the licence notice', () => {
  const files = [...SOURCE_DIRS.flatMap(sourceFiles), ...SINGLE_FILES];
  assert.ok(files.length > 150, `expected the whole source tree, got ${files.length} files`);
  for (const file of files) {
    const head = readFileSync(join(ROOT, file), 'utf8').slice(0, 400);
    assert.match(head, /SPDX-License-Identifier: GPL-3\.0-or-later/, file);
    assert.match(head, /SPDX-FileCopyrightText: 2026 Luca Genchi and contributors/, file);
  }
});

test('generated pages carry it too, and the app can show the licence offline', () => {
  for (const page of ['wiki/filter/index.html', 'example-setups/index.html', 'community/index.html']) {
    const head = readFileSync(join(ROOT, page), 'utf8').slice(0, 400);
    assert.match(head, /SPDX-License-Identifier: GPL-3\.0-or-later/, page);
    // The doctype still comes first.
    assert.match(head, /^<!DOCTYPE html>/i, page);
  }
  const worker = readFileSync(join(ROOT, 'sketch/service-worker.js'), 'utf8');
  // Inside /sketch/, because that is the service worker's scope: a top-level
  // navigation to a page outside it is not controlled and fails offline.
  assert.match(worker, /"\.\/license\.html"/, 'the licence page is precached with the app');
  const inScope = readFileSync(join(ROOT, 'sketch/license.html'), 'utf8');
  assert.match(inScope, /GNU GENERAL PUBLIC LICENSE/, 'and it carries the licence text');
  // license.html is generated from LICENSE and must not drift from it.
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  const page = readFileSync(join(ROOT, 'license.html'), 'utf8');
  const quoted = license.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  assert.ok(page.includes(quoted), 'license.html carries the licence text; run tools/build-license-page.mjs');
  const app = readFileSync(join(ROOT, 'sketch/index.html'), 'utf8');
  assert.match(app, /id="aboutDialog"/, 'the app has an about dialog');
  assert.match(app, /without any warranty/i, 'it carries the no-warranty notice');
  assert.match(app, /href="\.\/license\.html"/, 'and links the copy inside its own scope');
});

test('a bundled third-party file keeps its own notice, not ours', () => {
  // KaTeX's stylesheet is Khan Academy's work, shipped unmodified. A header
  // script once stamped it as ours under the GPL; it must not happen again.
  const katex = readFileSync(join(ROOT, 'wiki/assets/katex.min.css'), 'utf8').slice(0, 400);
  assert.match(katex, /KaTeX v\d+\.\d+/, 'it names the upstream version');
  assert.match(katex, /Khan Academy/, 'and its copyright holder');
  assert.match(katex, /SPDX-License-Identifier: MIT/, 'and its licence');
  assert.doesNotMatch(katex, /Luca Genchi/, 'it is not ours to claim');
  assert.doesNotMatch(katex, /GPL-3\.0/, 'and not under our licence');
  const notices = readFileSync(join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.match(notices, /not offered under the GPL/, 'the quoted licence texts are excluded from this file\'s own notice');
});

test('a community page states only the terms its own submission recorded', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = join(ROOT, 'community-submissions');
  const submissions = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  assert.ok(submissions.length, 'there are published submissions');
  for (const submission of submissions) {
    const slug = readdirSync(join(ROOT, 'community')).find(entry => {
      const page = join(ROOT, 'community', entry, 'index.html');
      try { return readFileSync(page, 'utf8').includes(submission.source.issue); } catch { return false; }
    });
    if (!slug) continue;
    const page = readFileSync(join(ROOT, 'community', slug, 'index.html'), 'utf8');
    const granted = submission.license?.content === 'CC-BY-4.0';
    if (granted) assert.match(page, /CC BY 4\.0/, `${slug} states the recorded grant`);
    else assert.doesNotMatch(page, /class="community-license">[^<]*CC BY/,
      `${slug} has no recorded licence, so its page must not claim CC BY`);
  }
});
