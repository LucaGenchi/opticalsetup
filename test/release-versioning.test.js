import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { nextRelease, bumpRelease } from '../tools/bump-release.mjs';
import {
  frozenReleaseStatuses,
  releaseDigest,
  releaseSourceDigest,
} from '../tools/release-integrity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('v1 is a complete immutable application snapshot', async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'v1/release.json'), 'utf8'));
  assert.deepEqual(manifest, {
    app: 'opticalsetup',
    release: 'v1',
    frozen: true,
    applicationPath: '/v1/sketch/',
    sceneFormatVersions: [1],
    bundledDirectories: [
      'sketch',
      'Examples',
      'community-submissions',
      'wiki',
      'example-setups',
      'community',
      'assets',
      'css',
    ],
    contentSha256: manifest.contentSha256,
    sourceSha256: manifest.sourceSha256,
  });
  assert.match(manifest.contentSha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(await releaseDigest(resolve(ROOT, 'v1')), manifest.contentSha256);
  assert.equal(await releaseSourceDigest(ROOT), manifest.sourceSha256);

  for (const path of [
    'v1/sketch/index.html',
    'v1/sketch/js/release.js',
    'v1/sketch/js/main.js',
    'v1/sketch/service-worker.js',
    'v1/Examples/Optics Bench/Michelson interferometer.json',
    'v1/community-submissions/issue-25.json',
    'v1/index.html',
    'v1/wiki/lens/index.html',
    'v1/example-setups/michelson-interferometer/index.html',
    'v1/community/optical-spectrometer/index.html',
  ]) {
    assert.ok((await stat(resolve(ROOT, path))).isFile(), `${path} is missing from the release`);
  }

  const releaseSource = await readFile(resolve(ROOT, 'v1/sketch/js/release.js'), 'utf8');
  assert.match(releaseSource, /APP_RELEASE = 'v1'/);

  const landing = await readFile(resolve(ROOT, 'v1/index.html'), 'utf8');
  assert.match(landing, /href="\.\/sketch\/"/);
  const app = await readFile(resolve(ROOT, 'v1/sketch/index.html'), 'utf8');
  assert.match(app, /class="brand" href="\.\.\/"/);
});

test('release status verifies immutable content and current-source alignment', () => {
  const result = spawnSync(process.execPath, ['tools/release-status.mjs', '--verify'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /v1 is intact and aligned/i);

  const github = spawnSync(process.execPath, ['tools/release-status.mjs', '--github'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(github.status, 0, github.stderr);
  assert.match(github.stdout, /^current_release=v1$/m);
  assert.match(github.stdout, /^next_release=v2$/m);
  assert.match(github.stdout, /^release_needed=false$/m);
  assert.match(github.stdout, /^content_valid=true$/m);
});

test('integrity checking covers every historical release', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opticalsetup-history-test-'));
  for (const release of ['v1', 'v2']) {
    const directory = resolve(root, release);
    await mkdir(directory);
    await writeFile(resolve(directory, 'asset.txt'), `${release}\n`);
    const contentSha256 = await releaseDigest(directory);
    await writeFile(resolve(directory, 'release.json'), `${JSON.stringify({
      release,
      frozen: true,
      contentSha256,
    })}\n`);
  }

  assert.deepEqual((await frozenReleaseStatuses(root)).map(status => status.valid), [true, true]);
  await writeFile(resolve(root, 'v1/asset.txt'), 'tampered\n');
  const statuses = await frozenReleaseStatuses(root);
  assert.equal(statuses.find(status => status.release === 'v1').valid, false);
  assert.equal(statuses.find(status => status.release === 'v2').valid, true);
  await rm(root, { recursive: true });
});

test('release bumps use monotonically increasing integer versions', async () => {
  assert.equal(nextRelease('v1'), 'v2');
  assert.equal(nextRelease('v19'), 'v20');
  assert.throws(() => nextRelease('1.0.0'), /invalid/i);

  const root = await mkdtemp(resolve(tmpdir(), 'opticalsetup-release-test-'));
  await mkdir(resolve(root, 'sketch/js'), { recursive: true });
  await writeFile(resolve(root, 'sketch/js/release.js'), "export const APP_RELEASE = 'v7';\n");
  assert.equal(await bumpRelease(root), 'v8');
  assert.match(await readFile(resolve(root, 'sketch/js/release.js'), 'utf8'), /APP_RELEASE = 'v8'/);
  await rm(root, { recursive: true });
});

test('Pages staging contains public files and releases, not repository internals', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'opticalsetup-pages-test-'));
  const output = resolve(parent, 'site');
  const result = spawnSync(process.execPath, ['tools/stage-pages.mjs', output], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  for (const path of [
    'index.html',
    'sketch/index.html',
    'v1/sketch/index.html',
    '.well-known/ai-catalog.json',
    'skills/opticalsetup/SKILL.md',
    'CNAME',
  ]) {
    assert.ok((await stat(resolve(output, path))).isFile(), `${path} is missing from Pages staging`);
  }
  await assert.rejects(stat(resolve(output, 'test')), { code: 'ENOENT' });
  await assert.rejects(stat(resolve(output, '.github')), { code: 'ENOENT' });
  await assert.rejects(stat(resolve(output, 'tools')), { code: 'ENOENT' });
  await rm(parent, { recursive: true });
});

test('release workflows prepare weekly PRs and deploy only approved releases', async () => {
  const weekly = await readFile(resolve(ROOT, '.github/workflows/weekly-release.yml'), 'utf8');
  assert.match(weekly, /cron: '17 9 \* \* 1'/);
  assert.match(weekly, /timezone: Europe\/Rome/);
  assert.match(weekly, /node tools\/release-status\.mjs --github/);
  assert.match(weekly, /node tools\/bump-release\.mjs/);
  assert.match(weekly, /gh pr create --base main/);
  assert.doesNotMatch(weekly, /gh pr merge|--auto/);

  const deploy = await readFile(resolve(ROOT, '.github/workflows/deploy-release.yml'), 'utf8');
  assert.match(deploy, /paths:\s*\n\s*- 'v\*\/release\.json'/);
  assert.match(deploy, /node tools\/release-status\.mjs --verify/);
  assert.match(deploy, /actions\/upload-pages-artifact@v4/);
  assert.match(deploy, /actions\/deploy-pages@v4/);
});

test('release snapshots cannot be overwritten', () => {
  const result = spawnSync(process.execPath, ['tools/freeze-release.mjs', 'v1'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /immutable/i);
});
