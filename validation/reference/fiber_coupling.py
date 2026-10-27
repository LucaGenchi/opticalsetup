# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Coupling a collimated Gaussian beam into a single-mode fiber through a
thin lens, written without the JavaScript.

The fiber mode. The page approximates the LP01 mode of a step-index fiber
by a Gaussian whose radius follows Marcuse's fit (Bell Syst. Tech. J. 56,
703 (1977)). This reference does not use that fit: it solves the exact
weakly-guiding LP01 eigenvalue equation (Gloge, Appl. Opt. 10, 2252 (1971))

  u J1(u) / J0(u) = w K1(w) / K0(w),   u^2 + w^2 = V^2,

with Bessel functions from their integral representations, builds the mode
field (J0 in the core, K0 in the cladding) and finds the Gaussian that
couples to it best, by maximizing the overlap. That is what Marcuse's fit
approximates, so the page's mode-field diameter is checked against the
physics, at the fit's own accuracy (about 1 %). The cutoff V = 2.405 is
found here as the first zero of J0, by bisection.

The coupling. Efficiency is the normalized overlap integral of the focused
beam and the fiber's Gaussian mode on the fiber face (Kogelnik and Li;
Joyce and DeLoach, Appl. Opt. 23, 4187 (1984)). The page evaluates it in
closed form; here it is integrated numerically over the face, one axis at a
time (both fields separate in x and y), with lateral offset and tilt along x
and the face displaced along the axis from the beam waist. The beam is
focused by a thin lens from a collimated waist at the lens (ABCD with the
complex beam parameter q), and the focal length that matches the fiber mode
exactly is found by bisection.

Units: lambda in nm, diameters and offsets in um unless named Mm, focal
lengths in mm, tilt in mrad.
"""
import cmath
import math

from common import sig


# Bessel functions by their integral representations; the trapezoid rule
# is spectrally accurate for these smooth periodic or doubly-exponentially
# decaying integrands.
def bessel_j(order, x, n=400):
    h = math.pi / n
    return math.fsum((0.5 if k in (0, n) else 1.0) * math.cos(order * k * h - x * math.sin(k * h)) for k in range(n + 1)) * h / math.pi


def bessel_k(order, x, n=800):
    top = math.acosh(max(1.0, 60.0 / x)) + 1.0
    h = top / n
    return math.fsum((0.5 if k in (0, n) else 1.0) * math.exp(-x * math.cosh(k * h)) * math.cosh(order * k * h) for k in range(n + 1)) * h


def first_zero_j0():
    lo, hi = 2.0, 3.0
    for _ in range(100):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if bessel_j(0, mid) > 0 else (lo, mid)
    return (lo + hi) / 2


J0_ZERO = first_zero_j0()


def lp01_u(V):
    """The core parameter u of LP01, by bisection on the eigenvalue
    equation between 0 and min(V, the first zero of J0)."""
    def f(u):
        w = math.sqrt(V * V - u * u)
        return u * bessel_j(1, u) / bessel_j(0, u) - w * bessel_k(1, w) / bessel_k(0, w)
    lo, hi = 1e-9, min(V, J0_ZERO) - 1e-12
    for _ in range(120):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
    return (lo + hi) / 2


def simpson(f, a, b, n):
    n += n % 2
    h = (b - a) / n
    return math.fsum((1 if k in (0, n) else 4 if k % 2 else 2) * f(a + k * h) for k in range(n + 1)) * h / 3


def best_gaussian_radius(V):
    """The 1/e^2 field radius (in core radii) of the Gaussian that couples
    best to the exact LP01 mode, and that best coupling."""
    u = lp01_u(V)
    w = math.sqrt(V * V - u * u)
    j0u, k0w = bessel_j(0, u), bessel_k(0, w)
    # The mode on radial grids (core radius 1), tabulated once: the core,
    # then the cladding in segments of growing step out to where the field
    # K0(w r) has fallen by e^-40 (at low V the mode reaches many core radii).
    out = max(12.0, 40.0 / w)
    segments = [[(r, bessel_j(0, u * r) / j0u) for r in (k / 200 for k in range(201))]]
    for a, b, step in ((1.0, 3.0, 0.01), (3.0, 12.0, 0.05), (12.0, out, 0.25)):
        if b <= a:
            continue
        n = 2 * math.ceil((b - a) / step / 2)
        segments.append([(r, bessel_k(0, w * r) / k0w) for r in (a + k * (b - a) / n for k in range(n + 1))])

    def integrate(g):
        total = []
        for pairs in segments:
            n = len(pairs) - 1
            h = (pairs[-1][0] - pairs[0][0]) / n
            total.append(math.fsum((1 if k in (0, n) else 4 if k % 2 else 2) * g(r, e) for k, (r, e) in enumerate(pairs)) * h / 3)
        return math.fsum(total)

    power = integrate(lambda r, e: e * e * r)

    def eta(s):
        cross = integrate(lambda r, e: e * math.exp(-r * r / s ** 2) * r)
        return cross ** 2 / (power * s * s / 4)

    # Bracket the optimum on a coarse logarithmic scan (it must lie inside
    # the scan, not on its edge), then refine by golden-section search.
    grid = [0.3 * 100 ** (k / 60) for k in range(61)]
    values = [eta(s) for s in grid]
    best = max(range(len(grid)), key=values.__getitem__)
    if best in (0, len(grid) - 1):
        raise ValueError(f"V = {V}: the best Gaussian lies outside the search range")
    lo, hi = grid[best - 1], grid[best + 1]
    g = (math.sqrt(5) - 1) / 2
    a, b = hi - g * (hi - lo), lo + g * (hi - lo)
    fa, fb = eta(a), eta(b)
    for _ in range(80):
        if fa > fb:
            hi, b, fb = b, a, fa
            a = hi - g * (hi - lo)
            fa = eta(a)
        else:
            lo, a, fa = a, b, fb
            b = lo + g * (hi - lo)
            fb = eta(b)
    s = (lo + hi) / 2
    return s, eta(s)


# The focused beam: a collimated TEM00 waist w_in at a thin lens of focal
# length f, by the ABCD law on q.
def focus(w_in_um, nm, f_mm):
    lam = nm * 1e-6
    q0 = 1j * math.pi * (w_in_um * 1e-3) ** 2 / lam
    q = q0 / (1 - q0 / f_mm)
    s = -q.real
    zr = (q + s).imag
    return math.sqrt(zr * lam / math.pi) * 1e3, s     # waist radius um, distance mm


def overlap_1d(w_beam_um, w_mode_um, dz_um, dx_um, tilt_mrad, nm):
    """|∫ u g*|^2 / (∫|u|^2 ∫|g|^2) along one axis, by the trapezoid rule:
    u is the beam on the face (waist w_beam, face dz past the waist, centred
    at dx, tilted by tilt), g the fiber mode exp(-x^2/w_mode^2)."""
    lam = nm * 1e-3                                       # um
    k = 2 * math.pi / lam
    zr = math.pi * w_beam_um ** 2 / lam
    q = dz_um + 1j * zr
    span = 12 * max(w_beam_um * math.sqrt(1 + (dz_um / zr) ** 2), w_mode_um) + abs(dx_um)
    n = 6000
    h = 2 * span / n
    re = im = pu = pg = 0.0
    terms_re, terms_im, terms_u, terms_g = [], [], [], []
    for i in range(n + 1):
        x = -span + i * h
        c = 0.5 if i in (0, n) else 1.0
        u = cmath.exp(-1j * k * (x - dx_um) ** 2 / (2 * q) + 1j * k * tilt_mrad * 1e-3 * x)
        g = math.exp(-x * x / w_mode_um ** 2)
        z = u * g
        terms_re.append(c * z.real); terms_im.append(c * z.imag)
        terms_u.append(c * abs(u) ** 2); terms_g.append(c * g * g)
    cross = complex(math.fsum(terms_re), math.fsum(terms_im)) * h
    return abs(cross) ** 2 / (math.fsum(terms_u) * h * math.fsum(terms_g) * h)


def coupling_case(name, inputs):
    nm, D, f = inputs["wavelengthNm"], inputs["beamDiameterMm"], inputs["focalMm"]
    w_in = D * 1e3 / 2
    if inputs["fiberMode"] == "mfd":
        w_mode = inputs["mfdUm"] / 2
    else:
        a = inputs["coreDiameterUm"] / 2
        V = 2 * math.pi * a * inputs["na"] / (nm * 1e-3)
        w_mode = best_gaussian_radius(V)[0] * a
    w_f, s = focus(w_in, nm, f)
    dz, dx, tilt = inputs.get("axialOffsetUm", 0), inputs.get("lateralOffsetUm", 0), inputs.get("tiltMrad", 0)
    matched = overlap_1d(w_f, w_mode, 0, 0, 0, nm) ** 2
    eff = overlap_1d(w_f, w_mode, dz, dx, tilt, nm) * overlap_1d(w_f, w_mode, dz, 0, 0, nm)
    # The focal length whose focused waist equals the mode radius.
    lo, hi = 1e-3, 1e5
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        lo, hi = (mid, hi) if focus(w_in, nm, mid)[0] < w_mode else (lo, mid)
    # Through a fiber given by core and NA the mode radius sits on a flat
    # optimum, known to about 1e-8: keep 6 digits so the expected file does
    # not depend on the machine's maths library.
    digits = 6 if inputs["fiberMode"] == "step" else 10
    expected = {"focusWaistUm": sig(w_f), "focusDistanceMm": sig(s), "matchEfficiency": sig(matched, digits),
                "efficiency": sig(eff, digits), "optimalFocalMm": sig(math.sqrt(lo * hi), digits)}
    return {"name": name, "inputs": {"kind": "coupling", **inputs}, "expected": expected,
            "tolerance": {k: 1e-9 for k in expected}}


def cases():
    out = []
    # The fiber mode: Marcuse's fit against the exact LP01 best Gaussian, and
    # the cutoff wavelength from the first zero of J0.
    for core, na, nm in ((8.2, 0.14, 1550), (8.2, 0.14, 1310), (4.4, 0.13, 780), (3.5, 0.12, 633), (5.0, 0.12, 980), (6.0, 0.14, 1064), (4.0, 0.1, 900)):
        a = core / 2
        V = 2 * math.pi * a * na / (nm * 1e-3)
        s, best = best_gaussian_radius(V)
        out.append({
            "name": f"step-index core {core} um, NA {na}, {nm} nm (V = {V:.3f}): mode-field diameter against the exact LP01 mode",
            "inputs": {"kind": "fiber", "wavelengthNm": nm, "coreDiameterUm": core, "na": na},
            "expected": {"vNumber": sig(V), "cutoffNm": sig(2 * math.pi * a * na / J0_ZERO * 1e3), "modeFieldDiameterUm": sig(2 * s * a, 6)},
            "tolerance": {"vNumber": 1e-9, "cutoffNm": 1e-9, "modeFieldDiameterUm": 1e-2},
            "note": f"the page uses Marcuse's fit; the reference fits the exact LP01 mode, whose best Gaussian couples to it at {best:.4f}. The fit's accuracy, about 1 %, sets the tolerance",
        })
    base = {"wavelengthNm": 1550, "beamDiameterMm": 2.0, "focalMm": 11.0, "fiberMode": "mfd", "mfdUm": 10.4}
    out += [
        coupling_case("1550 nm, 2 mm beam, f 11 mm, MFD 10.4 um: aligned", base),
        coupling_case("same, 1 um lateral offset", {**base, "lateralOffsetUm": 1.0}),
        coupling_case("same, 20 um axial offset", {**base, "axialOffsetUm": 20.0}),
        coupling_case("same, 5 mrad tilt", {**base, "tiltMrad": 5.0}),
        coupling_case("same, all three together", {**base, "lateralOffsetUm": 1.5, "axialOffsetUm": -15.0, "tiltMrad": 3.0}),
        # Offset and tilt in one plane: the offset is where the beam's centre
        # meets the fiber face, a positive tilt travels toward it.
        coupling_case("same, 2 um offset, 30 um past the focus, tilted 20 mrad toward the offset side", {**base, "lateralOffsetUm": 2.0, "axialOffsetUm": 30.0, "tiltMrad": 20.0}),
        coupling_case("same, tilted 20 mrad back toward the axis", {**base, "lateralOffsetUm": 2.0, "axialOffsetUm": 30.0, "tiltMrad": -20.0}),
        coupling_case("780 nm, 1.2 mm beam, f 8 mm, MFD 5.3 um, mismatched and offset", {**base, "wavelengthNm": 780, "beamDiameterMm": 1.2, "focalMm": 8.0, "mfdUm": 5.3, "lateralOffsetUm": 0.8, "tiltMrad": 4.0}),
        coupling_case("633 nm, 0.8 mm beam, f 4.5 mm, core 3.5 um NA 0.12 (mode from the exact LP01 fit)", {**base, "wavelengthNm": 633, "beamDiameterMm": 0.8, "focalMm": 4.5, "fiberMode": "step", "coreDiameterUm": 3.5, "na": 0.12}),
    ]
    # The last case's mode comes from the exact LP01 fit while the page uses
    # Marcuse's: its efficiencies differ by that fit's accuracy.
    for key in ("matchEfficiency", "efficiency", "optimalFocalMm"):
        out[-1]["tolerance"][key] = 2e-2
    out[-1]["note"] = "the mode radius comes from the exact LP01 best Gaussian here and from Marcuse's fit on the page; the 1 % difference in radius moves the efficiency and the matching focal length by up to 2 %"
    return out


MODEL = {
    "id": "fiber-coupling",
    "title": "Gaussian-beam coupling into a single-mode fiber",
    "app": "calculators/fiber-coupling/fiber-coupling.js: computeFiberCoupling (mode radius by Marcuse's fit, focused beam by calculators/gaussian-beam/gaussian-beam.js: thinLensFocus, overlap in closed form)",
    "reference": "Exact weakly-guiding LP01 mode from its Bessel-function eigenvalue equation, best-coupling Gaussian by golden-section search on the overlap; focused beam by the ABCD law on q; coupling efficiency by trapezoid quadrature of the overlap integral on the fiber face; matching focal length by bisection",
    "citations": [
        "D. Gloge, Appl. Opt. 10, 2252-2258 (1971), doi:10.1364/AO.10.002252 (LP modes, eigenvalue equation, cutoff V = 2.405)",
        "D. Marcuse, Bell Syst. Tech. J. 56, 703-718 (1977), doi:10.1002/j.1538-7305.1977.tb00534.x (Gaussian approximation of the fundamental mode)",
        "H. Kogelnik and T. Li, Appl. Opt. 5, 1550-1567 (1966), doi:10.1364/AO.5.001550 (Gaussian beams, ABCD law)",
        "W. B. Joyce and B. C. DeLoach, Appl. Opt. 23, 4187-4196 (1984), doi:10.1364/AO.23.004187 (alignment of Gaussian beams: offset, tilt, defocus)",
    ],
    "provenance": "The eigenvalue equation and field written from Gloge's weakly-guiding analysis; the coupling as the normalized overlap integral of the two fields on the face, as in Kogelnik and in Joyce and DeLoach. Marcuse's fit and the page's closed-form overlap are not used here.",
    "domain": "Step-index fibers with V 1.4-2.75 (633-1550 nm, one above the single-mode cutoff, cores 3.5-8.2 um, NA 0.12-0.14); collimated beams of 0.8-2 mm focused by 4.5-11 mm lenses; aligned, and with lateral offsets (on the fiber face) to 2 um, axial offsets to +/-30 um and tilts of either sign to 20 mrad in the plane of the offset, separately and together.",
    "convergence": "Bessel integrals by the trapezoid rule (400 and 800 nodes); 100- and 120-step bisections; mode overlaps by Simpson's rule on 200 core intervals and cladding steps of 0.01-0.25 core radii out to where the field has fallen by e^-40 (at least 12 core radii); the best Gaussian bracketed on a 61-point logarithmic scan from 0.3 to 30 core radii (it must fall inside) and refined by golden-section search to 80 steps; face overlaps by the trapezoid rule on 6000 intervals over 12 beam widths; focal-length bisection to 200 steps.",
    "tolerance_rationale": "1e-9 relative for the V number, cutoff and every coupling quantity computed from the same mode radius (algebra and spectrally accurate quadrature); 1 % on the mode-field diameter and 2 % on the aligned coupling through a fiber given by core and NA, because the page uses Marcuse's fit and the reference the exact LP01 mode (at large misalignments a 1 % radius error can move the efficiency by more). Values that pass through the best-Gaussian optimum are stored to 6 digits, which it fixes to about 1e-8.",
    "outside_scope": "Declines a mode or beam diameter that is not positive, a non-positive focal length, and V outside 1.2-3.5, the range checked here. The reference finds the fit within 1 % of the exact mode's best Gaussian from V = 1.0 (-0.49 %) to about 4.0 (-0.72 %), and degrading below: -3.6 % at V = 0.9, -13 % at V = 0.8. Above 2.405 the fit still describes LP01, but the fiber is no longer single-mode, and the page says so.",
    "fidelity": "computed",
    "scope": "Paraxial scalar coupling of a TEM00 beam into the fundamental mode, approximated as a Gaussian; ideal thin lens; no Fresnel reflection, aberrations, polarization or cladding modes.",
}
