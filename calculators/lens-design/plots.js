// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The lens designer's drawings: the meridional layout (SVG, to scale, equal
// axes), the spot diagrams (one canvas, because a 128 × 128 pupil grid is
// tens of thousands of points) and the heat maps of the wavefront and the
// PSF (canvas images with axes and a colour bar). Colours come from the page's CSS custom
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
  // Tall enough for every image point that exists (a field whose rays all
  // fail has no centroid).
  const heights = result.spots.map(s => Math.abs(s.chief?.y ?? s.poly.cy)).filter(Number.isFinite);
  const imgH = Math.max(...heights, yMax * 0.3) * 1.1;
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

// Draw every field's spot into one canvas, `columns` across, under a key
// (wavelength colours, the Airy circle, the chief-ray origin) that travels
// with the PNG export. Each panel has its own µm axes measured from the
// chief ray of the primary wavelength (or from the centroid when the chief
// ray fails); `common` puts every field on the scale of the largest.
export function drawSpots(canvas, result, { common = true } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth || 600;
  const spots = result?.ok ? result.spots : [];
  const n = Math.max(1, spots.length);
  const columns = Math.max(1, Math.min(n, Math.floor(cssWidth / 240)));
  const cell = cssWidth / columns;
  const rowsCount = Math.ceil(n / columns);
  const CAPTION = 44, PAD_L = 46, PAD_R = 10, PAD_T = 6, PAD_B = 36, KEY_LINE = 22;
  const box = Math.max(60, cell - PAD_L - PAD_R);
  const rowHeight = PAD_T + box + PAD_B + CAPTION;
  const font = getComputedStyle(document.body).fontFamily;
  const airyUm = result?.ok ? result.airyRadius * 1e3 : 0;

  // The key's items, laid out in lines that fit the width.
  ctx.font = `12px ${font}`;
  const items = result?.ok ? [
    ...result.system.wavelengthsNm.map(nm => ({ kind: 'wavelength', nm, text: `${formatNumber(nm, 4)} nm`, icon: 14 })),
    { kind: 'airy', text: `Airy radius ${formatNumber(airyUm, 3)} µm`, icon: 18 },
    { kind: 'origin', text: 'origin: chief ray', icon: 15 },
  ] : [];
  let lineX = 4, lineIndex = 0;
  for (const item of items) {
    const width = item.icon + ctx.measureText(item.text).width + 14;
    if (lineX > 4 && lineX + width > cssWidth) { lineIndex += 1; lineX = 4; }
    item.x = lineX; item.line = lineIndex;
    lineX += width;
  }
  const KEY = 8 + (lineIndex + 1) * KEY_LINE;
  const height = KEY + rowsCount * rowHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = css('--panel');
  ctx.fillRect(0, 0, cssWidth, height);
  if (!spots.length) return;

  const ink = css('--ink'), muted = css('--muted'), grid = css('--chart-grid'), axis = css('--chart-axis');

  // Key: one swatch per wavelength, then the Airy circle and the origin.
  ctx.font = `12px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineWidth = 1;
  for (const item of items) {
    const kx = item.x, ky = 4 + KEY_LINE / 2 + item.line * KEY_LINE;
    if (item.kind === 'wavelength') {
      ctx.fillStyle = wavelengthToColor(item.nm);
      ctx.beginPath(); ctx.arc(kx + 5, ky, 4.5, 0, 2 * Math.PI); ctx.fill();
    } else if (item.kind === 'airy') {
      ctx.strokeStyle = muted; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(kx + 7, ky, 6, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = ink;
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + 10, ky); ctx.moveTo(kx + 5, ky - 5); ctx.lineTo(kx + 5, ky + 5); ctx.stroke();
    }
    ctx.fillStyle = ink;
    ctx.fillText(item.text, kx + item.icon, ky);
  }

  const refOf = s => s.chief ?? { x: s.poly.cx, y: s.poly.cy };
  const extent = s => {
    if (!s.poly.count) return airyUm;
    const ref = refOf(s);
    let m = airyUm;
    for (const w of s.perWavelength) for (let i = 0; i < w.x.length; i++) {
      m = Math.max(m, Math.abs(w.x[i] - ref.x) * 1e3, Math.abs(w.y[i] - ref.y) * 1e3);
    }
    return m;
  };
  const extents = spots.map(extent);
  const shared = Math.max(...extents);
  const fieldLabel = s => `${formatNumber(s.field, 4)}${result.fieldUnit === '°' ? '°' : ' mm'}`;

  spots.forEach((s, k) => {
    const col = k % columns, row = Math.floor(k / columns);
    const left = col * cell + PAD_L, top = KEY + row * rowHeight + PAD_T;
    const cx = left + box / 2, cy = top + box / 2;
    const half = (common ? shared : extents[k]) * 1.08;
    const scale = box / (2 * half);

    // Grid and ticks at round multiples of the step, 0 at the chief ray.
    // Two to five ticks each side of the chief ray.
    const step = niceLength(half / 2);
    const ticks = [];
    for (let v = -Math.floor(half / step) * step; v <= half + 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    ctx.lineWidth = 1;
    for (const v of ticks) {
      const px = cx + v * scale, py = cy - v * scale;
      ctx.strokeStyle = v === 0 ? axis : grid;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + box); ctx.moveTo(left, py); ctx.lineTo(left + box, py); ctx.stroke();
    }
    ctx.strokeStyle = axis; ctx.strokeRect(left, top, box, box);
    ctx.fillStyle = muted; ctx.font = `10.5px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of ticks) ctx.fillText(formatNumber(v, 3), cx + v * scale, top + box + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of ticks) ctx.fillText(formatNumber(v, 3), left - 5, cy - v * scale);
    ctx.fillStyle = ink; ctx.font = `11px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('x (µm)', cx, top + box + 19);
    ctx.save(); ctx.translate(left - 36, cy); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle'; ctx.fillText('y (µm)', 0, 0); ctx.restore();

    const captionY = top + box + PAD_B;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = ink; ctx.font = `600 12.5px ${font}`;
    ctx.fillText(`Field ${fieldLabel(s)}`, cx, captionY + 2);
    ctx.font = `12px ${font}`; ctx.fillStyle = muted;

    // Every ray of this field failed: its statistics are NaN by design, so
    // nothing is drawn from them; the notes say which failures.
    if (!s.poly.count) {
      ctx.textBaseline = 'middle';
      ctx.fillText('No ray reaches the image', cx, cy);
      return;
    }
    ctx.fillText(`RMS ${formatNumber(s.poly.rms * 1e3, 3)} µm · largest ${formatNumber(s.poly.geo * 1e3, 3)} µm`, cx, captionY + 20);

    const ref = refOf(s);
    ctx.save();
    ctx.beginPath(); ctx.rect(left, top, box, box); ctx.clip();
    // Airy circle about the polychromatic centroid.
    ctx.setLineDash([4, 3]); ctx.strokeStyle = muted;
    ctx.beginPath();
    ctx.arc(cx + (s.poly.cx - ref.x) * 1e3 * scale, cy - (s.poly.cy - ref.y) * 1e3 * scale, airyUm * scale, 0, 2 * Math.PI);
    ctx.stroke(); ctx.setLineDash([]);
    const dot = Math.max(1, Math.min(2.2, box / 160));
    // Interleaved ray by ray, so where colours overlap none hides the
    // others behind it (drawn colour by colour, the last one would cover
    // an on-axis spot entirely).
    const colours = s.perWavelength.map(w => wavelengthToColor(w.nm));
    const longest = Math.max(...s.perWavelength.map(w => w.x.length));
    for (let i = 0; i < longest; i++) {
      s.perWavelength.forEach((w, wi) => {
        if (i >= w.x.length) return;
        ctx.fillStyle = colours[wi];
        ctx.fillRect(cx + (w.x[i] - ref.x) * 1e3 * scale - dot / 2, cy - (w.y[i] - ref.y) * 1e3 * scale - dot / 2, dot, dot);
      });
    }
    ctx.restore();
  });
}

// ------------------------------------------------------------- heat maps

// Perceptually even maps, as linear runs between published anchor colours:
// viridis (sequential, for the PSF) and ColorBrewer's RdBu (diverging, for
// the wavefront: blue behind the reference sphere, red ahead of it).
const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#fde725'];
const DIVERGING = ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
// grey, black to white, for images of a target.
const ramps = { viridis: VIRIDIS.map(rgb), diverging: DIVERGING.map(rgb), grey: ['#000000', '#ffffff'].map(rgb) };
export function colourAt(name, t) {
  const stops = ramps[name], x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
}

// ticks: values at round multiples of a step, between lo and hi.
function roundTicks(lo, hi, count = 4) {
  const step = niceLength((hi - lo) / count) || 1;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

// values: rows × cols, row 0 at the bottom (−y). extent: the outer edges of
// the grid in plot units, [x0, x1, y0, y1]. range: the values mapped to the
// two ends of the colour bar. `barTicks` are [value, label] pairs; `overlay`
// draws on top with the plot's coordinate transforms.
export function drawHeatmap(canvas, { values, cols, rows, extent, range, colormap = 'viridis', smooth = false, xLabel, yLabel, barLabel, barTicks, title = '', overlay = null }) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.min(canvas.parentElement.clientWidth || 480, 620);
  const PAD_L = 50, PAD_T = title ? 24 : 8, PAD_B = 42, BAR = 74;
  const side = Math.max(140, Math.min(cssWidth - PAD_L - BAR, 460));
  const width = PAD_L + side + BAR, height = PAD_T + side + PAD_B;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = css('--panel'); ctx.fillRect(0, 0, width, height);
  const font = getComputedStyle(document.body).fontFamily;
  const ink = css('--ink'), muted = css('--muted'), axis = css('--chart-axis');

  // The image, one pixel per sample, then scaled into the square.
  const image = document.createElement('canvas');
  image.width = cols; image.height = rows;
  const ictx = image.getContext('2d'), data = ictx.createImageData(cols, rows);
  const [lo, hi] = range, span = hi - lo || 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const v = values[i * cols + j], o = ((rows - 1 - i) * cols + j) * 4;
    if (!Number.isFinite(v)) { data.data[o + 3] = 0; continue; }
    const [r, g, b] = colourAt(colormap, (v - lo) / span);
    data.data[o] = r; data.data[o + 1] = g; data.data[o + 2] = b; data.data[o + 3] = 255;
  }
  ictx.putImageData(data, 0, 0);
  const [x0, x1, y0, y1] = extent;
  const sx = side / (x1 - x0), sy = side / (y1 - y0), scale = Math.min(sx, sy);
  const w = (x1 - x0) * scale, h = (y1 - y0) * scale;
  const left = PAD_L + (side - w) / 2, top = PAD_T + (side - h) / 2;
  const toX = x => left + (x - x0) * scale, toY = y => top + h - (y - y0) * scale;
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(image, left, top, w, h);
  ctx.strokeStyle = axis; ctx.lineWidth = 1; ctx.strokeRect(left, top, w, h);

  ctx.font = `10.5px ${font}`; ctx.fillStyle = muted;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of roundTicks(x0, x1)) {
    ctx.beginPath(); ctx.moveTo(toX(v), top + h); ctx.lineTo(toX(v), top + h + 4); ctx.stroke();
    ctx.fillText(formatNumber(v, 3), toX(v), top + h + 6);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of roundTicks(y0, y1)) {
    ctx.beginPath(); ctx.moveTo(left - 4, toY(v)); ctx.lineTo(left, toY(v)); ctx.stroke();
    ctx.fillText(formatNumber(v, 3), left - 6, toY(v));
  }
  ctx.fillStyle = ink; ctx.font = `11px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(xLabel, left + w / 2, top + h + 22);
  ctx.save(); ctx.translate(12, top + h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(yLabel, 0, 0); ctx.restore();
  if (title) { ctx.font = `600 12.5px ${font}`; ctx.textBaseline = 'top'; ctx.fillText(title, left + w / 2, 4); }
  if (overlay) {
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, w, h); ctx.clip();
    overlay(ctx, toX, toY, scale);
    ctx.restore();
  }

  // Colour bar.
  const bx = PAD_L + side + 14, bw = 12, by = PAD_T, bh = side;
  for (let k = 0; k < bh; k++) {
    const [r, g, b] = colourAt(colormap, 1 - k / (bh - 1));
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(bx, by + k, bw, 1.5);
  }
  ctx.strokeStyle = axis; ctx.strokeRect(bx, by, bw, bh);
  ctx.font = `10.5px ${font}`; ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const [v, label] of barTicks) {
    const y = by + bh * (1 - (v - lo) / span);
    if (y < by - 0.5 || y > by + bh + 0.5) continue;
    ctx.beginPath(); ctx.moveTo(bx + bw, y); ctx.lineTo(bx + bw + 3, y); ctx.stroke();
    ctx.fillText(label, bx + bw + 5, y);
  }
  ctx.fillStyle = ink; ctx.font = `11px ${font}`;
  ctx.save(); ctx.translate(width - 8, by + bh / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(barLabel, 0, 0); ctx.restore();
}

export { roundTicks };

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
