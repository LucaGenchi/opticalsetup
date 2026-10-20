// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// docs/contributor-workflow.md tells contributors and agents which files to
// edit and which commands to run. These tests fail when a file, command or
// link it names no longer exists, so the guide cannot drift silently from the
// repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUIDE = 'docs/contributor-workflow.md';
const guide = readFileSync(join(ROOT, GUIDE), 'utf8');
const releaseTool = readFileSync(join(ROOT, 'tools/release.mjs'), 'utf8');
const releaseLevels = readFileSync(join(ROOT, 'tools/release-lib.mjs'), 'utf8');

// A code span is a repository path when it has a slash or a file extension.
// Placeholders, bare extensions, site URLs and git refs are not.
const PLACEHOLDER = /[<>…*]|vX\.Y|MAJOR/;
const SITE_OR_URL = /^\/|^\.\w+$|^https?:/;
const GIT_REFS = new Set(['origin/main']);
const FILE_NAME = /^[\w.-]+\.[a-z]+$/;

function codeSpans(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map(match => match[1]);
}

function repositoryPaths(text) {
  return codeSpans(text).filter(span =>
    !/\s/.test(span) && !PLACEHOLDER.test(span) && !SITE_OR_URL.test(span) &&
    !GIT_REFS.has(span) && (span.includes('/') || FILE_NAME.test(span)));
}

// Every problem the guide has: missing paths, scripts, release subcommands
// or levels, and broken relative links.
function staleReferences(text) {
  const problems = [];
  for (const path of repositoryPaths(text)) {
    if (!existsSync(join(ROOT, path))) problems.push(`names ${path}`);
  }
  for (const [, script] of text.matchAll(/\b(?:node|python3) ((?:tools|validation)\/[\w./-]+\.(?:mjs|py))/g)) {
    if (!existsSync(join(ROOT, script))) problems.push(`runs ${script}`);
  }
  for (const [, command, argument] of text.matchAll(/release\.mjs (\w+)(?: (--?\w+))?/g)) {
    if (!releaseTool.includes(`command === '${command}'`)) problems.push(`runs release.mjs ${command}`);
    if (argument && !releaseTool.includes(`'${argument}'`)) problems.push(`passes ${argument} to release.mjs`);
  }
  for (const [, level] of text.matchAll(/`prepare (\w+)`/g)) {
    if (!releaseLevels.includes(`'${level}'`)) problems.push(`prepares a ${level} release`);
  }
  for (const [, target] of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^https?:/.test(target)) continue;
    if (!existsSync(join(ROOT, dirname(GUIDE), target))) problems.push(`links to ${target}`);
  }
  return problems;
}

test('every path, command and link the guide names exists', () => {
  assert.ok(repositoryPaths(guide).length > 30, 'expected the guide to name its files');
  assert.deepEqual(staleReferences(guide), []);
});

test('the check catches a stale guide', () => {
  const mutations = [
    ['`test/golden/`', '`tests/golden/`'],
    ['release.mjs status', 'release.mjs statuz'],
    ['verify --tree', 'verify --three'],
    ['`prepare patch`', '`prepare tiny`'],
    ['tools/build-wiki.mjs', 'tools/build-wikki.mjs'],
    ['(adding-physics.md)', '(adding-physic.md)'],
  ];
  for (const [from, to] of mutations) {
    assert.ok(guide.includes(from), `the guide no longer contains ${from}; update this test`);
    assert.notDeepEqual(staleReferences(guide.replace(from, to)), [], `${to} went unnoticed`);
  }
});

test('AGENTS.md points to the guide', () => {
  assert.match(readFileSync(join(ROOT, 'AGENTS.md'), 'utf8'), /\(docs\/contributor-workflow\.md\)/);
});
