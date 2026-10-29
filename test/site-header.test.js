// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteHeader, themeBootScript } from '../tools/site-header.mjs';
import { initTheme, THEME_STORAGE_KEY } from '../sketch/js/theme.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const citation = html => {
  const match = html.match(/<p class="about-text about-citation">([\s\S]*?)<\/p>/);
  assert.ok(match, 'an About dialog carries the citation');
  return match[1].replace(/\s+/g, ' ').trim();
};

test('the section pages and the homepage cite the software exactly as the app does', async () => {
  const app = await readFile(resolve(ROOT, 'sketch/index.html'), 'utf8');
  const home = await readFile(resolve(ROOT, 'index.html'), 'utf8');
  assert.equal(citation(siteHeader('..')), citation(app));
  assert.equal(citation(home), citation(app));
});

test('the shared header offers About and the light/dark switch, and marks only its own section', () => {
  const html = siteHeader('../..', { current: 'calculators' });
  assert.match(html, /<button type="button" id="btnAbout"[^>]*>About<\/button>/);
  assert.match(html, /<button type="button" id="btnTheme" class="theme-toggle"/);
  assert.match(html, /<dialog id="aboutDialog"/);
  assert.match(html, /src="\.\.\/\.\.\/wiki\/assets\/site-header\.js"/);
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.match(html, /href="\.\.\/\.\.\/calculators\/" aria-current="page"/);
  assert.doesNotMatch(siteHeader('..'), /aria-current/);
});

test('the homepage and every section hub open in the stored appearance before their stylesheets load', async () => {
  for (const hub of ['.', 'wiki', 'example-setups', 'calculators', 'community']) {
    const html = await readFile(resolve(ROOT, hub, 'index.html'), 'utf8');
    const boot = html.indexOf(themeBootScript);
    assert.ok(boot > 0, `${hub}: theme boot script present`);
    assert.ok(boot < html.indexOf('<link rel="stylesheet"'), `${hub}: boot script precedes the stylesheets`);
    assert.match(html, /id="btnAbout"/, `${hub}: About button`);
    assert.match(html, /id="btnTheme"/, `${hub}: theme switch`);
  }
});

test('a canvas follows an appearance switched or cleared on another page, and ignores other keys', () => {
  const previous = globalThis.window;
  const listeners = {};
  globalThis.window = {
    setTimeout: () => {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  try {
    const root = { dataset: {}, classList: { add() {}, remove() {} } };
    const storage = { getItem: () => null, setItem() {} };
    const media = { matches: false, addEventListener: (type, fn) => { listeners[type] = fn; } };
    initTheme(null, { root, media, storage });
    assert.equal(root.dataset.theme, 'light');

    const local = event => listeners.storage({ storageArea: storage, ...event });
    local({ key: THEME_STORAGE_KEY, newValue: 'dark' });
    assert.equal(root.dataset.theme, 'dark');
    local({ key: 'opticalsetup-autosave', newValue: 'light' });
    assert.equal(root.dataset.theme, 'dark', 'an unrelated key changes nothing');
    // sessionStorage.clear() in the page around an embedded canvas reaches it
    // with a null key too, but the stored choice is untouched.
    listeners.storage({ storageArea: { getItem: () => null }, key: null, newValue: null });
    assert.equal(root.dataset.theme, 'dark', 'another storage area changes nothing');
    // The choice cleared elsewhere: back to the system appearance.
    local({ key: THEME_STORAGE_KEY, newValue: null });
    assert.equal(root.dataset.theme, 'light');
    // localStorage.clear() elsewhere arrives with a null key: the stored
    // choice is gone, so the system appearance applies and is followed again.
    local({ key: THEME_STORAGE_KEY, newValue: 'dark' });
    local({ key: null, newValue: null });
    assert.equal(root.dataset.theme, 'light');
    listeners.change({ matches: true });
    assert.equal(root.dataset.theme, 'dark', 'after a clear the system appearance is followed again');
  } finally {
    globalThis.window = previous;
  }
});
