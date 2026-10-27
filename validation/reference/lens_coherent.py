# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Lens designer, coherent analyses: the image of two points and of a
grating in incoherent and coherent light, and the coupling of the focused
light into a single-mode fiber.

Reference methods, chosen to differ from the app's (calculators/lens-design/
engine/imaging.js and coupling.js), which work on a square grid of pupil
samples with fast Fourier transforms and neighbour differences:

- the pupil is integrated by Gauss-Legendre quadrature in the radius and the
  trapezoidal rule in the azimuth (exact at the rim), on rays traced by
  lens_design.py's own bisection trace;
- the image of two points is the Debye sum evaluated point by point, with
  the pupil mapped to directions by the documented affine fit (the model the
  app's FFT assumes), fitted here from this file's own rays;
- in coupling, the solid angle of each pupil element comes from a polynomial
  fitted to the traced directions and differentiated analytically (the app
  differences neighbouring samples), and the mode's normalization over the
  hemisphere by Simpson's rule (the app sums a series);
- a perfect lens is checked against closed forms: the Airy amplitude
  2 J1(v)/v (Bessel function from its integral), the grating's Fourier
  series through the diffraction-limited MTF and the coherent transfer
  function, and the Gaussian overlaps (mode mismatch, lateral and axial
  offsets, tilt) and the best Gaussian for a uniform pupil.

The relative sign of the wavefront W and of the Debye kernel is pinned
geometrically before any case is written (check_debye_convention): moving
the reference sphere's centre sideways must leave the computed focus where
the rays meet.
"""

import json
import math

from common import sig
from lens_design import first_order, trace, media, base, pcx, COOKE, n_of
from fiber_coupling import bessel_j

RAYLEIGH = 3.8317059702075125 / (2 * math.pi)


# ------------------------------------------------------------- quadrature

def gauss_legendre(n):
    """Nodes and weights on [-1, 1], by Newton's method on P_n."""
    out = []
    for i in range(1, n + 1):
        x = math.cos(math.pi * (i - 0.25) / (n + 0.5))
        for _ in range(100):
            p0, p1 = 1.0, x
            for k in range(2, n + 1):
                p0, p1 = p1, ((2 * k - 1) * x * p1 - (k - 1) * p0) / k
            dp = n * (x * p1 - p0) / (x * x - 1)
            dx = p1 / dp
            x -= dx
            if abs(dx) < 1e-16:
                break
        out.append((x, 2 / ((1 - x * x) * dp * dp)))
    return out


def pupil_nodes(nr=20, nphi=64):
    """(px, py, weight) over the unit disc: weight = rho drho dphi."""
    nodes = []
    for x, w in gauss_legendre(nr):
        rho = (x + 1) / 2
        for j in range(nphi):
            phi = 2 * math.pi * (j + 0.5) / nphi
            nodes.append((rho * math.cos(phi), rho * math.sin(phi), w / 2 * rho * 2 * math.pi / nphi))
    return nodes


def simpson(f, a, b, n=4000):
    h = (b - a) / n
    total = f(a) + f(b)
    for k in range(1, n):
        total += (4 if k % 2 else 2) * f(a + k * h)
    return total * h / 3


# --------------------------------------------------------------- geometry

class Pupil:
    """One field at one wavelength (the primary one): rays traced once."""

    def __init__(self, system, field, z_image, nodes):
        self.system = system
        self.nm = system["wavelengthsNm"][system["primaryWavelength"]]
        self.fo = first_order(system, self.nm)
        self.n_img = media(system, self.nm)[-1]
        self.field = field
        z_last = sum(s["thickness"] for s in system["surfaces"][:-1])
        self.E = [0.0, 0.0, z_last + self.fo["zXp"]]
        self.z_image = z_image
        pc, dc, oc = trace(system, self.nm, field, 0.0, 0.0, self.fo)
        t = (z_image - pc[2]) / dc[2]
        self.C = [pc[i] + t * dc[i] for i in range(3)]
        self.chief = (pc, dc, oc)
        self.nodes = nodes
        self.rays = [trace(system, self.nm, field, px, py, self.fo) for px, py, _ in nodes]
        assert all(r is not None for r in self.rays)

    def crossing(self, ray, C):
        """Where the ray meets the sphere centred on C through the exit pupil
        (the crossing nearer the pupil), and the optical path to it."""
        p, d, opl = ray
        R = math.sqrt(sum((C[i] - self.E[i]) ** 2 for i in range(3)))
        w = [p[i] - C[i] for i in range(3)]
        b = sum(d[i] * w[i] for i in range(3))
        c = sum(v * v for v in w) - R * R
        root = math.sqrt(b * b - c)
        s = min((-b - root, -b + root), key=lambda s: sum((p[i] + s * d[i] - self.E[i]) ** 2 for i in range(3)))
        point = [p[i] + s * d[i] for i in range(3)]
        return point, opl + self.n_img * s, R

    def sphere(self, C):
        """Directions (C - S)/R, and W (waves) from the chief ray."""
        _, chief_path, _ = self.crossing(self.chief, C)
        out = []
        for ray in self.rays:
            S, path, R = self.crossing(ray, C)
            out.append(([(C[i] - S[i]) / R for i in range(3)], (chief_path - path) / (self.nm * 1e-6)))
        return out


def lstsq(rows, values):
    """Least squares by the normal equations, Gaussian elimination."""
    n = len(rows[0])
    A = [[sum(r[i] * r[j] for r in rows) for j in range(n)] + [sum(r[i] * v for r, v in zip(rows, values))] for i in range(n)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(A[r][col]))
        A[col], A[piv] = A[piv], A[col]
        for r in range(n):
            if r != col:
                f = A[r][col] / A[col][col]
                A[r] = [A[r][k] - f * A[col][k] for k in range(n + 1)]
    return [A[i][n] / A[i][i] for i in range(n)]


def affine_scale(pupil_cells):
    """a_x = dl/dpx and a_y = dm/dpy from a plane fitted to the directions
    of a 12 x 12 cell grid (the documented model of the app's FFT)."""
    rows = [[1.0, px, py] for px, py, _ in pupil_cells.nodes]
    dirs = pupil_cells.sphere(pupil_cells.C)
    cx = lstsq(rows, [s[0] for s, _ in dirs])
    cy = lstsq(rows, [s[1] for s, _ in dirs])
    return cx[1], cy[2]


def cell_grid(n=12):
    out = []
    for i in range(n):
        y = (i + 0.5 - n / 2) * 2 / n
        for j in range(n):
            x = (j + 0.5 - n / 2) * 2 / n
            if x * x + y * y <= 1:
                out.append((x, y, 1.0))
    return out


# ---------------------------------------------------------------- imaging

def amplitude(pupil, a, x, y):
    """Debye sum of a uniformly lit pupil at image position (x, y) mm from
    the reference point, with P = exp(-2 pi i W) and the kernel
    exp(+2 pi i n (l x + m y) / lambda), l = a_x p_x, m = a_y p_y;
    relative to a perfect lens's peak."""
    lam = pupil.nm * 1e-6
    total, norm = 0j, 0.0
    for (px, py, w), (_, W) in zip(pupil.nodes, pupil.dirs):
        ph = -2 * math.pi * W + 2 * math.pi * pupil.n_img * (a[0] * px * x + a[1] * py * y) / lam
        total += w * complex(math.cos(ph), math.sin(ph))
        norm += w
    return total / norm


def two_point(pupil, a, points, phase, at):
    out = []
    for x, y in at:
        h = [amplitude(pupil, a, x - px, y - py) for px, py in points]
        out.append((abs(h[0]) ** 2 + abs(h[1]) ** 2, abs(h[0] + h[1] * complex(math.cos(phase), math.sin(phase))) ** 2))
    return out


def check_debye_convention():
    """With the sphere centred delta to the side of the focus, the Debye
    intensity must peak back at the focus (-delta from the centre)."""
    system = pcx(True, 4.0)
    nm = 587.5618
    fo = first_order(system, nm)
    z_image = sum(s["thickness"] for s in system["surfaces"][:-1]) + fo["imageDistance"]
    pupil = Pupil(system, 0.0, z_image, pupil_nodes(10, 24))
    a = affine_scale(Pupil(system, 0.0, z_image, cell_grid()))
    delta = 0.004
    C = [pupil.C[0], pupil.C[1] + delta, pupil.C[2]]
    pupil.dirs = pupil.sphere(C)
    ys = [-0.008 + 0.0002 * k for k in range(81)]
    values = [abs(amplitude(pupil, a, 0.0, y)) ** 2 for y in ys]
    peak = ys[values.index(max(values))]
    assert abs(peak + delta) < 0.0003, f"Debye convention: peak at {peak} mm, expected {-delta}"


def airy(v):
    return 1.0 if v == 0 else 2 * bessel_j(1, v) / v


def mtf_perfect(r):
    if r >= 1:
        return 0.0
    phi = math.acos(r)
    return 2 / math.pi * (phi - math.cos(phi) * math.sin(phi))


def grating_modulation(r, coherent):
    """A clear-centred square-wave grating of frequency r times 2 NA/lambda
    through a perfect lens with a uniform pupil: its Fourier series 1/2 and
    sin(m pi/2)/(m pi), each harmonic times the transfer function (the OTF in
    incoherent light; the pupil, 1 below NA/lambda, in coherent light, where
    the amplitude is squared)."""
    def value(x):
        s = 0.5
        for m in range(1, 200, 2):
            c = 2 * math.sin(m * math.pi / 2) / (m * math.pi)
            t = (1.0 if m * r < 0.5 else 0.0) if coherent else mtf_perfect(m * r)
            s += c * t * math.cos(2 * math.pi * m * x)
        return s * s if coherent else s
    vals = [value(k / 4000) for k in range(4000)]
    return (max(vals) - min(vals)) / (max(vals) + min(vals))


# --------------------------------------------------------------- coupling

def mode_norm(theta):
    """Integral of exp(-2 sin^2 a / theta^2) over the hemisphere."""
    top = min(math.pi / 2, 14 * theta)
    return 2 * math.pi * simpson(lambda a: math.exp(-2 * math.sin(a) ** 2 / theta ** 2) * math.sin(a), 0.0, top, 20000)


def poly_terms(x, y, degree=8):
    return [x ** i * y ** (k - i) for k in range(degree + 1) for i in range(k + 1)]


def poly_grad(coef, x, y, degree=8):
    gx = gy = 0.0
    idx = 0
    for k in range(degree + 1):
        for i in range(k + 1):
            j = k - i
            c = coef[idx]
            idx += 1
            if i:
                gx += c * i * x ** (i - 1) * y ** j
            if j:
                gy += c * j * x ** i * y ** (j - 1)
    return gx, gy


def fiber_axis(c, tilt_mrad):
    """The chief-ray direction c turned by the tilt: a rotation (Rodrigues)
    by t = hypot(tx, ty) about the unit vector c x d, where d is the
    direction across c that the tilt points to, tx along the direction
    across c nearest +x and ty along c x (that one). The angle from c is
    then t, which is checked."""
    tx, ty = tilt_mrad[0] * 1e-3, tilt_mrad[1] * 1e-3
    t = math.hypot(tx, ty)
    if t == 0:
        return list(c)
    ex = [1.0 - c[0] * c[0], -c[0] * c[1], -c[0] * c[2]]
    norm = math.sqrt(sum(v * v for v in ex))
    ex = [v / norm for v in ex]
    ey = cross(c, ex)
    d = [(tx * ex[i] + ty * ey[i]) / t for i in range(3)]
    k = cross(c, d)
    kv = cross(k, c)
    kdot = sum(k[i] * c[i] for i in range(3))
    axis = [c[i] * math.cos(t) + kv[i] * math.sin(t) + k[i] * kdot * (1 - math.cos(t)) for i in range(3)]
    angle = math.acos(max(-1.0, min(1.0, sum(axis[i] * c[i] for i in range(3)))))
    assert abs(angle - t) < 1e-12, (angle, t)
    return axis


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def coupling(pupil, mfd_um, offset_um=(0.0, 0.0, 0.0), tilt_mrad=(0.0, 0.0), beam_ratio=None):
    """eta for a Gaussian mode (1/e^2 radius mfd/2) with its core at the
    chief ray's image point plus `offset` and its axis along the chief ray
    turned by `tilt`."""
    lam = pupil.nm * 1e-6
    theta = lam / (math.pi * pupil.n_img * mfd_um * 1e-3 / 2)
    C = [pupil.C[i] + offset_um[i] * 1e-3 for i in range(3)]
    dirs = pupil.sphere(C)
    rows = [poly_terms(px, py) for px, py, _ in pupil.nodes]
    cx = lstsq(rows, [s[0] for s, _ in dirs])
    cy = lstsq(rows, [s[1] for s, _ in dirs])
    pc, dc, _ = pupil.chief
    axis = fiber_axis(dc, tilt_mrad)
    total, power = 0j, 0.0
    for (px, py, w), (s, W) in zip(pupil.nodes, dirs):
        lx, ly = poly_grad(cx, px, py)
        mx, my = poly_grad(cy, px, py)
        jac = abs(lx * my - ly * mx) / s[2]
        A = math.exp(-(px * px + py * py) / beam_ratio ** 2) if beam_ratio else 1.0
        cross = ((s[1] * axis[2] - s[2] * axis[1]) ** 2 + (s[2] * axis[0] - s[0] * axis[2]) ** 2
                 + (s[0] * axis[1] - s[1] * axis[0]) ** 2)
        M = math.exp(-cross / theta ** 2)
        total += w * A * M * math.sqrt(jac) * complex(math.cos(-2 * math.pi * W), math.sin(-2 * math.pi * W))
        power += w * A * A
    return abs(total) ** 2 / (power * mode_norm(theta))


def golden_max(f, a, b, steps=120):
    g = (math.sqrt(5) - 1) / 2
    x1, x2 = b - g * (b - a), a + g * (b - a)
    f1, f2 = f(x1), f(x2)
    for _ in range(steps):
        if f1 > f2:
            b, x2, f2 = x2, x1, f1
            x1 = b - g * (b - a)
            f1 = f(x1)
        else:
            a, x1, f1 = x1, x2, f2
            x2 = a + g * (b - a)
            f2 = f(x2)
    return max(f1, f2)


# ------------------------------------------------------------------ cases

def perfect(**diffraction):
    s = base([{"type": "paraxial", "focal": 100.0, "thickness": 100.0, "stop": True}],
             epd=10.0, wavelengths=(587.5618,), primary=0, focus="paraxial")
    s["diffraction"] = {"grid": 128, "padding": 2, **diffraction}
    return s


def image_z(system):
    nm = system["wavelengthsNm"][system["primaryWavelength"]]
    fo = first_order(system, nm)
    z_last = sum(s["thickness"] for s in system["surfaces"][:-1])
    return z_last + (fo["imageDistance"] if system["image"]["focus"] == "paraxial" else system["surfaces"][-1]["thickness"])


def cases():
    check_debye_convention()
    out = []

    # Perfect lens: two points at the Rayleigh distance.
    v = 3.8317059702075125 / 2
    a = airy(v)
    for phase, key in ((0.0, "in phase"), (180.0, "in antiphase")):
        system = perfect()
        system["imaging"] = {"target": "points", "separation": 1.0, "phaseDeg": phase}
        out.append({
            "name": f"perfect lens F/10, two points at the Rayleigh distance, coherent {key}: midpoint intensity",
            "inputs": {"kind": "two-point-midpoint", "system": system},
            "expected": {"incoherent": sig(2 * a * a), "coherent": sig(abs(2 * a) ** 2 if phase == 0 else 0.0)},
            "tolerance": {"incoherent": 3e-3, "coherent": 3e-3},
            "absolute": True,
            "note": "Airy amplitude 2 J1(v)/v at v = 3.8317/2 from each point; the app sums a 128-sample pupil grid",
        })

    # Perfect lens: gratings.
    for frac in (0.25, 0.4, 0.6):
        system = perfect(grid=64)
        system["imaging"] = {"target": "grating", "frequency": frac, "axis": "x"}
        r = round(frac * 64) / 64
        out.append({
            "name": f"perfect lens F/10, square-wave grating at {r:.5f} of the incoherent cutoff: modulation",
            "inputs": {"kind": "grating", "system": system},
            "expected": {"incoherent": sig(grating_modulation(r, False)), "coherent": sig(grating_modulation(r, True))},
            "tolerance": {"incoherent": 3e-3, "coherent": 3e-3},
            "absolute": True,
            "note": "the frequency is rounded to a whole number of periods across the computed field, round(fraction x N) / N of the cutoff",
        })

    # Perfect lens: fiber coupling closed forms.
    lam = 587.5618e-6
    best = golden_max(lambda u: 2 * (1 - math.exp(-u * u)) ** 2 / (u * u), 0.5, 2.0)
    out.append({
        "name": "perfect lens F/10, uniform pupil: best Gaussian mode, 2 (1 - exp(-alpha^2))^2 / alpha^2 at its maximum",
        "inputs": {"kind": "coupling-best", "system": perfect()},
        "expected": {"eta": sig(best)},
        "tolerance": {"eta": 1e-3},
        "absolute": True,
        "note": "alpha = NA / theta0; the closed form is paraxial (the app's mode on the sphere adds theta^2/4 terms, about 5e-4 here)",
    })
    beta = 0.4
    w_in = beta * 5.0
    w0 = lam * 100.0 / (math.pi * w_in)
    z_r = math.pi * w0 * w0 / lam
    trunc = 1 - math.exp(-2 / beta ** 2)
    theta0 = w_in / 100.0
    for name, offset, tilt, expected in [
        ("matched mode", (0, 0, 0), (0, 0), trunc),
        ("core 1 um off axis", (0, 1.0, 0), (0, 0), trunc * math.exp(-(1e-3 / w0) ** 2)),
        ("core 2 um off axis in x", (2.0, 0, 0), (0, 0), trunc * math.exp(-(2e-3 / w0) ** 2)),
        ("face one Rayleigh range past the focus", (0, 0, z_r * 1e3), (0, 0), trunc / (1 + 0.25)),
        ("fiber tilted by half the far-field angle", (0, 0, 0), (0, theta0 * 500), trunc * math.exp(-0.25)),
    ]:
        system = perfect(illumination="gaussian", beamRatio=beta)
        system["coupling"] = {"mfdUm": 2e3 * w0, "offsetXUm": offset[0], "offsetYUm": offset[1], "axialUm": offset[2], "tiltXMrad": tilt[0], "tiltYMrad": tilt[1]}
        out.append({
            "name": f"perfect lens f 100 mm, Gaussian beam w = {w_in} mm, mode w0 = lambda f/(pi w): {name}",
            "inputs": {"kind": "coupling", "system": system},
            "expected": {"eta": sig(expected)},
            "tolerance": {"eta": 1e-4},
            "absolute": True,
            "note": "Gaussian overlaps: exp(-d^2/w0^2), 1/(1 + (dz/2 zR)^2), exp(-t^2/theta0^2), times the beam's share inside the pupil, 1 - exp(-2/beta^2); paraxial",
        })

    # Real lenses: rays traced here, integrated by quadrature.
    singlet = pcx(True, 4.0)
    singlet["fields"] = {"type": "angle", "values": [0.0, 3.0]}
    cooke = json.loads(json.dumps(COOKE))
    cooke["wavelengthsNm"] = [550.0]
    cooke["primaryWavelength"] = 0
    for name, system, fi, field in [("curved-side-first singlet", singlet, 0, 0.0), ("curved-side-first singlet", singlet, 1, 3.0), ("Cooke triplet", cooke, 0, 0.0)]:
        z = image_z(system)
        nodes = pupil_nodes()
        pupil = Pupil(system, field, z, nodes)
        a = affine_scale(Pupil(system, field, z, cell_grid()))
        pupil.dirs = pupil.sphere(pupil.C)
        lam = pupil.nm * 1e-6
        s = RAYLEIGH * lam / (pupil.n_img * abs(a[0]))
        points = [[s / 2, 0.0], [-s / 2, 0.003]]
        at = [[0.0, 0.0], [s / 2, 0.0], [-0.002, 0.004], [0.003, -0.002]]
        for phase in (0.0, 120.0):
            values = two_point(pupil, a, points, math.radians(phase), at)
            sys_img = json.loads(json.dumps(system))
            sys_img["diffraction"] = {"grid": 128, "padding": 2, "vignetting": False}
            out.append({
                "name": f"{name}, field {field} deg, {pupil.nm} nm: two points, second at phase {phase} deg, intensity at four positions",
                "inputs": {"kind": "two-point", "system": sys_img, "field": fi, "points": points, "phaseDeg": phase, "at": at},
                "expected": {f"{k}{i}": sig(v[j], 6) for i, v in enumerate(values) for j, k in enumerate(("incoherent", "coherent"))},
                "tolerance": {f"{k}{i}": 3e-3 for i in range(len(at)) for k in ("incoherent", "coherent")},
                "absolute": True,
                "note": "relative to a perfect lens's peak; the app sums a 128-sample square grid, this file a 20 x 64 polar quadrature",
            })
        best_mfd = 2e3 * lam / (math.pi * pupil.n_img * abs(a[0]) / 1.1209)
        for label, offset, tilt, ratio in [
            ("aligned, uniform pupil", (0, 0, 0), (0, 0), None),
            ("Gaussian beam 0.8 pupil radii, core 1 um up and 20 um past the image", (0, 1.0, 20.0), (0, 0), 0.8),
            ("Gaussian beam 0.8 pupil radii, core 1 um down and 20 um past the image", (0, -1.0, 20.0), (0, 0), 0.8),
            ("Gaussian beam 0.8 pupil radii, core 1 um up, tilted 20 mrad up", (0, 1.0, 0), (0, 20.0), 0.8),
            ("Gaussian beam 0.8 pupil radii, core 1 um up, tilted 20 mrad down", (0, 1.0, 0), (0, -20.0), 0.8),
            ("Gaussian beam 0.8 pupil radii, tilted 30 mrad in x and -20 mrad in y", (0, 0, 0), (30.0, -20.0), 0.8),
        ]:
            eta = coupling(pupil, best_mfd, offset, tilt, ratio)
            sys_c = json.loads(json.dumps(system))
            sys_c["diffraction"] = {"grid": 128, "padding": 2, "vignetting": False,
                                    **({"illumination": "gaussian", "beamRatio": ratio} if ratio else {})}
            sys_c["coupling"] = {"mfdUm": best_mfd, "offsetXUm": offset[0], "offsetYUm": offset[1], "axialUm": offset[2], "tiltXMrad": tilt[0], "tiltYMrad": tilt[1]}
            out.append({
                "name": f"{name}, field {field} deg, {pupil.nm} nm, MFD {best_mfd:.3f} um: coupling, {label}",
                "inputs": {"kind": "coupling", "system": sys_c, "field": fi},
                "expected": {"eta": sig(eta, 6)},
                "tolerance": {"eta": 5e-4 if ratio else 2e-3},
                "absolute": True,
                "note": "the app sums a 128-sample square grid with neighbour-difference solid angles; this file integrates a 20 x 64 polar quadrature with a fitted polynomial's derivatives",
            })
    return out


MODEL = {
    "id": "lens-coherent",
    "title": "Lens designer: imaging in coherent and incoherent light, and fiber coupling",
    "app": "calculators/lens-design/engine/imaging.js: analyzeImaging, twoPointAt; calculators/lens-design/engine/coupling.js: analyzeCoupling",
    "reference": "Pupil integrals by Gauss-Legendre (radius) x trapezoid (azimuth) quadrature on lens_design.py's bisection trace; the Debye sum point by point; solid angles from a fitted polynomial's derivatives; the mode's hemisphere normalization by Simpson's rule; closed forms for a perfect lens (Airy amplitude, grating Fourier series through the MTF and the coherent cutoff, Gaussian overlaps)",
    "citations": [
        "J. W. Goodman, Introduction to Fourier Optics, 3rd ed. (Roberts & Company, 2005), ch. 6: coherent and incoherent imaging, the coherent transfer function and the OTF",
        "M. Born and E. Wolf, Principles of Optics, 7th ed. (Cambridge University Press, 1999), section 8.5: the Airy pattern",
        "A. E. Siegman, Lasers (University Science Books, 1986), section 17.2: Gaussian beam focusing",
    ],
    "provenance": "Textbook relations evaluated here; the coupling overlaps of Gaussian beams are derived from the overlap integral and checked against the numerical quadrature, not transcribed.",
    "domain": "A perfect F/10 lens at 587.6 nm; a curved-side-first N-BK7 singlet (F/10) on axis and at 3 deg; the Cooke triplet (F/5) on axis at 550 nm; separations near the Rayleigh distance; offsets of a few micrometres, tilts of 20 mrad.",
    "convergence": "20 x 64 polar nodes (the wavefronts here stay below a wave, so the azimuthal trapezoid converges well past 1e-6); a degree-8 polynomial for the directions; Simpson's rule on 20000 intervals for the mode's normalization.",
    "tolerance_rationale": "The app's square pupil grid (128 samples across) has a staircase rim that differs from the circle: 3e-3 on the images and 2e-3 on coupling through a uniformly lit pupil allow for it (the largest differences found are 2.0e-3 and 1.0e-3); a Gaussian beam of 0.8 pupil radii is dim at the rim, so 5e-4 (found: 3.1e-4); the perfect lens's Gaussian overlaps, which barely reach the rim, 1e-4 (found: 2e-5). Expected values are stored to 6 significant digits, as the last digits depend on the platform's maths library.",
    "outside_scope": "Partial coherence, vector (high-NA) diffraction, fiber modes other than a Gaussian, and the Fresnel-number focal shift are outside this model.",
    "fidelity": "computed",
    "scope": "Scalar, isoplanatic imaging of a target through one field point's wavefront, in fully coherent and fully incoherent light; coherent coupling of the focused light into a Gaussian fiber mode.",
}
