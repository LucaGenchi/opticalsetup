# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Thick spherical singlet cardinal points, Stokes polarization optics and
Fabry-Perot etalon relations.

Reference: ray-transfer (ABCD) matrices for the lens; Mueller matrices for
the retarder and analyzer; the Airy-function relations for the etalon,
with the inverse (reflectivity for a finesse) found by bisection rather
than by the closed form the app uses.
"""

import math

from common import sig
from sellmeier import index as glass_index


def thick_lens(r1, r2, thickness, n):
    """EFL and back focal distance from the system matrix M = R2 T R1."""
    def refraction(power):
        return [[1.0, 0.0], [-power, 1.0]]

    def translation(distance):
        return [[1.0, distance], [0.0, 1.0]]

    def mul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(2)) for j in range(2)] for i in range(2)]

    phi1 = (n - 1) / r1 if r1 else 0.0
    phi2 = (1 - n) / r2 if r2 else 0.0
    m = mul(refraction(phi2), mul(translation(thickness / n), refraction(phi1)))
    a, c = m[0][0], m[1][0]
    if abs(c) < 1e-12:
        return {"f": None, "bfd": None}
    return {"f": -1 / c, "bfd": -a / c}


def retarder_mueller(axis_deg, retardance_deg):
    """Goldstein's linear retarder with fast axis at theta and retardance
    delta, written so that a positive delta rotates the Stokes vector the
    same way the app's Rodrigues rotation does (the app's handedness
    convention is Goldstein's with delta -> -delta)."""
    t = 2 * math.radians(axis_deg)
    d = -math.radians(retardance_deg)
    c2, s2, cd, sd = math.cos(t), math.sin(t), math.cos(d), math.sin(d)
    return [
        [c2 * c2 + s2 * s2 * cd, c2 * s2 * (1 - cd), -s2 * sd],
        [c2 * s2 * (1 - cd), s2 * s2 + c2 * c2 * cd, c2 * sd],
        [s2 * sd, -c2 * sd, cd],
    ]


def apply(m, s):
    return [sum(m[i][j] * s[j] for j in range(3)) for i in range(3)]


def linear_stokes(angle_deg):
    return [math.cos(2 * math.radians(angle_deg)), math.sin(2 * math.radians(angle_deg)), 0.0]


def analyzer(stokes, axis_deg):
    t = 2 * math.radians(axis_deg)
    return 0.5 * (1 + stokes[0] * math.cos(t) + stokes[1] * math.sin(t))


def finesse(reflectivity):
    """The reflectivity finesse, pi sqrt(R) / (1 - R).

    This is the high-finesse approximation, and it is what the app inverts.
    It is exact only in the limit R -> 1; the Airy linewidth gives the exact
    finesse below.
    """
    return math.pi * math.sqrt(reflectivity) / (1 - reflectivity)


def airy_finesse(reflectivity):
    """The exact Airy finesse: FSR divided by the Airy linewidth.

    F = pi / (2 arcsin((1 - R) / (2 sqrt(R)))) for equal mirrors, which is the
    finesse a measured linewidth would give. At the app's nominal finesse 5
    this is 4.915, 1.7 % lower, and the two converge as R -> 1.
    Ismail et al., Opt. Express 24, 16366 (2016), Eq. (32).
    """
    return math.pi / (2 * math.asin((1 - reflectivity) / (2 * math.sqrt(reflectivity))))


def reflectivity_for_finesse(target):
    lo, hi = 0.0, 0.999999
    for _ in range(200):
        mid = (lo + hi) / 2
        if finesse(mid) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def cases():
    out = []
    for name, r1, r2, d, glass in (
        ("biconvex N-BK7 100/-100 x 5 mm", 100, -100, 5, "nbk7"),
        ("plano-convex N-BK7 51.7 mm", 51.7, 0, 4, "nbk7"),
        ("meniscus N-SF11 40/60 x 6 mm", 40, 60, 6, "nsf11"),
        ("thick biconvex silica 30/-30 x 12 mm", 30, -30, 12, "silica"),
    ):
        n = glass_index(glass, 0.5876)
        out.append({
            "name": name,
            "inputs": {"r1": r1, "r2": r2, "thickness": d, "glass": glass, "dia": 25.4, "wavelengthNm": 587.6},
            "expected": {k: sig(v) for k, v in thick_lens(r1, r2, d, n).items()},
            "tolerance": {"f": 1e-9, "bfd": 1e-9},
        })
    for axis, ret, pol in ((45, 90, 0), (0, 90, 30), (22.5, 180, 0), (10, 45, 60), (-30, 270, 90)):
        s = apply(retarder_mueller(axis, ret), linear_stokes(pol))
        out.append({
            "name": f"retarder axis {axis} deg, retardance {ret} deg, on linear {pol} deg",
            "inputs": {"axisDeg": axis, "retardanceDeg": ret, "inputAngleDeg": pol},
            "expected": {"s1": sig(s[0]), "s2": sig(s[1]), "s3": sig(s[2])},
            "tolerance": {"s1": 1e-9, "s2": 1e-9, "s3": 1e-9},
            "absolute": True,
        })
    for pol, axis in ((0, 0), (0, 90), (30, 60), (45, 0), (10, 80)):
        out.append({
            "name": f"analyzer at {axis} deg on linear {pol} deg (Malus)",
            "inputs": {"inputAngleDeg": pol, "axisDeg": axis},
            "expected": {"transmission": sig(analyzer(linear_stokes(pol), axis))},
            "tolerance": {"transmission": 1e-9},
            "absolute": True,
        })
    for target in (5, 19, 50, 200):
        r = reflectivity_for_finesse(target)
        out.append({
            "name": f"mirror reflectivity for finesse {target}",
            "inputs": {"finesse": target},
            "expected": {"reflectivity": sig(r), "finesse": sig(finesse(r))},
            "tolerance": {"reflectivity": 1e-8, "finesse": 1e-8},
            "note": "reflectivity finesse pi sqrt(R)/(1-R), the high-finesse approximation the app uses",
        })
    # What the same reflectivity means for a measured linewidth. This is not a
    # check of the app -- it is the size of the approximation, recorded so a
    # user reading "finesse 5" knows the Airy linewidth gives 4.92.
    for target in (5, 19, 50, 200):
        r = reflectivity_for_finesse(target)
        out.append({
            "name": f"exact Airy finesse at the reflectivity chosen for finesse {target}",
            "inputs": {"finesse": target, "quantity": "airy"},
            "expected": {"reflectivity": sig(r), "airyFinesse": sig(airy_finesse(r))},
            "tolerance": {"reflectivity": 1e-8, "airyFinesse": 1e-8},
            "note": f"approximation error at this reflectivity: {100 * (finesse(r) / airy_finesse(r) - 1):.2f} %",
        })
    # Circular and elliptical output, derived from Jones calculus rather than
    # read from the app's Mueller matrices. This is an algebraic check that the
    # app implements the convention it declares -- not an independent
    # experimental confirmation of which physical hand is called "left". The
    # derivation, written out because a bare vector of constants is not
    # checkable:
    #
    #   Field convention: E(t) = Re{J exp(-i omega t)}, propagation along +z,
    #   observed looking toward the source (the "from the receiver" view used
    #   by Goldstein and by the app).
    #   Stokes from Jones J = (Ex, Ey):
    #     S0 = |Ex|^2 + |Ey|^2,  S1 = |Ex|^2 - |Ey|^2,
    #     S2 = 2 Re(Ex conj(Ey)),  S3 = 2 Im(Ex conj(Ey)).
    #   A quarter-wave plate with its fast axis at theta is, in the lab frame,
    #     W = R(-theta) diag(1, i) R(theta),  R(a) = [[cos a, sin a], [-sin a, cos a]],
    #   i.e. the slow axis is retarded by delta = 90 deg.
    #   For theta = 45 deg on J = (1, 0):
    #     W J = (1/2)(1 + i, 1 - i),  Ex conj(Ey) = (1/4)(1+i)(1+i) = i/2,
    #     so S1 = S2 = 0 and S3 = 2 Im(i/2) = +1 in that convention.
    #   The app uses the opposite sign of the retardance (Goldstein with
    #   delta -> -delta). Its equivalent Jones matrix is therefore
    #     W_app = R(-theta) diag(1, -i) R(theta),
    #   which gives, on J = (1, 0):
    #     theta = +45 deg:   S = (0, 0, -1)
    #     theta = -45 deg:   S = (0, 0, +1)
    #     theta = 22.5 deg:  S = (1/2, 1/2, -1/sqrt(2))
    #   and on J = (0, 1) at +45 deg, S3 = +1. These are the values asserted.
    for axis, pol, name, expect in (
        (45, 0, "quarter-wave at 45 deg on linear 0 deg -> circular", (0.0, 0.0, -1.0)),
        (-45, 0, "quarter-wave at -45 deg on linear 0 deg -> circular, opposite hand", (0.0, 0.0, 1.0)),
        (45, 90, "quarter-wave at 45 deg on linear 90 deg -> circular, opposite hand", (0.0, 0.0, 1.0)),
        (22.5, 0, "quarter-wave at 22.5 deg on linear 0 deg -> elliptical", (0.5, 0.5, -1 / math.sqrt(2))),
    ):
        out.append({
            "name": name,
            "inputs": {"axisDeg": axis, "retardanceDeg": 90, "inputAngleDeg": pol},
            "expected": {"s1": sig(expect[0]), "s2": sig(expect[1]), "s3": sig(expect[2])},
            "tolerance": {"s1": 1e-9, "s2": 1e-9, "s3": 1e-9},
            "absolute": True,
            "note": "Jones-derived Stokes vector; Goldstein convention with delta -> -delta",
        })
    return out


MODEL = {
    "id": "paraxial",
    "title": "Thick singlet cardinal points, Stokes retarder and analyzer, etalon finesse",
    "app": "sketch/js/elements.js: thickLensCardinals; sketch/js/polarization.js: retarder, analyzerTransmission; sketch/js/etalon.js: reflectivityForFinesse, finesseForReflectivity",
    "reference": "ABCD system matrix; Goldstein Mueller matrices with Jones-derived circular cases; reflectivity finesse inverted by bisection, with the exact Airy finesse recorded alongside",
    "citations": [
        "E. Hecht, Optics, 5th ed., section 6.2 (thick lens cardinal points), section 8.13 (Stokes parameters and Mueller matrices)",
        "D. H. Goldstein, Polarized Light, 3rd ed. (CRC Press, 2011), ch. 6: Mueller matrices of retarders and polarizers. The app follows this convention with delta -> -delta, equivalent to the Jones matrix R(-theta) diag(1, -i) R(theta); the circular cases here are derived from that matrix by hand, an algebraic check of the declared convention rather than an experimental one.",
        "M. Born and E. Wolf, Principles of Optics, 7th ed., section 7.6 (Fabry-Perot), for the reflectivity finesse",
        "N. Ismail, C. C. Kores, D. Geskus and M. Pollnau, 'Fabry-Perot resonator: spectral line shapes, generic and related Airy distributions, linewidths, finesses, and performance at low or frequency-dependent reflectivity', Opt. Express 24, 16366-16389 (2016), doi:10.1364/OE.24.016366, Eq. (32) for the exact Airy finesse",
    ],
    "provenance": "Textbook closed forms, transcribed and evaluated here; the Airy finesse from Ismail et al. Eq. (32).",
    "domain": "Lens radii 30-100 mm with 4-12 mm centre thickness at 587.6 nm; retardances 45-270 deg on linear and circular input; finesse 5-200.",
    "convergence": "Closed forms, no discretisation. The finesse inversion bisects 200 times, far past double precision.",
    "tolerance_rationale": "1e-9 is agreement between two evaluations of the same algebra in different languages; 1e-8 on the finesse covers the bisection's own convergence.",
    "outside_scope": "No range gate. The finesse inversion accepts settings well below the high-finesse limit: at the minimum linewidth the etalon allows (finesse about 1.67, R about 0.19) the approximation is more than 10 % from the Airy value, and below R = 0.172 the Airy linewidth does not exist at all while the app still reports a finesse.",
    "fidelity": "computed",
    "scope": "Paraxial (Gaussian) optics for the lens; fully polarized Stokes vectors; lossless etalon mirrors of equal reflectivity.",
}
