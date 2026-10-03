// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Pattern previews are native workbench exports. No separate diagram renderer.
import { registry } from '../../sketch/js/elements.js';
import '../../sketch/js/detector-instruments.js';
import '../../sketch/js/etalon.js';
import '../../sketch/js/vipa.js';
import { state, parseSketch } from '../../sketch/js/state.js';
import { buildSVG } from '../../sketch/js/export.js';
import { traceScene } from '../../sketch/js/raytrace.js';

export const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function validateExample(example) {
  for (const key of ['id', 'title', 'summary', 'limit']) {
    if (typeof example[key] !== 'string' || !example[key].trim()) throw new Error(`Example missing ${key}`);
  }
  if (!['unavailable', 'rays'].includes(example.mode)) throw new Error(`${example.id}: a pattern needs a real setup or an explicit unavailable assessment`);
  if (!example.references?.length) throw new Error(`${example.id}: missing references`);
  for (const ref of example.references) {
    if (!ref.label || !/^https?:$/.test(new URL(ref.url).protocol)) throw new Error(`${example.id}: invalid reference`);
  }
  if (example.mode === 'unavailable') {
    if (example.scene) throw new Error(`${example.id}: unavailable patterns must not offer a substitute scene`);
    if (!example.unavailableReason?.trim()) throw new Error(`${example.id}: name the missing capability`);
    return example;
  }
  if (!example.scene) throw new Error(`${example.id}: available setup needs a native scene`);
  if (!Array.isArray(example.steps) || example.steps.length < 2) throw new Error(`${example.id}: missing setup instructions`);
  const scene = parseSketch(example.scene, registry);
  if (!scene.elements.some(el => registry[el.type]?.source)) throw new Error(`${example.id}: native setup needs a real source`);
  if (scene.elements.some(el => el.type === 'box')) throw new Error(`${example.id}: placeholder boxes cannot stand in for optical components`);
  if (scene.beams.some(beam => beam.kind !== 'fiber' || !beam.propagate)) throw new Error(`${example.id}: connection drawings are not native optical paths`);
  if (scene.elements.filter(el => registry[el.type]?.category !== 'Annotations').length < 3) throw new Error(`${example.id}: missing optical arrangement`);
  const traced = traceScene(scene.elements, scene.beams);
  if (!traced.drawables.length) throw new Error(`${example.id}: setup produces no traced light`);
  for (const drawable of traced.drawables) {
    for (const point of drawable.pts || drawable.dots || []) {
      if (![point.x, point.y].every(Number.isFinite)) throw new Error(`${example.id}: non-finite traced path`);
    }
  }
  return example;
}

export function exampleScene(example) {
  if (example.mode !== 'rays' || !example.scene) throw new Error(`${example.id}: no native setup is available`);
  // Settle the loader's floating-point angle wrapping before publication, so
  // opening the saved JSON gives exactly the geometry used for its preview.
  const normalized = parseSketch(example.scene, registry);
  return { app: 'optics2d', version: 1, ...parseSketch(normalized, registry) };
}

export function setupSVG(example) {
  const scene = exampleScene(example);
  const previous = { elements: state.elements, beams: state.beams };
  try {
    state.elements = scene.elements;
    state.beams = scene.beams;
    const svg = buildSVG({ whiteBg: true });
    return svg.replace(/(<svg\b[^>]*>)/, `$1\n<!-- SPDX-FileCopyrightText: 2026 Luca Genchi and contributors\nSPDX-License-Identifier: GPL-3.0-or-later -->\n<title>${esc(example.title)} — OpticalSetup setup</title><desc>${esc(example.summary)} ${esc(example.limit)}</desc>`);
  } finally {
    state.elements = previous.elements;
    state.beams = previous.beams;
  }
}
