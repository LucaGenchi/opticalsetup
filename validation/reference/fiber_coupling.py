# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Coupling a collimated Gaussian beam into a single-mode fiber through a
thin lens, written without the JavaScript.

The fiber mode. The page couples into the exact LP01 mode of a step-index
fiber of the same V; the Thin and thick lens engine's own fibers still use
Marcuse's Gaussian fit (Bell Syst. Tech. J. 56, 703 (1977)), checked here
too. This reference solves the exact weakly-guiding LP01 eigenvalue
equation (Gloge, Appl. Opt. 10, 2252 (1971))

  u J1(u) / J0(u) = w K1(w) / K0(w),   u^2 + w^2 = V^2,

with Bessel functions from their integral representations, builds the mode
field (J0 in the core, K0 in the cladding) and finds the Gaussian that
couples to it best, by maximizing the overlap. That is what Marcuse's fit
approximates, so the fit is checked against the physics, at its own
accuracy (about 1 %). The cutoff V = 2.405 is found here as the first zero
of J0, by bisection. The mode's far field is integrated directly from the
field and compared with the closed form the page uses.

The first part of the page. With the exact mode, the coupling of an ideal
lens's waist on the face, the lens that focuses the beam to the best
Gaussian, and the focal lengths that keep 95 %, found here by bisection on
the focal length itself.

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
def bessel_j(order, x, n=None):
    # 400 nodes, or more for large arguments, where the rule needs more
    # nodes than |x| to stay exact.
    n = n or max(400, int(1.5 * abs(x)) + 100)
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


_MODES = {}


def lp01_mode(V):
    """The exact LP01 mode at V (core radius 1): u, w, the radial integral
    over its tabulated field, and its overlap with a Gaussian of 1/e^2
    field radius s (in core radii) on the fiber face."""
    if V in _MODES:
        return _MODES[V]
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

    _MODES[V] = {"u": u, "w": w, "integrate": integrate, "power": power, "eta": eta}
    return _MODES[V]


def best_gaussian_radius(V):
    """The 1/e^2 field radius (in core radii) of the Gaussian that couples
    best to the exact LP01 mode, and that best coupling."""
    eta = lp01_mode(V)["eta"]
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


# The mode's far field, F(q) = integral of E(rho) J0(q rho) rho drho
# (q = k a sin(alpha)), normalized to F(0) = 1: by quadrature of the
# tabulated field, and in the closed form the page uses,
#   F(q) = V^2 [P J0(q) - q J1(q)] / ((u^2 - q^2)(w^2 + q^2)),  P = u J1(u)/J0(u),
# whose pole at q = u is removable (the limit is (P J1(u) + u J0(u)) / (2u)).
def far_field_numeric(V, q):
    """By Simpson's rule on its own grid, fine enough for J0(q rho): the
    core on 400 intervals, the cladding on steps of at most 0.2/q core radii
    out to where K0 has fallen by e^-40."""
    u = lp01_u(V)
    w = math.sqrt(V * V - u * u)
    j0u, k0w = bessel_j(0, u), bessel_k(0, w)
    out = max(12.0, 40.0 / w)
    step = min(0.01, 0.2 / max(q, 1e-9))
    n = 2 * math.ceil((out - 1) / step / 2)

    def both(g):
        core = simpson(lambda r: bessel_j(0, u * r) / j0u * g(r) * r, 0.0, 1.0, 400)
        return core + simpson(lambda r: bessel_k(0, w * r) / k0w * g(r) * r, 1.0, out, n)
    return both(lambda r: bessel_j(0, q * r)) / both(lambda r: 1.0)


def far_field_closed(V):
    u = lp01_u(V)
    w = math.sqrt(V * V - u * u)
    j0u, j1u = bessel_j(0, u), bessel_j(1, u)
    P = u * j1u / j0u
    f0 = V * V * P / (u * u * w * w)

    def F(q):
        if abs(q - u) < 1e-6:
            return (P * j1u + u * j0u) / (2 * u) / f0
        return V * V * (P * bessel_j(0, q) - q * bessel_j(1, q)) / ((u * u - q * q) * (w * w + q * q)) / f0
    return F


# The focused beam: a collimated TEM00 waist w_in at a thin lens of focal
# length f, by the ABCD law on q.
def focus(w_in_um, nm, f_mm):
    lam = nm * 1e-6
    q0 = 1j * math.pi * (w_in_um * 1e-3) ** 2 / lam
    q = q0 / (1 - q0 / f_mm)
    s = -q.real
    zr = (q + s).imag
    return math.sqrt(zr * lam / math.pi) * 1e3, s     # waist radius um, distance mm


# Fields carry exp(-ikz) (Kogelnik and Li): with q = dz + i z_R the factor
# exp(-ik x^2/(2q)) is a wavefront diverging past the waist, and a beam
# travelling toward +x at a small angle t carries exp(-ik t x).
def face_field(x, w_beam_um, dz_um, dx_um, tilt_mrad, nm):
    """The focused beam on the fiber face: waist w_beam, the face dz past
    the waist, centred at dx on the face, travelling at tilt toward +x."""
    lam = nm * 1e-3                                       # um
    k = 2 * math.pi / lam
    q = dz_um + 1j * math.pi * w_beam_um ** 2 / lam
    return cmath.exp(-1j * k * (x - dx_um) ** 2 / (2 * q) - 1j * k * tilt_mrad * 1e-3 * x)


def fresnel_propagate(field, xs, length_um, nm, out_xs):
    """Paraxial free-space propagation over length_um by direct summation
    of the Fresnel kernel exp(-ik (x - x')^2 / (2L)) in the same convention."""
    k = 2 * math.pi / (nm * 1e-3)
    h = xs[1] - xs[0]
    out = []
    for x in out_xs:
        terms = [u * cmath.exp(-1j * k * (x - xp) ** 2 / (2 * length_um)) for u, xp in zip(field, xs)]
        out.append(complex(math.fsum(t.real for t in terms), math.fsum(t.imag for t in terms)) * h)
    return out


def check_field_convention():
    """Pin the geometry of face_field by propagating it, not by algebra:
    (1) an untilted beam propagated L by the Fresnel kernel is the beam
    face_field describes L further on (so the kernel and the curvature term
    use one convention), and (2) a beam tilted by +t moves toward +x by tL."""
    nm, w, L, t = 1550, 5.0, 200.0, 30.0
    xs = [-150 + i * 0.25 for i in range(1201)]
    norm = lambda a, b: abs(sum(p * q.conjugate() for p, q in zip(a, b))) ** 2 / (sum(abs(p) ** 2 for p in a) * sum(abs(q) ** 2 for q in b))
    start = [face_field(x, w, 0, 0, 0, nm) for x in xs]
    far = fresnel_propagate(start, xs, L, nm, xs)
    match = norm(far, [face_field(x, w, L, 0, 0, nm) for x in xs])
    if not match > 1 - 1e-6:
        raise AssertionError(f"Fresnel kernel and beam curvature disagree: overlap {match}")
    tilted = fresnel_propagate([face_field(x, w, 0, 0, t, nm) for x in xs], xs, L, nm, xs)
    centre = sum(x * abs(u) ** 2 for x, u in zip(xs, tilted)) / sum(abs(u) ** 2 for u in tilted)
    if not abs(centre - t * 1e-3 * L) < 1e-3 * t * 1e-3 * L + 1e-6:
        raise AssertionError(f"a +{t} mrad tilt moved the beam to {centre} um after {L} um, not +{t * 1e-3 * L}")
    return match, centre


def overlap_1d(w_beam_um, w_mode_um, dz_um, dx_um, tilt_mrad, nm):
    """|∫ u g*|^2 / (∫|u|^2 ∫|g|^2) along one axis, by the trapezoid rule:
    u is the beam on the face (face_field), g the fiber mode exp(-x^2/w_mode^2)."""
    lam = nm * 1e-3                                       # um
    zr = math.pi * w_beam_um ** 2 / lam
    span = 12 * max(w_beam_um * math.sqrt(1 + (dz_um / zr) ** 2), w_mode_um) + abs(dx_um)
    n = 6000
    h = 2 * span / n
    terms_re, terms_im, terms_u, terms_g = [], [], [], []
    for i in range(n + 1):
        x = -span + i * h
        c = 0.5 if i in (0, n) else 1.0
        u = face_field(x, w_beam_um, dz_um, dx_um, tilt_mrad, nm)
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


SINGLE_MODE_V = 2.404825557695773


def setup_case(name, inputs):
    """The first part of the page: the exact LP01 mode, the ideal lens that
    focuses the beam to its best Gaussian, the coupling there and at a
    given focal length, and the focal lengths that keep 95 %, each found by
    bisection on the focal length itself."""
    nm, D = inputs["wavelengthNm"], inputs["beamDiameterMm"]
    if inputs["fiberMode"] == "mfd":
        V = J0_ZERO * inputs["cutoffNm"] / nm
        s_best, best = best_gaussian_radius(V)
        w_mode = inputs["mfdUm"] / 2
        a = w_mode / s_best
    else:
        a = inputs["coreDiameterUm"] / 2
        V = 2 * math.pi * a * inputs["na"] / (nm * 1e-3)
        s_best, best = best_gaussian_radius(V)
        w_mode = s_best * a
    eta = lp01_mode(V)["eta"]
    w_in = D * 1e3 / 2
    coupling = lambda f: eta(focus(w_in, nm, f)[0] / a)
    lo, hi = 1e-3, 1e5
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        lo, hi = (mid, hi) if focus(w_in, nm, mid)[0] < w_mode else (lo, mid)
    f_opt = math.sqrt(lo * hi)

    def edge(inside, outside):
        for _ in range(100):
            mid = math.sqrt(inside * outside)
            inside, outside = (mid, outside) if coupling(mid) >= 0.95 else (inside, mid)
        return math.sqrt(inside * outside)
    # The best Gaussian sits on a flat optimum: its radius, and everything
    # scaled by it (the core radius, a step-index fiber's mode radius, the
    # focal lengths and the couplings off the optimum), is known to about
    # 1e-8 and can move by that from one platform's maths library to
    # another's. Those are stored to 6 digits (checked to 1e-5); the
    # couplings at the optimum, flat there, to 8 (checked to 1e-6).
    flat = {"bestEfficiency": sig(best, 8), "matchEfficiency": sig(coupling(f_opt), 8)}
    scaled = {"optimalFocalMm": sig(f_opt, 6), "efficiencyAt": sig(coupling(inputs["focalMm"]), 6),
              ("coreDiameterUm" if inputs["fiberMode"] == "mfd" else "modeFieldDiameterUm"): sig(2 * a if inputs["fiberMode"] == "mfd" else 2 * w_mode, 6)}
    if best >= 0.95:
        scaled["rangeMinMm"] = sig(edge(f_opt, f_opt / 100), 6)
        scaled["rangeMaxMm"] = sig(edge(f_opt, f_opt * 100), 6)
    else:
        flat["rangeNone"] = 1
    expected = {"vNumber": sig(V), **flat, **scaled}
    return {"name": name, "inputs": {"kind": "setup", **inputs}, "expected": expected,
            "tolerance": {"vNumber": 1e-9, **{k: 1e-6 for k in flat}, **{k: 1e-5 for k in scaled}},
            "note": "the page: the same mode from the eigenvalue equation and the same face overlap, a golden-section best Gaussian, the matching focal length in closed form and the 95 % ends by bisection on the waist ratio"}


def cases():
    check_field_convention()
    out = []
    # The exact LP01 mode the page uses: u, its best Gaussian and that
    # coupling, and its far field against direct quadrature.
    for V, qs in ((1.2, ()), (1.6, ()), (J0_ZERO * 1260 / 1550, (0.5, None, 4.0)), (2.33, ()), (SINGLE_MODE_V, (0.5, None, 4.0)), (3.5, ()), (5.0, (0.5, None, 4.0))):
        u = lp01_u(V)
        s_best, best = best_gaussian_radius(V)
        qs = [u if q is None else q for q in qs]
        expected = {"u": sig(u, 10), "bestRatio": sig(s_best, 6), "bestEta": sig(best, 8)}
        expected.update({f"farField{i}": sig(far_field_numeric(V, q), 8) for i, q in enumerate(qs)})
        out.append({
            "name": f"exact LP01 mode at V = {V:.4f}: u, the best Gaussian and its coupling" + (", and the far field at q = " + ", ".join(f"{q:.4g}" for q in qs) if qs else ""),
            "inputs": {"kind": "lp01", "vNumber": V, "qs": qs},
            "expected": expected,
            # The best Gaussian sits on a flat optimum: its radius is known to
            # about 1e-8 (stored to 6 digits), its coupling far better.
            "tolerance": {**{k: 1e-7 for k in expected}, "bestRatio": 1e-5},
            "absolute": True,
            "note": "the far field by Simpson quadrature of the field times J0(q rho) here, by its closed form (the Lommel integrals and the eigenvalue equation) on the page, with rational approximations of J0 and J1 (about 1e-8)",
        })
    base_setup = {"wavelengthNm": 1550, "beamDiameterMm": 2.0, "fiberMode": "mfd", "mfdUm": 10.4, "cutoffNm": 1260, "focalMm": 11.0}
    out += [
        setup_case("the page's example: 1550 nm, 2 mm beam, MFD 10.4 um, cutoff 1260 nm (V = 1.955)", base_setup),
        setup_case("1064 nm, 5 mm beam, MFD 6.2 um, cutoff 980 nm", {**base_setup, "wavelengthNm": 1064, "beamDiameterMm": 5.0, "mfdUm": 6.2, "cutoffNm": 980, "focalMm": 25.0}),
        setup_case("1550 nm at the cutoff (V = 2.405)", {**base_setup, "cutoffNm": 1550}),
        setup_case("V = 4.5, multimode: coupling into LP01 only", {**base_setup, "cutoffNm": 2900}),
        setup_case("V = 1.24, far beyond the cutoff: no focal length keeps 95 %", {**base_setup, "cutoffNm": 800}),
        setup_case("step index, core 8.2 um, NA 0.14, 1550 nm", {**base_setup, "fiberMode": "step", "coreDiameterUm": 8.2, "na": 0.14}),
        setup_case("step index, core 3.5 um, NA 0.12, 633 nm, 0.8 mm beam", {**base_setup, "wavelengthNm": 633, "beamDiameterMm": 0.8, "fiberMode": "step", "coreDiameterUm": 3.5, "na": 0.12, "focalMm": 4.5}),
    ]
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
        coupling_case("633 nm, 0.8 mm beam, f 4.5 mm, core 3.5 um NA 0.12 (mode radius from the exact LP01 best Gaussian)", {**base, "wavelengthNm": 633, "beamDiameterMm": 0.8, "focalMm": 4.5, "fiberMode": "step", "coreDiameterUm": 3.5, "na": 0.12}),
    ]
    # Through the best-Gaussian optimum, known to about 1e-8.
    for key in ("matchEfficiency", "efficiency", "optimalFocalMm"):
        out[-1]["tolerance"][key] = 1e-5
    return out


MODEL = {
    "id": "fiber-coupling",
    "title": "Gaussian-beam coupling into a single-mode fiber, through its exact LP01 mode",
    "app": "calculators/fiber-coupling/lp01.js: lp01 (the exact mode, its best Gaussian, its far field in closed form); calculators/fiber-coupling/lens-choice.js: computeFiberSetup (the ideal lens into the exact mode, the 95 % range); calculators/fiber-coupling/fiber-coupling.js: computeFiberCoupling (the closed form for a Gaussian mode, focused beam by calculators/gaussian-beam/gaussian-beam.js: thinLensFocus) and fiberMode (Marcuse's fit)",
    "reference": "Exact weakly-guiding LP01 mode from its Bessel-function eigenvalue equation, best-coupling Gaussian by golden-section search on the overlap; the mode's far field by Simpson quadrature of its Hankel transform; focused beam by the ABCD law on q; coupling into a Gaussian mode by trapezoid quadrature of the overlap integral on the fiber face, into the exact mode by Simpson quadrature over the radius; matching focal length and the 95 % ends by bisection on the focal length",
    "citations": [
        "D. Gloge, Appl. Opt. 10, 2252-2258 (1971), doi:10.1364/AO.10.002252 (LP modes, eigenvalue equation, cutoff V = 2.405)",
        "D. Marcuse, Bell Syst. Tech. J. 56, 703-718 (1977), doi:10.1002/j.1538-7305.1977.tb00534.x (Gaussian approximation of the fundamental mode)",
        "H. Kogelnik and T. Li, Appl. Opt. 5, 1550-1567 (1966), doi:10.1364/AO.5.001550 (Gaussian beams, ABCD law)",
        "W. B. Joyce and B. C. DeLoach, Appl. Opt. 23, 4187-4196 (1984), doi:10.1364/AO.23.004187 (alignment of Gaussian beams: offset, tilt, defocus)",
    ],
    "provenance": "The eigenvalue equation and field written from Gloge's weakly-guiding analysis; the coupling as the normalized overlap integral of the two fields on the face, as in Kogelnik and in Joyce and DeLoach. Marcuse's fit and the page's closed-form overlap are not used here. The face field's geometry is pinned by propagation, not algebra: a Fresnel-kernel propagation of the beam reproduces its own q-parameter curvature, and a tilt of +t moves the beam toward +x by t per unit length.",
    "domain": "The exact mode at V 1.2-5 (its far field at V 1.955, 2.405 and 5, up to q = 4); the first part for fibers given by mode-field diameter and cutoff (V 1.24-4.5, 1064 and 1550 nm, 2-5 mm beams) and by core and NA (633 and 1550 nm); Marcuse's fit for step-index fibers with V 1.4-2.75 (633-1550 nm, one above the single-mode cutoff, cores 3.5-8.2 um, NA 0.12-0.14); the Gaussian closed form for collimated beams of 0.8-2 mm focused by 4.5-11 mm lenses, aligned, and with lateral offsets (on the fiber face) to 2 um, axial offsets to +/-30 um and tilts of either sign to 20 mrad in the plane of the offset, separately and together.",
    "convergence": "Bessel integrals by the trapezoid rule (400 and 800 nodes); 100- and 120-step bisections; mode overlaps by Simpson's rule on 200 core intervals and cladding steps of 0.01-0.25 core radii out to where the field has fallen by e^-40 (at least 12 core radii); the best Gaussian bracketed on a 61-point logarithmic scan from 0.3 to 30 core radii (it must fall inside) and refined by golden-section search to 80 steps; face overlaps by the trapezoid rule on 6000 intervals over 12 beam widths; focal-length bisection to 200 steps.",
    "tolerance_rationale": "1e-9 relative for the V number, cutoff and every Gaussian-mode coupling quantity computed from the same mode radius (algebra and spectrally accurate quadrature); 1e-6 relative on the couplings at the optimum (flat there, stored to 8 digits) and 1e-5 on the values scaled by the best Gaussian's radius, which sits on a flat optimum known to about 1e-8 and is stored to 6 digits so the file does not depend on the platform (matching focal lengths, couplings off the optimum, range ends, core and mode diameters, and that radius itself); 1e-7 absolute on u, the best coupling and the far field (the page evaluates the far field with rational approximations of J0 and J1, good to about 1e-8); 1 % on Marcuse's mode-field diameter, the fit's accuracy.",
    "outside_scope": "Declines a mode or beam diameter that is not positive, a non-positive focal length, and V outside 1.2-5, the range checked here (1.2-3.5 for Marcuse's fit in the Thin and thick lens engine). The reference finds the fit within 1 % of the exact mode's best Gaussian from V = 1.0 (-0.49 %) to about 4.0 (-0.72 %), and degrading below: -3.6 % at V = 0.9, -13 % at V = 0.8. Above 2.405 the fit still describes LP01, but the fiber is no longer single-mode, and the page says so.",
    "fidelity": "computed",
    "scope": "Paraxial scalar coupling of a TEM00 beam into the fundamental mode of an ideal weakly guiding step-index fiber (exact, or approximated as its best Gaussian for the closed forms); ideal thin lens; no Fresnel reflection, aberrations, polarization or cladding modes.",
}
