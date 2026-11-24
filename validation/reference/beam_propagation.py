# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Beam propagation in the drawing plane (step G1, docs/physics/beam-propagation.md).

The app measures the in-plane ray-transfer matrix of each beam from the
tracer with two companion rays (sketch/js/beam-propagation.js). This module
builds the same matrices from the analytic ones, written from the textbook
forms rather than from the JavaScript (A. E. Siegman, Lasers (1986), ch. 15
and 20; H. Kogelnik and T. Li, Appl. Opt. 5, 1550 (1966)), and propagates
the complex beam parameter with them (P. A. Belanger, Opt. Lett. 16, 196
(1991)):

  reduced ray (y, V = n u), every lossless matrix has determinant 1;
  free space L in index n:        [[1, L/n], [0, 1]]
  thin lens f:                    [[1, 0], [-1/f, 1]]
  refraction at radius R, n1->n2: [[1, 0], [-(n2 - n1)/R, 1]]
  concave mirror, focal length f, met at incidence theta, in the plane of
  incidence (tangential):         [[1, 0], [-1/(f cos theta), 1]] -- the
                                  mirror's in-plane focal length is
                                  f cos theta = (R/2) cos theta
  plane interface met at theta1, refracted to theta2, in the plane of
  incidence (anamorphic):         [[cos t2/cos t1, 0], [0, cos t1/cos t2]]
  grating, incidence ti, order at td (tangential, anamorphic):
                                  [[cos td/cos ti, 0], [0, cos ti/cos td]]

Sign convention, the app's (docs/physics/beam-propagation.md): offsets are
measured along p, the direction of travel turned a quarter turn
anticlockwise. A reflection mirrors the plane, so in that basis it also
negates both y and V: each reflection multiplies the matrix by -1, which
leaves the beam parameter unchanged.

Beam parameter: 1/q = 1/R - i M^2 lambda/(pi n w^2), q' /n' = (A q/n + B)/(C q/n + D).

Checks:
1. Matrices the app measures after a stated interaction, against the
   products above: 1e-6 on A and D, 2e-4 mm on B (about 1e-6 of the
   150 mm paths here), 1e-8 mm^-1 on C, all absolute. The companions start
   0.1 um off and 1 urad tilted; the first-order finite difference they make
   is up to about 1e-4 mm on B through the prism and the grating and 4e-7 on
   D of the tilted mirror (the test suite shows it shrinking with the step).
2. The invariant n (y1 u2 - y2 u1) of the two companions, which is the
   determinant of the reduced matrix: 1 at every interaction, 1e-6.
3. The issue's analytic waists after an ideal thin lens, input waist at the
   lens, 100 um at 1 um wavelength: for z_R >> f the cone estimate
   lambda f/(pi w); for M^2 = 1 and f = z_R = 31.416 mm, 70.711 um at
   15.708 mm; for M^2 = 2 and f = z_R = 15.708 mm, 70.711 um at 7.854 mm
   (the cone estimate would say 50 um). 1e-6 relative on waist and
   distance.
"""

import math

from common import sig

LASER_EXIT_X = 52.0  # where a laser at the origin emits (its local x = 52)
NBK7 = ([1.03961212, 0.231792344, 1.01046945], [0.00600069867, 0.0200179144, 103.560653])


def nbk7(wavelength_nm):
    l2 = (wavelength_nm / 1000) ** 2
    return math.sqrt(1 + sum(b * l2 / (l2 - c) for b, c in zip(*NBK7)))


def mat(a, b, c, d):
    return [[a, b], [c, d]]


def mul(m, n):
    return [[m[0][0] * n[0][0] + m[0][1] * n[1][0], m[0][0] * n[0][1] + m[0][1] * n[1][1]],
            [m[1][0] * n[0][0] + m[1][1] * n[1][0], m[1][0] * n[0][1] + m[1][1] * n[1][1]]]


def chain(*ms):
    """The product of matrices given in the order the light meets them."""
    out = mat(1, 0, 0, 1)
    for m in ms:
        out = mul(m, out)
    return out


def free(length, n=1.0):
    return mat(1, length / n, 0, 1)


def lens(f):
    return mat(1, 0, -1 / f, 1)


def surface(radius, n1, n2):
    return mat(1, 0, -(n2 - n1) / radius, 1)


def anamorphic(cos_in, cos_out):
    return mat(cos_out / cos_in, 0, 0, cos_in / cos_out)


def reflect(m):
    return [[-v for v in row] for row in m]


def as_case_matrix(m):
    return {"A": sig(m[0][0], 12), "B": sig(m[0][1], 12), "C": sig(m[1][0], 12), "D": sig(m[1][1], 12)}


MATRIX_TOLERANCE = {"A": 1e-6, "B": 2e-4, "C": 1e-8, "D": 1e-6}


def laser(wavelength_nm=1000, **extra):
    return {"type": "cwlaser", "x": 0, "y": 0, "rot": 0,
            "params": {"beamMode": "beam", "beamWidth": 2, "wavelength": wavelength_nm, **extra}}


def element(kind, x, y=0, rot=0, **params):
    return {"type": kind, "x": x, "y": y, "rot": rot, "params": params}


def prism_matrices(vertices, n, x0, start_x):
    """A ray along +x at y = 0 through a polygon of constant index n: the
    matrix after the entry face and after the exit face."""
    def crossing(px, py, dx, dy, exclude=None):
        best = None
        for i in range(len(vertices)):
            if i == exclude:
                continue
            ax, ay = vertices[i]
            bx, by = vertices[(i + 1) % len(vertices)]
            ex, ey = bx - ax, by - ay
            den = dx * ey - dy * ex
            if abs(den) < 1e-12:
                continue
            t = ((ax - px) * ey - (ay - py) * ex) / den
            u = ((ax - px) * dy - (ay - py) * dx) / den
            if t > 1e-9 and 0 <= u <= 1 and (best is None or t < best[0]):
                best = (t, i, ex, ey)
        return best

    vertices = [(x0 + vx, vy) for vx, vy in vertices]
    t1, i1, ex, ey = crossing(start_x, 0.0, 1.0, 0.0)
    # Unit normal of the entry face, and the angles either side.
    length = math.hypot(ex, ey)
    nx, ny = -ey / length, ex / length
    cos_i = abs(nx)
    sin_i = math.sqrt(max(0.0, 1 - cos_i * cos_i))
    sin_t = sin_i / n
    cos_t = math.sqrt(1 - sin_t * sin_t)
    m1 = chain(free(t1), anamorphic(cos_i, cos_t))
    # The refracted direction (vector Snell's law with the normal facing the ray).
    if nx > 0:
        nx, ny = -nx, -ny
    dx, dy = 1.0, 0.0
    c1 = -(dx * nx + dy * ny)
    r = 1 / n
    k = 1 - r * r * (1 - c1 * c1)
    tx, ty = r * dx + (r * c1 - math.sqrt(k)) * nx, r * dy + (r * c1 - math.sqrt(k)) * ny
    px, py = start_x + t1, 0.0
    t2, i2, ex2, ey2 = crossing(px, py, tx, ty, exclude=i1)
    l2 = math.hypot(ex2, ey2)
    mx, my = -ey2 / l2, ex2 / l2
    cos_in = abs(tx * mx + ty * my)
    sin_out = n * math.sqrt(max(0.0, 1 - cos_in * cos_in))
    cos_out = math.sqrt(1 - sin_out * sin_out)
    m2 = chain(m1, free(t2, n), anamorphic(cos_in, cos_out))
    return m1, m2


def q_after_lens(waist_um, wavelength_nm, m2, f_mm):
    """The waist after an ideal thin lens with the input waist on the lens."""
    zr = math.pi * (waist_um * 1e-3) ** 2 / (m2 * wavelength_nm * 1e-6)
    q = complex(0, zr)
    a, b, c, d = 1, 0, -1 / f_mm, 1
    q2 = (a * q + b) / (c * q + d)
    w0 = math.sqrt(m2 * wavelength_nm * 1e-6 * q2.imag / math.pi) * 1e3
    return w0, -q2.real, zr


def cases():
    out = []
    n1000 = nbk7(1000)

    def matrix_case(name, elements, vertex, expected, note, track=0):
        out.append({
            "name": name,
            "inputs": {"kind": "matrix", "elements": [laser()] + elements, "vertex": vertex, "track": track},
            "expected": as_case_matrix(expected),
            "tolerance": dict(MATRIX_TOLERANCE),
            "absolute": True,
            "note": note,
        })
        out.append({
            "name": name + ": companion invariant n (y1 u2 - y2 u1)",
            "inputs": {"kind": "determinant", "elements": [laser()] + elements, "vertex": vertex, "track": track},
            "expected": {"determinant": 1},
            "tolerance": {"determinant": 1e-6},
            "absolute": True,
            "note": "determinant of the reduced matrix",
        })

    # Free space and a thin lens: the laser emits at x = 52.
    matrix_case("thin lens f = 100 mm, 148 mm after the laser",
                [element("lens", 200, f=100)], 1, chain(free(148), lens(100)), "free space then a thin lens")
    # A thick N-BK7 lens at 1000 nm: vertices at 197 and 203 mm.
    matrix_case("thick lens R1 = 60, R2 = -60, 6 mm of N-BK7 at 1000 nm, front surface",
                [element("thicklens", 200, r1=60, r2=-60, thickness=6, glass="nbk7")], 1,
                chain(free(145), surface(60, 1, n1000)), "refraction at a sphere")
    matrix_case("thick lens R1 = 60, R2 = -60, 6 mm of N-BK7 at 1000 nm, both surfaces",
                [element("thicklens", 200, r1=60, r2=-60, thickness=6, glass="nbk7")], 2,
                chain(free(145), surface(60, 1, n1000), free(6, n1000), surface(-60, n1000, 1)),
                "a thick lens as a product of surface matrices")
    # A concave mirror f = 100 mm (R = 200 mm) met at 22.5 degrees.
    theta = math.radians(22.5)
    matrix_case("concave mirror f = 100 mm at 22.5 degrees incidence, in the plane",
                [element("cmirror", 200, rot=22.5, f=100)], 1,
                reflect(chain(free(148), lens(100 * math.cos(theta)))),
                "in-plane focal length (R/2) cos theta; a reflection negates the matrix")
    # A plane interface and a prism of index 1.5.
    tri = [(-20, -30), (20, -30), (0, 30)]
    m1, m2 = prism_matrices(tri, 1.5, 200, LASER_EXIT_X)
    matrix_case("tilted plane interface (prism entry face), n = 1.5", [element("freeglass", 200, vertices=[{"x": x, "y": y} for x, y in tri], material="constant", ior=1.5)], 1, m1,
                "anamorphic factor cos t2/cos t1 of a tilted plane interface")
    matrix_case("prism, n = 1.5, after the exit face", [element("freeglass", 200, vertices=[{"x": x, "y": y} for x, y in tri], material="constant", ior=1.5)], 2, m2,
                "two tilted interfaces and the path inside")
    # A reflective grating, 600 lines/mm, first order at 1000 nm, at 20 degrees.
    ti = math.radians(20)
    td = math.asin(abs(600e-3 * 1000e-3 - math.sin(ti)))
    matrix_case("reflection grating 600 l/mm, first order, 20 degrees incidence, 1000 nm",
                [element("grating", 200, rot=20, lines=600, orders="1")], 0,
                reflect(chain(free(148), anamorphic(math.cos(ti), math.cos(td)))),
                "the grating's in-plane anamorphic factor", track=1)
    # A Keplerian expander, f1 = 50 and f2 = 150 mm, 200 mm apart.
    matrix_case("Keplerian expander f1 = 50, f2 = 150 mm", [element("lens", 100, f=50), element("lens", 300, f=150)], 2,
                chain(free(48), lens(50), free(200), lens(150)), "magnification -3")

    # The issue's analytic waists: 100 um at 1 um, the input waist on the lens.
    for label, f, m2 in [("z_R >> f (f = 1 mm)", 1.0, 1), ("f = z_R = 31.416 mm", 31.41592653589793, 1),
                         ("M^2 = 2, f = z_R = 15.708 mm", 15.707963267948966, 2)]:
        w0, distance, zr = q_after_lens(100, 1000, m2, f)
        out.append({
            "name": f"waist after an ideal thin lens, 100 um at 1 um, waist on the lens, {label}",
            "inputs": {"kind": "waist", "waistUm": 100, "m2": m2, "focalMm": f, "lensX": 200},
            "expected": {"waistUm": sig(w0, 12), "distanceMm": sig(distance, 12)},
            "tolerance": {"waistUm": 1e-6, "distanceMm": 1e-6},
            "note": "the q law through the lens",
        })
    return out


def analytic_anchors():
    """The numbers the issue quotes, from the q law here."""
    w0, d, _ = q_after_lens(100, 1000, 1, 31.41592653589793)
    assert abs(w0 - 70.711) < 5e-4 and abs(d - 15.708) < 5e-4, (w0, d)
    w0, d, _ = q_after_lens(100, 1000, 2, 15.707963267948966)
    assert abs(w0 - 70.711) < 5e-4 and abs(d - 7.854) < 5e-4, (w0, d)
    # The cone estimate lambda f/(pi w) the M^2 = 2 waist is compared with:
    # 50 um, against the propagated 70.711 um.
    assert abs(1000e-6 * 15.707963267948966 / (math.pi * 0.1) * 1e3 - 50) < 1e-9
    w0, d, zr = q_after_lens(100, 1000, 1, 1.0)
    assert abs(w0 / (1000e-6 * 1.0 / (math.pi * 0.1) * 1e3) - 1) < 1e-3, w0


analytic_anchors()


MODEL = {
    "id": "beam-propagation",
    "title": "Beam propagation in the drawing plane: measured ray-transfer matrices and the Gaussian beam",
    "app": "sketch/js/beam-propagation.js: companionStarts, measuredMatrix; sketch/js/raytrace.js: propagateBeams; sketch/js/gaussian-beam.js: transformQ, beamFromQ",
    "reference": "Analytic ray-transfer matrices (free space, thin lens, spherical surface, tilted concave mirror, tilted plane interface, prism, grating) multiplied in order, and the q law through them ([code](../validation/reference/beam_propagation.py))",
    "citations": [
        "H. Kogelnik and T. Li, 'Laser beams and resonators,' Appl. Opt. 5, 1550-1567 (1966)",
        "A. E. Siegman, Lasers (University Science Books, 1986), chapters 15 and 20",
        "P. A. Belanger, 'Beam propagation and the ABCD ray matrices,' Opt. Lett. 16, 196-198 (1991)",
    ],
    "fidelity": "computed",
    "scope": "Paraxial Gaussian beams in the drawing plane, through elements met with the central ray in the plane; thin and thick lenses, a tilted concave mirror, plane interfaces, a prism, a grating, a two-lens expander; ideal-thin-lens waists for M^2 = 1 and 2.",
    "outside_scope": "The out-of-plane beam (G3), aberrations beyond first order, clipping (declined, not modelled), elements without a paraxial model (declined).",
    "provenance": "Expected matrices and waists computed here from the analytic forms; the issue's three waist values asserted from the q law.",
    "domain": "One scene per element kind, read after a stated interaction; three waist cases.",
    "convergence": "The app's companions are a first-order finite difference; test/beam-propagation.test.js shows the measured matrices converging to these as the offset and tilt shrink.",
    "tolerance_rationale": "1e-6 on A and D, 2e-4 mm on B (about 1e-6 of the paths), 1e-8 mm^-1 on C, all absolute, 1e-6 on the determinant: the companions' finite-difference error at 0.1 um and 1 urad stays inside these for every case (up to about 1e-4 mm on B). Waists 1e-6 relative.",
}
