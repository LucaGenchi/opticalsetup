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

// How a release is hashed. A published entry in releases.json names the
// scheme it was hashed with, so these definitions are permanent: to list a new
// public directory or change what is left out of a hash, add scheme 2 and
// leave scheme 1 as it is. Changing a scheme in place would make every
// release recorded under it fail its own check.
const SCHEMES = Object.freeze({
  1: Object.freeze({
    // Everything the public site serves. Tests, tools, workflows and internal
    // docs are not hosted.
    site: Object.freeze([
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
    ]),
    // What a kept release at /v1.2/ holds: the app and the scene files it
    // loads by relative path. Wiki, calculators and community pages exist
    // once, for the current release.
    kept: Object.freeze(['sketch', 'Examples', 'community-submissions']),
    // Generated lists of examples and community setups: data, no code. They
    // change with content, not with how a scene is drawn, so they are left
    // out of the renderer hash (and stay in the site hash).
    lists: Object.freeze(['sketch/js/examples-data.js', 'sketch/js/community-data.js']),
    // Two files mix a label or a list into code. Only the label and the list
    // are blanked; the code around them is hashed like any other. If a
    // pattern stops matching, the whole file is hashed, which errs toward
    // calling a change an app change.
    normalize: Object.freeze({
      // The release label, which cutting a release rewrites.
      'sketch/js/release.js': text => text.replace(/^export const APP_RELEASE = '[^']*';$/m, "export const APP_RELEASE = '';"),
      // The offline list of example files and the cache generation number.
      'sketch/service-worker.js': text => text
        .replace(/^const PRECACHE_PATHS = \[[\s\S]*?^\];$/m, 'const PRECACHE_PATHS = [];')
        .replace(/^(const CACHE_NAME = .*?)v\d+(`;)$/m, '$1v0$2'),
    }),
  }),
});
export const CURRENT_SCHEME = 1;

export function schemeOf(number) {
  const scheme = SCHEMES[number];
  if (!scheme) throw new Error(`Unknown release scheme: ${number}`);
  return scheme;
}

export const PUBLIC_SITE_ENTRIES = SCHEMES[CURRENT_SCHEME].site;

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
// nothing.
export async function digestTree(root, entries, { exclude = [], normalize = {} } = {}) {
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
    let bytes = await readFile(file);
    if (normalize[name]) bytes = Buffer.from(normalize[name](bytes.toString('utf8')), 'utf8');
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

// The app as far as drawing a scene goes. Two releases with the same value
// run the same code, so they share one kept copy.
export function rendererDigest(root, scheme = CURRENT_SCHEME) {
  const { lists, normalize } = schemeOf(scheme);
  return digestTree(root, ['sketch'], { exclude: lists, normalize });
}

// The whole public site. Only the release label and offline list are blanked.
export function siteDigest(root, scheme = CURRENT_SCHEME) {
  const { site, normalize } = schemeOf(scheme);
  return digestTree(root, site, { normalize });
}

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

// The list on its own: strictly increasing, and a patch must leave the
// renderer exactly as its MAJOR.MINOR recorded it. That it only ever grows is
// checked against the release tags, in verifyHistory().
export function validateReleases(data) {
  const releases = data?.releases;
  if (!Array.isArray(releases)) throw new Error('releases.json must hold a "releases" array');
  releases.forEach((entry, index) => {
    parseVersion(entry.version);
    for (const key of ['rendererSha256', 'siteSha256']) {
      if (!/^[0-9a-f]{64}$/.test(entry[key] ?? '')) throw new Error(`${entry.version}: ${key} is not a SHA-256`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '')) throw new Error(`${entry.version}: date must be YYYY-MM-DD`);
    schemeOf(entry.scheme);
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
    if (!seen.has(path)) seen.set(path, { path, version: entry.version });
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
  return execFileSync('git', args, { cwd: root, maxBuffer: 512 * 1024 * 1024, stdio: 'pipe', ...options });
}

export function tagExists(root, version) {
  try { git(root, ['rev-parse', '-q', '--verify', `refs/tags/${version}^{commit}`]); return true; }
  catch (_) { return false; }
}

function releaseTags(root) {
  return git(root, ['tag', '--list', 'v*']).toString().split('\n').filter(name => VERSION.test(name));
}

function releasesAt(root, ref) {
  let text;
  try { text = git(root, ['show', `${ref}:releases.json`]).toString(); } catch (_) { return null; }
  return JSON.parse(text).releases;
}

// A published release is a tag, and the tag carries the list as it stood
// when that release was cut. The list at hand must still begin with exactly
// that: an entry that was removed, reordered or edited (a date, a hash) fails
// here, as does a tag with no entry or an entry with no tag. Without this,
// deleting the v1.0 entries would silently drop /v1.0/ from the next deploy.
//
// `allowUntaggedLatest` is for a release that is prepared but not merged yet:
// its tag is created by the deploy.
export function verifyHistory(root, releases, { allowUntaggedLatest = false } = {}) {
  const listed = new Set(releases.map(entry => entry.version));
  const tags = new Set(releaseTags(root));
  for (const tag of tags) {
    if (!listed.has(tag)) throw new Error(`Release ${tag} is tagged but missing from releases.json; a published release cannot be removed`);
  }
  releases.forEach((entry, index) => {
    if (!tags.has(entry.version)) {
      if (allowUntaggedLatest && index === releases.length - 1) return;
      throw new Error(`Tag ${entry.version} is missing; a release tag is permanent and is not recreated automatically`);
    }
    const then = releasesAt(root, entry.version);
    const now = releases.slice(0, index + 1);
    if (!then || JSON.stringify(then) !== JSON.stringify(now)) {
      throw new Error(`releases.json no longer begins with the list that ${entry.version} was released with; published entries cannot be edited`);
    }
  });
}

// Whether the deploy may tag the latest release. Only the commit that added
// the entry is a new release; an entry that was already there with no tag
// means a tag was deleted, and that is never repaired by tagging whatever
// commit happens to be checked out.
export function releaseTagState(root, releases) {
  const latest = releases.at(-1);
  if (!latest) return 'none';
  if (tagExists(root, latest.version)) return 'tagged';
  const before = releasesAt(root, 'HEAD^') ?? [];
  if (before.some(entry => entry.version === latest.version)) {
    throw new Error(`Tag ${latest.version} is missing, and ${latest.version} was released before this commit. `
      + 'A release tag is not recreated automatically; restore it by hand on the release commit.');
  }
  return 'new';
}
