// One rotational conic, seen in a meridional section. The vertex is the
// element origin; +R puts its curvature centre on local +x.
import { asphereSag, realizeAsphereProfile } from './asphere.js';
import { rotPt } from './util.js';

const bounded = (value, fallback, lo, hi) => {
  const n = Number(value);
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : fallback));
};

export function conicMirrorGeometry(params = {}) {
  const h = bounded(params.dia, 50, 1, 500) / 2;
  const requestedR = bounded(params.radius, -100, -5000, 5000);
  const profile = realizeAsphereProfile({
    R: requestedR, k: bounded(params.conic, 0, -20, 20),
  }, h);
  const hole = bounded(params.hole, 0, 0, 500) / 2;
  const inner = Math.min(h, hole);
  const intervals = inner >= h ? [] : inner > 0 ? [[-h, -inner], [inner, h]] : [[-h, h]];
  return { ...profile, inner, intervals, requestedR, refl: bounded(params.refl, 98, 0, 100) };
}

export function conicMirrorSize(el) {
  const g = conicMirrorGeometry(el.params);
  return { w: 2 * Math.abs(asphereSag(g.h, g)) + 8, h: 2 * g.h + 6 };
}

export function conicMirrorSVG(el) {
  const g = conicMirrorGeometry(el.params);
  return g.intervals.map(([lo, hi]) => {
    const points = Array.from({ length: 65 }, (_, i) => {
      const y = lo + (hi - lo) * i / 64;
      return `${asphereSag(y, g)},${y}`;
    });
    const backSign = el.params.facing === 'right' ? -1 : 1;
    const ticks = Array.from({ length: 8 }, (_, i) => {
      const y = lo + (hi - lo) * (i + 0.5) / 8;
      const x = asphereSag(y, g);
      return `<path d="M ${x},${y} l ${backSign * 3},2" fill="none" stroke="#8a8f98" stroke-width="0.7" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    return ticks + `<path d="M ${points.join(' L ')}" fill="none" stroke="#b28b42" stroke-width="3.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }).join('') + (g.inner > 0
    ? `<path d="M 0,${-g.inner} L 0,${g.inner}" fill="none" stroke="#8a8f98" stroke-width="0.7" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>` : '');
}

export function conicMirrorSurfaces(el) {
  const g = conicMirrorGeometry(el.params);
  if (!g.intervals.length) return [];
  return [{
    x1: asphereSag(g.h, g), y1: g.h,
    x2: asphereSag(-g.h, g), y2: -g.h,
    kind: 'conicmirror',
    data: {
      refl: g.refl,
      // Coating faces local -x or +x. The reverse side is opaque.
      frontSign: el.params.facing === 'right' ? 1 : -1,
      asphere: { ...g, cx: el.x, cy: el.y,
        ux: rotPt(1, 0, el.rot || 0), uy: rotPt(0, 1, el.rot || 0) },
    },
  }];
}
