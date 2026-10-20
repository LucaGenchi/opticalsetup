// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// docs/contributor-workflow.md tells contributors and agents which files to
// edit and which commands to run. These tests fail when a file or command it
// names no longer exists, so the guide cannot drift silently from the repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GUIDE = 'docs/contributor-workflow.md';
const text = readFileSync(join(ROOT, GUIDE), 'utf8');

const ROOT_ENTRIES = new Set(readdirSync(ROOT));
const FILE_EXTENSION = /\.(?:md|mjs|js|json|py|txt|html|yml)$/;
// Placeholders, bare extensions and site URLs are not repository paths.
const NOT_A_PATH = /[<>…*\s]|vX\.Y|MAJOR|^\.\w+$|^\/|^https?:/;

function repositoryPaths() {
  const paths = new Set();
  for (const [, span] of text.matchAll(/`([^`]+)`/g)) {
    if (NOT_A_PATH.test(span)) continue;
    const first = span.split('/')[0];
    if (FILE_EXTENSION.test(span) || (span.includes('/') && ROOT_ENTRIES.has(first))) {
      paths.add(span);
    }
  }
  return [...paths];
}

test('every repository path the guide names exists', () => {
  const paths = repositoryPaths();
  assert.ok(paths.length > 30, `expected the guide's paths, found ${paths.length}`);
  for (const path of paths) {
    assert.ok(existsSync(join(ROOT, path)), `${GUIDE} names ${path}, which does not exist`);
  }
});

test('every command the guide tells you to run exists', () => {
  const scripts = [...text.matchAll(/\b(?:node|python3) ((?:tools|validation)\/[\w./-]+\.(?:mjs|py))/g)]
    .map(match => match[1]);
  assert.ok(scripts.length >= 4, `expected the guide's commands, found ${scripts.length}`);
  for (const script of scripts) {
    assert.ok(existsSync(join(ROOT, script)), `${GUIDE} runs ${script}, which does not exist`);
  }
  // release.mjs subcommands the guide uses.
  const release = readFileSync(join(ROOT, 'tools/release.mjs'), 'utf8');
  for (const command of ['status', 'prepare', 'verify']) {
    assert.match(release, new RegExp(`command === '${command}'`), `release.mjs has no ${command}`);
  }
  assert.match(release, /--tree/, 'release.mjs has no verify --tree');
});

test('the guide is linked from AGENTS.md and its own links resolve', () => {
  assert.match(readFileSync(join(ROOT, 'AGENTS.md'), 'utf8'), /\(docs\/contributor-workflow\.md\)/);
  for (const [, target] of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^https?:/.test(target)) continue;
    assert.ok(existsSync(join(ROOT, dirname(GUIDE), target)), `${GUIDE} links to ${target}, which does not exist`);
  }
});
