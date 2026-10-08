// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Dense point sources use pixels on screen, retaining the same traced vector
// geometry for measurements and exports. Laser envelopes stay in SVG.
export const POINT_SOURCE_CANVAS_THRESHOLD = 256;

export class SceneTraceCache {
  constructor(trace, revision) {
    this.trace = trace;
    this.revision = revision;
  }

  get(elements, beams) {
    // Dragging mutates elements before changed() is called. Include the actual
    // inputs, including animated poses, rather than relying on an undo revision.
    const key = JSON.stringify([elements, beams]);
    if (key !== this.key || this.traceRevision !== this.revision()) {
      this.scene = this.trace(elements, beams, { pointSourceCanvas: true });
      this.key = key;
      this.traceRevision = this.revision();
    }
    return this.scene;
  }
}

export function drawPointSourceCanvas(canvas, drawables, view, width, height, pixelRatio = 1) {
  const ratio = Math.min(2, Math.max(1, pixelRatio || 1));
  canvas.width = Math.max(1, Math.ceil(width * ratio));
  canvas.height = Math.max(1, Math.ceil(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const point = p => ({ x: view.x + p.x * view.z, y: view.y + p.y * view.z });
  for (const d of drawables) {
    ctx.fillStyle = ctx.strokeStyle = d.color;
    ctx.globalAlpha = d.opacity ?? 1;
    if (d.type === 'dots') {
      for (const dot of d.dots) {
        const p = point(dot);
        ctx.globalAlpha = dot.o;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dot.r * view.z, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    if (!d.pts?.length) continue;
    ctx.beginPath();
    const first = point(d.pts[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < d.pts.length; i++) {
      const p = point(d.pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (d.type === 'poly') {
      ctx.closePath();
      ctx.fill();
    } else {
      // SVG beam strokes use non-scaling-stroke; dashes scale with the view.
      ctx.lineWidth = d.w;
      const dash = d.dash === true ? [6, 4]
        : d.dash ? String(d.dash).split(/[ ,]+/).map(Number) : [];
      ctx.setLineDash(dash.map(length => length * view.z));
      ctx.lineDashOffset = (d.dashOffset || 0) * view.z;
      ctx.stroke();
    }
  }
  return true;
}
