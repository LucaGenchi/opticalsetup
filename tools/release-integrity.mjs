import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

// Files whose current contents define the public product. Changes elsewhere
// (tests, internal docs, workflows, tooling) do not consume a release number.
export const RELEASE_SOURCE_ENTRIES = Object.freeze([
  '.nojekyll',
  '.well-known',
  'CNAME',
  'Examples',
  'assets',
  'community',
  'community-submissions',
  'css',
  'example-setups',
  'index.html',
  'llms.txt',
  'robots.txt',
  'skill.md',
  'skills/opticalsetup',
  'sitemap.xml',
  'sketch',
  'wiki',
]);

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function digestFiles(root, files) {
  const hash = createHash('sha256');
  files.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
  for (const file of files) {
    const path = relative(root, file).split(sep).join('/');
    const contents = await readFile(file);
    hash.update(path);
    hash.update('\0');
    hash.update(String(contents.length));
    hash.update('\0');
    hash.update(contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function releaseDigest(root) {
  const files = (await filesBelow(root))
    .filter(file => relative(root, file) !== 'release.json');
  return digestFiles(root, files);
}

export async function releaseSourceDigest(root) {
  const files = [];
  for (const entry of RELEASE_SOURCE_ENTRIES) {
    const path = resolve(root, entry);
    const details = await stat(path);
    if (details.isDirectory()) files.push(...await filesBelow(path));
    else if (details.isFile()) files.push(path);
  }
  return digestFiles(root, files);
}

export async function frozenReleaseStatuses(root) {
  const releases = (await readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^v[1-9]\d*$/.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  return Promise.all(releases.map(async release => {
    const manifest = JSON.parse(await readFile(resolve(root, release, 'release.json'), 'utf8'));
    const actualContentSha256 = await releaseDigest(resolve(root, release));
    return {
      release,
      manifest,
      actualContentSha256,
      valid: manifest.release === release
        && manifest.frozen === true
        && manifest.contentSha256 === actualContentSha256,
    };
  }));
}
