// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// What a release is made of, and the checks that keep a published one from
// changing. Used by tools/release.mjs (cut a release) and
// tools/stage-site.mjs (build the site that gets deployed). See
// docs/release-policy.md.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

// Everything the public site serves. Tests, tools, workflows and internal
// docs are not hosted.
export const PUBLIC_SITE_ENTRIES = Object.freeze([
  '.nojekyll',
  '.well-known',
  'CNAME',
  'Examples',
  'assets',
  'calculators',
  'community',
  'community-submissions',
  'css',
  // Wiki and example pages link to these derivations.
  'docs/physics',
  'example-setups',
  'index.html',
  'license.html',
  'llms.txt',
  'robots.txt',
  'sitemap.xml',
  'sketch',
  'skill.md',
  'skills/opticalsetup',
  'wiki',
]);

// What a kept release at /v1.2/ holds: the app and the scene files it loads
// by relative path. Wiki, calculators and community pages exist once, for the
// current release.
export const KEPT_RELEASE_ENTRIES = Object.freeze(['sketch', 'Examples', 'community-submissions']);

// Files under sketch/ that change without changing how a scene is drawn: the
// release label, the generated lists of examples and community setups, and
// the offline cache list that names them. A release that touches only these
// (and content outside sketch/) is a patch release.
export const NON_RENDERER_FILES = Object.freeze([
  'sketch/js/release.js',
  'sketch/js/examples-data.js',
  'sketch/js/community-data.js',
  'sketch/service-worker.js',
]);

const VERSION = /^v(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(version) {
  const match = VERSION.exec(String(version ?? ''));
  if (!match) throw new Error(`Not a release version (expected vMAJOR.MINOR.PATCH): ${version}`);
  return match.slice(1).map(Number);
}

// 'v1.2.3' -> 'v1.2', the path of the kept app copy. Mirrors releasePath()
// in sketch/js/release.js.
export function releasePath(version) {
  const [major, minor] = parseVersion(version);
  return `v${major}.${minor}`;
}

export function bumpVersion(version, level) {
  const [major, minor, patch] = parseVersion(version);
  if (level === 'major') return `v${major + 1}.0.0`;
  if (level === 'minor') return `v${major}.${minor + 1}.0`;
  if (level === 'patch') return `v${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown release level: ${level}`);
}

function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

async function filesBelow(path) {
  const details = await stat(path);
  if (details.isFile()) return [path];
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

// One hash over names and bytes, independent of directory listing order and
// of the platform's path separator. Entries missing from `root` contribute
// nothing: an older release may predate a section of the site.
export async function digestTree(root, entries, exclude = []) {
  const skip = new Set(exclude);
  const files = [];
  for (const entry of entries) {
    let found;
    try { found = await filesBelow(resolve(root, entry)); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const file of found) {
      const name = relative(root, file).split(sep).join('/');
      if (!skip.has(name)) files.push([name, file]);
    }
  }
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const hash = createHash('sha256');
  for (const [name, file] of files) {
    const bytes = await readFile(file);
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

// The app as far as drawing a scene goes. Two releases with the same value
// draw every scene identically, so they share one kept copy.
export const rendererDigest = root => digestTree(root, ['sketch'], NON_RENDERER_FILES);

// The whole public site, less the release label that cutting a release
// rewrites.
export const siteDigest = root => digestTree(root, PUBLIC_SITE_ENTRIES, ['sketch/js/release.js']);

export async function readAppRelease(root) {
  const source = await readFile(resolve(root, 'sketch/js/release.js'), 'utf8');
  const match = /^export const APP_RELEASE = '([^']*)';$/m.exec(source);
  if (!match) throw new Error('Could not read APP_RELEASE from sketch/js/release.js');
  return match[1];
}

export function withAppRelease(source, version) {
  const line = /^export const APP_RELEASE = '[^']*';$/m;
  if (!line.test(source)) throw new Error('Could not find APP_RELEASE in sketch/js/release.js');
  return source.replace(line, `export const APP_RELEASE = '${version}';`);
}

// The list is append-only and strictly increasing. A new MAJOR.MINOR is what
// creates a kept copy, so it must come with a new renderer; a patch must
// leave the renderer exactly as its MAJOR.MINOR recorded it.
export function validateReleases(data) {
  const releases = data?.releases;
  if (!Array.isArray(releases)) throw new Error('releases.json must hold a "releases" array');
  releases.forEach((entry, index) => {
    parseVersion(entry.version);
    for (const key of ['rendererSha256', 'siteSha256']) {
      if (!/^[0-9a-f]{64}$/.test(entry[key] ?? '')) throw new Error(`${entry.version}: ${key} is not a SHA-256`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '')) throw new Error(`${entry.version}: date must be YYYY-MM-DD`);
    if (index === 0) return;
    const previous = releases[index - 1];
    if (compareVersions(entry.version, previous.version) <= 0) {
      throw new Error(`${entry.version} does not come after ${previous.version}`);
    }
    const samePath = releasePath(entry.version) === releasePath(previous.version);
    if (samePath && entry.rendererSha256 !== previous.rendererSha256) {
      throw new Error(`${entry.version} changes the app but keeps the path of ${previous.version}`);
    }
  });
  return releases;
}

export async function readReleases(root) {
  return validateReleases(JSON.parse(await readFile(resolve(root, 'releases.json'), 'utf8')));
}

// Which version the tree at hand becomes. `level` is 'auto', 'patch',
// 'minor' or 'major'.
export function planRelease({ releases, renderer, site, level = 'auto' }) {
  if (!['auto', 'patch', 'minor', 'major'].includes(level)) throw new Error(`Unknown release level: ${level}`);
  const last = releases.at(-1);
  if (!last) return { version: 'v1.0.0', level: 'major', rendererChanged: true };
  if (site === last.siteSha256) throw new Error(`Nothing public has changed since ${last.version}; there is nothing to release.`);
  const rendererChanged = renderer !== last.rendererSha256;
  const chosen = level === 'auto' ? (rendererChanged ? 'minor' : 'patch') : level;
  if (chosen === 'patch' && rendererChanged) {
    throw new Error(
      `The app itself changed since ${last.version}, so this cannot be a patch release: `
      + `links shared from ${releasePath(last.version)} must keep opening the app that made them. Use minor or major.`);
  }
  return { version: bumpVersion(last.version, chosen), level: chosen, rendererChanged };
}

// The first release of each MAJOR.MINOR: the tag its kept copy is taken from.
export function keptReleases(releases) {
  const seen = new Map();
  for (const entry of releases) {
    const path = releasePath(entry.version);
    if (!seen.has(path)) seen.set(path, { path, version: entry.version, rendererSha256: entry.rendererSha256 });
  }
  return [...seen.values()];
}

// Every link from a staged page to another file on the site must land on a
// staged file. This is what catches a public page that depends on something
// PUBLIC_SITE_ENTRIES does not list: on the repository-wide site that used
// to be served, such a link worked by accident.
export async function brokenInternalLinks(root) {
  const base = resolve(root);
  const exists = async path => {
    try {
      const details = await stat(path);
      return details.isFile() || (await stat(join(path, 'index.html'))).isFile();
    } catch (_) { return false; }
  };
  const broken = [];
  for (const file of await filesBelow(base)) {
    if (!file.endsWith('.html')) continue;
    const html = await readFile(file, 'utf8');
    for (const [, raw] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      // Other sites, in-page anchors, and template text inside inline scripts.
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw) || raw.includes('${')) continue;
      let path;
      try { path = decodeURIComponent(raw.split('#')[0].split('?')[0]); } catch (_) { path = raw; }
      if (!path) continue;
      const target = path.startsWith('/') ? join(base, path) : resolve(file, '..', path);
      if (!await exists(target)) broken.push(`${relative(base, file).split(sep).join('/')} -> ${raw}`);
    }
  }
  return broken;
}

export function git(root, args, options = {}) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 512 * 1024 * 1024, ...options });
}

export function tagExists(root, version) {
  try { git(root, ['rev-parse', '-q', '--verify', `refs/tags/${version}^{commit}`], { stdio: 'pipe' }); return true; }
  catch (_) { return false; }
}
