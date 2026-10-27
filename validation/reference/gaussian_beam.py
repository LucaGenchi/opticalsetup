# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gaussian beams: waist, Rayleigh range, divergence, the beam at a
distance, and focusing by a thin lens.

Written from Kogelnik and Li (Appl. Opt. 5, 1550 (1966)) without the
JavaScript, by a different route: every quantity comes from the complex
beam parameter q, propagated with ABCD matrices, instead of from the
closed-form expressions the page evaluates (w(z) = w0 sqrt(1 + (z/zR)^2),
Self's lens equation). A beam of quality M^2 in a medium of index n is the
"embedded Gaussian" of ISO 11146 / Siegman: the same q algebra with the
wavelength replaced by M^2 lambda / n.

  1/q = 1/R - i M^2 lambda / (pi n w^2),   q(z) = q(0) + z,
  thin lens:   q' = q / (1 - q/f).

Units: lambda in nm, w in um, z, R and f in mm, angles in mrad, power in W,
intensity in W/cm^2.
"""
import cmath
import math

from common import sig


def lam_mm(nm, m2, n):
    """The effective wavelength of the embedded Gaussian, in mm."""
    return m2 * nm * 1e-6 / n


def q_at_waist(w0_um, nm, m2, n):
    return 1j * math.pi * (w0_um * 1e-3) ** 2 / lam_mm(nm, m2, n)


def width_um(q, nm, m2, n):
    """1/e^2 radius from q: Im(1/q) = -lambda_eff / (pi w^2)."""
    return math.sqrt(-lam_mm(nm, m2, n) / (math.pi * (1 / q).imag)) * 1e3


def curvature_mm(q):
    re = (1 / q).real
    return math.inf if re == 0 else 1 / re


def lens(q, f):
    """ABCD thin lens [[1, 0], [-1/f, 1]]."""
    return q / (-q / f + 1)


def waist_after(q):
    """Distance to the waist (Re q = 0) and the waist's q."""
    s = -q.real
    return s, q + s


def far_field_half_angle_mrad(w0_um, nm, m2, n):
    """lim w(z)/z, evaluated far out instead of from the closed form."""
    q0 = q_at_waist(w0_um, nm, m2, n)
    z = 1e9 * abs(q0)
    return width_um(q0 + z, nm, m2, n) * 1e-3 / z * 1e3


def peak_intensity_w_cm2(power_w, w_um):
    """I0 from P = integral of I0 exp(-2 r^2/w^2) 2 pi r dr, by Simpson's
    rule on the radius (the integrand is not even about r = 0, so the
    trapezoid rule would only be second order there)."""
    w_cm = w_um * 1e-4
    n, top = 4000, 8 * w_cm
    h = top / n
    total = math.fsum((1 if i in (0, n) else 4 if i % 2 else 2) * math.exp(-2 * (i * h) ** 2 / w_cm ** 2) * 2 * math.pi * (i * h) for i in range(n + 1)) * h / 3
    return power_w / total


def beam_case(name, given, inputs, expect_lens=True):
    nm, n, m2 = inputs["wavelengthNm"], inputs["index"], inputs["m2"]
    # The waist from whichever quantity the beam is given by.
    if given == "waist":
        w0 = inputs["waistUm"]
    elif given == "diameter":
        w0 = inputs["waistDiameterUm"] / 2
    elif given == "divergence":
        # Bisection on far_field_half_angle(w0) = half the full angle given.
        target = inputs["divergenceMrad"] / 2
        lo, hi = 1e-6, 1e9
        for _ in range(300):
            mid = math.sqrt(lo * hi)
            lo, hi = (mid, hi) if far_field_half_angle_mrad(mid, nm, m2, n) > target else (lo, mid)
        w0 = math.sqrt(lo * hi)
    else:
        # The Rayleigh range is where w = sqrt(2) w0: Im q at the waist.
        zr = inputs["rayleighMm"]
        w0 = width_um(1j * zr, nm, m2, n)
    q0 = q_at_waist(w0, nm, m2, n)
    z = inputs["zMm"]
    expected = {
        "waistUm": sig(w0),
        "rayleighMm": sig(q0.imag),
        "halfDivergenceMrad": sig(far_field_half_angle_mrad(w0, nm, m2, n)),
        "bppMmMrad": sig(w0 * 1e-3 * far_field_half_angle_mrad(w0, nm, m2, n)),
    }
    q = q0 + z
    if inputs.get("lens"):
        f, d = inputs["focalMm"], inputs["lensDistanceMm"]
        q_lens = lens(q0 + d, f)
        s, q_waist = waist_after(q_lens)
        expected.update({
            "focusWaistUm": sig(width_um(q_waist, nm, m2, n)),
            "focusDistanceMm": sig(s),
            "focusRayleighMm": sig(q_waist.imag),
            "magnification": sig(width_um(q_waist, nm, m2, n) / w0),
            "lensRadiusUm": sig(width_um(q0 + d, nm, m2, n)),
        })
        if z > d:
            q = q_lens + (z - d)
    expected["radiusUm"] = sig(width_um(q, nm, m2, n))
    expected["curvatureMm"] = sig(curvature_mm(q))
    if m2 == 1 and not (inputs.get("lens") and z > d):
        # Gouy phase of the TEM00 beam: the phase of q(z)/q(0) is -psi.
        expected["gouyDeg"] = sig(-math.degrees(cmath.phase(q / q0)))
    if inputs.get("powerW") and m2 == 1:
        expected["peakIntensityWcm2"] = sig(peak_intensity_w_cm2(inputs["powerW"], width_um(q, nm, m2, n)))
    tol = {k: 1e-9 for k in expected}
    # Bisection and the far-field limit: converged to round-off but through
    # a 1e9 zR step, which leaves about 1e-12 of near-field correction.
    return {"name": name, "inputs": {"given": given, **inputs}, "expected": expected, "tolerance": tol}


def cases():
    base = {"wavelengthNm": 632.8, "index": 1.0, "m2": 1.0, "lens": False}
    out = [
        beam_case("HeNe 632.8 nm, w0 = 250 um, 1 m from the waist", "waist", {**base, "waistUm": 250, "zMm": 1000, "powerW": 0.005}),
        beam_case("1064 nm, w0 = 1 mm, M^2 = 1.3, 2 m before the waist", "waist", {**base, "wavelengthNm": 1064, "m2": 1.3, "waistUm": 1000, "zMm": -2000}),
        beam_case("800 nm, waist diameter 20 um in water (n 1.33), 50 um past it", "diameter", {**base, "wavelengthNm": 800, "index": 1.33, "waistDiameterUm": 20, "zMm": 0.05}),
        beam_case("1550 nm, full divergence 0.5 mrad, 10 m away", "divergence", {**base, "wavelengthNm": 1550, "divergenceMrad": 0.5, "zMm": 10000}),
        beam_case("532 nm, M^2 = 2, full divergence 3 mrad, 150 mm out (about one Rayleigh range)", "divergence", {**base, "wavelengthNm": 532, "m2": 2, "divergenceMrad": 3, "zMm": 150}),
        beam_case("355 nm, Rayleigh range 3 mm, 1 mm past the waist, 2 W", "rayleigh", {**base, "wavelengthNm": 355, "rayleighMm": 3, "zMm": 1, "powerW": 2}),
        beam_case("10.6 um CO2, Rayleigh range 2 m, M^2 = 1.1, 5 m away", "rayleigh", {**base, "wavelengthNm": 10600, "m2": 1.1, "rayleighMm": 2000, "zMm": 5000}),
    ]
    lens_base = {**base, "lens": True}
    out += [
        beam_case("collimated 1064 nm beam, w0 = 1 mm at a 100 mm lens: focus, read at the focus", "waist",
                  {**lens_base, "wavelengthNm": 1064, "waistUm": 1000, "focalMm": 100, "lensDistanceMm": 0, "zMm": 99.9}),
        beam_case("w0 = 50 um, 200 mm before a 100 mm lens (s = 2f): about unit magnification", "waist",
                  {**lens_base, "waistUm": 50, "focalMm": 100, "lensDistanceMm": 200, "zMm": 350}),
        beam_case("w0 = 50 um at the front focal plane (s = f)", "waist",
                  {**lens_base, "waistUm": 50, "focalMm": 100, "lensDistanceMm": 100, "zMm": 50}),
        beam_case("w0 = 20 um, 30 mm before a 100 mm lens (inside f: virtual waist)", "waist",
                  {**lens_base, "waistUm": 20, "focalMm": 100, "lensDistanceMm": 30, "zMm": 500}),
        beam_case("w0 = 1 mm at a -50 mm diverging lens", "waist",
                  {**lens_base, "wavelengthNm": 1030, "waistUm": 1000, "focalMm": -50, "lensDistanceMm": 0, "zMm": 300}),
        beam_case("M^2 = 1.5, w0 = 2 mm, 500 mm before a 250 mm lens, in the converging beam", "waist",
                  {**lens_base, "wavelengthNm": 800, "m2": 1.5, "waistUm": 2000, "focalMm": 250, "lensDistanceMm": 500, "zMm": 700, "powerW": 1}),
    ]
    return out


MODEL = {
    "id": "gaussian-beam",
    "title": "Gaussian beam propagation and thin-lens focusing",
    "app": "calculators/gaussian-beam/gaussian-beam.js: computeGaussianBeam",
    "reference": "Complex beam parameter q propagated with ABCD matrices (free space, thin lens), widths and curvatures read from 1/q; the waist from a given divergence by bisection on the far-field limit; peak intensity by radial quadrature of the power",
    "citations": [
        "H. Kogelnik and T. Li, Appl. Opt. 5, 1550-1567 (1966), doi:10.1364/AO.5.001550 (q parameter, ABCD law, Gaussian beam formulas)",
        "S. A. Self, Appl. Opt. 22, 658-661 (1983), doi:10.1364/AO.22.000658 (thin-lens focusing of a Gaussian beam, with M^2)",
        "ISO 11146-1:2021, beam widths, divergence angles and beam propagation ratios (M^2, embedded Gaussian)",
    ],
    "provenance": "The ABCD law and the q relations written from Kogelnik and Li; M^2 enters as lambda -> M^2 lambda, the embedded-Gaussian rule Self uses. The app evaluates the closed forms (w(z), R(z), Gouy phase, Self's lens equation); this reference never uses them.",
    "domain": "632.8-10600 nm, M^2 1-2, n 1-1.33; beams given by waist radius, waist diameter, full divergence or Rayleigh range; read before and after the waist and through converging (s = 2f, s = f), virtual-waist (s < f) and diverging (f < 0) thin lenses; peak intensity for TEM00 beams.",
    "convergence": "Closed-form complex arithmetic; the divergence inversion bisects 300 times; the far-field limit is taken 1e9 Rayleigh ranges out; the power integral uses Simpson's rule on 4000 intervals over 8 beam radii.",
    "tolerance_rationale": "1e-9 relative: algebraic identities in double precision, and a far-field limit and quadrature converged well below that.",
    "outside_scope": "Declines non-positive or out-of-range wavelength, M^2 below 1, index below 1, non-positive waist, divergence or Rayleigh range, and a zero focal length; R is reported as flat at a waist; the Gouy phase and peak intensity are reported for M^2 = 1 only.",
    "fidelity": "computed",
    "scope": "Paraxial scalar Gaussian beams (TEM00, or the embedded Gaussian of an M^2 beam) in a uniform medium, and an ideal thin lens; no aberrations, apertures or clipping.",
}
