// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Optical sectioning, as an opt-in qualitative model. A specimen is one thin
// layer. A nonlinear signal of order n from a thin layer goes as the integral
// of I^n over the layer, which for a beam of radius w is ~ P^n / w^(2(n-1)).
// With an ideal Gaussian focus that is the thin-layer axial response
//   (1 + (z/zR)^2)^-(n-1)
// relative to the same layer at the focus. A linear signal (n = 1) does not
// depend on where the focus is, which is the whole difference.
//
// The focus is found from the beam's own sampling rays as they cross the
// layer. Its size is the diffraction limit of their convergence (in air);
// aberrations, the medium's index and how tight the focus is in absolute
// terms are not computed.

// How many photons a signal needs at once: its yield goes as the excitation
// intensity to this power. SRS and CARS take each beam's power once per
// field it supplies (Ip·Is and Ip²·Is).
export const NONLINEAR_ORDER = { tpef: 2, shg: 2, srs: 2, thpef: 3, thg: 3, cars: 3 };

// Below this convergence a bundle is treated as collimated: its focus is too
// far away to place, and the layer sees the same beam wherever it sits.
const MIN_HALF_ANGLE = 1e-4;

// The narrowest point of a bundle of straight rays, from where they cross the
// layer. `rays` are { p: {x,y}, d: {x,y} (unit), w: weight }; distances are in
// canvas millimetres. Returns { ok: true, zMm, zRMm, na, w0Mm } with zMm the
// signed distance from the crossing to the focus along the beam (positive:
// the focus lies beyond the layer), or { ok: false, reason }.
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
  if (![zMm, na, w0Mm, zRMm].every(Number.isFinite) || !(zRMm > 0)) return { ok: false, reason: 'collimated' };
  return { ok: true, zMm, zRMm, na, w0Mm };
}

// The thin-layer yield of an order-n signal relative to the same layer at the
// focus. 1 for a linear signal, and 1 when the focus is unknown: the model
// then does not scale the signal rather than silently removing it.
export function focusYield(order, focus) {
  const n = Number(order);
  if (!(n > 1) || !focus?.ok) return 1;
  const ratio = focus.zMm / focus.zRMm;
  const factor = (1 + ratio * ratio) ** -(n - 1);
  return Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 0;
}
