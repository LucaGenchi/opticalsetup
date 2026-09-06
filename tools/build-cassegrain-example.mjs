// Regenerate the authored scene: node tools/build-cassegrain-example.mjs
import { writeFile } from 'node:fs/promises';
import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';

const elements = [];
function add(id, type, x, y, params = {}) {
  const el = createElement(type, x, y);
  el.id = id;
  Object.assign(el.params, params);
  elements.push(el);
  return el;
}
function text(id, x, y, value, size = 11, fill = '#7c828c') {
  return add(id, 'textlabel', x, y, { text: value, fontSize: size, fill });
}

// This is an illustrative conic prescription, not a vendor reconstruction.
// Convex paraboloid: R=80, k=-1, virtual focus x=410.
// Concave ellipsoid: foci x=410 and x=530, vertex x=250.
// a=(160+280)/2=220, c=60; R=(a²-c²)/a, k=-c²/a².
add('frame', 'figureframe', 320, 255, { w: 640, h: 510, background: 'white' });
text('title', 24, 40, 'Inside an IR Cassegrain objective', 21);
text('subtitle', 24, 71, 'Two real mirror surfaces • 3 µm illumination • a meridional cutaway', 11.5);
text('prescription', 24, 94, 'Illustrative conic design. Every bend below is computed from the mirror shape.', 10);

add('source', 'cwlaser', 80, 230, { wavelength: 3000, beamWidth: 32, avgPowerW: 0.1 });
add('central-stop', 'beamdump', 160, 230, { aperture: 14.4 });
add('entrance-stop', 'slit', 208, 230, { gap: 32, length: 45 });
add('primary', 'conicmirror', 250, 230, {
  radius: (220 * 220 - 60 * 60) / 220, conic: -60 * 60 / (220 * 220),
  dia: 160, hole: 36, facing: 'right', refl: 98,
});
add('secondary', 'conicmirror', 370, 230, {
  radius: 80, conic: -1, dia: 36, hole: 0, facing: 'left', refl: 98,
});
add('focus-sensor', 'camera', 552, 230, { ch: 20, pixels: 32, interference: false });

text('primary-label', 245, 127, 'PRIMARY', 11, '#b28b42');
text('primary-detail', 245, 143, 'concave • annular', 9.5);
text('secondary-label', 358, 177, 'SECONDARY', 11, '#b28b42');
text('secondary-detail', 358, 193, 'convex', 9.5);
text('source-label', 34, 277, 'IR laser', 10);
text('stop-label', 137, 289, 'Pupil stops', 10);
text('hole-label', 232, 335, 'Real opening', 10);
text('focus-label', 473, 268, 'Sample / sensor plane', 10);
text('wd-label', 390, 294, '160 mm from secondary vertex', 9);

// Direction keys sit clear of the traced beam; they are annotations only.
const arrow = (id, x, y, rot) => {
  const el = add(id, 'arrowann', x, y, { len: 28, width: 1, fill: '#b28b42' });
  el.rot = rot;
};
arrow('incoming-key', 294, 244, 0);
arrow('return-key', 301, 183, 180);
arrow('focus-key', 444, 204, 0);

text('route', 24, 382,
  '**Follow the light**\n1. The pupil stops admit two off-axis ray bands.\n2. Light passes through the primary opening.\n3. The convex secondary sends it back, spreading out.\n4. The concave primary brings it to the sample,\n   around the secondary: an annular focusing cone.', 10.5);
text('controls', 355, 382,
  '**Try it in the inspector**\n• Primary opening: 36 → 20 mm clips the input.\n• Both conic constants: set k = 0 to see aberration.\n• Laser wavelength: 3000 → 10000 nm, same focus.\n• Primary reflectivity: 0% removes the focus.', 10.5);
text('limits', 24, 480,
  'Geometry only: no Airy rings, spider diffraction, coating spectrum or calibrated IR sensitivity.\nThe point focus is geometric. The scale and conics are teaching choices, not catalogue specifications.', 9);

const scene = { app: 'optics2d', version: 1, elements, beams: [] };
await writeFile(new URL('../Examples/Microscopy Implementations/IR Cassegrain objective — element by element.json', import.meta.url), JSON.stringify(scene, null, 2) + '\n');
