# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fresnel power transmission at an uncoated, lossless dielectric interface,
and the Stokes vector it leaves (docs/physics/prism-fresnel.md).

Written from the textbook amplitude coefficients (Born and Wolf, §1.5.2;
Hecht, §4.6.2), not from the JavaScript:

    t_s = 2 n1 cos(i) / (n1 cos(i) + n2 cos(t))
    t_p = 2 n1 cos(i) / (n2 cos(i) + n1 cos(t))
    T   = (n2 cos(t)) / (n1 cos(i)) |t|^2

where the app uses T = 1 - |r|^2: the two agree only if the bookkeeping of
the obliquity factor is right. The Stokes vector after the face follows from
the Jones matrix diag(t_p', t_s') with t' the intensity-normalized
amplitudes, worked out here as Jones vectors rather than through the app's
Mueller form.

Analytic limits checked inside cases(): normal incidence T = 4 n1 n2 /
(n1 + n2)^2 for both polarizations, and T_p = 1 at Brewster's angle from
either side.

Arithmetic: 40-digit decimals; the formulas are closed form, so the
tolerance is double-precision agreement (1e-12).
"""
from decimal import Decimal as D, getcontext
import math

from common import sig

getcontext().prec = 40


def transmittances(n1, n2, incidence_deg):
    n1, n2 = D(repr(n1)), D(repr(n2))
    i = D(repr(math.radians(incidence_deg)))
    # cos and sin by series would be overkill: float trig is exact to 1e-16,
    # far below the 1e-12 tolerance; Decimal keeps the algebra clean.
    ci, si = D(repr(math.cos(float(i)))), D(repr(math.sin(float(i))))
    st = n1 * si / n2
    if st >= 1:
        return None
    ct = (1 - st * st).sqrt()
    ts = 2 * n1 * ci / (n1 * ci + n2 * ct)
    tp = 2 * n1 * ci / (n2 * ci + n1 * ct)
    factor = (n2 * ct) / (n1 * ci)
    return float(factor * ts * ts), float(factor * tp * tp)


def stokes_after(Ts, Tp, azimuth_deg, ellipticity_deg=0.0):
    """Pure input state (azimuth from p, ellipticity angle chi), as a Jones
    vector; returns transmitted fraction and the output Stokes vector."""
    a, chi = math.radians(azimuth_deg), math.radians(ellipticity_deg)
    # Jones vector (E_p, E_s) for azimuth a and ellipticity chi.
    ep = complex(math.cos(a) * math.cos(chi), -math.sin(a) * math.sin(chi))
    es = complex(math.sin(a) * math.cos(chi), math.cos(a) * math.sin(chi))
    op, os_ = ep * math.sqrt(Tp), es * math.sqrt(Ts)
    total = abs(op) ** 2 + abs(os_) ** 2
    s1 = (abs(op) ** 2 - abs(os_) ** 2) / total
    s2 = 2 * (op * os_.conjugate()).real / total
    s3 = -2 * (op * os_.conjugate()).imag / total
    return total, s1, s2, s3


def cases():
    out = []
    # Normal incidence and Brewster limits.
    for n1, n2 in ((1.0, 1.5), (1.0, 1.7112), (1.4533, 1.0)):
        Ts, Tp = transmittances(n1, n2, 0.0)
        limit = 4 * n1 * n2 / (n1 + n2) ** 2
        assert abs(Ts - limit) < 1e-14 and abs(Tp - limit) < 1e-14
        theta_b = math.degrees(math.atan(n2 / n1))
        assert abs(transmittances(n1, n2, theta_b)[1] - 1) < 1e-14
    for n1, n2, angle in ((1.0, 1.5, 0.0), (1.0, 1.5, 30.0), (1.0, 1.5, 56.30993247402), (1.0, 1.5, 80.0),
                          (1.0, 1.7112, 59.6964), (1.7112, 1.0, 30.3036), (1.4533, 1.0, 40.0),
                          (1.0, 1.4533, 55.469), (1.4533, 1.0, 43.0)):
        r = transmittances(n1, n2, angle)
        Ts, Tp = r
        out.append({
            "name": f"n {n1} to {n2} at {angle} deg",
            "inputs": {"kind": "transmittance", "n1": n1, "n2": n2, "incidenceDeg": angle},
            "expected": {"Ts": sig(Ts, 14), "Tp": sig(Tp, 14)},
            "tolerance": {"Ts": 1e-12, "Tp": 1e-12},
        })
    # Polarization through a face: s, p, 45 deg linear, circular, and an
    # elliptical state, at the N-SF10 Brewster face and off Brewster.
    for n1, n2, angle in ((1.0, 1.7112, 59.6964), (1.0, 1.5, 30.0)):
        Ts, Tp = transmittances(n1, n2, angle)
        for az, chi in ((0, 0), (90, 0), (45, 0), (0, 45), (30, 10)):
            T, s1, s2, s3 = stokes_after(Ts, Tp, az, chi)
            out.append({
                "name": f"state az {az} chi {chi} through n {n1} to {n2} at {angle} deg",
                "inputs": {"kind": "stokes", "Ts": Ts, "Tp": Tp, "azimuthDeg": az, "ellipticityDeg": chi},
                "expected": {"T": sig(T, 14), "s1": s1, "s2": s2, "s3": s3},
                "tolerance": {"T": 1e-12, "s1": 1e-12, "s2": 1e-12, "s3": 1e-12},
                "absolute": True,
            })
    return out


MODEL = {
    "id": "fresnel",
    "title": "Fresnel transmission and polarization at prism faces",
    "app": "sketch/js/fresnel.js: fresnelTransmittances, throughFace",
    "reference": "Textbook amplitude transmission coefficients with the obliquity factor (n2 cos t / n1 cos i)|t|^2 in 40-digit decimals; output state from Jones vectors",
    "citations": [
        "M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 1.5.2",
        "E. Hecht, Optics, 5th ed., Pearson (2017), section 4.6.2",
    ],
    "fidelity": "computed",
    "scope": "Lossless, uncoated, non-magnetic interfaces between real indices, below the critical angle",
    "outside_scope": "Beyond the critical angle the tracer reflects the ray totally, as before; absorption and coatings are not modelled",
    "provenance": "Closed-form Fresnel coefficients; analytic limits (normal incidence, Brewster from either side) asserted in the module.",
    "domain": "Air to glass and glass to air for n = 1.45-1.71 at 0-80 degrees; s, p, 45-degree linear, circular and elliptical inputs.",
    "convergence": "Closed form; no discretisation.",
    "tolerance_rationale": "1e-12: double-precision agreement with closed-form expressions (absolute for the Stokes components).",
}
