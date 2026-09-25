// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Plane-wave, monochromatic three-wave mixing WITH pump depletion, for the
// OPA calculator's reference curve. The app's own model (sketch/js/
// parametric-amplifier.js) uses the undepleted gain and clamps it at the
// pump's energy; this solves the coupled amplitude equations instead, so the
// page can show where the clamp is accurate and where real plane waves
// convert energy back into the pump.
//
// Amplitudes are normalised so that |a|^2 is photon flux relative to the
// input pump photon flux (a_p(0) = 1). In these units one coupling constant
// serves all three waves (Manley-Rowe), and it equals the small-signal gain
// coefficient Gamma of the input pump (Manzoni & Cerullo 2016, eqs. 2.8-2.9;
// Boyd, Nonlinear Optics, section 2.9):
//   da_s/dz = i Gamma a_p a_i* exp(-i dk z)
//   da_i/dz = i Gamma a_p a_s* exp(-i dk z)
//   da_p/dz = i Gamma a_s a_i  exp(+i dk z)
// with a_s(0) = sqrt(r) (r = seed/pump photon flux ratio) and a_i(0) = 0.
// Integrated by fixed-step fourth-order Runge-Kutta. Checked against the
// closed-form Jacobi-elliptic solution for dk = 0 and an independent Python
// integration (validation/reference/opa.py).

const STEP_GAIN = 0.05;   // h * Gamma_eff: resolves exponential growth and depletion
const STEP_PHASE = 0.1;   // h * |dk|: resolves the mismatch oscillation
const MAX_STEPS = 200000;

// Pump power conversion (fraction of input pump photons converted) at each
// of the ascending lengths in `lengthsM`. Returns null for invalid input.
export function coupledWaveConversion({ gammaPerM, deltaKPerM = 0, seedPhotonRatio, lengthsM, stepScale = 1 }) {
  if (![gammaPerM, deltaKPerM, seedPhotonRatio, stepScale].every(Number.isFinite)
      || gammaPerM < 0 || seedPhotonRatio < 0 || !(stepScale > 0)
      || !Array.isArray(lengthsM) || lengthsM.some((l, k) => !(l >= 0) || (k && l < lengthsM[k - 1]))) return null;
  if (gammaPerM === 0 || seedPhotonRatio === 0) return lengthsM.map(() => 0);
  const lengthMax = lengthsM.at(-1) ?? 0;
  const gammaEff = gammaPerM * Math.sqrt(1 + seedPhotonRatio);
  const h0 = Math.min(STEP_GAIN / gammaEff, deltaKPerM ? STEP_PHASE / Math.abs(deltaKPerM) : Infinity) * stepScale;
  if (lengthMax / h0 > MAX_STEPS) return null;
  // State: [sRe, sIm, iRe, iIm, pRe, pIm].
  let y = [Math.sqrt(seedPhotonRatio), 0, 0, 0, 1, 0];
  const g = gammaPerM, dk = deltaKPerM;
  const f = (z, [sr, si, ir, ii, pr, pi]) => {
    const c = Math.cos(dk * z), s = Math.sin(dk * z);
    // e = exp(-i dk z) = c - i s
    // a_p a_i* e
    const x1r = pr * ir + pi * ii, x1i = pi * ir - pr * ii;
    const t1r = x1r * c + x1i * s, t1i = x1i * c - x1r * s;
    // a_p a_s* e
    const x2r = pr * sr + pi * si, x2i = pi * sr - pr * si;
    const t2r = x2r * c + x2i * s, t2i = x2i * c - x2r * s;
    // a_s a_i e*
    const x3r = sr * ir - si * ii, x3i = sr * ii + si * ir;
    const t3r = x3r * c - x3i * s, t3i = x3i * c + x3r * s;
    // multiply by i Gamma: i (a + ib) = -b + i a
    return [-g * t1i, g * t1r, -g * t2i, g * t2r, -g * t3i, g * t3r];
  };
  const out = [];
  let z = 0;
  for (const target of lengthsM) {
    while (target - z > 1e-12 * target) {
      const h = Math.min(h0, target - z);
      const k1 = f(z, y);
      const k2 = f(z + h / 2, y.map((v, j) => v + k1[j] * h / 2));
      const k3 = f(z + h / 2, y.map((v, j) => v + k2[j] * h / 2));
      const k4 = f(z + h, y.map((v, j) => v + k3[j] * h));
      y = y.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      z += h;
    }
    // Converted pump photons = generated idler photons (Manley-Rowe); the
    // idler is the better-conditioned of the two when conversion is tiny.
    out.push(Math.min(1, y[2] * y[2] + y[3] * y[3]));
  }
  return out;
}
