// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Where a volume specimen's signals come from along the excitation path.
//
// A linear signal (fluorescence, spontaneous Raman) comes equally from every
// part of the illuminated path. A signal of order n goes as the n-th power of
// the intensity; through a thin slice of the specimen the beam's power is
// fixed while its area grows as w², so the slice gives ~ 1/w^(2(n-1)). With an
// ideal Gaussian focus that is (1 + (z/zR)²)^-(n-1) relative to the focus, and
// the slices of the path are weighted by its exact integral. So a focus inside
// the specimen concentrates a nonlinear signal there (optical sectioning),
// while a beam without a focus inside -- collimated, wide-field, speckle, or
// focused somewhere else -- generates it along the whole path.
//
// The focus is found from the beam's own sampling rays as they cross the
// specimen. Its size is the diffraction limit of their convergence (in air);
// aberrations, the medium's index and how tight the focus is in absolute terms
// are not computed.

// How many photons a signal needs at once: its yield goes as the excitation
// intensity to this power. SRS and CARS take each beam's power once per
// field it supplies (Ip·Is and Ip²·Is).
export const NONLINEAR_ORDER = { tpef: 2, shg: 2, srs: 2, thpef: 3, thg: 3, cars: 3 };

// A part of the path weaker than this, relative to the most intense point the
// beam reaches inside the specimen, generates nothing.
export const MIN_RELATIVE_SIGNAL = 1e-6;

// Below this convergence a bundle is treated as collimated: its focus is too
// far away to place, and the specimen sees the same beam wherever it sits.
const MIN_HALF_ANGLE = 1e-4;

// The narrowest point of a bundle of straight rays, from where they cross the
// specimen. `rays` are { p: {x,y}, d: {x,y} (unit), w: weight }; distances are
// in canvas millimetres. Returns { ok: true, zMm, zRMm, na, w0Mm, point, axis }
// with zMm the signed distance from the crossing to the focus along the beam
// (positive: the focus lies further along), or { ok: false, reason }.
export function bundleFocus(rays, wlNm) {
  const list = (rays || []).filter(r => r && Number.isFinite(r.p?.x) && Number.isFinite(r.p?.y)
    && Number.isFinite(r.d?.x) && Number.isFinite(r.d?.y) && r.w > 0);
  if (list.length < 2) return { ok: false, reason: 'single' };
  if (!(wlNm > 0)) return { ok: false, reason: 'single' };
  const total = list.reduce((s, r) => s + r.w, 0);
  // The beam axis: the weighted mean direction, through the weighted centre
  // of the crossing points.
  let ax = 0, ay = 0, cx = 0, cy = 0;
  for (const r of list) { ax += r.w * r.d.x; ay += r.w * r.d.y; cx += r.w * r.p.x; cy += r.w * r.p.y; }
  const len = Math.hypot(ax, ay);
  if (!(len > 0)) return { ok: false, reason: 'single' };
  ax /= len; ay /= len; cx /= total; cy /= total;
  const tx = -ay, ty = ax;
  // Each ray's transverse offset from the axis, as a straight line in the
  // axial coordinate s: x(s) = u + v·s.
  const lines = [];
  for (const r of list) {
    const along = r.d.x * ax + r.d.y * ay;
    if (!(along > 0.1)) continue;
    const px = r.p.x - cx, py = r.p.y - cy;
    const v = (r.d.x * tx + r.d.y * ty) / along;
    const u = (px * tx + py * ty) - (px * ax + py * ay) * v;
    lines.push({ u, v, w: r.w });
  }
  if (lines.length < 2) return { ok: false, reason: 'single' };
  const W = lines.reduce((s, l) => s + l.w, 0);
  const mu = lines.reduce((s, l) => s + l.w * l.u, 0) / W;
  const mv = lines.reduce((s, l) => s + l.w * l.v, 0) / W;
  let varV = 0, cov = 0;
  for (const l of lines) { varV += l.w * (l.v - mv) ** 2; cov += l.w * (l.u - mu) * (l.v - mv); }
  varV /= W; cov /= W;
  const vs = lines.map(l => l.v);
  const halfTan = (Math.max(...vs) - Math.min(...vs)) / 2;
  if (!(halfTan > MIN_HALF_ANGLE) || !(varV > 0)) return { ok: false, reason: 'collimated' };
  // The plane where the bundle's spread is least.
  const zMm = -cov / varV;
  const na = halfTan / Math.hypot(1, halfTan);
  const wlMm = wlNm * 1e-6;
  const w0Mm = wlMm / (Math.PI * na);
  const zRMm = Math.PI * w0Mm * w0Mm / wlMm;
  const point = { x: cx + zMm * ax + (mu + mv * zMm) * tx, y: cy + zMm * ay + (mu + mv * zMm) * ty };
  if (![zMm, na, w0Mm, zRMm, point.x, point.y].every(Number.isFinite) || !(zRMm > 0)) return { ok: false, reason: 'collimated' };
  return { ok: true, zMm, zRMm, na, w0Mm, point, axis: { x: ax, y: ay } };
}

// The signal of order n from a thin slice at u = z/zR, relative to the focus.
export function relativeYield(order, u) {
  const n = Number(order);
  if (!(n > 1)) return 1;
  const value = (1 + u * u) ** -(n - 1);
  return Number.isFinite(value) ? value : 0;
}

// An antiderivative of relativeYield in u, for the orders the registry uses;
// any other order is integrated numerically.
function yieldIntegral(order, u) {
  if (order === 2) return Math.atan(u);
  if (order === 3) return (u / (1 + u * u) + Math.atan(u)) / 2;
  const steps = 400, a = 0, h = (u - a) / steps;
  let sum = relativeYield(order, a) + relativeYield(order, u);
  for (let i = 1; i < steps; i++) sum += relativeYield(order, a + i * h) * (i % 2 ? 4 : 2);
  return sum * h / 3;
}

// Where along one crossing of the specimen a signal is emitted. `startMm` and
// `endMm` are the axial positions where the path enters and leaves, measured
// from the beam's focus (so a focus inside has startMm < 0 < endMm); `focus`
// carries zRMm, or is null/not ok for a beam with no focus. The path is split
// into `parts` equal pieces; each returns where it emits (`at`, 0..1 along the
// path), its share of the signal (`share`, summing to 1 before the cutoff) and
// how intense it is relative to the most intense point inside (`level`).
// Pieces with level below MIN_RELATIVE_SIGNAL are left out.
export function volumeEmissionPoints(order, startMm, endMm, focus, parts) {
  const k = Math.max(1, Math.round(Number(parts) || 1));
  const uniform = () => Array.from({ length: k }, (_, i) => ({ at: (i + 0.5) / k, share: 1 / k, level: 1 }));
  const n = Number(order);
  if (!(n > 1) || !focus?.ok || !(focus.zRMm > 0) || !Number.isFinite(startMm) || !Number.isFinite(endMm)) return uniform();
  const u0 = Math.min(startMm, endMm) / focus.zRMm, u1 = Math.max(startMm, endMm) / focus.zRMm;
  const total = yieldIntegral(n, u1) - yieldIntegral(n, u0);
  if (!(total > 0) || !(u1 > u0)) return uniform();
  const peak = relativeYield(n, Math.min(u1, Math.max(u0, 0)));
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = u0 + (u1 - u0) * i / k, b = u0 + (u1 - u0) * (i + 1) / k;
    // Each piece emits from its most intense point: the focus itself in
    // the piece that holds it.
    const u = Math.min(b, Math.max(a, 0));
    const level = peak > 0 ? relativeYield(n, u) / peak : 0;
    if (!(level >= MIN_RELATIVE_SIGNAL)) continue;
    const share = (yieldIntegral(n, b) - yieldIntegral(n, a)) / total;
    if (!(share > 0)) continue;
    const at = (u - u0) / (u1 - u0);
    const placed = { at: startMm <= endMm ? at : 1 - at, share, level: Math.min(1, level) };
    // Two pieces meeting at the focus both emit from it: one spot.
    const same = out.find(p => Math.abs(p.at - placed.at) < 1e-12);
    if (same) same.share += placed.share;
    else out.push(placed);
  }
  return out;
}

// The fraction of the excitation a linear signal converts over a path, from
// its efficiency per millimetre: 1 - (1 - eff)^L, like the light a uniform dye
// absorbs. It grows with the path and never exceeds one.
export function linearPathFraction(effPerMm, lengthMm) {
  const eff = Math.min(1, Math.max(0, Number(effPerMm) || 0));
  const length = Math.max(0, Number(lengthMm) || 0);
  if (eff >= 1) return length > 0 ? 1 : 0;
  const fraction = 1 - (1 - eff) ** length;
  return Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
}
