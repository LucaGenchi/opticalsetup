import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildSVG } from '../sketch/js/export.js';
import { registry } from '../sketch/js/elements.js';
import { parseSketch, replaceScene } from '../sketch/js/state.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const scenePath = join(root, 'collections/2pp/setups/dong-2007.json');
const outputDir = join(root, 'collections/2pp/evidence');
const source = await readFile(scenePath, 'utf8');

const variants = [
  ['dong-2007-default.svg', () => {}],
  ['dong-2007-mask-18mm.svg', scene => {
    const mask = scene.elements.find(element => element.id === 'dong-mask');
    mask.params.gap = 18;
    mask.label = 'Aperture mask — 18 mm';
  }],
  ['dong-2007-two-lenslets.svg', scene => {
    const array = scene.elements.find(element => element.id === 'dong-array');
    array.params.count = 2;
    array.label = '2 lenslets · f = 60 mm';
  }],
  ['dong-2007-defocus-45mm.svg', scene => {
    const array = scene.elements.find(element => element.id === 'dong-array');
    array.params.f = 45;
    array.label = '4 lenslets · f = 45 mm';
  }],
];

await mkdir(outputDir, { recursive: true });
for (const [filename, change] of variants) {
  const scene = parseSketch(source, registry);
  change(scene);
  replaceScene(scene, { resetHistory: true });
  await writeFile(join(outputDir, filename), buildSVG({ whiteBg: true }), 'utf8');
}

console.log(`Rendered ${variants.length} native-scene evidence files to ${dirname(join(outputDir, variants[0][0]))}`);
