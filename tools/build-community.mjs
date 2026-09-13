// Static community-page generator: `node tools/build-community.mjs`.
//
// Scans community-submissions/issue-<N>.json (written by the "materialize
// example proposal" GitHub Action from a submitted issue; lowercased and
// hyphenated so it can never collide with the generated community/ pages
// directory below on a case-insensitive filesystem), publishes only the
// entries that are present in the checkout and emits:
//   - community/<slug>/index.html  (title, author, abstract, reference,
//     and a locked, click-to-inspect embed of the actual submitted scene)
//   - community/index.html         (hub page: card grid + propose CTA)
//   - sketch/js/community-data.js  (manifest the app's "From the community"
//     dropdown fetches at runtime, same pattern as examples-data.js)
// Merging a proposal PR is the deliberate moderation gate. A main-branch
// workflow runs this generator after the merge.

import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSketch } from '../sketch/js/state.js';
import { registry } from '../sketch/js/elements.js';
// Registers the redesigned detector catalogue and the Etalon/VIPA element
// onto `registry`. Required here because this tool validates scenes with
// parseSketch(..., registry): without these, a sketch using a Power meter,
// Polarimeter, Spectrometer, Wavefront detector, General detector,
// Etalon, or VIPA is rejected as an unknown type.
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';
import { FAVICON, header } from './site-chrome.mjs';


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMUNITY_DIR = join(ROOT, 'community-submissions');
const OUT_DIR = join(ROOT, 'community');
const DATA_FILE = join(ROOT, 'sketch/js/community-data.js');
const SITE_URL = 'https://opticalsetup.com';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slugify(name) {
  return name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    || 'setup';
}

function uniqueSlug(base, issueNumber, taken) {
  if (!taken.has(base)) return base;
  const withNumber = `${base}-${issueNumber}`;
  if (!taken.has(withNumber)) return withNumber;
  let n = 2;
  while (taken.has(`${withNumber}-${n}`)) n++;
  return `${withNumber}-${n}`;
}

function referenceHTML(reference) {
  if (!reference) return '';
  let isURL = false;
  try { isURL = new URL(reference).protocol === 'https:' || new URL(reference).protocol === 'http:'; } catch (_) { isURL = false; }
  const body = isURL ? `<a href="${esc(reference)}" target="_blank" rel="noopener">${esc(reference)}</a>` : esc(reference);
  return `<div class="community-reference"><span class="lbl">Reference</span>${body}</div>`;
}

// The shared site header and mark live in one module; see tools/site-chrome.mjs.

function pageHTML(entry) {
  const base = '../..';
  const submitted = new Date(entry.source.submittedAt);
  const dateText = Number.isFinite(submitted.getTime())
    ? submitted.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(entry.name)} — Community | OpticalSetup</title>
<meta name="description" content="${esc(entry.description)}">
<link rel="canonical" href="${SITE_URL}/community/${entry.slug}/">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(entry.name)} — OpticalSetup Community">
<meta property="og:description" content="${esc(entry.description)}">
<meta property="og:url" content="${SITE_URL}/community/${entry.slug}/">
<meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${base}/wiki/assets/wiki.css">
<link rel="stylesheet" href="${base}/community/assets/community.css">
</head>
<body>
${header(base)}
  <div class="wiki-shell" style="grid-template-columns: 1fr;">
    <main class="wiki-article" style="max-width: 760px;">
      <div class="crumb"><a href="${base}/community/">Community</a> / ${esc(entry.name)}</div>
      <h1>${esc(entry.name)}</h1>
      <p class="community-byline">By <a href="${esc(entry.author.profile)}" target="_blank" rel="noopener">@${esc(entry.author.github)}</a>${dateText ? ` · ${dateText}` : ''} · <a href="${esc(entry.source.issue)}" target="_blank" rel="noopener">source discussion</a></p>

      <p class="tagline" style="margin-top: 18px; white-space: pre-wrap;">${esc(entry.description)}</p>
      ${referenceHTML(entry.reference)}

      <div class="embed-wrap">
        <iframe class="embed-frame" src="${base}/sketch/?community=${encodeURIComponent(entry.slug)}&amp;embed=1"
          title="${esc(entry.name)} — a live trace of this setup"
          loading="lazy" tabindex="-1" aria-hidden="true"></iframe>
      </div>
      <p class="embed-caption">A live trace of the submitted setup, shown as a picture. Open it in the canvas to explore it, change it, and save or export your own copy.</p>
      <a class="place-cta" href="${base}/sketch/?community=${encodeURIComponent(entry.slug)}">Open in the full canvas →</a>
    </main>
  </div>
  <footer class="wiki-footer">Community setups are submitted and reviewed via <a href="https://github.com/LucaGenchi/optics-sketch/issues" target="_blank" rel="noopener">GitHub issues</a> — they show how people actually use OpticalSetup, and haven't been vetted for pedagogical accuracy the way <a href="${base}/sketch/">Examples</a> have.</footer>
</body>
</html>
`;
}

function hubHTML(entries) {
  const base = '..';
  const cards = entries.map(e => `
        <a class="community-card" href="${base}/community/${e.slug}/">
          <span class="name">${esc(e.name)}</span>
          <span class="by">by @${esc(e.author.github)}</span>
          <span class="snippet">${esc(e.description.length > 140 ? `${e.description.slice(0, 140)}…` : e.description)}</span>
        </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Community — OpticalSetup</title>
<meta name="description" content="Optical setups shared by the OpticalSetup community — real implementations, with the story behind each one.">
<link rel="canonical" href="${SITE_URL}/community/">
<meta property="og:type" content="website">
<meta property="og:title" content="Community — OpticalSetup">
<meta property="og:description" content="Optical setups shared by the OpticalSetup community — real implementations, with the story behind each one.">
<meta property="og:url" content="${SITE_URL}/community/">
<meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${base}/wiki/assets/wiki.css">
<link rel="stylesheet" href="${base}/community/assets/community.css">
</head>
<body>
${header(base)}
  <div class="wiki-shell" style="grid-template-columns: 1fr;">
    <div>
      <div class="hub-hero">
        <h1>Setups from the community</h1>
        <p>Sketches shared by users of OpticalSetup.</p>
        <p>A tool to spread knowledge and increase the impact of your work, sharing the details of every optical element used in your implementations.</p>
        <p>Each submission is reviewed by one of the moderators before it appears on this list.</p>
      </div>
      <div class="propose-banner">
        <p>Built something worth sharing? Open it in the canvas and use the Propose button to submit it for review.</p>
        <a class="btn" href="${base}/sketch/">Open the canvas →</a>
      </div>
      ${entries.length ? `
      <div class="hub-groups">
        <div class="hub-group">
          <div class="community-grid">${cards}</div>
        </div>
      </div>` : `
      <p class="community-empty">No community setups are published yet — be the first to propose one from the canvas.</p>`}
    </div>
  </div>
  <footer class="wiki-footer">Community setups are submitted and reviewed via <a href="https://github.com/LucaGenchi/optics-sketch/issues" target="_blank" rel="noopener">GitHub issues</a> — see the <a href="${base}/wiki/">wiki</a> for how each component actually works.</footer>
</body>
</html>
`;
}

async function loadEntries() {
  let files;
  try {
    files = (await readdir(COMMUNITY_DIR)).filter(f => f.toLowerCase().endsWith('.json')).sort((a, b) => a.localeCompare(b));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const taken = new Set();
  const entries = [];
  for (const file of files) {
    const full = join(COMMUNITY_DIR, file);
    let raw;
    try {
      raw = JSON.parse(await readFile(full, 'utf-8'));
    } catch (err) {
      throw new Error(`community-submissions/${file}: invalid JSON (${err.message})`);
    }
    const issueMatch = file.match(/issue-(\d+)\.json$/i);
    const issueNumber = issueMatch ? issueMatch[1] : file.replace(/\.json$/i, '');

    if (!raw.name || typeof raw.name !== 'string') throw new Error(`community-submissions/${file}: missing "name"`);
    if (!raw.description || typeof raw.description !== 'string') throw new Error(`community-submissions/${file}: missing "description"`);
    if (!raw.author?.github || !raw.author?.profile) throw new Error(`community-submissions/${file}: missing "author"`);
    if (!raw.source?.issue || !raw.source?.submittedAt) throw new Error(`community-submissions/${file}: missing "source"`);

    try {
      parseSketch(JSON.stringify(raw.scene), registry);
    } catch (err) {
      throw new Error(`community-submissions/${file}: ${err.message}`);
    }

    const slug = uniqueSlug(slugify(raw.name), issueNumber, taken);
    taken.add(slug);
    entries.push({
      slug,
      name: raw.name,
      description: raw.description,
      reference: raw.reference || null,
      author: raw.author,
      source: raw.source,
      sourceFile: file,
    });
  }

  entries.sort((a, b) => new Date(b.source.submittedAt) - new Date(a.source.submittedAt));
  return entries;
}

async function main() {
  const entries = await loadEntries();

  await mkdir(OUT_DIR, { recursive: true });
  for (const entry of entries) {
    const pageDir = join(OUT_DIR, entry.slug);
    await mkdir(pageDir, { recursive: true });
    await writeFile(join(pageDir, 'index.html'), pageHTML(entry), 'utf-8');
  }
  await writeFile(join(OUT_DIR, 'index.html'), hubHTML(entries), 'utf-8');

  const manifest = entries.map(e => ({
    slug: e.slug,
    name: e.name,
    path: `../community-submissions/${encodeURIComponent(e.sourceFile)}`,
  }));
  const body = `// Generated by tools/build-community.mjs — do not edit by hand.
// Lists every merged community-submissions/*.json entry so the "From the community"
// dropdown can fetch them at runtime without a directory listing (this is a
// static site). The publishing workflow regenerates this file after approval.
export const community = ${JSON.stringify(manifest, null, 2)};
`;
  await writeFile(DATA_FILE, body, 'utf-8');

  console.log(`Built ${entries.length} community page(s) + hub + community-data.js`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
