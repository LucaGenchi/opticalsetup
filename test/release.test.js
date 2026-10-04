// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Releases: version numbering, what counts as an app change, share links
// pinned to a kept release, and the staged site. Everything that cuts or
// stages a release runs against a throwaway repository, so ordinary work on
// main -- which always differs from the last release -- cannot fail here.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_RELEASE, archivedRelease, releasePath } from '../sketch/js/release.js';
import { buildShareURL, pinShareURL, sharedSceneFromURL } from '../sketch/js/share.js';
import { autosaveKeyFor } from '../sketch/js/state.js';
import { sceneFromShareURL } from '../scripts/materialize-example-proposal.mjs';
import {
  bumpVersion, keptReleases, planRelease, readReleases, rendererDigest, siteDigest, validateReleases,
} from '../tools/release-lib.mjs';
import { prepareRelease, verifyRelease } from '../tools/release.mjs';
import { stageSite } from '../tools/stage-site.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = c => c.repeat(64);

test('a release names its kept app copy by MAJOR.MINOR', () => {
  assert.equal(releasePath('v1.0.0'), 'v1.0');
  assert.equal(releasePath('v12.3.45'), 'v12.3');
  for (const bad of ['', 'v1', 'v1.0', '1.0.0', 'v1.0.0-beta', null]) assert.equal(releasePath(bad), '');
  assert.equal(archivedRelease('/v1.0/sketch/'), 'v1.0');
  assert.equal(archivedRelease('/opticalsetup/v2.13/sketch/index.html'), 'v2.13');
  for (const current of ['/sketch/', '/sketch/index.html', '/v1/sketch/', '/v1.0/wiki/', '', undefined]) {
    assert.equal(archivedRelease(current), '');
  }
});

test('the committed release label and release list agree', async () => {
  const releases = await readReleases(ROOT);
  assert.equal(APP_RELEASE, releases.at(-1)?.version ?? '');
  assert.equal(await verifyRelease(ROOT), APP_RELEASE);
});

test('shared links are pinned to the kept release, from every way into the app', () => {
  const pin = href => pinShareURL(href, 'v1.2.3');
  assert.equal(pin('https://opticalsetup.com/sketch/#sketch=j.x'), 'https://opticalsetup.com/v1.2/sketch/#sketch=j.x');
  assert.equal(pin('https://opticalsetup.com/sketch/index.html#sketch=j.x'), 'https://opticalsetup.com/v1.2/sketch/#sketch=j.x');
  assert.equal(pin('https://opticalsetup.com/sketch#sketch=j.x'), 'https://opticalsetup.com/v1.2/sketch/#sketch=j.x');
  assert.equal(pin('https://opticalsetup.com/sketch/?lang=en#sketch=j.x'), 'https://opticalsetup.com/v1.2/sketch/?lang=en#sketch=j.x');
  // A mirror under a path prefix keeps the prefix.
  assert.equal(pin('https://lucagenchi.github.io/opticalsetup/sketch/#sketch=j.x'),
    'https://lucagenchi.github.io/opticalsetup/v1.2/sketch/#sketch=j.x');
  // A kept copy keeps naming itself, whatever release label it carries.
  assert.equal(pin('https://opticalsetup.com/v1.0/sketch/#sketch=j.x'), 'https://opticalsetup.com/v1.0/sketch/#sketch=j.x');
  assert.equal(pin('https://opticalsetup.com/v1.0/sketch/index.html#sketch=j.x'), 'https://opticalsetup.com/v1.0/sketch/index.html#sketch=j.x');
  // With no release there is no kept copy to name.
  assert.equal(pinShareURL('https://opticalsetup.com/sketch/#sketch=j.x', ''), 'https://opticalsetup.com/sketch/#sketch=j.x');
});

test('a pinned link still carries the scene, and the address bar form is not pinned', async () => {
  const scene = JSON.stringify({ app: 'optics2d', version: 1, elements: [], beams: [] });
  const url = await buildShareURL(scene, 'https://opticalsetup.com/sketch/', { compression: false });
  assert.equal(new URL(url).pathname, '/sketch/');
  const pinned = pinShareURL(url, 'v3.1.4');
  assert.equal(new URL(pinned).pathname, '/v3.1/sketch/');
  assert.equal(await sharedSceneFromURL(pinned), scene);
  // The example-proposal flow accepts a pinned link as an official address.
  assert.deepEqual(JSON.parse(JSON.stringify(sceneFromShareURL(pinned).elements ?? [])), []);
  assert.throws(() => sceneFromShareURL(pinned.replace('opticalsetup.com', 'example.org')), /official/);
  assert.throws(() => sceneFromShareURL(pinned.replace('/v3.1/sketch/', '/v3.1/wiki/')), /official/);
});

test('the current app keeps one autosave across releases; a kept copy has its own', () => {
  assert.equal(autosaveKeyFor('/sketch/'), 'optics2d-autosave-v1');
  assert.equal(autosaveKeyFor('/sketch/index.html'), 'optics2d-autosave-v1');
  assert.equal(autosaveKeyFor(''), 'optics2d-autosave-v1');
  assert.equal(autosaveKeyFor('/v1.0/sketch/'), 'optics2d-autosave-v1@v1.0');
  assert.notEqual(autosaveKeyFor('/v1.1/sketch/'), autosaveKeyFor('/v1.0/sketch/'));
});

test('version numbers: content is a patch, an app change is at least a minor', () => {
  assert.equal(bumpVersion('v1.2.3', 'patch'), 'v1.2.4');
  assert.equal(bumpVersion('v1.2.3', 'minor'), 'v1.3.0');
  assert.equal(bumpVersion('v1.2.3', 'major'), 'v2.0.0');
  assert.throws(() => bumpVersion('v1.2', 'patch'), /Not a release version/);

  assert.deepEqual(planRelease({ releases: [], renderer: SHA('a'), site: SHA('b') }).version, 'v1.0.0');
  const releases = [{ version: 'v1.0.0', date: '2026-10-05', rendererSha256: SHA('a'), siteSha256: SHA('b') }];
  // A community setup: the site changed, the renderer did not.
  assert.equal(planRelease({ releases, renderer: SHA('a'), site: SHA('c') }).version, 'v1.0.1');
  // The app changed.
  assert.equal(planRelease({ releases, renderer: SHA('d'), site: SHA('c') }).version, 'v1.1.0');
  assert.equal(planRelease({ releases, renderer: SHA('d'), site: SHA('c'), level: 'major' }).version, 'v2.0.0');
  // Calling an app change a patch would change what v1.0 links open.
  assert.throws(() => planRelease({ releases, renderer: SHA('d'), site: SHA('c'), level: 'patch' }), /cannot be a patch/);
  // A larger step is always allowed, and nothing changed means no release.
  assert.equal(planRelease({ releases, renderer: SHA('a'), site: SHA('c'), level: 'minor' }).version, 'v1.1.0');
  assert.throws(() => planRelease({ releases, renderer: SHA('a'), site: SHA('b') }), /nothing to release/);
  assert.throws(() => planRelease({ releases, renderer: SHA('a'), site: SHA('c'), level: 'weekly' }), /Unknown release level/);
});

test('the release list is append-only in order and cannot relabel an app change', () => {
  const entry = (version, renderer) => ({ version, date: '2026-10-05', rendererSha256: SHA(renderer), siteSha256: SHA('f') });
  assert.equal(validateReleases({ releases: [entry('v1.0.0', 'a'), entry('v1.0.1', 'a'), entry('v1.1.0', 'b')] }).length, 3);
  assert.throws(() => validateReleases({ releases: [entry('v1.0.1', 'a'), entry('v1.0.0', 'a')] }), /does not come after/);
  assert.throws(() => validateReleases({ releases: [entry('v1.0.0', 'a'), entry('v1.0.0', 'a')] }), /does not come after/);
  assert.throws(() => validateReleases({ releases: [entry('v1.0.0', 'a'), entry('v1.0.1', 'b')] }), /changes the app/);
  assert.throws(() => validateReleases({ releases: [{ ...entry('v1.0.0', 'a'), rendererSha256: 'abc' }] }), /SHA-256/);
  assert.throws(() => validateReleases({ releases: [{ ...entry('v1.0.0', 'a'), date: 'today' }] }), /date/);
  assert.throws(() => validateReleases({}), /"releases" array/);
  assert.deepEqual(keptReleases([entry('v1.0.0', 'a'), entry('v1.0.1', 'a'), entry('v1.1.0', 'b'), entry('v1.1.1', 'b')])
    .map(k => [k.path, k.version]), [['v1.0', 'v1.0.0'], ['v1.1', 'v1.1.0']]);
});

// A miniature site in a real git repository: enough to cut releases, tag
// them, and stage what would be deployed.
async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'opticalsetup-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, text) => {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), text);
  };
  const run = (...args) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.org',
    '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd: root, stdio: 'pipe' });
  await write('sketch/js/release.js', "export const APP_RELEASE = '';\n");
  await write('sketch/js/raytrace.js', 'export const trace = 1;\n');
  await write('sketch/js/community-data.js', 'export const community = [];\n');
  await write('sketch/index.html', '<!doctype html>app\n');
  await write('Examples/a.json', '{}\n');
  await write('wiki/index.html', '<!doctype html>wiki 1\n');
  await write('index.html', '<!doctype html>landing\n');
  await write('test/private.test.js', '// never hosted\n');
  await write('releases.json', '{\n  "releases": []\n}\n');
  run('init', '-q', '-b', 'main');
  const commit = message => { run('add', '.'); run('commit', '-q', '-m', message); };
  commit('start');
  const release = async (level = 'auto') => {
    const plan = await prepareRelease(root, level, '2026-10-05');
    commit(`Release ${plan.version}`);
    assert.equal(await verifyRelease(root, { tree: true }), plan.version);
    run('tag', plan.version);
    return plan.version;
  };
  return { root, write, run, commit, release, read: path => readFile(resolve(root, path), 'utf8') };
}

test('content-only changes cut patch releases; an app change cuts a minor', async t => {
  const f = await fixture(t);
  assert.equal(await f.release(), 'v1.0.0');
  assert.match(await f.read('sketch/js/release.js'), /APP_RELEASE = 'v1\.0\.0'/);

  // The release label and the generated lists are not the renderer.
  const renderer = await rendererDigest(f.root);
  await f.write('wiki/index.html', '<!doctype html>wiki 2\n');
  await f.write('sketch/js/community-data.js', "export const community = ['new-setup'];\n");
  await f.write('community-submissions/issue-1.json', '{}\n');
  assert.equal(await rendererDigest(f.root), renderer);
  await assert.rejects(verifyRelease(f.root, { tree: true }), /not v1\.0\.0/);
  assert.equal(await verifyRelease(f.root), 'v1.0.0', 'unreleased work is a normal state');
  f.commit('publish a community setup');
  assert.equal(await f.release(), 'v1.0.1');

  await f.write('sketch/js/raytrace.js', 'export const trace = 2;\n');
  assert.notEqual(await rendererDigest(f.root), renderer);
  await assert.rejects(prepareRelease(f.root, 'patch'), /cannot be a patch/);
  f.commit('change the tracer');
  assert.equal(await f.release(), 'v1.1.0');

  // Files that are not public do not make a release.
  await f.write('test/private.test.js', '// changed\n');
  f.commit('tests only');
  await assert.rejects(prepareRelease(f.root), /nothing to release/);
  const site = await siteDigest(f.root);
  await f.write('index.html', '<!doctype html>landing 2\n');
  assert.notEqual(await siteDigest(f.root), site);
});

test('the staged site is the latest release plus each earlier app, read from tags', async t => {
  const f = await fixture(t);
  await f.release();                                   // v1.0.0
  await f.write('wiki/index.html', '<!doctype html>wiki 2\n');
  f.commit('wiki');
  await f.release();                                   // v1.0.1
  await f.write('sketch/js/raytrace.js', 'export const trace = 2;\n');
  await f.write('Examples/b.json', '{}\n');
  f.commit('tracer');
  await f.release();                                   // v1.1.0
  // Merged after the release, not released: must not be deployed.
  await f.write('sketch/js/raytrace.js', 'export const trace = 3;\n');
  await f.write('wiki/index.html', '<!doctype html>wiki 3\n');
  f.commit('unreleased work');

  const out = resolve(f.root, '..', `staged-${process.pid}-${Date.now()}`);
  t.after(() => rm(out, { recursive: true, force: true }));
  assert.deepEqual(await stageSite(out, f.root), { version: 'v1.1.0', kept: ['v1.0', 'v1.1'] });
  const staged = path => readFile(resolve(out, path), 'utf8');
  assert.match(await staged('sketch/js/raytrace.js'), /trace = 2/);
  assert.match(await staged('sketch/js/release.js'), /v1\.1\.0/);
  assert.match(await staged('wiki/index.html'), /wiki 2/);
  assert.match(await staged('v1.0/sketch/js/raytrace.js'), /trace = 1/);
  assert.match(await staged('v1.0/sketch/js/release.js'), /v1\.0\.0/);
  assert.match(await staged('v1.1/sketch/js/raytrace.js'), /trace = 2/);
  assert.equal(JSON.parse(await staged('releases.json')).releases.length, 3);
  await staged('v1.0/Examples/a.json');
  await assert.rejects(staged('v1.0/Examples/b.json'), /ENOENT/, 'a kept copy holds the examples of its time');
  await assert.rejects(staged('v1.0/wiki/index.html'), /ENOENT/, 'wiki exists once, for the current release');
  await assert.rejects(staged('test/private.test.js'), /ENOENT/, 'tests are not hosted');
  await assert.rejects(stageSite(out, f.root), /already exists/);
});

test('a moved tag or a missing tag stops the deploy', async t => {
  const f = await fixture(t);
  await f.release();                                   // v1.0.0
  await f.write('sketch/js/raytrace.js', 'export const trace = 2;\n');
  f.commit('tracer');
  await f.release();                                   // v1.1.0
  const out = n => resolve(f.root, '..', `staged-${process.pid}-${Date.now()}-${n}`);
  t.after(async () => { for (const n of [1, 2]) await rm(out(n), { recursive: true, force: true }); });

  // Rewriting history under an old link: v1.0.0 now points at the new app.
  f.run('tag', '-f', 'v1.0.0', 'v1.1.0');
  await assert.rejects(stageSite(out(1), f.root), /no longer holds the app that was released as v1\.0/);
  f.run('tag', '-d', 'v1.0.0');
  await assert.rejects(stageSite(out(2), f.root), /Tag v1\.0\.0 is missing/);
});

// The worker is exercised as written, with the Cache API simulated.
function serviceWorker(scopeURL, existing) {
  const stores = new Map(Object.entries(existing).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const cacheFor = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    const key = request => new URL(typeof request === 'string' ? request : request.url).href.split('?')[0];
    return {
      addAll: async urls => { for (const url of urls) store.set(url, `fresh ${url}`); },
      put: async (request, response) => { store.set(key(request), response); },
      match: async request => store.get(key(request)),
    };
  };
  const handlers = {};
  const context = vm.createContext({
    URL, Response: { error: () => 'NETWORK ERROR' }, Promise,
    self: { location: { href: `${scopeURL}service-worker.js`, origin: new URL(scopeURL).origin },
      addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: {
      open: async name => cacheFor(name),
      keys: async () => [...stores.keys()],
      delete: async name => stores.delete(name),
      // Creation order across the whole origin, as the real API searches.
      match: async request => { for (const name of stores.keys()) { const hit = await cacheFor(name).match(request); if (hit) return hit; } },
    },
    fetch: async () => { throw new Error('offline'); },
  });
  return { stores, handlers, context };
}

async function runWorker(scopeURL, existing) {
  const worker = serviceWorker(scopeURL, existing);
  vm.runInContext(await readFile(resolve(ROOT, 'sketch/service-worker.js'), 'utf8'), worker.context);
  const settle = async type => { let done; worker.handlers[type]({ waitUntil: p => { done = p; } }); await done; };
  await settle('install');
  await settle('activate');
  worker.offline = async url => {
    let answer;
    worker.handlers.fetch({ request: { url, method: 'GET', mode: 'navigate' }, respondWith: p => { answer = p; } });
    return answer;
  };
  return worker;
}

test('an installed copy from before releases cannot answer offline for the current app', async () => {
  const entry = 'https://opticalsetup.com/sketch/';
  const worker = await runWorker(entry, {
    'opticalsetup-pwa-v138': { [entry]: 'OLD WORKBENCH' },
    'opticalsetup-kept-v1.0-v139': { 'https://opticalsetup.com/v1.0/sketch/': 'KEPT v1.0' },
  });
  const names = [...worker.stores.keys()];
  assert.ok(!names.includes('opticalsetup-pwa-v138'), 'the earlier cache of this app is removed');
  assert.ok(names.includes('opticalsetup-kept-v1.0-v139'), 'a kept release keeps its own cache');
  assert.equal(await worker.offline(entry), `fresh ${entry}`);
});

test('a kept release reads only its own offline cache and leaves the current app alone', async () => {
  const entry = 'https://opticalsetup.com/v1.0/sketch/';
  const current = 'https://opticalsetup.com/sketch/';
  const worker = await runWorker(entry, {
    'opticalsetup-pwa-v150': { [current]: 'CURRENT', [entry]: 'WRONG COPY' },
    'opticalsetup-kept-v1.0-v100': { [entry]: 'STALE KEPT' },
    'opticalsetup-kept-v1.1-v139': { 'https://opticalsetup.com/v1.1/sketch/': 'KEPT v1.1' },
  });
  const names = [...worker.stores.keys()].sort();
  assert.deepEqual(names, ['opticalsetup-kept-v1.0-v139', 'opticalsetup-kept-v1.1-v139', 'opticalsetup-pwa-v150']);
  assert.equal(await worker.offline(entry), `fresh ${entry}`);
});

test('the site is deployed by a release, not by a merge or a schedule', async () => {
  const deploy = await readFile(resolve(ROOT, '.github/workflows/deploy-release.yml'), 'utf8');
  assert.match(deploy, /paths:\s*\n\s*- releases\.json/);
  assert.doesNotMatch(deploy, /schedule:/);
  assert.match(deploy, /node tools\/release\.mjs verify --tree/);
  assert.match(deploy, /node tools\/stage-site\.mjs/);
});
