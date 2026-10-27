# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Dispersion compensators as the dispersion compensation calculator reports
them: the GDD, TOD and FOD of a prism pair, a four-prism sequence, a grating
pair, a four-grating sequence and a grating stretcher; the separation that
brings the net GDD to a target; and the transmission.

The calculator's inputs are taken as given (the same dictionary its form
produces) and everything is rebuilt here from the sources, without the
JavaScript:

- Prism pair (Fork, Martinez and Gordon 1984): the phase between a wavefront
  before the first prism and one after the second is
  phi = (omega/c) (B - A) . u(omega), A and B the apexes, u the colour's
  direction between the prisms, turned from the input by the deviation
  delta = theta1 + asin(n sin(alpha - asin(sin theta1 / n))) - alpha.
  The apexes follow from the central ray: it enters the first prism at
  incidence theta1, crosses `insertion1Mm` of glass (law of sines in the apex
  triangle gives the depth along the face), travels `separationMm` to the
  second, inverted prism and crosses `insertion2Mm` there.
- Grating pair (Treacy 1969): phi = (omega/c) G cos beta,
  sin beta = lambda/d - sin gamma; Treacy's explicit
  GDD = -lambda^3 G / (2 pi c^2 d^2 cos^3 beta) is asserted on every case.
- Stretcher (Martinez 1987): a grating pair of separation
  (s1 + s2 - 2 f) cos beta0, s1 = s2 = s.
- A four-element sequence is two pairs, the second the mirror image of the
  first with the insertions in reverse order; a double pass doubles a pair.
- Chirp from a material: L d^2k/domega^2 (and higher orders) of
  k = n omega / c from the published Sellmeier forms (material_dispersion.py).
- Solve: each layout's phase is linear in its separation, so the separation
  for a target net GDD follows from two evaluations; the reference checks
  the linearity with a third.
- Fresnel: amplitude coefficients t_s, t_p and T = (n2 cos t)/(n1 cos i) t^2
  (Born and Wolf section 1.5.2) at each face's angle; by reciprocity a pair's
  four faces transmit T(theta1)^2 T(theta4)^2 from air.

Derivatives: central finite differences in angular frequency in 40-digit
decimals (seven-point stencils, h = 1e-4 omega0), where the app uses Taylor arithmetic for GDD and TOD and fourth
differences in double precision for FOD.
"""
from decimal import Decimal as D, getcontext

from common import sig
from material_dispersion import index as sellmeier_index
from ray_path_phase import _sin, _cos, PI

getcontext().prec = 40
C_NM_PER_FS = D("299.792458")
C_MM_PER_FS = C_NM_PER_FS / D(10) ** 6


def dec(x):
    return x if isinstance(x, D) else D(repr(x))


def asin(x):
    # Newton on sin(y) = x from a series start; no platform trigonometry.
    y = x
    for _ in range(60):
        step = (_sin(y) - x) / _cos(y)
        y -= step
        if abs(step) < D("1e-38"):
            break
    return y


def atan(x):
    # atan(x) = asin(x / sqrt(1 + x^2)).
    return asin(x / (1 + x * x).sqrt())


def rad(deg):
    return dec(deg) * PI / 180


def rot(v, a):
    c, s = _cos(a), _sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def omega_of(nm):
    return 2 * PI * C_NM_PER_FS / dec(nm)


def nm_of(omega):
    return 2 * PI * C_NM_PER_FS / omega


def derivatives(phi, w0):
    """GDD, TOD and FOD of phi at w0 (rad, fs)."""
    h2 = w0 * D("1e-4")
    f = {k: phi(w0 + k * h2) for k in (-3, -2, -1, 0, 1, 2, 3)}
    gdd = (2 * f[3] - 27 * f[2] + 270 * f[1] - 490 * f[0] + 270 * f[-1] - 27 * f[-2] + 2 * f[-3]) / (180 * h2 * h2)
    h = w0 * D("1e-4")
    g = {k: phi(w0 + k * h) for k in (-3, -2, -1, 0, 1, 2, 3)}
    tod = (-g[3] + 8 * g[2] - 13 * g[1] + 13 * g[-1] - 8 * g[-2] + g[-3]) / (8 * h ** 3)
    fod = (-g[3] + 12 * g[2] - 39 * g[1] + 56 * g[0] - 39 * g[-1] + 12 * g[-2] - g[-3]) / (6 * h ** 4)
    return gdd, tod, fod


# ------------------------------------------------------------------ prisms

def prism_angles(material, nm, theta1, alpha):
    n = sellmeier_index(material, dec(nm))
    t2 = asin(_sin(theta1) / n)
    t4 = asin(n * _sin(alpha - t2))
    return n, t2, t4, theta1 + t4 - alpha


def prism_pair_phase(v, glass1, glass2, separation):
    """The pair's phase function and its four face angles at lambda0. The
    input travels +x; the prism deviates toward +y (the canvas's choice;
    the sign of the deviation does not change the phase)."""
    material, nm = v["prismMaterial"], dec(v["wavelengthNm"])
    n0 = sellmeier_index(material, nm)
    if v["prismCut"] == "brewster":
        theta1 = atan(n0)
        alpha = PI - 2 * theta1
    else:
        theta1, alpha = rad(v["incidenceDeg"]), rad(v["apexDeg"])
    _, t2, t4, dev0 = prism_angles(material, nm, theta1, alpha)
    t3 = alpha - t2
    # First prism: the ray meets its entrance face at theta1. Taking the
    # face normal at angle pi + theta1 from +x (pointing back at the ray) and
    # the apex toward -y, the face runs from the apex along
    # (sin theta1, cos theta1)... in the prism's own terms: the entrance face
    # makes the angle (pi/2 - theta1) with the ray.
    face1 = rot((D(0), D(1)), theta1)              # apex -> base along the entrance face
    # The apex lies `depth1` back along that face from the entry point.
    depth1 = dec(glass1) * _cos(alpha - t2) / _sin(alpha)
    hit1 = (D(0), D(0))
    A = (hit1[0] - depth1 * face1[0], hit1[1] - depth1 * face1[1])
    # Inside, the ray turns by theta1 - t2 toward the base.
    inside = rot((D(1), D(0)), theta1 - t2)
    exit1 = (hit1[0] + dec(glass1) * inside[0], hit1[1] + dec(glass1) * inside[1])
    out = rot((D(1), D(0)), dev0)
    hit2 = (exit1[0] + dec(separation) * out[0], exit1[1] + dec(separation) * out[1])
    # Second prism: inverted, faces parallel to the first's; its entrance
    # face is parallel to the first's exit face, which runs from the apex at
    # the angle alpha from the entrance face (turned the other way).
    face2 = rot(face1, -alpha)                     # first prism's exit face, apex -> base
    face2 = (-face2[0], -face2[1])                 # the inverted prism's entrance face, apex -> base
    depth2 = dec(glass2) * _cos(t2) / _sin(alpha)
    B = (hit2[0] - depth2 * face2[0], hit2[1] - depth2 * face2[1])
    ab = (B[0] - A[0], B[1] - A[1])

    def phi(omega):
        _, _, _, dev = prism_angles(material, nm_of(omega), theta1, alpha)
        return omega / C_MM_PER_FS * (ab[0] * _cos(dev) + ab[1] * _sin(dev))
    return phi, {"n0": n0, "theta1": theta1, "t3": t3, "t4": t4}


def fresnel_air_to_glass(n, theta):
    ci, si = _cos(theta), _sin(theta)
    st = si / n
    ct = (1 - st * st).sqrt()
    ts = 2 * ci / (ci + n * ct)
    tp = 2 * ci / (n * ci + ct)
    factor = n * ct / ci
    return factor * ts * ts, factor * tp * tp


# --------------------------------------------------------------- gratings

def grating_phase(v, separation):
    lines, gamma = dec(v["lines"]), rad(v["gratingIncidenceDeg"])

    def beta_sin(omega):
        return nm_of(omega) * lines / D(10) ** 6 - _sin(gamma)

    if v["layout"] == "stretcher":
        sb0 = beta_sin(omega_of(v["wavelengthNm"]))
        G = (2 * dec(separation) - 2 * dec(v["focalMm"])) * (1 - sb0 * sb0).sqrt()
        pairs = 1
    else:
        G = dec(separation)
        pairs = 2 if v["layout"] == "four-grating" else 1
    passes = int(v["passes"]) if v["layout"] in ("grating-pair", "stretcher") else 1

    def phi(omega):
        sb = beta_sin(omega)
        return omega / C_MM_PER_FS * G * (1 - sb * sb).sqrt() * pairs * passes
    # Treacy's explicit GDD for the same bench.
    lam = dec(v["wavelengthNm"]) / D(10) ** 6           # mm
    d = 1 / lines                                        # mm
    sb = beta_sin(omega_of(v["wavelengthNm"]))
    cb = (1 - sb * sb).sqrt()
    treacy = -(lam ** 3) * G / (2 * PI * C_MM_PER_FS ** 2 * d * d * cb ** 3) * pairs * passes
    return phi, treacy


# ------------------------------------------------------------------ bench

SOLVED = {"prism-pair": "separationMm", "four-prism": "separationMm", "grating-pair": "gratingSeparationMm",
          "four-grating": "gratingSeparationMm", "stretcher": "gratingLensMm"}


def compensator(v, separation):
    if v["layout"] in ("prism-pair", "four-prism"):
        a, angles = prism_pair_phase(v, v["insertion1Mm"], v["insertion2Mm"], separation)
        if v["layout"] == "four-prism":
            b, _ = prism_pair_phase(v, v["insertion2Mm"], v["insertion1Mm"], separation)
            return (lambda w: a(w) + b(w)), angles, None
        passes = int(v["passes"])
        return (lambda w: a(w) * passes), angles, None
    phi, treacy = grating_phase(v, separation)
    return phi, None, treacy


def chirp(v, w0):
    if v["chirp"] == "none":
        return D(0)
    if v["chirp"] == "gdd":
        return dec(v["inputGddFs2"])

    def phi(omega):
        return sellmeier_index(v["chirpMaterial"], nm_of(omega)) * omega / C_MM_PER_FS * dec(v["chirpLengthMm"])
    return derivatives(phi, w0)[0]


def evaluate(v):
    w0 = omega_of(v["wavelengthNm"])
    key = SOLVED[v["layout"]]
    out = {}
    if v["solve"] == "target":
        a, b, c = D(100), D(200), D(300)
        ga, gb, gc = (derivatives(compensator(v, x)[0], w0)[0] for x in (a, b, c))
        # Linear in the separation: the third point lies on the line.
        assert abs((gc - gb) - (gb - ga)) < D("1e-12") * (abs(ga) + abs(gb)), (v["layout"], ga, gb, gc)
        slope = (gb - ga) / (b - a)
        separation = a + (dec(v["targetGddFs2"]) - chirp(v, w0) - ga) / slope
        out["separationMm"] = separation
    else:
        separation = dec(v[key])
    phi, angles, treacy = compensator(v, separation)
    gdd, tod, fod = derivatives(phi, w0)
    if treacy is not None:
        assert abs(gdd / treacy - 1) < D("1e-12"), (gdd, treacy)
    out.update({"gddFs2": gdd, "todFs3": tod, "fodFs4": fod})
    if angles:
        Ts1, Tp1 = fresnel_air_to_glass(angles["n0"], angles["theta1"])
        Ts4, Tp4 = fresnel_air_to_glass(angles["n0"], angles["t4"])
        per_pair = (Ts1 * Ts4) ** 2 if v["polarization"] == "s" else (Tp1 * Tp4) ** 2
        pairs = 2 if v["layout"] == "four-prism" else int(v["passes"])
        out["transmission"] = per_pair ** pairs
    else:
        diffractions = 2 * (1 if v["layout"] == "stretcher" else 2 if v["layout"] == "four-grating" else 1)
        diffractions *= int(v["passes"]) if v["layout"] in ("grating-pair", "stretcher") else 1
        out["transmission"] = (dec(v["efficiencyPct"]) / 100) ** diffractions
    return out


# ------------------------------------------------------------------ cases
# The calculator's example benches, as its form submits them, and three
# benches set by hand.
PULSE = {"bandwidthNm": 30, "shape": "gauss", "beamDiameterMm": 2}
PRISM = {"prismCut": "brewster", "apexDeg": 60, "incidenceDeg": 55, "prismSizeMm": 25.4, "pairGapMm": 100, "polarization": "p"}
GRATING = {"focalMm": 500, "gratingLensMm": 200, "lensDiameterMm": 100, "gratingSizeMm": 160, "efficiencyPct": 92}
BENCHES = [
    ("prism pair, double pass: fused silica, 10 mm of N-BK7 to cancel", {
        **PULSE, **PRISM, "layout": "prism-pair", "passes": "2", "solve": "target", "targetGddFs2": 0, "wavelengthNm": 800,
        "chirp": "material", "chirpMaterial": "nbk7", "chirpLengthMm": 10, "prismMaterial": "silica",
        "separationMm": 600, "insertion1Mm": 3, "insertion2Mm": 12}),
    ("four N-SF10 prisms: 30 mm of N-BK7 to cancel", {
        **PULSE, **PRISM, "layout": "four-prism", "solve": "target", "targetGddFs2": 0, "wavelengthNm": 800,
        "chirp": "material", "chirpMaterial": "nbk7", "chirpLengthMm": 30, "prismMaterial": "nsf10",
        "separationMm": 160, "insertion1Mm": 3, "insertion2Mm": 5}),
    ("prism pair set by hand: 60 deg N-SF11 prisms at 50 deg, s-polarized, single pass", {
        **PULSE, **PRISM, "layout": "prism-pair", "passes": "1", "solve": "manual", "targetGddFs2": 0, "wavelengthNm": 1030,
        "chirp": "none", "prismMaterial": "nsf11", "prismCut": "custom", "apexDeg": 60, "incidenceDeg": 50,
        "polarization": "s", "separationMm": 450, "insertion1Mm": 4, "insertion2Mm": 8}),
    ("grating pair, double pass: 1200 lines/mm at 45 deg, entered chirp", {
        **PULSE, **GRATING, "layout": "grating-pair", "passes": "2", "solve": "target", "targetGddFs2": 0, "wavelengthNm": 800,
        "chirp": "gdd", "inputGddFs2": 1e6, "inputTodFs3": -1.6046e6, "inputFodFs4": 4.002e6, "lines": 1200,
        "gratingIncidenceDeg": 45, "gratingSeparationMm": 300}),
    ("four 1000 lines/mm gratings at 1030 nm: 20 m of fused silica to cancel", {
        **PULSE, **GRATING, "layout": "four-grating", "solve": "target", "targetGddFs2": 0, "wavelengthNm": 1030,
        "bandwidthNm": 8, "shape": "sech2", "chirp": "material", "chirpMaterial": "silica", "chirpLengthMm": 20000,
        "lines": 1000, "gratingIncidenceDeg": 45, "gratingSeparationMm": 100, "gratingSizeMm": 50}),
    ("grating pair set by hand: 1500 lines/mm at 50 deg, 1030 nm, single pass", {
        **PULSE, **GRATING, "layout": "grating-pair", "passes": "1", "solve": "manual", "targetGddFs2": 0, "wavelengthNm": 1030,
        "bandwidthNm": 10, "chirp": "none", "lines": 1500, "gratingIncidenceDeg": 50, "gratingSeparationMm": 200,
        "gratingSizeMm": 100, "efficiencyPct": 95}),
    ("grating stretcher: 1200 lines/mm, f = 500 mm, solved for +1e6 fs^2", {
        **PULSE, **GRATING, "layout": "stretcher", "passes": "1", "solve": "target", "targetGddFs2": 1e6, "wavelengthNm": 800,
        "chirp": "none", "lines": 1200, "gratingIncidenceDeg": 45}),
]


def cases():
    out = []
    for name, v in BENCHES:
        r = evaluate(v)
        expected = {k: sig(float(x)) for k, x in r.items()}
        tolerance = {k: 1e-9 for k in r}
        tolerance["fodFs4"] = 2e-3
        out.append({
            "name": name,
            "inputs": v,
            "expected": expected,
            "tolerance": tolerance,
            "note": ("GDD, TOD, the solved separation and the transmission to 1e-9 (closed forms in both programs; "
                     "the app in double precision). FOD to 2e-3: the app takes it from fourth differences of its "
                     "double-precision phase, about 1 fs^4 of rounding on phases of 10^7 rad."),
        })
    return out


MODEL = {
    "id": "dispersion-compensation",
    "title": "Dispersion compensators: GDD, TOD and FOD of prism and grating layouts, the solved separation and the transmission",
    "app": "calculators/dispersion-compensation/compressor-calculator.js: computeCompressor (compressor-model.js: phaseJet, dispersionAt, throughput)",
    "reference": "The calculator's inputs rebuilt from the sources in 40-digit decimals: apex geometry and Fork-Martinez-Gordon phase for prisms, Treacy's plane-wave phase for gratings (his explicit GDD asserted), Martinez's equivalent pair for the stretcher, Fresnel amplitude coefficients; derivatives by seven-point finite differences",
    "citations": [
        "R. L. Fork, O. E. Martinez and J. P. Gordon, Opt. Lett. 9, 150 (1984), doi:10.1364/OL.9.000150",
        "E. B. Treacy, IEEE J. Quantum Electron. 5, 454-458 (1969), doi:10.1109/JQE.1969.1076303",
        "O. E. Martinez, IEEE J. Quantum Electron. 23, 59-64 (1987), doi:10.1109/JQE.1987.1073201",
        "M. Born and E. Wolf, Principles of Optics, 7th ed., section 1.5.2 (Fresnel formulae)",
    ],
    "fidelity": "computed",
    "scope": "Plane waves along the central ray; prisms of the canvas's glass catalogue, Brewster-cut or set by hand; reflective gratings in order -1; ideal thin lenses to paraxial order in the stretcher",
    "outside_scope": "Beam size, diffraction, grating efficiency curves, absorption and mirror losses",
    "provenance": "Sellmeier forms from material_dispersion.py (SCHOTT catalogue, Malitson); geometry and phase written from the cited papers.",
    "domain": "800 and 1030 nm; 8-30 nm FWHM; fused silica, N-SF10 and N-SF11 prisms, Brewster-cut and 60 deg at 50 deg incidence, p and s; 1000-1500 lines/mm gratings at 45-50 deg, single and double pass; a 1200 lines/mm stretcher with f = 500 mm; chirps from N-BK7, fused silica and entered GDD.",
    "convergence": "Seven-point central differences in 40-digit arithmetic at h = 1e-4 omega0: truncation of order (h/omega0)^4 ~ 1e-16 relative for GDD and TOD and (h/omega0)^2 ~ 1e-8 for FOD; round-off below 1e-18.",
    "tolerance_rationale": "1e-9 where both sides evaluate closed forms (the app in double precision); 2e-3 for FOD, which the app takes from fourth differences in double precision.",
}
