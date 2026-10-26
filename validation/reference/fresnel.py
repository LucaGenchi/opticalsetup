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

Arithmetic: 40-digit decimals throughout, trigonometry by series, so the
expected file is the same on every machine (platform floating-point trig can
differ in its last bits). The formulas are closed form, so the tolerance is
double-precision agreement (1e-12).
"""
from decimal import Decimal as D, getcontext
import math

from common import sig

getcontext().prec = 40


PI = D("3.141592653589793238462643383279502884197")


def _sin(x):
    # Taylor series in 40-digit decimals: the same digits on every machine,
    # unlike the platform's floating-point trig, whose last bits vary.
    x = x % (2 * PI)
    term, total, k = x, x, 1
    while abs(term) > D("1e-45"):
        term *= -x * x / ((2 * k) * (2 * k + 1))
        total += term
        k += 1
    return total


def _cos(x):
    return _sin(x + PI / 2)


def transmittances(n1, n2, incidence_deg):
    n1, n2 = D(repr(n1)), D(repr(n2))
    i = D(repr(incidence_deg)) * PI / 180
    ci, si = _cos(i), _sin(i)
    st = n1 * si / n2
    if st >= 1:
        return None
    ct = (1 - st * st).sqrt()
    ts = 2 * n1 * ci / (n1 * ci + n2 * ct)
    tp = 2 * n1 * ci / (n2 * ci + n1 * ct)
    factor = (n2 * ct) / (n1 * ci)
    return factor * ts * ts, factor * tp * tp


def stokes_after(Ts, Tp, azimuth_deg, ellipticity_deg=0.0):
    """Pure input state (azimuth from p, ellipticity angle chi), as a Jones
    vector of decimal (real, imaginary) pairs; returns the transmitted
    fraction and the output Stokes vector."""
    a, chi = D(repr(azimuth_deg)) * PI / 180, D(repr(ellipticity_deg)) * PI / 180
    # Jones vector (E_p, E_s) for azimuth a and ellipticity chi.
    ep = (_cos(a) * _cos(chi), -_sin(a) * _sin(chi))
    es = (_sin(a) * _cos(chi), _cos(a) * _sin(chi))
    rp, rs = Tp.sqrt(), Ts.sqrt()
    op, os_ = (ep[0] * rp, ep[1] * rp), (es[0] * rs, es[1] * rs)
    ip, is_ = op[0] ** 2 + op[1] ** 2, os_[0] ** 2 + os_[1] ** 2
    total = ip + is_
    # op * conj(os): real and imaginary parts.
    re = op[0] * os_[0] + op[1] * os_[1]
    im = op[1] * os_[0] - op[0] * os_[1]
    return total, (ip - is_) / total, 2 * re / total, -2 * im / total


def cases():
    out = []
    # Normal incidence and Brewster limits.
    for n1, n2 in ((1.0, 1.5), (1.0, 1.7112), (1.4533, 1.0)):
        Ts, Tp = transmittances(n1, n2, 0.0)
        limit = 4 * D(repr(n1)) * D(repr(n2)) / (D(repr(n1)) + D(repr(n2))) ** 2
        assert abs(Ts - limit) < D("1e-30") and abs(Tp - limit) < D("1e-30")
        theta_b = math.degrees(math.atan(n2 / n1))
        # Brewster from a float angle: good to about 1e-16 in the angle.
        assert abs(transmittances(n1, n2, theta_b)[1] - 1) < D("1e-14")
    for n1, n2, angle in ((1.0, 1.5, 0.0), (1.0, 1.5, 30.0), (1.0, 1.5, 56.30993247402), (1.0, 1.5, 80.0),
                          (1.0, 1.7112, 59.6964), (1.7112, 1.0, 30.3036), (1.4533, 1.0, 40.0),
                          (1.0, 1.4533, 55.469), (1.4533, 1.0, 43.0)):
        Ts, Tp = transmittances(n1, n2, angle)
        out.append({
            "name": f"n {n1} to {n2} at {angle} deg",
            "inputs": {"kind": "transmittance", "n1": n1, "n2": n2, "incidenceDeg": angle},
            "expected": {"Ts": sig(float(Ts), 14), "Tp": sig(float(Tp), 14)},
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
                "inputs": {"kind": "stokes", "Ts": sig(float(Ts), 17), "Tp": sig(float(Tp), 17), "azimuthDeg": az, "ellipticityDeg": chi},
                "expected": {"T": sig(float(T), 14), "s1": round(float(s1), 14), "s2": round(float(s2), 14), "s3": round(float(s3), 14)},
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
