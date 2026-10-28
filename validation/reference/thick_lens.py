# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Thin and thick lens calculator: the first-order data of a spherical
singlet, a singlet designed from its focal length, the Gaussian focus of a
collimated beam, and the real singlet's focus and fiber coupling, the fiber
set off laterally and tilted.

Reference methods, chosen to differ from the app's
(calculators/thin-thick-lens/thick-lens.js), which takes the system matrix
from two y-nu rays, solves a bi-convex design by bisection on that matrix's
power, focuses a Gaussian beam with Self's thin-lens equations between the
principal planes, and integrates the real singlet's focus over the pupil
radius by Simpson's rule and the azimuth of an offset fiber by the
trapezoid rule:

- the lens data from the closed forms of the thick-lens lensmaker's
  equation and of the principal planes (Wikipedia, "Lens"; "Cardinal
  point"), with the index from sellmeier.py's own coefficients;
- a design from f: the plano-convex radius (n - 1) f, and a bi-convex one
  solved by the secant method on the closed-form power, with the best-form
  ratio from the Coddington shape factor (Wikipedia, "Spherical
  aberration");
- the Gaussian focus by carrying the complex beam parameter q through the
  two refracting surfaces and the glass between them (ray-transfer matrices
  of a spherical interface and of a slab, applied to q directly), and
  finding the waist where Re q = 0;
- the real singlet by lens_design.py's bisection ray trace at Gauss-Legendre
  nodes along the pupil radius (the app: an even grid and Simpson's rule),
  each node traced with two neighbours so that the directions' area ratio
  comes from a central difference (the app: neighbouring grid samples),
  another plane by the phase each plane wave gains, dz cos(theta) (the
  Debye-Wolf form), the peak as the pupil sum and the mode's normalization
  by Simpson's rule
  (lens_coherent.mode_norm; the app sums a series); an offset fiber's
  azimuth by Gauss-Legendre nodes over [0, pi] (the app: the trapezoid
  rule); and, for the example
  lens, the fiber overlap at the paraxial focus once more over the whole pupil by
  lens_coherent.coupling (a polar grid, the directions from a fitted
  polynomial). A 2-D polynomial fit cannot follow the directions of a
  strongly aberrated lens such as the flat-first singlet (it is 0.02 off
  there), so the radial method is the one used for the others.
"""

import cmath
import math

from common import sig
from lens_design import first_order, base, n_of
from lens_coherent import Pupil, pupil_nodes, coupling, gauss_legendre, mode_norm


def lens(glass, nm, r1, r2, t):
    """Thick-lens closed forms; 0 is a flat face."""
    n = n_of(glass, nm)
    c1 = 1 / r1 if r1 else 0.0
    c2 = 1 / r2 if r2 else 0.0
    power = (n - 1) * (c1 - c2 + (n - 1) * t * c1 * c2 / n)
    f = 1 / power
    h1 = -f * (n - 1) * t * c2 / n
    h2 = -f * (n - 1) * t * c1 / n
    thin = 1 / ((n - 1) * (c1 - c2))
    return {"n": n, "f": f, "h1": h1, "h2": h2, "bfl": f + h2, "ffl": f - h1, "thin": thin}


def sag(r, h):
    return r - math.sqrt(r * r - h * h)


def design(glass, nm, kind, f, diameter, edge, orientation="convex", shape="equi"):
    """Signed radii and centre thickness for focal length f, clear diameter
    and edge thickness: plano-convex R = (n - 1) f; bi-convex |R2| = k R1
    (k = 1 equi-convex; best form (1 + c)/(1 - c), c = 2(n^2 - 1)/(n + 2)),
    R1 by the secant method on the closed-form power."""
    n = n_of(glass, nm)
    h = diameter / 2
    if kind == "planoconvex":
        r = (n - 1) * f
        t = edge + sag(r, h)
        return (0.0, -r, t) if orientation == "plano" else (r, 0.0, t)
    c = 2 * (n * n - 1) / (n + 2)
    k = 1.0 if shape == "equi" else (1 + c) / (1 - c)

    def g(r1):
        t = edge + sag(r1, h) + sag(k * r1, h)
        return 1 / lens(glass, nm, r1, -k * r1, t)["f"] - 1 / f

    # From the thin lens's R1 = (n - 1) f (1 + k)/k; a step is kept above
    # the smallest radius that reaches the clear diameter.
    least = h * max(1, 1 / k)
    a = (n - 1) * f * (1 + k) / k
    b = 1.05 * a
    for _ in range(200):
        ga, gb = g(a), g(b)
        if gb == ga:
            break
        nxt = b - gb * (b - a) / (gb - ga)
        a, b = b, nxt if nxt > least else (b + least) / 2
        if abs(b - a) < 1e-15 * abs(b):
            break
    r1 = b
    return r1, -k * r1, edge + sag(r1, h) + sag(k * r1, h)


def gaussian_focus(glass, nm, r1, r2, t, beam_diameter_mm):
    """A collimated beam (waist at V1) through both faces, by the ABCD law
    on q: refraction at a spherical face [[1, 0], [(n1 - n2)/(R n2), n1/n2]],
    a slab of glass [[1, t], [0, 1]]; then the waist after V2."""
    n = n_of(glass, nm)
    lam = nm * 1e-6
    w = beam_diameter_mm / 2
    q = 1j * math.pi * w * w / lam

    def apply(m, q):
        return (m[0][0] * q + m[0][1]) / (m[1][0] * q + m[1][1])

    def face(r, n1, n2):
        return [[1.0, 0.0], [((n1 - n2) / (r * n2)) if r else 0.0, n1 / n2]]

    q = apply(face(r1, 1.0, n), q)
    q = apply([[1.0, t], [0.0, 1.0]], q)
    q = apply(face(r2, n, 1.0), q)
    z = -q.real
    q_waist = q + z
    zr = q_waist.imag
    return {"waistUm": math.sqrt(lam * zr / math.pi) * 1e3, "fromV2Mm": z, "rayleighMm": zr}


def singlet(glass, nm, r1, r2, t, diameter, beam_diameter):
    """The real singlet as the page sets it up: the front face is the stop,
    the pupil is lit out to 3.5 beam radii or the clear diameter."""
    w = beam_diameter / 2
    epd = min(diameter, 7 * w)
    data = lens(glass, nm, r1, r2, t)
    system = base([
        {"radius": r1, "thickness": t, "material": glass, "stop": True},
        {"radius": r2, "thickness": data["bfl"], "material": "air"},
    ], epd=epd, wavelengths=(nm,), primary=0, focus="paraxial")
    fo = first_order(system, nm)
    z_focus = t + fo["imageDistance"]
    return system, z_focus, w / (epd / 2)


def focus_values(system, z_focus, beta, mfd_um, shifts_mm, nr=256, delta=1e-5, offsets=None, nphi=160):
    """Peak intensity relative to the unaberrated pupil at the paraxial
    focus, and the coupling into a fiber at each shift, its core moved by
    `offsets` [(lateral mm, tilt rad)] across the axis in the x-z plane. On
    axis the pupil is round: Gauss-Legendre nodes along one radius, each
    traced with two neighbours at +/- delta, whose directions give ds/drho by
    a central difference; the mode's far field exp(-sin^2 alpha/theta0^2),
    alpha from the fiber's axis, and the phase 2 pi s cos(phi) dx/lambda
    averaged over the azimuth phi by Gauss-Legendre nodes on [0, pi]."""
    radii = [(x + 1) / 2 for x, _ in gauss_legendre(nr)]
    weights = [w / 2 for _, w in gauss_legendre(nr)]
    nodes = [(r + e, 0.0, 1.0) for r in radii for e in (-delta, 0.0, delta)]
    pupil = Pupil(system, 0.0, z_focus, nodes)
    nm = system["wavelengthsNm"][0]
    theta = nm * 1e-3 / (math.pi * mfd_um / 2)
    amp = [math.exp(-r * r / beta ** 2) for r in radii]

    # The pupil on the sphere about the paraxial focus; another plane, dz
    # past it, adds dz (1 - cos theta) / lambda to each plane wave's W.
    dirs = pupil.sphere(pupil.C)
    lam = nm * 1e-6
    base_rows = []
    for k, r in enumerate(radii):
        lo, mid, hi = dirs[3 * k], dirs[3 * k + 1], dirs[3 * k + 2]
        sv = abs(mid[0][0])
        ds = (abs(hi[0][0]) - abs(lo[0][0])) / (2 * delta)
        base_rows.append((sv, sv / r * ds, mid[1]))

    def plane(shift):
        return [(sv, j, W + shift * (1 - math.sqrt(1 - sv * sv)) / lam) for sv, j, W in base_rows]

    # The Debye integrand per unit pupil area, A sqrt(J / cos theta): the
    # amplitude A sqrt(cos theta / J) per unit solid angle, summed over
    # d^2s / cos theta = J d^2rho / cos theta.
    def field(a, sv, j):
        return a * math.sqrt(j / math.sqrt(1 - sv * sv))

    norm = sum(w * field(a, sv, j) * r for w, a, r, (sv, j, _) in zip(weights, amp, radii, base_rows)) ** 2
    power = sum(w * a * a * r for w, a, r in zip(weights, amp, radii))
    phis = [(math.pi * (x + 1) / 2, w / 2) for x, w in gauss_legendre(nphi)]

    def ring(sv, dx, tilt):
        """The mode's far field averaged over the azimuth at sin(theta) = sv."""
        if dx == 0 and tilt == 0:
            return math.exp(-sv * sv / theta ** 2)
        c, st, ct, kx = math.sqrt(1 - sv * sv), math.sin(tilt), math.cos(tilt), 2 * math.pi * dx / lam
        total = 0
        for phi, w in phis:
            ca = sv * math.cos(phi) * st + c * ct
            total += w * math.exp(-(1 - ca * ca) / theta ** 2) * cmath.exp(1j * kx * sv * math.cos(phi))
        return total

    out = []
    for i, shift in enumerate(shifts_mm):
        dx, tilt = offsets[i] if offsets else (0.0, 0.0)
        rows = plane(shift)
        peak = sum(w * field(a, sv, j) * r * cmath.exp(-2j * math.pi * W) for w, a, r, (sv, j, W) in zip(weights, amp, radii, rows))
        over = sum(w * field(a, sv, j) * ring(sv, dx, tilt) * r * cmath.exp(-2j * math.pi * W)
                   for w, a, r, (sv, j, W) in zip(weights, amp, radii, rows))
        out.append((abs(peak) ** 2 / norm, 2 * math.pi * abs(over) ** 2 / (power * mode_norm(theta))))
    return out


LENSES = [
    ("plano-convex N-BK7, R1 = 5.5 mm, t = 3 mm, at 1550 nm (the page's example)", "nbk7", 1550.0, 5.5, 0.0, 3.0),
    ("the same lens turned round, flat side first", "nbk7", 1550.0, 0.0, -5.5, 3.0),
    ("biconvex N-BK7, R = +/-20 mm, t = 5 mm, at 587.6 nm", "nbk7", 587.6, 20.0, -20.0, 5.0),
    ("the example lens at the F line, 486.1 nm", "nbk7", 486.1, 5.5, 0.0, 3.0),
    ("the example lens at the C line, 656.3 nm", "nbk7", 656.3, 5.5, 0.0, 3.0),
    ("positive meniscus N-SF11, R1 = 30, R2 = 80 mm, t = 6 mm, at 800 nm", "nsf11", 800.0, 30.0, 80.0, 6.0),
    ("biconcave fused silica, R = -/+40 mm, t = 2 mm, at 1064 nm", "silica", 1064.0, -40.0, 40.0, 2.0),
    ("thick CaF2 ball-like lens, R = +/-6 mm, t = 10 mm, at 4000 nm", "caf2", 4000.0, 6.0, -6.0, 10.0),
]


def cases():
    out = []
    keys = [("efl", "f"), ("bfl", "bfl"), ("ffl", "ffl"), ("h1Mm", "h1"), ("h2Mm", "h2"), ("thinFocalMm", "thin"), ("n", "n")]
    for name, glass, nm, r1, r2, t in LENSES:
        d = lens(glass, nm, r1, r2, t)
        inputs = {"kind": "lens", "glass": glass, "wavelengthNm": nm, "r1Mm": r1, "r2Mm": r2, "thicknessMm": t, "diameterMm": 4.0}
        nonzero = [(k, a) for k, a in keys if d[a] != 0]
        out.append({
            "name": f"lens data: {name}",
            "inputs": inputs,
            "expected": {k: sig(d[a]) for k, a in nonzero},
            "tolerance": {k: 1e-9 for k, _ in nonzero},
        })
        # A principal plane exactly on a vertex: checked absolutely, in mm.
        zero = [k for k, a in keys if d[a] == 0]
        if zero:
            out.append({
                "name": f"lens data: {name}: the principal plane on its vertex",
                "inputs": inputs,
                "expected": {k: 0.0 for k in zero},
                "tolerance": {k: 1e-12 for k in zero},
                "absolute": True,
            })

    for name, glass, nm, r1, r2, t, bd in [
        ("the example lens, 2 mm beam", "nbk7", 1550.0, 5.5, 0.0, 3.0, 2.0),
        ("flat side first, 2 mm beam", "nbk7", 1550.0, 0.0, -5.5, 3.0, 2.0),
        ("biconvex, 10 mm beam at 587.6 nm", "nbk7", 587.6, 20.0, -20.0, 5.0, 10.0),
        ("meniscus N-SF11, 0.5 mm beam at 800 nm (slow focus)", "nsf11", 800.0, 30.0, 80.0, 6.0, 0.5),
    ]:
        g = gaussian_focus(glass, nm, r1, r2, t, bd)
        out.append({
            "name": f"Gaussian focus: {name}",
            "inputs": {"kind": "gaussian", "glass": glass, "wavelengthNm": nm, "r1Mm": r1, "r2Mm": r2, "thicknessMm": t, "diameterMm": 4.0, "beamDiameterMm": bd},
            "expected": {k: sig(v) for k, v in g.items()},
            "tolerance": {k: 1e-9 for k in g},
        })

    # Singlets designed from f, D and the edge thickness, as the page offers
    # them: the radii and centre thickness, and the focal length they give.
    for name, glass, nm, kind, f, dia, edge, orientation, shape in [
        ("plano-convex N-BK7, f = 11 mm, D = 6 mm, 1 mm edge, curved side first, at 1550 nm (the page's example)", "nbk7", 1550.0, "planoconvex", 11.0, 6.0, 1.0, "convex", "equi"),
        ("the same, flat side first", "nbk7", 1550.0, "planoconvex", 11.0, 6.0, 1.0, "plano", "equi"),
        ("equi-convex N-BK7, f = 11 mm, D = 6 mm, 1 mm edge, at 1550 nm", "nbk7", 1550.0, "biconvex", 11.0, 6.0, 1.0, "convex", "equi"),
        ("best-form N-BK7, f = 11 mm, D = 6 mm, 1 mm edge, at 1550 nm", "nbk7", 1550.0, "biconvex", 11.0, 6.0, 1.0, "convex", "best"),
        ("best-form N-BK7, f = 50 mm, D = 25 mm, 2 mm edge, at 587.6 nm", "nbk7", 587.6, "biconvex", 50.0, 25.0, 2.0, "convex", "best"),
        ("equi-convex fused silica, f = 100 mm, D = 25.4 mm, 3 mm edge, at 1064 nm", "silica", 1064.0, "biconvex", 100.0, 25.4, 3.0, "convex", "equi"),
        ("plano-convex CaF2, f = 20 mm, D = 10 mm, 1.5 mm edge, at 4000 nm", "caf2", 4000.0, "planoconvex", 20.0, 10.0, 1.5, "convex", "equi"),
        # Near its strongest (f = 4.365 mm): faces of 3.5 mm on a 6 mm
        # diameter, the centre 4.4 mm thick.
        ("equi-convex N-BK7, f = 4.4214828 mm, D = 6 mm, 1 mm edge, at 1550 nm (near the strongest such lens)", "nbk7", 1550.0, "biconvex", 4.4214828, 6.0, 1.0, "convex", "equi"),
    ]:
        r1, r2, t = design(glass, nm, kind, f, dia, edge, orientation, shape)
        values = {"r1Mm": r1, "r2Mm": r2, "thicknessMm": t, "efl": lens(glass, nm, r1, r2, t)["f"]}
        inputs = {"kind": "design", "glass": glass, "wavelengthNm": nm, "lensKind": kind, "spec": "focal", "focalMm": f,
                  "diameterMm": dia, "edgeMm": edge, "orientation": orientation, "shape": shape}
        nonzero = {k: v for k, v in values.items() if v != 0}
        out.append({"name": f"design: {name}", "inputs": inputs,
                    "expected": {k: sig(v) for k, v in nonzero.items()}, "tolerance": {k: 1e-9 for k in nonzero}})
        zero = [k for k, v in values.items() if v == 0]
        if zero:
            out.append({"name": f"design: {name}: the flat face", "inputs": inputs,
                        "expected": {k: 0.0 for k in zero}, "tolerance": {k: 1e-12 for k in zero}, "absolute": True})

    # The real singlets: the example, designed as above.
    ex = design("nbk7", 1550.0, "planoconvex", 11.0, 6.0, 1.0)
    flip = design("nbk7", 1550.0, "planoconvex", 11.0, 6.0, 1.0, "plano")
    flip1000 = design("nbk7", 1000.0, "planoconvex", 11.0, 6.0, 1.0, "plano")
    for name, glass, nm, (r1, r2, t), dia, bd, mfd, shifts, offsets, nr in [
        ("the example lens, 2 mm beam, MFD 10.4 um", "nbk7", 1550.0, ex, 6.0, 2.0, 10.4, [0.0, -0.08, -0.11], None, 256),
        ("flat side first, 2 mm beam, MFD 10.4 um", "nbk7", 1550.0, flip, 6.0, 2.0, 10.4, [0.0, -0.08, -0.11], None, 256),
        ("the example lens, 1.4 mm beam, MFD 10.4 um", "nbk7", 1550.0, ex, 6.0, 1.4, 10.4, [0.0, -0.08, -0.11], None, 256),
        # About 2.5 times the waves of the 1550 nm case: the page samples
        # the pupil 4096 times here.
        ("flat side first, designed at 1000 nm, 2 mm beam, MFD 10.4 um", "nbk7", 1000.0, flip1000, 6.0, 2.0, 10.4, [0.0, -0.2], None, 512),
        # The fiber set off one way at a time, 80 um before F' (near its
        # best plane) and at F'.
        ("the example lens, 2 mm beam, MFD 10.4 um, the fiber 80 um before F' moved 2 um across or tilted by 20 and 100 mrad",
         "nbk7", 1550.0, ex, 6.0, 2.0, 10.4, [-0.08] * 3, [(2e-3, 0.0), (0.0, 0.02), (0.0, 0.1)], 256),
        ("the example lens, 2 mm beam, MFD 10.4 um, at F' moved 3 um across or tilted by 30 mrad", "nbk7", 1550.0, ex, 6.0, 2.0, 10.4, [0.0, 0.0], [(3e-3, 0.0), (0.0, 0.03)], 256),
    ]:
        system, z_focus, beta = singlet(glass, nm, r1, r2, t, dia, bd)
        values = focus_values(system, z_focus, beta, mfd, shifts, nr=nr, offsets=offsets)
        expected, tolerance = {}, {}
        for i, (peak, eta) in enumerate(values):
            if not offsets:
                expected[f"peak{i}"] = sig(peak, 6)
                tolerance[f"peak{i}"] = 1e-4
            expected[f"eta{i}"] = sig(eta, 6)
            tolerance[f"eta{i}"] = 1e-4
        inputs = {"kind": "singlet", "glass": glass, "wavelengthNm": nm, "r1Mm": r1, "r2Mm": r2, "thicknessMm": t,
                  "diameterMm": dia, "beamDiameterMm": bd, "mfdUm": mfd, "shiftsMm": shifts}
        if offsets:
            inputs["lateralUm"] = [dx * 1e3 for dx, _ in offsets]
            inputs["tiltMrad"] = [a * 1e3 for _, a in offsets]
        out.append({
            "name": f"real singlet: {name}, at {', '.join(f'{s * 1e3:g} um' for s in shifts)} from F'",
            "inputs": inputs,
            "expected": expected,
            "tolerance": tolerance,
            "absolute": True,
            "note": f"the app integrates 1025 or 4097 evenly spaced samples along the pupil radius by Simpson's rule, a lateral offset's azimuth as J0 and a tilt's over its lit arc by 64 Gauss-Legendre nodes; this file {nr} Gauss-Legendre nodes along the radius and 160 over the azimuth",
        })
    # A wide mode (200 um) has a far field narrower than 2 % of the pupil
    # radius: checked relatively, as the coupling is small.
    system, z_focus, beta = singlet("nbk7", 1550.0, *ex, 6.0, 2.0)
    shifts = [0.0, -0.08]
    values = focus_values(system, z_focus, beta, 200.0, shifts, nr=1024)
    out.append({
        "name": "real singlet: the example lens, 2 mm beam, MFD 200 um (a far field 2 % of the pupil wide): coupling at F' and 80 um before it",
        "inputs": {"kind": "singlet", "glass": "nbk7", "wavelengthNm": 1550.0, "r1Mm": ex[0], "r2Mm": ex[1], "thicknessMm": ex[2],
                   "diameterMm": 6.0, "beamDiameterMm": 2.0, "mfdUm": 200.0, "shiftsMm": shifts},
        "expected": {f"eta{i}": sig(eta, 6) for i, (_, eta) in enumerate(values)},
        "tolerance": {f"eta{i}": 1e-4 for i in range(len(shifts))},
        "note": "1024 Gauss-Legendre nodes (256 and 512 agree to 3e-9)",
    })
    # The example lens's coupling at F' over the whole pupil, in two
    # dimensions (lens_coherent.coupling centres its sphere on the core, so
    # off the focus it is a slightly different approximation).
    system, z_focus, beta = singlet("nbk7", 1550.0, *ex, 6.0, 2.0)
    pupil = Pupil(system, 0.0, z_focus, pupil_nodes(64, 24))
    out.append({
        "name": "real singlet: the example lens, 2 mm beam, MFD 10.4 um: coupling at F' over the whole pupil (2-D quadrature)",
        "inputs": {"kind": "singlet", "glass": "nbk7", "wavelengthNm": 1550.0, "r1Mm": ex[0], "r2Mm": ex[1], "thicknessMm": ex[2],
                   "diameterMm": 6.0, "beamDiameterMm": 2.0, "mfdUm": 10.4, "shiftsMm": [0.0]},
        "expected": {"eta0": sig(coupling(pupil, 10.4, (0.0, 0.0, 0.0), (0.0, 0.0), beta), 6)},
        "tolerance": {"eta0": 1e-4},
        "absolute": True,
        "note": "lens_coherent.coupling: a 64 x 24 polar Gauss-Legendre grid over the disc, solid angles from a degree-8 polynomial fitted to the directions",
    })
    return out


MODEL = {
    "id": "thick-lens",
    "title": "Thin and thick lens: lens data, design from f, Gaussian focus, real singlet focus and fiber coupling with offsets",
    "app": "calculators/thin-thick-lens/thick-lens.js: lensData, designLens, idealFocus, singletRays, focusFrom",
    "reference": "Closed forms of the thick-lens lensmaker's equation and principal planes; a design from f by the closed-form plano-convex radius and the secant method on the closed-form power (the app: the strongest lens first, then bisection); the complex beam parameter carried through both refracting surfaces; the real singlet by lens_design.py's ray trace at Gauss-Legendre nodes along the pupil radius, the area ratio by central differences, an offset fiber's azimuth by Gauss-Legendre nodes, and for the example lens the 2-D overlap of lens_coherent.coupling",
    "citations": [
        "Wikipedia, \"Lens (optics)\": lensmaker's equation with thickness, principal planes",
        "Wikipedia, \"Cardinal point (optics)\": principal planes of a thick lens, focal and nodal points",
        "Wikipedia, \"Spherical aberration\": the best-form shape of a single lens from the Coddington shape and position factors",
        "H. Kogelnik and T. Li, Appl. Opt. 5, 1550-1567 (1966), doi:10.1364/AO.5.001550 (the ABCD law for the complex beam parameter)",
    ],
    "provenance": "The closed forms written from the cited articles; the interface and slab matrices are the standard ray-transfer matrices; the ray trace and quadrature are this repository's independent Python lens references.",
    "domain": "Eight singlets (plano-convex both ways, bi-convex, positive meniscus, bi-concave, a thick CaF2 lens) from 587.6 to 4000 nm; eight designed from f (plano-convex both ways, equi-convex and best form, N-BK7, fused silica and CaF2, f from 4.42 to 100 mm, one near the strongest equi-convex lens its diameter allows); collimated beams of 0.5 to 10 mm; the designed plano-convex singlet at 1550 nm with 1.4 and 2 mm beams at the paraxial focus and 80 and 110 um before it, flat side first at 1000 nm where the page traces 4096 rays, a 200 um mode, and the fiber moved by up to 3 um across the axis or tilted by up to 100 mrad.",
    "convergence": "Closed forms in double precision; the secant method to 1e-15. The radial quadrature: 96 nodes leave the flat-first singlet (tens of waves at the rim of its pupil) 7e-3 off, 160 nodes 3e-5, 256 nodes below 1e-6; at 1000 nm 256 nodes are 5e-6 off and 512 are used; the central difference uses 1e-5 of the pupil radius. The azimuth: 160 nodes, past convergence for these offsets. The 2-D check: 64 x 24 polar nodes and a degree-8 polynomial.",
    "tolerance_rationale": "1e-9 relative for the algebra and the designs. 1e-4 absolute on the singlet's peak and coupling, against differences found below 3e-6 (the two quadratures of the same model converge to the same value), and 1e-4 relative on the 200 um mode's small coupling, against 2e-5; expected values stored to 6 significant digits, as the last digits depend on the platform's maths library.",
    "outside_scope": "The page refuses wavelengths outside a glass's fitted range, afocal lenses, radii smaller than the clear radius, a focal length too short for the diameter and edge, a best form that is not bi-convex (n from 1.686), and beams whose lit pupil reaches NA 0.9; the real singlet is not traced when its faces cross at the clear diameter.",
    "fidelity": "computed",
    "scope": "Paraxial first-order optics of a spherical singlet in air; a collimated TEM00 beam focused on axis, scalar and monochromatic, with a Gaussian fiber mode on the axis, or moved across it or tilted, one way at a time.",
}
