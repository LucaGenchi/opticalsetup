// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Scans Examples/<Category>/*.json (native "Save" format sketch files) and
// emits sketch/js/examples-data.js, the manifest the app's Examples dropdown
// loads at runtime via fetch(). Run this after adding, renaming, or removing
// a file under Examples/ — `node tools/build-examples.mjs`. It also brings
// the examples in the service worker's offline list up to date (see
// tools/example-precache.mjs).
//
// A .json placed directly under Examples/, not inside a category
// subdirectory, is standalone: it is listed before every category, outside
// any optgroup, so it can't be mistaken for belonging to a category —
// including one added later.
//
// Each .json is validated against the real component registry (the same
// parseSketch() the app itself uses to open a file), so a typo'd element
// type or malformed file fails the build instead of silently 404ing or
// crashing the dropdown at runtime.
//
// Each entry also gets a stable `slug`, the same slugify() convention
// build-community.mjs uses. tools/build-examples-pages.mjs matches its
// content entries against this slug, and the app's `?example=<slug>` demo
// boot (see main.js) uses it to find which example to load into a locked
// embed — so the slug is part of this manifest's public contract, not an
// incidental field.

//
// Categories are listed in CATEGORY_ORDER, a teaching order from single
// components to whole instruments; a category not named there follows, in
// alphabetical order, so a new folder still appears without an edit here.

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
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
import { syncExamplePrecache } from './example-precache.mjs';


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES_DIR = join(ROOT, 'Examples');
const OUT_FILE = join(ROOT, 'sketch/js/examples-data.js');
const WORKER_FILE = join(ROOT, 'sketch/service-worker.js');

function humanize(baseName) {
  return baseName.replace(/[_-]+/g, ' ').trim();
}

// Same convention as build-community.mjs's slugify/uniqueSlug, duplicated
// rather than shared: each generator is a self-contained script in this
// project, and neither depends on the other's internals.
function slugify(name) {
  return name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    || 'example';
}

function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const CATEGORY_ORDER = [
  'Lens Physics',
  'Reflective Imaging Systems',
  'Beam Routing',
  'Interferometers',
  'Nonlinear Optics',
  'Microscopy Implementations',
];

// Within a category, examples named here come first, in this order (a
// teaching order); the rest follow alphabetically. Names are file names
// without `.json`, so the order never touches an example's slug.
const EXAMPLE_ORDER = {
  'Microscopy Implementations': [
    'Optical sectioning — linear versus nonlinear',
    'Epi-fluorescence microscope',
    'Multiphoton microscope — SHG and two photon fluorescence',
    'Coherent Raman microscope — SRS and CARS',
  ],
};

async function main() {
  let listing;
  try {
    listing = await readdir(EXAMPLES_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') { listing = []; } else { throw err; }
  }
  const rank = name => { const i = CATEGORY_ORDER.indexOf(name); return i < 0 ? CATEGORY_ORDER.length : i; };
  const categories = listing.filter(d => d.isDirectory()).map(d => d.name)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  const entries = [];
  const takenSlugs = new Set();

  // Files directly under Examples/ (not inside a category subdirectory) are
  // standalone — no optgroup, listed before every category so they can never
  // be mistaken for belonging to one, including categories added later.
  const standaloneFiles = listing.filter(d => d.isFile() && d.name.toLowerCase().endsWith('.json'))
    .map(d => d.name).sort((a, b) => a.localeCompare(b));
  for (const file of standaloneFiles) {
    const full = join(EXAMPLES_DIR, file);
    const text = await readFile(full, 'utf-8');
    let parsed;
    try {
      parsed = parseSketch(text, registry);
    } catch (err) {
      throw new Error(`Examples/${file}: ${err.message}`);
    }
    if (!parsed.elements.length) throw new Error(`Examples/${file}: sketch has no elements`);
    const name = humanize(file.replace(/\.json$/i, ''));
    const path = `../Examples/${encodeURIComponent(file)}`;
    const slug = uniqueSlug(slugify(name), takenSlugs);
    takenSlugs.add(slug);
    entries.push({ group: null, name, path, slug });
  }

  for (const category of categories) {
    const dir = join(EXAMPLES_DIR, category);
    const order = EXAMPLE_ORDER[category] || [];
    const place = f => { const i = order.indexOf(f.replace(/\.json$/i, '')); return i < 0 ? order.length : i; };
    const files = (await readdir(dir))
      .filter(f => f.toLowerCase().endsWith('.json'))
      .sort((a, b) => place(a) - place(b) || a.localeCompare(b));
    for (const file of files) {
      const full = join(dir, file);
      const text = await readFile(full, 'utf-8');
      let parsed;
      try {
        parsed = parseSketch(text, registry);
      } catch (err) {
        throw new Error(`Examples/${category}/${file}: ${err.message}`);
      }
      if (!parsed.elements.length) {
        throw new Error(`Examples/${category}/${file}: sketch has no elements`);
      }
      const name = humanize(file.replace(/\.json$/i, ''));
      const path = `../Examples/${encodeURIComponent(category)}/${encodeURIComponent(file)}`;
      const slug = uniqueSlug(slugify(name), takenSlugs);
      takenSlugs.add(slug);
      entries.push({ group: category, name, path, slug });
    }
  }

  const body = `// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Generated by tools/build-examples.mjs — do not edit by hand.
// Scans Examples/<Category>/*.json and lists them here so the Examples
// dropdown can fetch them at runtime without a directory listing (this is a
// static site). Re-run the generator after adding/removing/renaming a file
// under Examples/. Each entry's \`slug\` is a stable id used by the
// \`?example=<slug>\` demo boot (see main.js) and by
// tools/build-examples-pages.mjs's generated pages.
export const examples = ${JSON.stringify(entries, null, 2)};
`;
  await writeFile(OUT_FILE, body, 'utf-8');
  console.log(`Wrote ${entries.length} example(s) (${standaloneFiles.length} standalone) across ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} to sketch/js/examples-data.js`);

  const worker = syncExamplePrecache(await readFile(WORKER_FILE, 'utf-8'), entries.map(entry => entry.path));
  if (worker.changed) {
    await writeFile(WORKER_FILE, worker.source, 'utf-8');
    console.log('Updated the examples in sketch/service-worker.js PRECACHE_PATHS and bumped its cache generation');
  } else {
    console.log('sketch/service-worker.js already lists every example offline');
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
