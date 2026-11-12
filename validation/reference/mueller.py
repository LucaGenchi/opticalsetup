# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mueller and Jones kernel: the matrices of a rotator, a linear retarder, a
linear diattenuator, an ideal polarizer and an ideal mirror, the conversion
of a Jones matrix, and the Fresnel reflection and transmission matrices of a
dielectric interface, total internal reflection included
(docs/physics/mueller-kernel.md).

Method, different from the app's: every Mueller matrix here is measured from
its Jones matrix by sending four pure states through it (p, s, linear 45
degrees and the state with S3 = +1) and reading the Stokes vectors that come
out, where the app writes the matrices in closed form (Rodrigues' rotation for
the retarder, Goldstein's diattenuator) or through the trace formula
M_ij = 1/2 tr(J^dagger sigma_i J sigma_j). The Fresnel coefficients are
evaluated with complex arithmetic on cos(theta_t), and the transmission matrix
from the amplitude coefficients t with the obliquity factor
(n2 cos t / n1 cos i) |t|^2, where the app uses T = 1 - |r|^2.

Conventions, as the app declares them: Jones vectors (E_p, E_s), field
Re{J exp(-i omega t)}, S3 = 2 Im(E_p conj(E_s)); a retarder with axis setting
theta and retardance delta is R(-theta) diag(1, exp(-i delta)) R(theta) with
R(a) = [[cos a, sin a], [-sin a, cos a]] (Goldstein with delta -> -delta);
Fresnel signs of Born and Wolf, section 1.5.2, in which a perfect conductor
gives r_p = +1 and r_s = -1, the ideal mirror diag(1, -1).

Analytic limits asserted inside cases(): R_p = 0 at Brewster's angle, the sign
of r_p on either side of it, |r_s| = |r_p| = 1 beyond the critical angle, and
the retardance of total internal reflection against the closed form of Born
and Wolf, section 1.5.4: tan(Delta / 2) = cos(theta) sqrt(sin^2 theta - n^2)
/ sin^2 theta with n = n2 / n1. A Fresnel rhomb of n = 1.51 at 54.6 degrees
gives about 45 degrees per reflection, so two reflections turn linear 45
degrees into nearly circular light.

Closed forms in double precision; values are stored to 10 significant
digits, and entries below 1e-12 in magnitude as zero, so the expected file is
the same on every machine.
"""

import cmath
import math

from common import sig


def clean(x):
    return 0.0 if abs(x) < 1e-12 else sig(x, 10)


# ---------------------------------------------------------------- Jones and Stokes

def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(2)) for j in range(2)] for i in range(2)]


def apply(j, e):
    return [j[0][0] * e[0] + j[0][1] * e[1], j[1][0] * e[0] + j[1][1] * e[1]]


def stokes(e):
    p, s = e
    cross = p * s.conjugate()
    return [abs(p) ** 2 + abs(s) ** 2, abs(p) ** 2 - abs(s) ** 2, 2 * cross.real, 2 * cross.imag]


# The four probe states. The fourth has S3 = 2 Im(E_p conj(E_s)) = +1.
P = [1 + 0j, 0j]
S = [0j, 1 + 0j]
D = [1 / math.sqrt(2) + 0j, 1 / math.sqrt(2) + 0j]
C = [1 / math.sqrt(2) + 0j, -1j / math.sqrt(2)]
assert all(abs(a - b) < 1e-15 for a, b in zip(stokes(C), (1, 0, 0, 1)))


def mueller(j):
    """Columns from the responses to the probes: M (1,1,0,0) = col0 + col1,
    M (1,-1,0,0) = col0 - col1, M (1,0,1,0) = col0 + col2, M (1,0,0,1) =
    col0 + col3."""
    sp, ss, sd, sc = (stokes(apply(j, e)) for e in (P, S, D, C))
    col0 = [(a + b) / 2 for a, b in zip(sp, ss)]
    col1 = [(a - b) / 2 for a, b in zip(sp, ss)]
    col2 = [a - b for a, b in zip(sd, col0)]
    col3 = [a - b for a, b in zip(sc, col0)]
    return [[col0[i], col1[i], col2[i], col3[i]] for i in range(4)]


def rot(a):
    return [[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]]


def in_frame(axis_deg, diagonal):
    t = math.radians(axis_deg)
    return matmul(rot(-t), matmul([[diagonal[0], 0j], [0j, diagonal[1]]], rot(t)))


def rotator(angle_deg):
    t = math.radians(angle_deg)
    return [[math.cos(t) + 0j, -math.sin(t) + 0j], [math.sin(t) + 0j, math.cos(t) + 0j]]


def retarder(axis_deg, retardance_deg):
    return in_frame(axis_deg, (1 + 0j, cmath.exp(-1j * math.radians(retardance_deg))))


def diattenuator(axis_deg, t_max, t_min):
    return in_frame(axis_deg, (math.sqrt(t_max) + 0j, math.sqrt(t_min) + 0j))


MIRROR = [[1 + 0j, 0j], [0j, -1 + 0j]]
GENERAL = [[0.8 + 0.1j, 0.2 - 0.3j], [-0.1 + 0.4j, 0.5 + 0.2j]]


# ---------------------------------------------------------------- Fresnel

def coefficients(n1, n2, incidence_deg):
    i = math.radians(incidence_deg)
    ci = math.cos(i)
    st = n1 * math.sin(i) / n2
    # cos(theta_t) on the branch whose transmitted field decays away from the
    # face for exp(-i omega t): +i kappa beyond the critical angle.
    ct = cmath.sqrt(1 - st * st) if st < 1 else 1j * math.sqrt(st * st - 1)
    rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct)
    rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct)
    if st >= 1:
        return {"rs": rs, "rp": rp, "total": True}
    ts = 2 * n1 * ci / (n1 * ci + n2 * ct)
    tp = 2 * n1 * ci / (n2 * ci + n1 * ct)
    return {"rs": rs, "rp": rp, "ts": ts, "tp": tp, "ct": ct.real, "ci": ci, "total": False}


def reflection_jones(n1, n2, incidence_deg):
    c = coefficients(n1, n2, incidence_deg)
    return [[c["rp"], 0j], [0j, c["rs"]]]


def transmission_jones(n1, n2, incidence_deg):
    c = coefficients(n1, n2, incidence_deg)
    eta = math.sqrt(n2 * c["ct"] / (n1 * c["ci"]))
    return [[eta * c["tp"], 0j], [0j, eta * c["ts"]]]


def tir_retardance_deg(n1, n2, incidence_deg):
    """Delta = arg(r_s) - arg(r_p) from the closed form of Born and Wolf."""
    n = n2 / n1
    t = math.radians(incidence_deg)
    s2 = math.sin(t) ** 2
    return math.degrees(2 * math.atan(math.cos(t) * math.sqrt(s2 - n * n) / s2))


def flat(m):
    return {f"m{i}{j}": clean(m[i][j]) for i in range(4) for j in range(4)}


def matrix_case(name, inputs, m, note=None):
    case = {
        "name": name,
        "inputs": inputs,
        "expected": flat(m),
        "tolerance": {f"m{i}{j}": 1e-9 for i in range(4) for j in range(4)},
        "absolute": True,
    }
    if note:
        case["note"] = note
    return case


def compose(first, second):
    return [[sum(second[i][k] * first[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def through(m, s):
    out = [sum(m[i][k] * s[k] for k in range(4)) for i in range(4)]
    return [x / out[0] for x in out]


def cases():
    out = []
    # Analytic limits first, so that a wrong sign stops the generator.
    brewster = math.degrees(math.atan(1.5))
    assert abs(coefficients(1.0, 1.5, brewster)["rp"]) < 1e-15
    assert coefficients(1.0, 1.5, 45)["rp"].real > 0 > coefficients(1.0, 1.5, 65)["rp"].real
    assert coefficients(1.0, 1.5, 45)["rs"].real < 0 and coefficients(1.0, 1.5, 65)["rs"].real < 0
    for n1, angle in ((1.51, 54.6), (1.5, 50.0), (1.4533, 70.0)):
        c = coefficients(n1, 1.0, angle)
        assert c["total"] and abs(abs(c["rs"]) - 1) < 1e-15 and abs(abs(c["rp"]) - 1) < 1e-15
        phase = math.degrees(cmath.phase(c["rs"]) - cmath.phase(c["rp"]))
        assert abs(phase - tir_retardance_deg(n1, 1.0, angle)) < 1e-9, (phase, tir_retardance_deg(n1, 1.0, angle))
    # A perfect conductor is the ideal mirror.
    big = coefficients(1.0, 1e9, 30)
    assert abs(big["rp"] - 1) < 1e-8 and abs(big["rs"] + 1) < 1e-8
    # Every probe-built matrix acts on a fifth, elliptical state as its Jones
    # matrix does: the probe construction is linear and complete.
    e = [0.6 + 0.2j, -0.3 + 0.7j]
    for j in (rotator(30), retarder(30, 45), diattenuator(35, 0.8, 0.1), GENERAL, reflection_jones(1.51, 1.0, 54.6)):
        got = [sum(mueller(j)[i][k] * stokes(e)[k] for k in range(4)) for i in range(4)]
        want = stokes(apply(j, e))
        assert all(abs(a - b) < 1e-14 for a, b in zip(got, want))

    for angle in (30, -15):
        out.append(matrix_case(f"rotator {angle} deg", {"kind": "rotator", "angleDeg": angle}, mueller(rotator(angle))))
    for axis, ret in ((0, 90), (30, 45), (-20, 200), (22.5, 180)):
        out.append(matrix_case(f"retarder axis {axis} deg, retardance {ret} deg",
                               {"kind": "retarder", "axisDeg": axis, "retardanceDeg": ret}, mueller(retarder(axis, ret))))
    for axis, tmax, tmin in ((0, 0.9, 0.6), (35, 0.8, 0.1)):
        out.append(matrix_case(f"diattenuator axis {axis} deg, {tmax} and {tmin}",
                               {"kind": "diattenuator", "axisDeg": axis, "tMax": tmax, "tMin": tmin},
                               mueller(diattenuator(axis, tmax, tmin))))
    for axis in (0, 60):
        out.append(matrix_case(f"ideal polarizer axis {axis} deg", {"kind": "polarizer", "axisDeg": axis},
                               mueller(diattenuator(axis, 1.0, 0.0))))
    out.append(matrix_case("ideal mirror, diag(1, 1, -1, -1)", {"kind": "mirror"}, mueller(MIRROR)))
    out.append(matrix_case("Mueller matrix of a general complex Jones matrix",
                           {"kind": "jones", "jones": [[[z.real, z.imag] for z in row] for row in GENERAL]},
                           mueller(GENERAL)))
    for n1, n2, angle, label in (
        (1.0, 1.5, 30.0, "below Brewster"),
        (1.0, 1.5, brewster, "at Brewster"),
        (1.0, 1.5, 70.0, "above Brewster"),
        (1.5, 1.0, 20.0, "inside glass, below the critical angle"),
        (1.51, 1.0, 54.6, "total internal reflection, Fresnel rhomb angle"),
        (1.5, 1.0, 50.0, "total internal reflection"),
    ):
        out.append(matrix_case(f"Fresnel reflection n {n1} to {n2} at {angle:.6g} deg, {label}",
                               {"kind": "reflection", "n1": n1, "n2": n2, "incidenceDeg": angle},
                               mueller(reflection_jones(n1, n2, angle))))
    for n1, n2, angle in ((1.0, 1.5, 30.0), (1.0, 1.7112, 59.6964), (1.5, 1.0, 35.0)):
        out.append(matrix_case(f"Fresnel transmission n {n1} to {n2} at {angle} deg",
                               {"kind": "transmission", "n1": n1, "n2": n2, "incidenceDeg": angle},
                               mueller(transmission_jones(n1, n2, angle)),
                               note="reference from (n2 cos t / n1 cos i)|t|^2, the app from 1 - |r|^2"))

    # Scalar consequences, each a sentence of the model statement.
    out.append({
        "name": "R_p vanishes at Brewster's angle, n 1 to 1.5",
        "inputs": {"kind": "brewster", "n1": 1.0, "n2": 1.5, "incidenceDeg": brewster},
        "expected": {"Rp": 0.0},
        "tolerance": {"Rp": 1e-12},
        "absolute": True,
    })
    for angle in (45.0, 65.0):
        c = coefficients(1.0, 1.5, angle)
        s3 = through(mueller(reflection_jones(1.0, 1.5, angle)), [1, 0, 0, 1])[3]
        side = "below" if angle < brewster else "above"
        out.append({
            "name": f"r_p sign and circular light reflected {side} Brewster, n 1 to 1.5 at {angle} deg",
            "inputs": {"kind": "handedness", "n1": 1.0, "n2": 1.5, "incidenceDeg": angle},
            "expected": {"rp": clean(c["rp"].real), "rs": clean(c["rs"].real), "s3": clean(s3)},
            "tolerance": {"rp": 1e-9, "rs": 1e-9, "s3": 1e-9},
            "absolute": True,
            "note": "s3 of reflected light that arrives with s3 = +1: negative below Brewster (reversed, as by the ideal mirror), positive above it",
        })
    for n1, angle in ((1.51, 54.6), (1.5, 50.0)):
        out.append({
            "name": f"retardance of one total internal reflection, n {n1} to 1 at {angle} deg",
            "inputs": {"kind": "tirRetardance", "n1": n1, "n2": 1.0, "incidenceDeg": angle},
            "expected": {"retardanceDeg": sig(tir_retardance_deg(n1, 1.0, angle), 10)},
            "tolerance": {"retardanceDeg": 1e-9},
            "note": "Born and Wolf closed form; arg(r_s) - arg(r_p) from the coefficients agrees to 1e-9 degrees (asserted above)",
        })
    one = mueller(reflection_jones(1.51, 1.0, 54.6))
    rhomb = through(compose(one, one), [1, 0, 1, 0])
    out.append({
        "name": "Fresnel rhomb: two total internal reflections at 54.6 deg in n 1.51 on linear 45 deg",
        "inputs": {"kind": "rhomb", "n1": 1.51, "n2": 1.0, "incidenceDeg": 54.6},
        "expected": {"s1": clean(rhomb[1]), "s2": clean(rhomb[2]), "s3": clean(rhomb[3])},
        "tolerance": {"s1": 1e-9, "s2": 1e-9, "s3": 1e-9},
        "absolute": True,
        "note": "both reflections in the drawing plane, each in the p, s basis of its own rays",
    })
    return out


MODEL = {
    "id": "mueller",
    "title": "Mueller and Jones kernel: retarder, diattenuator, polarizer, mirror and Fresnel matrices",
    "app": "sketch/js/mueller.js: rotatorMueller, linearRetarderMueller, linearDiattenuatorMueller, idealPolarizerMueller, idealMirrorMueller, jonesToMueller, fresnelCoefficients, fresnelReflectionMueller, fresnelTransmissionMueller",
    "reference": "Mueller matrices measured from Jones matrices with four probe states; Fresnel coefficients in complex arithmetic, transmission from t with the obliquity factor; total-internal-reflection retardance from the Born and Wolf closed form",
    "citations": [
        "D. H. Goldstein, Polarized Light, 3rd ed. (CRC Press, 2011), ch. 5 and 6: Jones and Mueller matrices of rotators, retarders and diattenuators. The app keeps its retardance sign, Goldstein's with delta -> -delta.",
        "M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 1.5.2 (Fresnel coefficients and their signs) and section 1.5.4 (phase change on total internal reflection; the Fresnel rhomb)",
    ],
    "fidelity": "computed",
    "scope": "Fully polarized light through ideal linear elements; lossless, non-magnetic interfaces between real indices, total internal reflection included. In this version the tracer uses the retarder, the polarizer and the transmission diattenuator; the mirror, rotator and Fresnel reflection matrices are not applied by any element yet.",
    "outside_scope": "Absorbing media (complex indices), coatings, depolarization and circular diattenuation are not modelled. Handedness labels follow the app's existing convention until step A2 of the Physics in 2D track.",
    "provenance": "Closed-form Jones matrices transcribed from the sources; analytic limits (Brewster, sign of r_p, unit modulus beyond the critical angle, the closed-form TIR retardance, the perfect-conductor limit) asserted in the module.",
    "domain": "Rotations and axes from -20 to 60 degrees, retardances 45-200 degrees, diattenuation 0-0.9; interfaces n = 1-1.71 at 20-70 degrees, two of them beyond the critical angle.",
    "convergence": "Closed form; no discretisation.",
    "tolerance_rationale": "1e-9 absolute: two double-precision evaluations of the same algebra, stored to 10 significant digits.",
}
