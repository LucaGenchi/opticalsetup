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

Traced glass (step P1 of the Physics in 2D track, issue #313): scenes the app
traces end to end, a laser, one body of free-form glass set to bare glass
(Fresnel) and a detector, compared with the field followed through the same
faces here. Each face contributes its Jones matrix from mueller.py (complex
Fresnel coefficients of Born and Wolf, section 1.5.2, in the basis
p = s x k of each ray, so a perfect conductor is diag(1, -1)); the
traversal and the angle at every face are worked out here from the layout,
not taken from the tracer:

- a plane-parallel plate turned to 30 degrees and to Brewster's angle, for
  p, s and linear 45 degrees: two transmissions, T_p = 1 at Brewster's angle;
- a Fresnel rhomb, a parallelogram of n = 1.51 with an acute angle of 54.6
  degrees: entry and exit at normal incidence, two total internal
  reflections at 54.6 degrees, which turn linear 45 degrees into circular
  light (Born and Wolf, section 1.5.4);
- the same rhomb left on per-surface transmission, where the reflections are
  the ideal mirror (step A2) and linear 45 degrees comes back as itself.

These scenes are in double precision, stored to 10 significant digits, with
a tolerance of 1e-9: the tracer finds each hit point by intersection, so its
angles agree with the closed forms to about 1e-12. Every layout number that
comes out of a trigonometric function is rounded to 6 decimals before it is
used (platform trigonometry differs in its last bits, and the inputs are
stored in the expected file), and the expected field is computed from the
rounded layout, so the app traces exactly the geometry the reference
describes.
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


def _scene_cases():
    import mueller as M  # the kernel's independent Jones matrices

    def state(pol_deg):
        a = math.radians(pol_deg)
        return [complex(math.cos(a)), complex(math.sin(a))]

    def read(e, power0=1.0):
        S = M.stokes(e)
        return S[0] / power0, [S[i] / S[0] for i in (1, 2, 3)]

    def clean(x):
        return 0.0 if abs(x) < 1e-12 else sig(x, 10)

    def glass(x, y, rot, vertices, ior, surface_model="fresnel"):
        xs = [v[0] for v in vertices]
        ys = [v[1] for v in vertices]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        # The app keeps a body's points about the centre of their bounds.
        c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        return {
            "type": "freeglass", "x": x + cx * c - cy * s_, "y": y + cx * s_ + cy * c, "rot": rot,
            "params": {
                "vertices": [{"x": round(vx - cx, 9), "y": round(vy - cy, 9)} for vx, vy in vertices],
                "material": "constant", "ior": ior, "surfaceModel": surface_model,
            },
        }

    out = []
    n = 1.5
    # Plates: 10 mm thick, 60 mm tall, the beam along +x meeting the front
    # face at the plate's turn angle; the rear face is parallel, so the
    # beam leaves at the same angle, displaced but parallel.
    # Rounded: the angle is stored as the plate's turn.
    brewster = round(math.degrees(math.atan(n)), 6)
    for angle in (30.0, brewster):
        theta_t = math.degrees(math.asin(math.sin(math.radians(angle)) / n))
        J = M.matmul(M.transmission_jones(n, 1.0, theta_t), M.transmission_jones(1.0, n, angle))
        plate = glass(150, 0, angle, [(-5, -30), (5, -30), (5, 30), (-5, 30)], n)
        for pol in (0, 90, 45):
            power, (s1, s2, s3) = read(M.apply(J, state(pol)))
            label = "Brewster" if angle == brewster else f"{angle:g} deg"
            out.append({
                "name": f"plate of n {n} at {label}, linear {pol} deg in",
                "inputs": {"kind": "scene", "pol": pol, "laser": {"beamWidth": 1},
                           "elements": [plate], "detector": {"x": 320, "y": 0, "rot": 0}},
                "expected": {"power": clean(power), "s1": clean(s1), "s2": clean(s2), "s3": clean(s3)},
                "tolerance": {"power": 1e-9, "s1": 1e-9, "s2": 1e-9, "s3": 1e-9},
                "absolute": True,
            })
            if angle == brewster and pol == 0:
                assert abs(power - 1) < 1e-12  # p passes a Brewster plate whole (angle rounded to 1e-6 deg)
    # Fresnel rhomb. Long faces at alpha = 90 - 54.6 degrees to the beam,
    # end faces perpendicular to it; the beam (along +x, at y = 0) enters the
    # left end at mid-height, reflects off the lower face, then the upper,
    # and leaves the right end along +x again.
    n, design, t = 1.51, 54.6, 12.0
    alpha = math.radians(90 - design)
    height = t / math.cos(alpha)            # length of each end face
    y0 = height / 2                         # entry point on the left end (x = 0)
    x1 = y0 / math.tan(alpha)               # first reflection, on the lower face
    d = (math.cos(2 * alpha), math.sin(2 * alpha))
    # Second reflection: the upper face is y = x tan(alpha) + height.
    k = (x1 * math.tan(alpha) + height - y0) / (d[1] - d[0] * math.tan(alpha))
    x2, y2 = x1 + k * d[0], y0 + k * d[1]
    # The right end sits where the leaving beam is at its mid-height.
    X = (y2 - height / 2) / math.tan(alpha)
    assert X > x2
    # The stored outline, rounded so that the long faces stay exactly parallel
    # (one direction vector) and the ends exactly perpendicular to the beam;
    # the angle of incidence is then that of the rounded faces.
    X, Y, height, y0, y2 = (round(v, 6) for v in (X, X * math.tan(alpha), height, y0, y2))
    rhomb_vertices = [(0, 0), (X, Y), (X, Y + height), (0, height)]
    inc = 90 - math.degrees(math.atan2(Y, X))
    assert abs(inc - design) < 1e-5
    entry_y = y2  # the beam leaves at height y2 relative to the entry at y0
    for model in ("fresnel", "transmission"):
        rhomb = glass(150, -y0, 0, rhomb_vertices, n, model)
        if model == "fresnel":
            J = M.transmission_jones(1.0, n, 0.0)
            for _ in range(2):
                J = M.matmul(M.reflection_jones(n, 1.0, inc), J)
            J = M.matmul(M.transmission_jones(n, 1.0, 0.0), J)
        else:
            # Per-surface transmission (98 % a face by default) and the ideal
            # mirror at each reflection.
            J = [[math.sqrt(0.98) ** 2, 0j], [0j, math.sqrt(0.98) ** 2]]
            mirror = [[1 + 0j, 0j], [0j, -1 + 0j]]
            J = M.matmul(mirror, M.matmul(mirror, J))
        power, (s1, s2, s3) = read(M.apply(J, state(45)))
        if model == "fresnel":
            assert abs(abs(s3) - 1) < 2e-3  # nearly circular
        out.append({
            "name": f"Fresnel rhomb, n {n} at {design} deg, {'bare glass' if model == 'fresnel' else 'per-surface transmission'}, linear 45 deg in",
            "inputs": {"kind": "scene", "pol": 45, "laser": {"beamWidth": 1},
                       "elements": [rhomb], "detector": {"x": 150 + X + 60, "y": entry_y - y0, "rot": 0}},
            "expected": {"power": clean(power), "s1": clean(s1), "s2": clean(s2), "s3": clean(s3)},
            "tolerance": {"power": 1e-9, "s1": 1e-9, "s2": 1e-9, "s3": 1e-9},
            "absolute": True,
        })
    return out


def cases():
    out = _scene_cases()
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
    "title": "Fresnel transmission and polarization at prism faces and bare glass",
    "app": "sketch/js/fresnel.js: fresnelTransmittances, throughFace; traced scenes through free-form glass set to bare glass (Fresnel)",
    "reference": "Textbook amplitude transmission coefficients with the obliquity factor (n2 cos t / n1 cos i)|t|^2 in 40-digit decimals; output state from Jones vectors",
    "citations": [
        "M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 1.5.2",
        "E. Hecht, Optics, 5th ed., Pearson (2017), section 4.6.2",
    ],
    "fidelity": "computed",
    "scope": "Lossless, uncoated, non-magnetic interfaces between real indices, below the critical angle",
    "outside_scope": "Absorption, coatings, multiple reflections inside a plate (ghosts) and interference between them are not modelled; total internal reflection carries the Fresnel retardance only where a face follows Fresnel (prisms, glass set to bare glass)",
    "provenance": "Closed-form Fresnel coefficients; analytic limits (normal incidence, Brewster from either side) asserted in the module.",
    "domain": "Air to glass and glass to air for n = 1.45-1.71 at 0-80 degrees; s, p, 45-degree linear, circular and elliptical inputs; traced plates at 30 degrees and Brewster's angle, and a Fresnel rhomb (n = 1.51, 54.6 degrees).",
    "convergence": "Closed form; no discretisation.",
    "tolerance_rationale": "1e-12: double-precision agreement with closed-form expressions (absolute for the Stokes components).",
}
