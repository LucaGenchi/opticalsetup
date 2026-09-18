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
    return math.pi * math.sqrt(reflectivity) / (1 - reflectivity)


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
        })
    return out


MODEL = {
    "id": "paraxial",
    "title": "Thick singlet cardinal points, Stokes retarder and analyzer, etalon finesse",
    "app": "sketch/js/elements.js: thickLensCardinals; sketch/js/polarization.js: retarder, analyzerTransmission; sketch/js/etalon.js: reflectivityForFinesse, finesseForReflectivity",
    "reference": "ABCD system matrix; Goldstein Mueller matrices; Airy finesse inverted by bisection",
    "citations": [
        "E. Hecht, Optics, 5th ed., section 6.2 (thick lens), section 8.13 (Stokes parameters and Mueller matrices)",
        "D. H. Goldstein, Polarized Light, 3rd ed., ch. 6 (Mueller matrices of retarders and polarizers)",
        "M. Born and E. Wolf, Principles of Optics, section 7.6 (Fabry-Perot finesse)",
    ],
    "fidelity": "computed",
    "scope": "Paraxial (Gaussian) optics for the lens; fully polarized Stokes vectors; lossless etalon mirrors of equal reflectivity.",
}
