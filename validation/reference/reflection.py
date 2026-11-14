# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Polarization at reflections and backward crossings (docs/model-details.md,
step A2 of the Physics in 2D track).

Method, different from the app's: the field is followed as an explicit
three-dimensional complex vector through the layout each case describes,
with no Jones or Mueller matrix. A mirror is a perfect conductor,
E_r = -E + 2 (E . n) n, with n the mirror's normal in space; a waveplate
splits the field along its fast and slow axes, physical directions fixed to
the plate, and delays the slow part by exp(+i delta) (the field is
Re{E exp(-i omega t)}); a polarizer keeps the part along its axis; a
beamsplitter reflects like the mirror with amplitude sqrt(R) and transmits
with amplitude sqrt(T); a polarizing beamsplitter transmits the part along p
and reflects the part along s. The Stokes vector is read at the end in the
basis of the arriving ray. The app instead tracks a Stokes vector, applies
diag(1, 1, -1, -1) at reflections and mirrors an element's axis angle when
light crosses it backwards.

Basis, as docs/model-details.md states it: physical axes X right and Y up on
the screen and Z out of it (the canvas's y axis points down); k along the
ray, s = +Z, p = s x k; an element's axis angle is measured from p towards
s for light crossing the element along its local +x, and is fixed to the
element, so light crossing it the other way sees it at -theta. An element's
local +x is the canvas vector (cos rot, sin rot); a mirror's normal is that
vector, a beamsplitter's coating normal is it turned by +45 degrees.

Round trips (an element, a mirror at normal incidence, the element again)
have the Jones matrix Q J^T J with Q = diag(1, -1) (R. Bhandari, Opt. Lett.
33, 854 (2008)). The module asserts the consequences the cases rely on: a
quarter-wave plate at 45 degrees returns horizontal light as vertical; a
half-wave plate at any angle leaves the mirror's result unchanged; a
polarizer passes on the way back all that it passed on the way in. The
reciprocal Jones matrix itself is checked for a retarder, a polarizer and a
rotator (a reciprocal rotation keeps its sense, so the round trip undoes
it), with Mueller matrices measured from four probe states.

Values are stored to 10 significant digits, entries below 1e-12 as zero.
"""

import cmath
import math


def sig(x, digits=10):
    return 0.0 if abs(x) < 1e-12 else float(f"{x:.{digits - 1}e}")


# ------------------------------------------------------------------ vectors

Z = (0.0, 0.0, 1.0)


def physical(cx, cy):
    return (cx, -cy, 0.0)


def canvas_dir(rot_deg, extra_deg=0.0):
    a = math.radians(rot_deg + extra_deg)
    return physical(math.cos(a), math.sin(a))


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def p_hat(k):
    return cross(Z, k)


def scale(v, s):
    return tuple(x * s for x in v)


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def axis_of(rot_deg, axis_deg):
    p = p_hat(canvas_dir(rot_deg))
    a = math.radians(axis_deg)
    return add(scale(p, math.cos(a)), scale(Z, math.sin(a)))


class Field:
    def __init__(self, E, k):
        self.E, self.k = E, k

    def power(self):
        return sum(abs(x) ** 2 for x in self.E)

    def stokes(self):
        ep, es = dot(self.E, p_hat(self.k)), dot(self.E, Z)
        i = abs(ep) ** 2 + abs(es) ** 2
        c = ep * es.conjugate()
        return ((abs(ep) ** 2 - abs(es) ** 2) / i, 2 * c.real / i, 2 * c.imag / i)


def laser(pol_deg):
    k = physical(1.0, 0.0)
    a = math.radians(pol_deg)
    return Field(add(scale(p_hat(k), math.cos(a)), scale(Z, math.sin(a))), k)


def reflect(f, n, amplitude=1.0):
    kn = dot(f.k, n)
    k = add(f.k, scale(n, -2 * kn))
    En = dot(f.E, n)
    return Field(tuple(amplitude * (-e + 2 * En * ni) for e, ni in zip(f.E, n)), k)


def waveplate(f, rot, axis_deg, retardance_deg):
    fast = axis_of(rot, axis_deg)
    slow = cross(f.k, fast)
    delay = cmath.exp(1j * math.radians(retardance_deg))
    return Field(add(scale(fast, dot(f.E, fast)), scale(slow, delay * dot(f.E, slow))), f.k)


def polarizer(f, rot, axis_deg):
    a = axis_of(rot, axis_deg)
    return Field(scale(a, dot(f.E, a)), f.k)


def through(f, amplitude):
    return Field(scale(f.E, amplitude), f.k)


def pbs_reflect(f, rot):
    n = canvas_dir(rot, 45)
    s_part = scale(Z, dot(f.E, Z))
    return reflect(Field(s_part, f.k), n)


# ------------------------------------------------------------------ scenes

def element(kind, x, y, rot=0, **params):
    return {"type": kind, "x": x, "y": y, "rot": rot, "params": params}


def apply(f, el, reflects=False):
    """Follow the field through one element of a layout. `reflects` says
    which port of a splitter the path takes."""
    kind, rot, p = el["type"], el["rot"], el["params"]
    if kind == "mirror":
        return reflect(f, canvas_dir(rot))
    if kind in ("qwp", "hwp"):
        return waveplate(f, rot, p["a"], 90 if kind == "qwp" else 180)
    if kind == "polarizer":
        return polarizer(f, rot, p["pangle"])
    if kind == "bs":
        return reflect(f, canvas_dir(rot, 45), math.sqrt(0.5)) if reflects else through(f, math.sqrt(0.5))
    if kind == "pbs":
        if reflects:
            return pbs_reflect(f, rot)
        return Field(scale(p_hat(f.k), dot(f.E, p_hat(f.k))), f.k)
    raise ValueError(kind)


def scene_case(name, pol, elements, path, detector, note):
    """`path` lists, in order, the indices of the elements the light meets
    and the splitter port it takes: (index, reflects)."""
    f = laser(pol)
    for index, reflects in path:
        f = apply(f, elements[index], reflects)
    expected, tolerance = {"power": sig(f.power())}, {"power": 1e-9}
    # Light that is extinguished has no state to read.
    if f.power() > 1e-12:
        expected.update(zip(("s1", "s2", "s3"), (sig(x) for x in f.stokes())))
        tolerance.update({"s1": 1e-9, "s2": 1e-9, "s3": 1e-9})
    return {
        "name": name,
        "inputs": {"kind": "scene", "pol": pol, "elements": elements, "detector": detector},
        "expected": expected,
        "tolerance": tolerance,
        "absolute": True,
        "note": note,
    }


# ------------------------------------------------------------------ reciprocity

def in_frame(axis_deg, d):
    a = math.radians(axis_deg)
    c, s = math.cos(a), math.sin(a)
    r = [[c, s], [-s, c]]
    rinv = [[c, -s], [s, c]]
    dm = [[d[i] * r[i][j] for j in range(2)] for i in range(2)]
    return [[sum(rinv[i][k] * dm[k][j] for k in range(2)) for j in range(2)] for i in range(2)]


def jones(kind, axis_deg=0.0, retardance_deg=0.0, angle_deg=0.0):
    if kind == "retarder":
        return in_frame(axis_deg, (1 + 0j, cmath.exp(1j * math.radians(retardance_deg))))
    if kind == "polarizer":
        return in_frame(axis_deg, (1 + 0j, 0j))
    if kind == "rotator":
        t = math.radians(angle_deg)
        return [[math.cos(t) + 0j, -math.sin(t) + 0j], [math.sin(t) + 0j, math.cos(t) + 0j]]
    raise ValueError(kind)


def mat(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(2)) for j in range(2)] for i in range(2)]


def transpose(a):
    return [[a[0][0], a[1][0]], [a[0][1], a[1][1]]]


Q = [[1 + 0j, 0j], [0j, -1 + 0j]]


def backward(j):
    return mat(Q, mat(transpose(j), Q))


def jstokes(e):
    ep, es = e
    c = ep * es.conjugate()
    return (abs(ep) ** 2 + abs(es) ** 2, abs(ep) ** 2 - abs(es) ** 2, 2 * c.real, 2 * c.imag)


def mueller(j):
    """Measured with four probe states: p, s, linear 45 and s3 = +1."""
    probes = [(1 + 0j, 0j), (0j, 1 + 0j), (math.sqrt(0.5) + 0j, math.sqrt(0.5) + 0j), (math.sqrt(0.5) + 0j, -1j * math.sqrt(0.5))]
    out = [jstokes((j[0][0] * e[0] + j[0][1] * e[1], j[1][0] * e[0] + j[1][1] * e[1])) for e in probes]
    p, s, d, r = out
    col0 = [(p[i] + s[i]) / 2 for i in range(4)]
    col1 = [(p[i] - s[i]) / 2 for i in range(4)]
    col2 = [d[i] - col0[i] for i in range(4)]
    col3 = [r[i] - col0[i] for i in range(4)]
    return [[col0[i], col1[i], col2[i], col3[i]] for i in range(4)]


def reciprocal_case(name, inputs, j):
    m = mueller(backward(j))
    return {
        "name": name,
        "inputs": {"kind": "reciprocal", **inputs},
        "expected": {f"m{i}{k}": sig(m[i][k]) for i in range(4) for k in range(4)},
        "tolerance": {f"m{i}{k}": 1e-9 for i in range(4) for k in range(4)},
        "absolute": True,
        "note": "Mueller matrix of Q J^T Q, measured with four probe states",
    }


# ------------------------------------------------------------------ cases

def round_trip(j, e):
    """The element, a mirror at normal incidence (Q), the element backwards."""
    m = mat(backward(j), mat(Q, j))
    return (m[0][0] * e[0] + m[0][1] * e[1], m[1][0] * e[0] + m[1][1] * e[1])


def assert_identities():
    h, v = (1 + 0j, 0j), (0j, 1 + 0j)
    # A quarter-wave plate at 45 degrees returns horizontal light as vertical.
    out = round_trip(jones("retarder", 45, 90), h)
    assert abs(abs(out[1]) - 1) < 1e-12 and abs(out[0]) < 1e-12, out
    # The return is proportional to Q J^T J, not the inverse of the forward
    # pass: through a quarter-wave plate at 30 degrees, horizontal light does
    # not come back horizontal.
    out = round_trip(jones("retarder", 30, 90), h)
    assert abs(out[1]) > 0.5, out
    # A half-wave plate at any angle leaves the mirror's result unchanged.
    for axis in (0, 17, 30, 75, 120):
        for e in (h, (0.6 + 0j, 0.8j), (math.sqrt(0.5) + 0j, math.sqrt(0.5) + 0j)):
            out, mirror_only = jstokes(round_trip(jones("retarder", axis, 180), e)), jstokes((e[0], -e[1]))
            assert all(abs(a - b) < 1e-12 for a, b in zip(out, mirror_only)), (axis, e, out, mirror_only)
    # A polarizer passes on the way back all that it passed on the way in.
    for axis in (0, 25, 60, 135):
        for pol in (0, 20, 70):
            e = (math.cos(math.radians(pol)) + 0j, math.sin(math.radians(pol)) + 0j)
            j = jones("polarizer", axis)
            once = j[0][0] * e[0] + j[0][1] * e[1], j[1][0] * e[0] + j[1][1] * e[1]
            back = round_trip(j, e)
            assert abs(jstokes(back)[0] - jstokes(once)[0]) < 1e-12, (axis, pol)
    # A reciprocal rotation is undone by the round trip: the result is the
    # mirror's alone.
    for angle in (10, 45, 80):
        for e in (h, v, (0.6 + 0j, 0.8j)):
            out = round_trip(jones("rotator", angle_deg=angle), e)
            assert abs(out[0] - e[0]) < 1e-12 and abs(out[1] + e[1]) < 1e-12, (angle, e, out)


def cases():
    assert_identities()
    out = []
    det_down = lambda x, y: {"x": x, "y": y, "rot": 90}
    det_right = lambda x, y: {"x": x, "y": y, "rot": 0}

    # One 45-degree fold, then nothing, for linear 0, 45 and 30.
    for pol in (0, 45, 30):
        els = [element("mirror", 200, 0, -45)]
        out.append(scene_case(f"linear {pol} deg after one 45 deg fold", pol, els, [(0, False)], det_down(200, 200),
                              "s2 and s3 change sign at the reflection"))
    # A fold followed by a polarizer at +45 and -45 degrees (case 1).
    for axis in (45, 135):
        els = [element("mirror", 200, 0, -45), element("polarizer", 200, 120, 90, pangle=axis)]
        out.append(scene_case(f"linear 45 deg, one fold, polarizer at {axis} deg", 45, els, [(0, False), (1, False)],
                              det_down(200, 240), "the fold turns +45 into -45 before the polarizer"))
    # The anchor case and the handedness after one and two folds (cases 2, 4).
    q = element("qwp", 120, 0, 0, a=45)
    out.append(scene_case("quarter-wave at 45 deg on linear 0 deg: right circular", 0, [q], [(0, False)], det_right(300, 0),
                          "the field turns clockwise seen looking towards the source"))
    els = [q, element("mirror", 250, 0, -45)]
    out.append(scene_case("right circular after one fold: left circular", 0, els, [(0, False), (1, False)], det_down(250, 200),
                          "a reflection reverses the handedness"))
    els = [q, element("mirror", 250, 0, -45), element("mirror", 250, 200, -45)]
    out.append(scene_case("right circular after two folds: right circular", 0, els, [(0, False), (1, False), (2, False)],
                          det_right(450, 200), "two reflections restore it"))
    # The double pass through a PBS and a quarter-wave plate (case 3).
    els = [element("pbs", 200, 0), element("qwp", 300, 0, 0, a=45), element("mirror", 400, 0)]
    out.append(scene_case("PBS, quarter-wave at 45 deg, mirror, back: all light at the other port", 0, els,
                          [(0, False), (1, False), (2, False), (1, False), (0, True)], det_down(200, 150),
                          "the round trip through the plate is Q J^T J; horizontal returns vertical"))
    # Round trips seen through a 50:50 beamsplitter (the return is picked off
    # by its reflection): a half-wave plate leaves the mirror's result, a
    # polarizer passes what it passed.
    bs = element("bs", 200, 0)
    for axis in (30, 75):
        els = [bs, element("hwp", 300, 0, 0, a=axis), element("mirror", 400, 0)]
        out.append(scene_case(f"diagonal light, half-wave at {axis} deg and back: the mirror's result", 45, els,
                              [(0, False), (1, False), (2, False), (1, False), (0, True)], det_down(200, 200),
                              "a half-wave plate at any angle leaves the round trip unchanged"))
    els = [bs, element("mirror", 400, 0)]
    out.append(scene_case("diagonal light, mirror only, picked off by the beamsplitter", 45, els,
                          [(0, False), (1, False), (0, True)], det_down(200, 200), "reference for the half-wave rows"))
    els = [bs, element("polarizer", 300, 0, 0, pangle=60), element("mirror", 400, 0)]
    out.append(scene_case("linear 20 deg, polarizer at 60 deg and back", 20, els,
                          [(0, False), (1, False), (2, False), (1, False), (0, True)], det_down(200, 200),
                          "the polarizer passes on the return all that it passed (cos^2 40 deg)"))
    # Diagonal light returned by one mirror and by two folds (case 5).
    pol45 = element("polarizer", 200, 100, 90, pangle=45)
    els = [bs, element("mirror", 350, 0), pol45]
    out.append(scene_case("diagonal light returned by one mirror, analyzer at 45 deg", 45, els,
                          [(0, False), (1, False), (0, True), (2, False)], det_down(200, 200),
                          "one reflection: the mirror image of the two-fold return"))
    els = [bs, element("mirror", 350, 0, -45, length=10), element("mirror", 350, 8, 45, length=10), pol45]
    out.append(scene_case("diagonal light returned by two 45 deg folds, analyzer at 45 deg", 45, els,
                          [(0, False), (1, False), (2, False), (0, True), (3, False)], det_down(200, 200),
                          "two reflections: the state of the one-mirror return mirrored"))
    # The reciprocal matrices.
    for axis, ret in ((45, 90), (30, 45), (-20, 200)):
        out.append(reciprocal_case(f"retarder at {axis} deg, {ret} deg, crossed backwards",
                                   {"element": "retarder", "axisDeg": axis, "retardanceDeg": ret}, jones("retarder", axis, ret)))
    for axis in (0, 35):
        out.append(reciprocal_case(f"polarizer at {axis} deg, crossed backwards",
                                   {"element": "polarizer", "axisDeg": axis}, jones("polarizer", axis)))
    out.append(reciprocal_case("rotator by 25 deg, crossed backwards: the same sense",
                               {"element": "rotator", "angleDeg": 25}, jones("rotator", angle_deg=25)))
    return out


MODEL = {
    "id": "reflection",
    "title": "Polarization at reflections and backward crossings",
    "app": "sketch/js/raytrace.js: reflectPolarization, crossingAxisDeg, through traceScene and detectorReading; sketch/js/mueller.js: reciprocalMueller",
    "reference": "Explicit field vectors followed through each layout (perfect-conductor reflection E_r = -E + 2(E.n)n, waveplate axes fixed in space, Stokes read in the arriving ray's basis); reciprocal Jones matrices Q J^T Q measured with four probe states",
    "citations": [
        "M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 1.4.2 (handedness: right-handed when the field turns clockwise seen looking towards the source) and section 1.5.2 (reflection at a perfect conductor)",
        "R. Bhandari, 'Transpose symmetry of the Jones matrix and topological phases,' Opt. Lett. 33, 854-856 (2008): the reciprocal Jones matrix of an element crossed backwards",
        "R. J. Potton, 'Reciprocity in optics,' Rep. Prog. Phys. 67, 717-754 (2004): background on reciprocity",
    ],
    "fidelity": "computed",
    "scope": "Ideal specular reflections and ideal linear elements in the drawing plane: every ray and surface normal in the plane, so s is out of the plane at every surface. A mirror is a perfect conductor; a beamsplitter reflects and transmits with real amplitudes; a polarizing beamsplitter transmits p and reflects s.",
    "outside_scope": "Real coatings and metals (their retardance on reflection, step P8), Fresnel retardance on total internal reflection (step P1), depolarization, non-reciprocal elements (Faraday rotation, step P2) and out-of-plane beam folds.",
    "provenance": "The field rules are the definitions above; the round-trip consequences are asserted in the module before the cases are written.",
    "domain": "Linear inputs at 0-45 degrees and circular light made by a quarter-wave plate; folds at 45 degrees and returns at normal incidence; waveplates and polarizers at 0-75 degrees crossed both ways.",
    "convergence": "Closed form; no discretisation.",
    "tolerance_rationale": "1e-9 absolute: the same algebra in double precision, stored to 10 significant digits.",
}
