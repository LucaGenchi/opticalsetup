// Native SVG layout inspection; this does not replace real-browser acceptance.
// node tools/render-2pp-preview.mjs basic-2pp [output-directory]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registry } from '../sketch/js/elements.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';

const id = process.argv[2];
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || '')) throw new Error('Provide a collection scene ID');
const directory = resolve(process.argv[3] || 'collections/2pp/previews');
const scene = parseSketch(await readFile(new URL(`../collections/2pp/setups/${id}.json`, import.meta.url), 'utf8'), registry);
state.elements = scene.elements;
state.beams = scene.beams;
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, `${id}.svg`), buildSVG({ whiteBg: true }));
console.log(`Rendered native ${id}.svg`);
