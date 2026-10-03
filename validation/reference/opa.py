# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Optical parametric amplification: plane-wave gain, pulse-averaged seeded
gain, Manley-Rowe accounting and the depleted coupled-wave conversion.

Written from the sources, not from the JavaScript:

- The gain coefficient in the angular-frequency form of Manzoni & Cerullo
  (2016), eq. 2.9: Gamma^2 = 2 d^2 w_s w_i I_p / (n_s n_i n_p eps0 c^3), with
  I = n eps0 c |E|^2 / 2. (Baumgartner & Byer 1979, eq. 46, is the same
  quantity written with wavelengths; the app uses that form.)
- The undepleted signal gain by direct Runge-Kutta integration of the two
  linear coupled equations for signal and idler amplitudes, and, at dk = 0,
  the closed form cosh^2(Gamma L) (Baumgartner & Byer eq. 44a). The app
  evaluates the closed form 1 + (Gamma/g)^2 sinh^2(g L) instead.
- The pulse-averaged gain as a Simpson integral on a fine uniform grid of
  the seed-weighted gain cosh^2(Gamma(t) L), Gamma(t) = Gamma_peak
  sqrt(I_p(t)/I_peak), over Gaussian intensity envelopes (FWHM widths). A CW
  seed is present for the whole period, so its average-power gain is
  1 + f_rep * integral (G(t) - 1) dt. The app uses a different quadrature
  (midpoint cells cut at every window edge).
- Depleted conversion at dk = 0 from the closed-form solution of the
  coupled equations in Jacobi elliptic functions (Armstrong, Bloembergen,
  Ducuing & Pershan 1962; Baumgartner & Byer 1979, eqs. 39-43), derived
  here for an unseeded idler; at dk != 0 by a separate fine-step RK4. The
  calculator integrates by RK4 with a coarser, gain-scaled step.
"""

import math

from common import sig

EPS0 = 8.8541878128e-12
C = 299792458.0


def gain_coefficient(pump_nm, signal_nm, n_p, n_s, n_i, d_pm_per_v, intensity_w_m2):
    """Manzoni & Cerullo eq. 2.9, angular-frequency form."""
    w_p = 2 * math.pi * C / (pump_nm * 1e-9)
    w_s = 2 * math.pi * C / (signal_nm * 1e-9)
    w_i = w_p - w_s
    d = d_pm_per_v * 1e-12
    return math.sqrt(2 * d * d * w_s * w_i * intensity_w_m2 / (n_s * n_i * n_p * EPS0 * C ** 3))


def undepleted_gain_rk4(gamma, length, dk, steps=40000):
    """Signal power gain from dA_s/dz = i G A_i* e^{-i dk z},
    dA_i/dz = i G A_s* e^{-i dk z}, A_s(0) = 1, A_i(0) = 0 (photon units)."""
    h = length / steps

    def f(z, s, i):
        e = complex(math.cos(dk * z), -math.sin(dk * z))
        return 1j * gamma * i.conjugate() * e, 1j * gamma * s.conjugate() * e

    s, i, z = 1 + 0j, 0j, 0.0
    for _ in range(steps):
        a1, b1 = f(z, s, i)
        a2, b2 = f(z + h / 2, s + a1 * h / 2, i + b1 * h / 2)
        a3, b3 = f(z + h / 2, s + a2 * h / 2, i + b2 * h / 2)
        a4, b4 = f(z + h, s + a3 * h, i + b3 * h)
        s += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4)
        i += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4)
        z += h
    return abs(s) ** 2


def gaussian(t, fwhm):
    return math.exp(-4 * math.log(2) * (t / fwhm) ** 2)


def simpson(f, a, b, n=20000):
    n += n % 2
    h = (b - a) / n
    total = f(a) + f(b)
    for k in range(1, n):
        total += (4 if k % 2 else 2) * f(a + k * h)
    return total * h / 3


def pulse_averaged_gain(gamma_l, pump_fwhm, seed_fwhm=None, delay=0.0, rep_hz=80e6):
    """Average-power signal gain for a Gaussian pump (and Gaussian or CW
    seed), undepleted, matched (dk = 0). Times in fs."""
    def gain(t):
        return math.cosh(gamma_l * math.sqrt(gaussian(t, pump_fwhm))) ** 2
    if seed_fwhm is None:
        span = 8 * pump_fwhm
        return 1 + rep_hz * 1e-15 * simpson(lambda t: gain(t) - 1, -span, span)
    span = 8 * max(pump_fwhm, seed_fwhm) + abs(delay)
    num = simpson(lambda t: gaussian(t - delay, seed_fwhm) * gain(t), -span, span)
    den = simpson(lambda t: gaussian(t - delay, seed_fwhm), -span, span)
    return num / den


def jacobi(u, m):
    """sn, cn, dn by the arithmetic-geometric mean (Abramowitz & Stegun
    16.4.3), 0 <= m < 1."""
    a, b, c = [1.0], math.sqrt(1 - m), [math.sqrt(m)]
    while abs(c[-1]) > 1e-17 and len(a) < 60:
        a_next, c_next = (a[-1] + b) / 2, (a[-1] - b) / 2
        b = math.sqrt(a[-1] * b)
        a.append(a_next)
        c.append(c_next)
    n = len(a) - 1
    phi = [0.0] * (n + 1)
    phi[n] = 2 ** n * a[n] * u
    for k in range(n, 0, -1):
        phi[k - 1] = (phi[k] + math.asin(c[k] / a[k] * math.sin(phi[k]))) / 2
    sn, cn = math.sin(phi[0]), math.cos(phi[0])
    dn = cn / math.cos(phi[1] - phi[0]) if n else 1.0
    return sn, cn, dn


def depleted_conversion_closed_form(gamma_l, r):
    """Fraction of pump photons converted at dk = 0, idler unseeded.

    With photon-flux amplitudes (pump flux 1 at the input, seed flux r) and
    the Manley-Rowe invariants u_s^2 - u_i^2 = r, u_p^2 + u_i^2 = 1, the
    generated idler flux x obeys (dx/dz)^2 = 4 Gamma^2 x (x + r)(1 - x),
    whose solution is x = sn^2(Gamma sqrt(r) z | -1/r). The imaginary-modulus
    transformation (A&S 16.10.2) gives the positive-parameter form used here:
    x = r/(1+r) sd^2(Gamma L sqrt(1+r) | 1/(1+r)). Full conversion x = 1 is
    reached at sn = 1, then the pump regenerates (back-conversion).
    """
    m = 1 / (1 + r)
    sn, _, dn = jacobi(gamma_l * math.sqrt(1 + r), m)
    return r / (1 + r) * (sn / dn) ** 2


def depleted_conversion_rk4(gamma, dk, r, length, steps):
    def f(z, s, i, p):
        e = complex(math.cos(dk * z), -math.sin(dk * z))
        return (1j * gamma * p * i.conjugate() * e,
                1j * gamma * p * s.conjugate() * e,
                1j * gamma * s * i * e.conjugate())

    s, i, p, z = complex(math.sqrt(r)), 0j, 1 + 0j, 0.0
    h = length / steps
    for _ in range(steps):
        k1 = f(z, s, i, p)
        k2 = f(z + h / 2, s + k1[0] * h / 2, i + k1[1] * h / 2, p + k1[2] * h / 2)
        k3 = f(z + h / 2, s + k2[0] * h / 2, i + k2[1] * h / 2, p + k2[2] * h / 2)
        k4 = f(z + h, s + k3[0] * h, i + k3[1] * h, p + k3[2] * h)
        s += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        i += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        p += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
        z += h
    return abs(i) ** 2


def cases():
    out = []
    # 1. Gain coefficient: BBO-like type I (400 -> 600 nm), a 515 nm pumped
    # NIR amplifier, and periodically poled lithium niobate at 1064 nm.
    for name, pump, signal, n_p, n_s, n_i, d, gw_cm2 in (
        ("BBO-like, 400 nm pump, 600 nm signal, 100 GW/cm2", 400, 600, 1.66, 1.66, 1.65, 2.0, 100),
        ("515 nm pump, 780 nm signal, 50 GW/cm2", 515, 780, 1.66, 1.66, 1.65, 2.0, 50),
        ("PPLN, 1064 nm pump, 1550 nm signal, 0.1 GW/cm2", 1064, 1550, 2.156, 2.138, 2.08, 14.0, 0.1),
    ):
        intensity = gw_cm2 * 1e13
        out.append({
            "name": f"gain coefficient: {name}",
            "inputs": {"kind": "gamma", "pumpWl": pump, "signalWl": signal, "nPump": n_p, "nSignal": n_s,
                       "nIdler": n_i, "dEffPmV": d, "pumpIntensityWm2": intensity},
            "expected": {"gammaPerM": sig(gain_coefficient(pump, signal, n_p, n_s, n_i, d, intensity))},
            "tolerance": {"gammaPerM": 1e-9},
        })
    # 2. Undepleted gain: analytic cosh^2 at dk = 0, then RK4 across the
    # exponential, boundary (g = 0) and oscillatory regimes.
    for gamma_l in (0.5, 3.0, 10.0):
        out.append({
            "name": f"undepleted gain, matched, Gamma L = {gamma_l} (analytic cosh^2)",
            "inputs": {"kind": "gain", "gammaPerM": 1000.0, "lengthM": gamma_l / 1000.0, "deltaKPerM": 0.0},
            "expected": {"gain": sig(math.cosh(gamma_l) ** 2)},
            "tolerance": {"gain": 1e-9},
        })
    for gamma_l, ratio in ((1.0, 0.5), (4.0, 0.5), (2.0, 1.0), (1.0, 2.0), (3.0, 5.0)):
        gamma = 1000.0
        dk = 2 * gamma * ratio
        out.append({
            "name": f"undepleted gain, Gamma L = {gamma_l}, dk/(2 Gamma) = {ratio} (RK4)",
            "inputs": {"kind": "gain", "gammaPerM": gamma, "lengthM": gamma_l / gamma, "deltaKPerM": dk},
            "expected": {"gain": sig(undepleted_gain_rk4(gamma, gamma_l / gamma, dk))},
            "tolerance": {"gain": 1e-7},
        })
    # 3. Pulse-averaged seeded gain (quasi-static, Gamma_peak L = 5).
    for name, pump_fwhm, seed_fwhm, delay in (
        ("100 fs pump, 100 fs seed, zero delay", 100, 100, 0),
        ("100 fs pump, 100 fs seed, 100 fs delay", 100, 100, 100),
        ("1 ps pump, 100 fs seed", 1000, 100, 0),
        ("100 fs pump, 1 ps seed", 100, 1000, 0),
        ("100 fs pump at 80 MHz, CW seed", 100, None, 0),
    ):
        out.append({
            "name": f"pulse-averaged gain: {name}",
            "inputs": {"kind": "pulsed", "gammaPeakL": 5.0, "pumpFwhmFs": pump_fwhm, "seedFwhmFs": seed_fwhm,
                       "delayFs": delay, "repRateMHz": 80},
            "expected": {"gain": sig(pulse_averaged_gain(5.0, pump_fwhm, seed_fwhm, delay))},
            "tolerance": {"gain": 1e-6},
        })
    # 4. Manley-Rowe: one pump photon -> one signal + one idler photon.
    pump, signal = 532.0, 800.0
    idler = 1 / (1 / pump - 1 / signal)
    out.append({
        "name": "Manley-Rowe accounting, 532 nm pump, 800 nm seed, small signal",
        "inputs": {"kind": "photons", "pumpWl": pump, "signalWl": signal},
        "expected": {"idlerWl": sig(idler), "idlerPerSignalW": sig(signal / idler), "pumpPerSignalW": sig(signal / pump)},
        "tolerance": {"idlerWl": 1e-9, "idlerPerSignalW": 1e-9, "pumpPerSignalW": 1e-9},
    })
    # 5. Depleted plane-wave conversion (calculator's reference curve).
    for gamma_l, r in ((2.0, 1e-3), (4.0, 1e-3), (6.0, 1e-3), (8.0, 1e-6), (9.0, 1e-6), (12.0, 1e-6)):
        out.append({
            "name": f"depleted conversion, dk = 0, Gamma L = {gamma_l}, seed/pump photons {r:g} (elliptic)",
            "inputs": {"kind": "depleted", "gammaPerM": 1000.0, "lengthM": gamma_l / 1000.0, "deltaKPerM": 0.0,
                       "seedPhotonRatio": r},
            "expected": {"conversion": sig(depleted_conversion_closed_form(gamma_l, r))},
            "tolerance": {"conversion": 2e-6},
            "absolute": True,
        })
    for gamma_l, ratio, r in ((6.0, 0.3, 1e-4), (8.0, 0.8, 1e-4), (4.0, 1.5, 1e-2)):
        gamma = 1000.0
        dk = 2 * gamma * ratio
        out.append({
            "name": f"depleted conversion, Gamma L = {gamma_l}, dk/(2 Gamma) = {ratio}, seed/pump photons {r:g} (RK4)",
            "inputs": {"kind": "depleted", "gammaPerM": gamma, "lengthM": gamma_l / gamma, "deltaKPerM": dk,
                       "seedPhotonRatio": r},
            "expected": {"conversion": sig(depleted_conversion_rk4(gamma, dk, r, gamma_l / gamma, 60000))},
            "tolerance": {"conversion": 2e-6},
            "absolute": True,
        })
    return out


MODEL = {
    "id": "opa",
    "title": "Optical parametric amplification: plane-wave gain, pulse-averaged seeded gain, depleted conversion",
    "app": "sketch/js/parametric.js: parametricGainCoefficient, parametricSmallSignalGain, parametricPair; sketch/js/parametric-amplifier.js: allocateParametricAmplifier; calculators/opa/coupled-wave.js: coupledWaveConversion",
    "reference": "Gain coefficient in the angular-frequency form; undepleted gain by RK4 of the linear coupled equations and the analytic cosh^2; pulse-averaged gain by Simpson integration on a 20000-interval grid; depleted conversion from the closed-form Jacobi-elliptic solution (dk = 0) and a 60000-step RK4 ([code](../validation/reference/opa.py))",
    "citations": [
        "R. A. Baumgartner and R. L. Byer, 'Optical parametric amplification', IEEE J. Quantum Electron. 15, 432-444 (1979), doi:10.1109/JQE.1979.1070043, eqs. 39-47",
        "C. Manzoni and G. Cerullo, 'Design criteria for ultrafast optical parametric amplifiers', J. Opt. 18, 103501 (2016), doi:10.1088/2040-8978/18/10/103501, eqs. 2.8-2.14",
        "J. A. Armstrong, N. Bloembergen, J. Ducuing and P. S. Pershan, 'Interactions between light waves in a nonlinear dielectric', Phys. Rev. 127, 1918-1939 (1962), doi:10.1103/PhysRev.127.1918",
        "M. Abramowitz and I. A. Stegun, Handbook of Mathematical Functions (1964), 16.4 (AGM evaluation of Jacobi functions) and 16.10 (imaginary-modulus transformation)",
    ],
    "provenance": "Equations transcribed from the papers; the elliptic solution derived here from the Manley-Rowe invariants; no published numerical anchor is reproduced.",
    "domain": "Gamma L 0.5-12; dk/(2 Gamma) 0-5; Gaussian pulses 100 fs-1 ps, delays up to one FWHM, 80 MHz; seed/pump photon ratios 1e-6-1e-2.",
    "convergence": "Closed forms for the matched gain and the elliptic conversion; the AGM runs to 1e-17. RK4 at 40000-60000 steps and Simpson at 20000 intervals change by less than 1e-9 relative on halving.",
    "tolerance_rationale": "1e-9 for algebra; 1e-7 for the undepleted RK4 (converged well below); 1e-6 for the pulse-averaged gain (the app's midpoint cells, 64 per shortest width); 2e-6 absolute for the calculator's gain-scaled RK4 step (h Gamma = 0.05; measured worst 3.4e-7).",
    "outside_scope": "The gain functions return null for invalid wavelengths or non-finite inputs; the allocator reports explicit states (degenerate, double-seeded, repetition mismatch, unknown duration) instead of a gain. Nothing here models beam profiles, walk-off, group-velocity mismatch, dispersion inside the crystal or parametric noise.",
    "fidelity": "computed",
    "scope": "Plane waves, collinear, monochromatic within each instant (quasi-static in time), unseeded idler, nondegenerate; Gaussian intensity envelopes; depleted conversion for a single seed.",
}
