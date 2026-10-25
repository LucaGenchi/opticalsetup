// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The lens designer's drawings: the meridional layout (SVG, to scale, equal
// axes) and the spot diagrams (one canvas, because a 128 × 128 pupil grid is
// tens of thousands of points). Colours come from the page's CSS custom
// properties, read at draw time, so both follow the light and dark themes;
// exports inline them.

import { wavelengthToColor } from '../../sketch/js/util.js';
import { formatNumber } from '../assets/calculator-kit.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const fieldColor = i => css(`--field-${(i % 6) + 1}`);

// A round number for a scale bar no longer than `max`.
function niceLength(max) {
  const p = 10 ** Math.floor(Math.log10(max));
  return [5, 2, 1].map(m => m * p).find(v => v <= max) ?? p;
}

// ---------------------------------------------------------------- layout

export function drawLayout(host, result) {
  host.textContent = '';
  if (!result?.ok) return null;
  const { surfaces, layoutRays, image } = result;
  let zMin = result.layoutStart, zMax = image.z, yMax = 0;
  for (const d of surfaces) {
    yMax = Math.max(yMax, d.height ?? d.sd);
    for (const [z] of d.profile) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
  }
  for (const r of layoutRays) for (const [z, y] of r.points) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); yMax = Math.max(yMax, Math.abs(y)); }
  yMax = Math.max(yMax, 1e-3) * 1.12;
  const width = Math.max(zMax - zMin, 1e-3);
  // Equal axes, but never thinner than a 1:4 strip.
  const halfHeight = Math.max(yMax, width / 8);
  const pad = width * 0.04;
  const vb = [zMin - pad, -halfHeight - pad, width + 2 * pad, 2 * halfHeight + 2 * pad];
  const svg = svgEl('svg', { viewBox: vb.join(' '), class: 'bench-layout', role: 'img' });
  const unit = vb[2] / 900; // one CSS pixel at the usual drawn width
  svg.setAttribute('aria-label', `Layout: ${surfaces.length} surfaces, ${result.system.fields.values.length} field${result.system.fields.values.length === 1 ? '' : 's'}; image plane ${formatNumber(image.fromLast, 4)} mm after the last surface.`);
  // y up on screen.
  const g = svgEl('g', { transform: 'scale(1,-1)' });
  svg.append(g);
  const line = (pts, cls, extra = {}) => g.append(svgEl('polyline', { points: pts.map(p => p.join(',')).join(' '), class: cls, 'stroke-width': unit * (extra.w ?? 1.2), ...(extra.dash ? { 'stroke-dasharray': `${unit * 6} ${unit * 4}` } : {}) }));

  line([[vb[0], 0], [vb[0] + vb[2], 0]], 'lay-axis', { w: 0.8, dash: true });

  // Glass bodies: the front face, then the back face reversed.
  const S = result.system.surfaces;
  surfaces.forEach((d, j) => {
    if (S[j].material === 'air' || j === surfaces.length - 1) return;
    const back = surfaces[j + 1];
    g.append(svgEl('polygon', { points: [...d.profile, ...[...back.profile].reverse()].map(p => p.join(',')).join(' '), class: 'lay-glass', 'stroke-width': unit * 1.2 }));
  });
  surfaces.forEach((d, j) => {
    const inGlass = S[j].material !== 'air' || (j > 0 && S[j - 1].material !== 'air');
    if (d.type === 'paraxial') {
      // The usual symbol: arrowheads pointing out for a positive lens, in
      // for a negative one.
      const h = d.sd * 1.08, a = h * 0.12;
      const tip = S[j].focal > 0 ? h : h - a, base = S[j].focal > 0 ? h - a : h;
      line([[d.z, -h], [d.z, h]], 'lay-ideal', { w: 1.8 });
      line([[d.z - a / 2, base], [d.z, tip], [d.z + a / 2, base]], 'lay-ideal', { w: 1.8 });
      line([[d.z - a / 2, -base], [d.z, -tip], [d.z + a / 2, -base]], 'lay-ideal', { w: 1.8 });
    } else if (!inGlass) {
      line(d.profile, 'lay-surface', { dash: true });
    }
    if (d.stop) {
      const r = result.firstOrder.stopRadius, l = halfHeight * 0.12;
      line([[d.z, r], [d.z, r + l]], 'lay-stop', { w: 3 });
      line([[d.z, -r], [d.z, -r - l]], 'lay-stop', { w: 3 });
    }
  });

  for (const r of layoutRays) {
    const cls = `lay-ray${r.ok ? '' : ' is-failed'}`;
    g.append(svgEl('polyline', { points: r.points.map(p => p.join(',')).join(' '), class: cls, stroke: fieldColor(r.field), 'stroke-width': unit * 1 }));
    if (!r.ok) {
      const [z, y] = r.points.at(-1), s = unit * 5;
      g.append(svgEl('path', { d: `M${z - s},${y - s}L${z + s},${y + s}M${z - s},${y + s}L${z + s},${y - s}`, class: 'lay-fail', 'stroke-width': unit * 1.6 }));
    }
  }
  // Image plane.
  const imgH = Math.max(...result.spots.map(s => Math.abs(s.chief?.y ?? s.poly.cy ?? 0)), yMax * 0.3) * 1.1;
  line([[image.z, -imgH], [image.z, imgH]], 'lay-image', { w: 1.5 });

  // Surface numbers above each vertex, and a scale bar.
  const labels = svgEl('g', { class: 'lay-labels' });
  const fs = unit * 11;
  surfaces.forEach((d, j) => {
    const top = d.stop ? Math.max(d.height ?? d.sd, result.firstOrder.stopRadius + halfHeight * 0.12) : (d.height ?? d.sd);
    const t = svgEl('text', { x: d.z, y: -top - fs * 0.8, 'font-size': fs, 'text-anchor': 'middle' });
    t.textContent = String(j + 1);
    labels.append(t);
  });
  const bar = niceLength(width / 5);
  const bx = vb[0] + pad * 0.5, by = vb[1] + vb[3] - pad * 0.5;
  labels.append(svgEl('path', { d: `M${bx},${by}h${bar}`, class: 'lay-scale', 'stroke-width': unit * 1.5 }));
  const bt = svgEl('text', { x: bx + bar / 2, y: by - fs * 0.6, 'font-size': fs, 'text-anchor': 'middle' });
  bt.textContent = `${formatNumber(bar, 3)} mm`;
  labels.append(bt);
  svg.append(labels);
  host.append(svg);

  // Legend: one swatch per field.
  const legend = document.createElement('div');
  legend.className = 'chart-legend bench-legend';
  result.system.fields.values.forEach((v, i) => {
    const item = document.createElement('span');
    const sw = document.createElement('i');
    sw.style.background = fieldColor(i);
    item.append(sw, document.createTextNode(`${formatNumber(v, 4)}${result.fieldUnit === '°' ? '°' : ' mm'}`));
    legend.append(item);
  });
  host.append(legend);
  return svg;
}

// ------------------------------------------------------------------ spots

// Draw every field's spot into one canvas, `columns` across. Points are in
// µm from the chief ray of the primary wavelength (or the centroid when the
// chief ray fails). `common` puts every field on the scale of the largest.
export function drawSpots(canvas, result, { common = true } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth || 600;
  const spots = result?.ok ? result.spots : [];
  const n = Math.max(1, spots.length);
  const columns = Math.max(1, Math.min(n, Math.floor(cssWidth / 200)));
  const cell = cssWidth / columns;
  const rowsCount = Math.ceil(n / columns);
  const label = 46;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${rowsCount * (cell + label)}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(rowsCount * (cell + label) * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = css('--panel');
  ctx.fillRect(0, 0, cssWidth, rowsCount * (cell + label));
  if (!spots.length) return;

  const airyUm = result.airyRadius * 1e3;
  const refOf = s => s.chief ?? { x: s.poly.cx, y: s.poly.cy };
  const extent = s => {
    const ref = refOf(s);
    let m = airyUm;
    for (const w of s.perWavelength) for (let i = 0; i < w.x.length; i++) {
      m = Math.max(m, Math.abs(w.x[i] - ref.x) * 1e3, Math.abs(w.y[i] - ref.y) * 1e3);
    }
    return m;
  };
  const extents = spots.map(extent);
  const shared = Math.max(...extents);
  const ink = css('--ink'), muted = css('--muted'), grid = css('--chart-grid');
  const font = getComputedStyle(document.body).fontFamily;

  spots.forEach((s, k) => {
    const col = k % columns, row = Math.floor(k / columns);
    const x0 = col * cell, y0 = row * (cell + label);
    const half = (common ? shared : extents[k]) * 1.08;
    const box = cell - 16, cx = x0 + cell / 2, cy = y0 + 8 + box / 2;
    const scale = box / (2 * half);
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.strokeRect(cx - box / 2, cy - box / 2, box, box);
    ctx.beginPath(); ctx.moveTo(cx - box / 2, cy); ctx.lineTo(cx + box / 2, cy); ctx.moveTo(cx, cy - box / 2); ctx.lineTo(cx, cy + box / 2); ctx.stroke();
    const ref = refOf(s);
    // Airy circle about the polychromatic centroid.
    ctx.setLineDash([4, 3]); ctx.strokeStyle = muted;
    ctx.beginPath();
    ctx.arc(cx + (s.poly.cx - ref.x) * 1e3 * scale, cy - (s.poly.cy - ref.y) * 1e3 * scale, airyUm * scale, 0, 2 * Math.PI);
    ctx.stroke(); ctx.setLineDash([]);
    const dot = Math.max(1, Math.min(2.2, box / 160));
    for (const w of s.perWavelength) {
      ctx.fillStyle = wavelengthToColor(w.nm);
      for (let i = 0; i < w.x.length; i++) {
        ctx.fillRect(cx + (w.x[i] - ref.x) * 1e3 * scale - dot / 2, cy - (w.y[i] - ref.y) * 1e3 * scale - dot / 2, dot, dot);
      }
    }
    // Scale bar and caption.
    const bar = niceLength(half * 0.8);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - box / 2 + 6, cy + box / 2 - 6); ctx.lineTo(cx - box / 2 + 6 + bar * scale, cy + box / 2 - 6); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = `11px ${font}`; ctx.textAlign = 'left';
    ctx.fillText(`${formatNumber(bar, 3)} µm`, cx - box / 2 + 6, cy + box / 2 - 10);
    ctx.textAlign = 'center';
    ctx.font = `600 12.5px ${font}`;
    ctx.fillText(`${formatNumber(s.field, 4)}${result.fieldUnit === '°' ? '°' : ' mm'}`, cx, y0 + cell + 10);
    ctx.font = `12px ${font}`; ctx.fillStyle = muted;
    ctx.fillText(`RMS ${formatNumber(s.poly.rms * 1e3, 3)} µm · GEO ${formatNumber(s.poly.geo * 1e3, 3)} µm`, cx, y0 + cell + 27);
  });
}

// ----------------------------------------------------------------- export

function download(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.append(a); a.click(); a.remove();
}

export const fileSafe = name => (String(name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'lens');

export function downloadText(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCanvas(canvas, name) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    download(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// The layout as a PNG: the SVG with its computed colours inlined, rasterized
// at twice its drawn size on the page background.
export function downloadSvgAsPng(svg, name) {
  const clone = svg.cloneNode(true);
  const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  src.forEach((node, i) => {
    const cs = getComputedStyle(node);
    for (const prop of ['fill', 'stroke', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-weight']) dst[i].style.setProperty(prop, cs.getPropertyValue(prop));
  });
  const rect = svg.getBoundingClientRect();
  const w = Math.round(rect.width * 2), h = Math.round(rect.height * 2);
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  clone.setAttribute('xmlns', SVG_NS);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = css('--panel'); ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    downloadCanvas(canvas, name);
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
}
