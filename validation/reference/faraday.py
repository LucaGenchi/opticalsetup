# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Faraday rotation and the physical optical isolator (docs/physics/faraday.md,
step P2 of the Physics in 2D track).

Written from the physics, not from the JavaScript:

- Faraday rotation: theta = V B L, a turn of the polarization about the
  field's direction, right-handed for V > 0, whatever way the light
  travels. In the frame of light travelling against the field the turn has
  the opposite sign. V(lambda) for TGG is Vojna et al.'s Eq. (13),
  |V| = F l0^2/(l^2 - l0^2) + G with their Table 2 (F = 820.3 rad/(T m),
  G = -6.2 rad/(T m), l0 = 239.3 nm), negative (Slezak et al. 2016); the
  catalogue's values themselves are checked in crystal_catalogue.py.
- The Faraday mirror (M. Martinelli, Opt. Commun. 72, 341 (1989)): light
  that crosses a reciprocal element W, a Faraday rotator, a mirror and both
  again returns, in fixed laboratory axes with the mirror as the identity,
  as W^T R(theta) R(theta) W, because the reciprocal element is crossed
  back as its transpose (R. J. Potton, Rep. Prog. Phys. 67, 717 (2004))
  while the Faraday turn keeps its sense about the field. For theta = 45
  degrees, M^T R(90) M = det(M) R(90) for any 2x2 M, so the light returns
  orthogonal to how it left, whatever W is. The cases give the fraction of
  light that leaves p-polarized and returns s-polarized, the fraction a
  polarizing beamsplitter sends to its return port, for a quarter-wave and
  a half-wave plate at several angles, with and without the rotator; without
  it the quarter-wave plate's round trip is a half-wave plate at a, so the
  fraction is sin^2(2a).
- The physical isolator: an input polarizer at a, a rotator turning forward
  light by 45 degrees at the design wavelength (so by 45 V(l)/V(ld) at l),
  and an output polarizer at a + 45 degrees. With ideal polarizers forward
  light along the input polarizer passes cos^2(delta) and light returning
  along the output polarizer leaks back sin^2(delta), delta = theta - 45.
  With polarizers that pass a fraction 1/ER across their axis the leak is
  computed here with Jones matrices of partial polarizers (amplitude
  transmissions 1 and sqrt(1/ER)) in laboratory axes, an implementation
  independent of the app's Mueller matrices.

Tolerances: 1e-9 for closed forms and matrix products.
"""

import cmath
import math

from common import sig

F, G, L0 = 820.3, -6.2, 239.3  # Vojna et al., Table 2 (TGG, sample NG6, 295 K)


def verdet_tgg(nm):
    return -(F * L0 * L0 / (nm * nm - L0 * L0) + G)


def rot(deg):
    """Turns the field from x towards y by deg (laboratory axes)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [[c, -s], [s, c]]


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(2)) for j in range(2)] for i in range(2)]


def transpose(a):
    return [[a[j][i] for j in range(2)] for i in range(2)]


def apply(m, v):
    return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]]


def retarder(axis_deg, retardance_deg):
    """Linear retarder, fast axis at axis_deg from x, the slow axis delayed."""
    d = cmath.exp(1j * math.radians(retardance_deg))
    core = [[1, 0], [0, d]]
    return mul(mul(rot(axis_deg), core), rot(-axis_deg))


def partial_polarizer(axis_deg, leak):
    """Amplitude transmission 1 along the axis and sqrt(leak) across it."""
    core = [[1, 0], [0, math.sqrt(leak)]]
    return mul(mul(rot(axis_deg), core), rot(-axis_deg))


def power(v):
    return abs(v[0]) ** 2 + abs(v[1]) ** 2


def faraday_mirror_return(axis_deg, retardance_deg, faraday_deg):
    """Fraction of p light returning s-polarized after W, a rotator, a mirror,
    the rotator and W again (laboratory axes, mirror as the identity)."""
    w = retarder(axis_deg, retardance_deg)
    f = rot(faraday_deg)
    round_trip = mul(mul(mul(transpose(w), f), f), w)
    out = apply(round_trip, [1, 0])
    return abs(out[1]) ** 2 / power(out)


def isolator(design_nm, nm, extinction_db, input_axis_deg=0.0):
    """Forward transmission of light along the input polarizer, and the
    transmission back of light along the output polarizer."""
    theta = 45.0 * verdet_tgg(nm) / verdet_tgg(design_nm)
    leak = 10 ** (-extinction_db / 10)
    p_in = partial_polarizer(input_axis_deg, leak)
    p_out = partial_polarizer(input_axis_deg + 45, leak)
    # Laboratory axes: the Faraday turn is the same matrix both ways; the
    # polarizers are reciprocal (symmetric matrices).
    f = rot(theta)
    a = math.radians(input_axis_deg)
    forward = power(apply(mul(mul(p_out, f), p_in), [math.cos(a), math.sin(a)]))
    b = math.radians(input_axis_deg + 45)
    backward = power(apply(mul(mul(transpose(p_in), f), transpose(p_out)), [math.cos(b), math.sin(b)]))
    return theta, forward, backward


def cases():
    out = []
    # Rotation: V B L, with the sign of the direction of travel relative to
    # the field.
    for nm, field_t, length_mm, along in ((632, 1.0, 20.0, True), (1064, 1.0, 20.0, True), (1064, 1.0, 20.0, False),
                                          (800, 0.5, 30.0, True), (1064, 1.0, 20.941912, True)):
        deg = math.degrees(verdet_tgg(nm) * field_t * length_mm / 1000) * (1 if along else -1)
        out.append({
            "name": f"TGG rotator, {field_t} T, {length_mm} mm, {nm} nm, light {'along' if along else 'against'} the field",
            "inputs": {"kind": "rotation", "material": "tgg", "fieldT": field_t, "lengthMm": length_mm, "wavelengthNm": nm, "along": along},
            "expected": {"rotationDeg": sig(deg, 12)},
            "tolerance": {"rotationDeg": 1e-9},
            "absolute": True,
            "note": "theta = V B L, the turn about the field; negative V (TGG) turns light along the field to lower azimuth",
        })
    out.append({
        "name": "custom Verdet constant +3.8 rad/(T m), 2 T, 50 mm, light along the field",
        "inputs": {"kind": "rotation", "material": "custom", "verdetCustom": 3.8, "fieldT": 2.0, "lengthMm": 50.0, "wavelengthNm": 1550, "along": True},
        "expected": {"rotationDeg": sig(math.degrees(3.8 * 2.0 * 0.05), 12)},
        "tolerance": {"rotationDeg": 1e-9},
        "absolute": True,
        "note": "a custom constant is the same at every wavelength",
    })
    # The Faraday mirror, traced end to end by the app.
    for retardance, axis, faraday in ((90, 0, 0), (90, 10, 0), (90, 22, 0), (90, 37, 0), (90, 60, 0),
                                      (90, 10, 45), (90, 37, 45), (180, 30, 45), (73, 12, 45), (180, 30, 22.5)):
        frac = faraday_mirror_return(axis, retardance, faraday)
        if faraday == 45:
            assert abs(frac - 1) < 1e-12, frac
        if faraday == 0 and retardance == 90:
            assert abs(frac - math.sin(math.radians(2 * axis)) ** 2) < 1e-12, frac
        out.append({
            "name": f"Faraday mirror: retarder {retardance} deg at {axis} deg, rotator {faraday} deg per pass, return to the polarizing beamsplitter's return port",
            "inputs": {"kind": "faraday-mirror", "retardanceDeg": retardance, "axisDeg": axis, "faradayDeg": faraday},
            "expected": {"returnFraction": sig(frac, 12)},
            "tolerance": {"returnFraction": 1e-9},
            "absolute": True,
            "note": "W^T R(theta)^2 W in laboratory axes (Martinelli 1989); 1 whatever W for 45 deg per pass",
        })
    # The physical isolator.
    for design, nm, er in ((1064, 1064, 40), (1064, 1000, 40), (800, 780, 40), (800, 830, 30), (800, 800, 30),
                           (800, 760, 200), (1064, 900, 200)):
        theta, forward, backward = isolator(design, nm, er)
        if er >= 200:
            delta = math.radians(theta - 45)
            assert abs(forward - math.cos(delta) ** 2) < 1e-12 and abs(backward - math.sin(delta) ** 2) < 1e-12
        out.append({
            "name": f"isolator designed at {design} nm, light at {nm} nm, polarizers {er} dB",
            "inputs": {"kind": "isolator", "material": "tgg", "designWl": design, "wavelengthNm": nm, "extinctionDb": er, "inputAxis": 0},
            "expected": {"rotationDeg": sig(theta, 12), "forward": sig(forward, 12), "backward": sig(backward, 12)},
            "tolerance": {"rotationDeg": 1e-9, "forward": 1e-9, "backward": 1e-9},
            "absolute": True,
            "note": "cos^2(delta) and sin^2(delta) with ideal polarizers (200 dB here); partial polarizers otherwise",
        })
    return out


MODEL = {
    "id": "faraday",
    "title": "Faraday rotator, Faraday mirror and physical optical isolator",
    "app": "sketch/js/faraday.js: rotationForCrossingDeg, isolatorFigures; sketch/js/raytrace.js: the 'faraday' surface traced through a polarizing beamsplitter, a waveplate and a mirror",
    "reference": "theta = V B L with Vojna's TGG model; Jones matrices in laboratory axes for the Faraday mirror and the isolator's partial polarizers",
    "citations": [
        "D. Vojna, O. Slezak, A. Lucianetti and T. Mocek, 'Verdet constant of magneto-active materials developed for high-power Faraday devices,' Appl. Sci. 9, 3160 (2019), Eq. (13) and Table 2 (CC BY 4.0)",
        "M. Martinelli, 'A universal compensator for polarization changes induced by birefringence on a retracing beam,' Opt. Commun. 72, 341-344 (1989)",
        "R. J. Potton, 'Reciprocity in optics,' Rep. Prog. Phys. 67, 717-754 (2004)",
    ],
    "fidelity": "computed",
    "scope": "The rotation of a thin Faraday element for light along or against its field; the round trip through a retarder, a Faraday rotator and a mirror, traced by the app; the forward transmission and back leakage of a polarizer-rotator-polarizer isolator with partial polarizers.",
    "outside_scope": "The rotator's index, length, path delay, dispersion and surface reflections; temperature; a Verdet constant outside 500-1100 nm for TGG; a broadband ray's polarization, which carries the turn at its centre wavelength (the isolator weighs each wavelength of the spectrum).",
    "provenance": "The TGG model is evaluated here from Vojna's printed parameters; the Faraday mirror and isolator are matrix products written here in laboratory axes, a convention independent of the app's ray-frame basis.",
    "domain": "Six rotation cases; ten Faraday-mirror cases (quarter-wave, half-wave and 73 degree retarders, 0, 22.5 and 45 degrees per pass); seven isolator cases.",
    "convergence": "Closed forms and 2x2 matrix products; no discretisation.",
    "tolerance_rationale": "1e-9: closed forms and matrix products, evaluated in double precision on both sides.",
}
