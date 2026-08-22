// Small math + misc helpers. Convention: 1 px = 1 mm, angles in degrees CW (SVG y-down).

export const D2R = Math.PI / 180;

export const uid = () => 'e' + Math.random().toString(36).slice(2, 9);

export function rotPt(x, y, deg) {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

// element-local -> world
export function toWorld(el, x, y) {
  const p = rotPt(x, y, el.rot || 0);
  return { x: p.x + el.x, y: p.y + el.y };
}
// world -> element-local
export function toLocal(el, x, y) {
  return rotPt(x - el.x, y - el.y, -(el.rot || 0));
}

export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const len = a => Math.hypot(a.x, a.y);
export const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = a => ({ x: -a.y, y: a.x });

export function distToSegment(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return len(sub(p, add(a, mul(ab, t))));
}

// Catmull-Rom spline through the given points, converted to cubic Bézier
// segments (tension 1/6, the standard conversion) — a smooth curve through
// real sampled data instead of a row of discrete bars. Shared by the
// spectrometer's screen readout and the beam probe's spectrum card.
export function smoothPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)},${points[1].y.toFixed(2)}`;
  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// Remove consecutive duplicate vertices. Double-click completion naturally
// produces a repeated final pointer event; zero-length fiber end segments have
// no direction and must not reach the ray tracer.
export function distinctPoints(pts, epsilon = 1e-6) {
  const out = [];
  for (const p of pts || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > epsilon) out.push({ x: p.x, y: p.y });
  }
  return out;
}

// Approximate visible-spectrum color (Bruton), with sensible UV / IR fallbacks.
export function wavelengthToColor(nm) {
  if (!Number.isFinite(nm)) return '#e02020';
  if (nm < 380) return '#8b00d4';           // UV
  if (nm > 780) return nm > 1400 ? '#6e3b3b' : '#8b1a1a'; // IR / far IR
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
  else if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
  const q = v => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8)).toString(16).padStart(2, '0');
  return '#' + q(r) + q(g) + q(b);
}

export function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ptsAttr = pts => pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

export function arrowHeadSVG(pts, color, w) {
  if (pts.length < 2) return '';
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const L = 6 + 2.5 * w, W = 3 + 1.2 * w;
  const p1 = { x: b.x - L * Math.cos(ang) + W * Math.sin(ang), y: b.y - L * Math.sin(ang) - W * Math.cos(ang) };
  const p2 = { x: b.x - L * Math.cos(ang) - W * Math.sin(ang), y: b.y - L * Math.sin(ang) + W * Math.cos(ang) };
  return `<polygon points="${b.x},${b.y} ${p1.x},${p1.y} ${p2.x},${p2.y}" fill="${color}"/>`;
}

// manual overlay drawing: hand-drawn beam or optical fiber patch cable
export function manualBeamSVG(b) {
  const p = b.pts;
  if (p.length < 2) return '';
  if (b.kind === 'fiber') {
    // smooth the polyline so the fiber bends like a real patch cable
    let d = `M ${p[0].x},${p[0].y}`;
    if (p.length === 2) d += ` L ${p[1].x},${p[1].y}`;
    else {
      d += ` L ${(p[0].x + p[1].x) / 2},${(p[0].y + p[1].y) / 2}`;
      for (let i = 1; i < p.length - 1; i++) {
        d += ` Q ${p[i].x},${p[i].y} ${(p[i].x + p[i + 1].x) / 2},${(p[i].y + p[i + 1].y) / 2}`;
      }
      d += ` L ${p[p.length - 1].x},${p[p.length - 1].y}`;
    }
    const w = b.width || 4;
    // Bare fiber is the same physical/optical component with connector
    // plugs omitted and flat-cut (not rounded) ends, matching a cleaved bare
    // fiber tip rather than a terminated patch cable.
    const cap = b.bare ? 'butt' : 'round';
    let s = `<path d="${d}" fill="none" stroke="${b.color}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round" opacity="0.95"/>`;
    if (!b.bare) {
      for (const [e, q] of [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]]) {
        const a = Math.atan2(q.y - e.y, q.x - e.x) * 180 / Math.PI;
        const W = w + 6;
        s += `<g transform="translate(${e.x} ${e.y}) rotate(${a})">` +
          `<rect x="0" y="${-W / 2}" width="11" height="${W}" rx="1.5" fill="#4d565f"/>` +
          `<rect x="11" y="${-(W - 5) / 2}" width="4" height="${W - 5}" fill="#8d98a5"/></g>`;
      }
    }
    return s;
  }
  let s = `<polyline points="${ptsAttr(p)}" fill="none" stroke="${b.color}" stroke-width="${b.width}" opacity="0.9" stroke-linejoin="round" stroke-linecap="round" ${b.dash ? 'stroke-dasharray="7 5"' : ''}/>`;
  if (b.arrow) s += arrowHeadSVG(p, b.color, b.width);
  return s;
}
