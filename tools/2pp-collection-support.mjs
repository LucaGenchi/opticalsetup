import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';

// Discover only authored native files. There is no scene recipe or generated
// allowlist, so adding one paper never overwrites another paper's scene.
export async function readCollectionSetups(directory, papers) {
  let files;
  try { files = await readdir(join(directory, 'setups')); }
  catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
  const known = new Set(papers.map(paper => paper.id));
  const entries = new Map();
  for (const file of files.filter(name => name.endsWith('.json') && name !== 'manifest.json').sort()) {
    const id = file.slice(0, -5);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !known.has(id)) {
      throw new Error(`Unknown 2PP paper setup: ${file}`);
    }
    const scene = parseSketch(await readFile(join(directory, 'setups', file), 'utf8'), registry);
    if (!scene.elements.length) throw new Error(`${file}: scene has no elements`);
    const note = await readFile(join(directory, 'research', `${id}.md`), 'utf8');
    if (!note.trim()) throw new Error(`${id}: missing evidence and controls`);
    entries.set(id, { id, path: `setups/${file}`, research: `research/${id}.md` });
  }
  return entries;
}

// Research records contain ranges, source ratings and unresolved quantities.
// Only an explicitly reviewed subset can become a calculator preset. The
// scene's illustrative source defaults are never a fallback for this object.
export function reviewedPaperHandoff(paper) {
  const handoff = paper?.handoff;
  if (handoff?.basis !== 'paper' || handoff.verified !== true || !handoff.settings
    || typeof handoff.settings !== 'object' || Array.isArray(handoff.settings)) return null;
  return buildPaperHandoff(handoff.settings);
}
