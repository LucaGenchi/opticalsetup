// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { registry, createElement, getSize } from '../../sketch/js/elements.js';
import '../../sketch/js/detector-instruments.js';
import '../../sketch/js/etalon.js';
import '../../sketch/js/vipa.js';
import { parseSketch } from '../../sketch/js/state.js';

export const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const colors = { light: '#78dfb0', reference: '#efbe71', signal: '#a6b9db' };

export function wrap(text, length = 21) {
  const lines = [''];
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1;
    if (lines[last] && lines[last].length + word.length + 1 > length) lines.push(word);
    else lines[last] += (lines[last] ? ' ' : '') + word;
  }
  return lines;
}

export function validateExample(example) {
  for (const key of ['id', 'title', 'summary', 'limit']) {
    if (typeof example[key] !== 'string' || !example[key].trim()) throw new Error(`Example missing ${key}`);
  }
  if (!['schematic', 'rays'].includes(example.mode)) throw new Error(`${example.id}: invalid mode`);
  if (example.mode === 'rays' && !example.scene) throw new Error(`${example.id}: ray example needs a scene`);
  if (!Array.isArray(example.steps) || example.steps.length < 2 || example.steps.some(s => !s)) throw new Error(`${example.id}: missing inspection steps`);
  if (!example.references?.length) throw new Error(`${example.id}: missing references`);
  for (const ref of example.references) {
    if (!ref.label || !/^https?:$/.test(new URL(ref.url).protocol)) throw new Error(`${example.id}: invalid reference`);
  }
  if (!Array.isArray(example.nodes) || example.nodes.length < 3) throw new Error(`${example.id}: empty arrangement`);
  const nodes = new Map();
  for (const node of example.nodes) {
    if (!node.id || nodes.has(node.id)) throw new Error(`${example.id}: duplicate node ${node.id}`);
    if (!node.label || !node.note) throw new Error(`${example.id}: node ${node.id} needs a label and role`);
    if (![node.x, node.y].every(Number.isFinite) || node.x < 40 || node.x > 920 || node.y < 40 || node.y > 370) throw new Error(`${example.id}: node outside diagram ${node.id}`);
    if (node.type && !registry[node.type]) throw new Error(`${example.id}: unknown component ${node.type}`);
    nodes.set(node.id, node);
  }
  if (!example.edges?.length) throw new Error(`${example.id}: no connections`);
  for (const edge of example.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) throw new Error(`${example.id}: invalid connection`);
    if (edge.kind && !colors[edge.kind]) throw new Error(`${example.id}: invalid connection kind`);
    if ((edge.via || []).some(point => point.length !== 2 || !point.every(Number.isFinite))) throw new Error(`${example.id}: non-finite connection`);
  }
  if (example.scene) parseSketch(example.scene, registry);
  return example;
}

function edgePoints(edge, nodes, box = null) {
  const a = nodes.get(edge.from), b = nodes.get(edge.to);
  const points = [[a.x, a.y], ...(edge.via || []), [b.x, b.y]];
  // Stop outside each symbol, so arrows cannot run through the optic itself.
  for (const [end, next] of [[0, 1], [points.length - 1, points.length - 2]]) {
    const [x, y] = points[end], [nx, ny] = points[next];
    const distance = Math.hypot(nx - x, ny - y);
    if (distance > 0) {
      const dx = nx - x, dy = ny - y;
      // A zero direction component imposes no boundary; choose the other axis.
      const inset = box ? Math.min(dx ? box.w * distance / Math.abs(dx) : Infinity, dy ? box.h * distance / Math.abs(dy) : Infinity) : 40;
      const shift = Math.min(inset, Math.max(0, distance / 2 - .1));
      points[end] = [x + dx * shift / distance, y + dy * shift / distance];
    }
  }
  return points;
}

function icon(node) {
  if (!node.type) return '<path d="M-13 0H13M0-13V13" stroke="#587088" stroke-width="1.5"/>';
  const el = createElement(node.type, 0, 0);
  el.id = `pattern-symbol-${node.id}`;
  Object.assign(el.params, node.params || {});
  const size = getSize(el);
  const scale = Math.min(1, 48 / Math.max(size.w, size.h));
  return `<g transform="scale(${scale}) rotate(${Number.isFinite(node.rot) ? node.rot : 0})">${registry[node.type].svg(el)}</g>`;
}

export function diagramSVG(example, { interactive = false } = {}) {
  validateExample(example);
  const prefix = example.id.toLowerCase();
  const nodes = new Map(example.nodes.map(node => [node.id, node]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 440" class="pattern-diagram" role="${interactive ? 'group' : 'img'}" aria-labelledby="${prefix}-title ${prefix}-desc">
<!-- SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
     SPDX-License-Identifier: GPL-3.0-or-later -->
<title id="${prefix}-title">${esc(example.title)}</title><desc id="${prefix}-desc">${esc(example.summary)} Arrows indicate connections, not calculated ray trajectories.</desc>
<defs>${Object.entries(colors).map(([kind, color]) => `<marker id="${prefix}-${kind}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1L8 5L0 9" fill="none" stroke="${color}" stroke-width="1.5"/></marker>`).join('')}<pattern id="${prefix}-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#34465a"/></pattern></defs>
<rect width="960" height="440" fill="#101e2b"/><rect width="960" height="440" fill="url(#${prefix}-grid)"/>
<g fill="none" stroke-width="2">${example.edges.map(edge => {
    const points = edgePoints(edge, nodes), kind = edge.kind || 'light';
    return `<path d="M${points.map(p => p.join(',')).join('L')}" stroke="${colors[kind]}"${kind === 'signal' ? ' stroke-dasharray="6 5"' : ''} marker-end="url(#${prefix}-${kind})"><title>${esc(edge.label || kind + ' path')}</title></path>`;
  }).join('')}</g>
${example.nodes.map((node, index) => `<g transform="translate(${node.x},${node.y})"${interactive ? ` class="diagram-node" role="button" tabindex="0" data-node="${esc(node.id)}" aria-label="${esc(node.label)}: ${esc(node.note)}"` : ''}>
<title>${esc(node.label)}: ${esc(node.note)}</title><rect class="node-outline" x="-35" y="-29" width="70" height="58" rx="5" fill="#f4f7fa" stroke="#a6b9ca" stroke-width="1.5"/>${icon(node)}
<circle cx="-34" cy="-29" r="10" fill="#1c3549" stroke="#819bab"/><text x="-34" y="-25" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#fff">${index + 1}</text>
<text text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#eef5fb" stroke="#101e2b" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${wrap(node.label).map((line, i) => `<tspan x="0" y="${48 + i * 17}">${esc(line)}</tspan>`).join('')}</text></g>`).join('')}
<g font-family="Arial,sans-serif" font-size="12" fill="#b3c5d4"><path d="M30 418H56" stroke="${colors.light}" stroke-width="2"/><text x="64" y="422">Optical path</text><path d="M188 418H214" stroke="${colors.reference}" stroke-width="2"/><text x="222" y="422">Reference / auxiliary</text><path d="M402 418H428" stroke="${colors.signal}" stroke-width="2" stroke-dasharray="5 4"/><text x="436" y="422">Signal / control</text><text x="930" y="422" text-anchor="end">Arrangement map · not to scale</text></g>
</svg>`;
}

export function exampleScene(example) {
  if (example.mode === 'rays') return { app: 'optics2d', version: 1, ...parseSketch(example.scene, registry) };
  const elements = [];
  const add = (type, id, x, y, params) => {
    const element = createElement(type, x, y);
    element.id = `${example.id}-${id}`;
    Object.assign(element.params, params);
    elements.push(element);
    return element;
  };
  add('textlabel', 'title', 35, -25, { text: example.title, fontSize: 20, fill: '#16334c' });
  for (const [index, node] of example.nodes.entries()) {
    add('highlight', `${node.id}-box`, node.x, node.y, { w: 130, h: 66, fill: '#dbeafe', opacity: 70 });
    add('textlabel', node.id, node.x - 60, node.y, { text: `${index + 1}. ${wrap(node.label, 18).join('\n')}`, fontSize: 14, fill: '#173d5d' });
  }
  add('textlabel', 'scope', 35, 415, { text: 'SCHEMATIC · arrows are connections, not traced rays.\n' + wrap(example.limit, 112).join('\n'), fontSize: 12, fill: '#52657a' });
  const nodes = new Map(example.nodes.map(node => [node.id, node]));
  const beams = example.edges.map((edge, index) => ({ id: `${example.id}-path-${index}`, kind: 'beam', pts: edgePoints(edge, nodes, { w: 73, h: 40 }).map(([x, y]) => ({ x, y })), color: { light: '#15765d', reference: '#99601c', signal: '#66748e' }[edge.kind || 'light'], width: 2, arrow: true, dash: edge.kind === 'signal' }));
  return { app: 'optics2d', version: 1, ...parseSketch({ elements, beams }, registry) };
}
