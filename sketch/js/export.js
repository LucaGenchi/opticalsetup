// Export the sketch as standalone SVG or PNG.

import { state } from './state.js';
import { registry, getVisualBounds, labelSVG, displayCableSVG } from './elements.js';
import { traceAll } from './raytrace.js';
import { download, manualBeamSVG } from './util.js';

function sceneBounds() {
  const frame = [...state.elements].reverse().find(el => registry[el.type]?.exportFrame);
  if (frame) {
    const crop = getVisualBounds(frame, { includeLabel: false });
    if (crop) return { x: crop.x0, y: crop.y0, w: crop.x1 - crop.x0, h: crop.y1 - crop.y0 };
  }
  const pts = [];
  const clampPts = [];
  for (const el of state.elements) {
    const def = registry[el.type];
    if (!def) continue;
    const clamp = getVisualBounds(el, { includeLabel: !def.hideInExport });
    if (!clamp) continue;
    const bounds = [{ x: clamp.x0, y: clamp.y0 }, { x: clamp.x1, y: clamp.y1 }];
    clampPts.push(...bounds);
    if (!def.hideInExport) pts.push(...bounds);
  }
  for (const b of state.beams) pts.push(...b.pts);
  for (const d of traceAll(state.elements, state.beams)) {
    // beams can extend far; clamp their contribution so an unterminated ray
    // doesn't blow up the export canvas
    if (d.pts) pts.push(...d.pts);
    if (d.dots) pts.push(...d.dots);
  }
  if (!pts.length) return { x: 0, y: 0, w: 400, h: 300 };
  // clamp runaway rays to the element bounding box + margin
  const elPts = clampPts;
  let bx0, bx1, by0, by1;
  if (elPts.length) {
    bx0 = Math.min(...elPts.map(p => p.x)) - 150; bx1 = Math.max(...elPts.map(p => p.x)) + 150;
    by0 = Math.min(...elPts.map(p => p.y)) - 150; by1 = Math.max(...elPts.map(p => p.y)) + 150;
  } else { bx0 = -1e9; bx1 = 1e9; by0 = -1e9; by1 = 1e9; }
  const xs = pts.map(p => Math.min(bx1, Math.max(bx0, p.x)));
  const ys = pts.map(p => Math.min(by1, Math.max(by0, p.y)));
  const m = 30;
  const x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  return { x: x0, y: y0, w: Math.max(...xs) + m - x0, h: Math.max(...ys) + m - y0 };
}

function ptsAttr(pts) { return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }

export function buildSVG({ whiteBg = false } = {}) {
  const b = sceneBounds();
  let body = '';
  const frame = [...state.elements].reverse().find(el => registry[el.type]?.exportFrame);

  if (whiteBg || frame?.params.background === 'white') body += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#ffffff"/>`;

  for (const d of traceAll(state.elements, state.beams)) {
    if (d.type === 'poly') body += `<polygon points="${ptsAttr(d.pts)}" fill="${d.color}" opacity="${d.opacity}"/>`;
    else if (d.type === 'dots') body += `<g fill="${d.color}">` + d.dots.map(o => `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="${o.r.toFixed(2)}" opacity="${o.o.toFixed(2)}"/>`).join('') + `</g>`;
    else body += `<polyline points="${ptsAttr(d.pts)}" fill="none" stroke="${d.color}" stroke-width="${d.w}" opacity="${d.opacity}" stroke-linejoin="round" stroke-linecap="round" ${d.dash ? `stroke-dasharray="${d.dash === true ? '6 4' : d.dash}"` : ''}/>`;
  }

  for (const mb of state.beams) body += manualBeamSVG(mb);

  for (const el of state.elements) {
    if (el.type === 'display') body += displayCableSVG(el, state.elements);
  }

  for (const el of state.elements) {
    const def = registry[el.type];
    if (!def || def.hideInExport) continue;
    body += `<g transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})">${def.svg(el, state.elements)}</g>`;
    body += labelSVG(el);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${Math.round(b.w)}" height="${Math.round(b.h)}" font-family="Helvetica, Arial, sans-serif">${body}</svg>`;
}

export function exportSVG() {
  download('optical-setup.svg', buildSVG(), 'image/svg+xml');
}

export function exportPNG(scale = 3) {
  const svgText = buildSVG({ whiteBg: true });
  const m = svgText.match(/width="(\d+)" height="(\d+)"/);
  const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    cv.toBlob(blob => {
      if (blob) download('optical-setup.png', blob);
      else alert('Could not create the PNG export. Try exporting SVG instead.');
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Could not render the PNG export. Try exporting SVG instead.');
  };
  img.src = url;
}
