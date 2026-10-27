// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Spot statistics. The pupil is sampled at the centres of an n × n grid of
// equal square cells inside the unit circle, so every ray stands for the
// same pupil area and plain means are area-weighted means (the same grid the
// wavefront and PSF pages sample).

export function pupilGrid(n) {
  const points = [];
  for (let i = 0; i < n; i++) {
    const py = -1 + (2 * i + 1) / n;
    for (let j = 0; j < n; j++) {
      const px = -1 + (2 * j + 1) / n;
      if (px * px + py * py <= 1) points.push([px, py]);
    }
  }
  return points;
}

// Centroid, RMS radius and largest radius about the centroid of points
// given as parallel x and y arrays.
export function spotStats(xs, ys) {
  const count = xs.length;
  if (!count) return { count: 0, cx: NaN, cy: NaN, rms: NaN, geo: NaN };
  let cx = 0, cy = 0;
  for (let i = 0; i < count; i++) { cx += xs[i]; cy += ys[i]; }
  cx /= count; cy /= count;
  let sum = 0, geo = 0;
  for (let i = 0; i < count; i++) {
    const r2 = (xs[i] - cx) ** 2 + (ys[i] - cy) ** 2;
    sum += r2;
    if (r2 > geo) geo = r2;
  }
  return { count, cx, cy, rms: Math.sqrt(sum / count), geo: Math.sqrt(geo) };
}

// The axial shift Δ of the image plane that minimises the sum over groups
// (fields) of each group's mean squared radius about its own centroid. A ray
// at (x, y) with direction tangents (sx, sy) lands at (x + Δ sx, y + Δ sy),
// so each group's mean square is a quadratic a + 2bΔ + cΔ² and the minimum
// is exact: Δ = −Σb / Σc.
export function bestFocusShift(groups) {
  let B = 0, C = 0;
  for (const g of groups) {
    const count = g.x.length;
    if (count < 2) continue;
    let mx = 0, my = 0, msx = 0, msy = 0;
    for (let i = 0; i < count; i++) { mx += g.x[i]; my += g.y[i]; msx += g.sx[i]; msy += g.sy[i]; }
    mx /= count; my /= count; msx /= count; msy /= count;
    let b = 0, c = 0;
    for (let i = 0; i < count; i++) {
      const dx = g.x[i] - mx, dy = g.y[i] - my, ex = g.sx[i] - msx, ey = g.sy[i] - msy;
      b += dx * ex + dy * ey;
      c += ex * ex + ey * ey;
    }
    B += b / count; C += c / count;
  }
  return C > 0 ? -B / C : 0;
}
