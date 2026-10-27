# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Lens designer: first-order data, real skew rays, Seidel spherical
aberration and the ideal aplanatic singlet.

Reference methods, chosen to differ from the app's (calculators/lens-design/
engine/): first-order data from 2x2 ray-transfer (ABCD) matrices in reduced
(y, n u) form instead of the y-nu trace; surface intersections by a bracketed
bisection on z(t) - sag(r(t)) instead of the closed-form conic root and
Newton's method; refraction by keeping the tangential component of n d
across the surface instead of the vector form of Snell's law; the thin-lens
spherical aberration from Welford's shape/conjugate formula instead of a
surface-by-surface sum; and the third-order coefficient of a real lens from a
polynomial fit to its real transverse ray aberration, which owes nothing to
Seidel theory.

Conventions match the app's documented ones (they are the page's, not
choices hidden in the code): z axis, light toward +z, R > 0 with the centre
of curvature on the +z side, a positive field angle sends rays toward +y,
every wavelength aimed at the primary wavelength's paraxial entrance pupil.
"""

import cmath
import math

from sellmeier import index as glass_index

PRIMARY_LINES = [486.1327, 587.5618, 656.2725]


# ---------------------------------------------------------------- materials

def n_of(material, nm, constant=1.5):
    if material == "air":
        return 1.0
    if material == "constant":
        return constant
    return glass_index(material, nm / 1000.0)


def media(system, nm):
    return [1.0] + [n_of(s.get("material", "air"), nm, s.get("index", 1.5)) for s in system["surfaces"]]


# ------------------------------------------------------- first order (ABCD)

def mat_mul(a, b):
    return [[a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
            [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]]]


def refraction(power):
    return [[1.0, 0.0], [-power, 1.0]]


def translation(reduced_thickness):
    return [[1.0, reduced_thickness], [0.0, 1.0]]


def surface_power(s, n1, n2):
    if s.get("type") == "paraxial":
        return 1.0 / s["focal"]
    r = s.get("radius", 0.0)
    return (n2 - n1) / r if r else 0.0


def chain(system, nm, first, last, include_last_refraction=True):
    """Matrix acting on (y, n u) from just before surface `first` to just
    after (or just before) surface `last`."""
    n = media(system, nm)
    S = system["surfaces"]
    m = [[1.0, 0.0], [0.0, 1.0]]
    for j in range(first, last + 1):
        if j > first:
            m = mat_mul(translation(S[j - 1]["thickness"] / n[j]), m)
        if j < last or include_last_refraction:
            m = mat_mul(refraction(surface_power(S[j], n[j], n[j + 1])), m)
    return m


def first_order(system, nm):
    S = system["surfaces"]
    n = media(system, nm)
    last = len(S) - 1
    stop = next(i for i, s in enumerate(S) if s.get("stop"))
    full = chain(system, nm, 0, last)
    n_img = n[-1]
    efl = -1.0 / full[1][0]
    bfl = -full[0][0] * n_img / full[1][0]
    # Entrance pupil: the stop seen from object space.
    to_stop = chain(system, nm, 0, stop, include_last_refraction=False)
    z_ep = to_stop[0][1] / to_stop[0][0]
    # Exit pupil: a ray from the stop centre, through the rest.
    after = chain(system, nm, stop, last)
    z_xp = -after[0][1] * n_img / after[1][1]
    # Marginal ray from the rim of the entrance pupil.
    ap = system["aperture"]
    infinite = system["object"]["atInfinity"]
    d = system["object"].get("distanceMm", 0.0)
    if ap["type"] == "epd":
        r_ep = ap["value"] / 2
    elif ap["type"] == "fno":
        r_ep = abs(efl) / ap["value"] / 2
    else:
        r_ep = abs(d + z_ep) * math.tan(math.asin(ap["value"]))
    u0 = 0.0 if infinite else r_ep / (d + z_ep)
    y0 = r_ep if infinite else u0 * d
    y_k = full[0][0] * y0 + full[0][1] * u0
    nu_k = full[1][0] * y0 + full[1][1] * u0
    image_distance = -y_k * n_img / nu_k
    r_xp = abs(y_k + nu_k / n_img * z_xp)
    return {"efl": efl, "bfl": bfl, "zEp": z_ep, "zXp": z_xp, "xpd": 2 * r_xp,
            "imageDistance": image_distance, "rEp": r_ep, "uImage": nu_k / n_img}


# ------------------------------------------------------------ real rays (3D)

def sag(s, rho):
    r = s.get("radius", 0.0)
    k = s.get("conic", 0.0)
    z = 0.0
    if r:
        c = 1.0 / r
        disc = 1 - (1 + k) * c * c * rho
        if disc < 0:
            return None
        z = c * rho / (1 + math.sqrt(disc))
    for i, a in enumerate(s.get("asphere", [])):
        z += a * rho ** (i + 2)
    return z


def sag_complex(s, rho):
    r = s.get("radius", 0.0)
    k = s.get("conic", 0.0)
    z = 0j
    if r:
        c = 1.0 / r
        z = c * rho / (1 + cmath.sqrt(1 - (1 + k) * c * c * rho))
    for i, a in enumerate(s.get("asphere", [])):
        z += a * rho ** (i + 2)
    return z


def normal(s, x, y):
    """Unit normal from the complex-step derivative of the sag, exact to
    rounding (no subtractive cancellation, unlike a finite difference)."""
    h = 1e-30
    fx = sag_complex(s, (x + 1j * h) ** 2 + y * y).imag / h
    fy = sag_complex(s, x * x + (y + 1j * h) ** 2).imag / h
    length = math.sqrt(fx * fx + fy * fy + 1)
    return (-fx / length, -fy / length, 1 / length)


def intersect(s, p, d):
    """Bisection on g(t) = z(t) - sag(t), bracketed around the vertex plane."""
    def g(t):
        x, y, z = (p[i] + t * d[i] for i in range(3))
        zs = sag(s, x * x + y * y)
        return None if zs is None else z - zs
    t_plane = -p[2] / d[2]
    span = 1.0
    x, y = p[0] + t_plane * d[0], p[1] + t_plane * d[1]
    zs = sag(s, x * x + y * y)
    if zs is not None:
        span += 2 * abs(zs) / d[2]
    steps = 4000
    prev_t, prev_g = None, None
    for i in range(steps + 1):
        t = t_plane - span + 2 * span * i / steps
        gt = g(t)
        if gt is not None and prev_g is not None and (gt == 0 or (gt > 0) != (prev_g > 0)):
            lo, hi, glo = prev_t, t, prev_g
            for _ in range(200):
                mid = 0.5 * (lo + hi)
                gm = g(mid)
                if (gm > 0) == (glo > 0):
                    lo, glo = mid, gm
                else:
                    hi = mid
            return 0.5 * (lo + hi)
        prev_t, prev_g = t, gt
    return None


def refract(d, nrm, n1, n2):
    """Keep n times the tangential part of the direction; rebuild the normal
    part from unit length."""
    cos_i = sum(d[i] * nrm[i] for i in range(3))
    tang = [n1 / n2 * (d[i] - cos_i * nrm[i]) for i in range(3)]
    t2 = sum(v * v for v in tang)
    if t2 > 1:
        return None
    sign = 1.0 if cos_i > 0 else -1.0
    return [tang[i] + sign * math.sqrt(1 - t2) * nrm[i] for i in range(3)]


def trace(system, nm, field, px, py, primary_fo):
    S = system["surfaces"]
    n = media(system, nm)
    z_ep, r_ep = primary_fo["zEp"], primary_fo["rEp"]
    aim = [px * r_ep, py * r_ep, z_ep]
    if system["object"]["atInfinity"]:
        th = math.radians(field)
        p, d = aim, [0.0, math.sin(th), math.cos(th)]
    else:
        o = [0.0, field, -system["object"]["distanceMm"]]
        v = [aim[i] - o[i] for i in range(3)]
        length = math.sqrt(sum(c * c for c in v))
        p, d = o, [c / length for c in v]
    z_vertex = 0.0
    for j, s in enumerate(S):
        local = [p[0], p[1], p[2] - z_vertex]
        if s.get("type") == "paraxial":
            t = -local[2] / d[2]
        else:
            t = intersect(s, local, d)
            if t is None:
                return None
        p = [p[i] + t * d[i] for i in range(3)]
        if s.get("type") == "paraxial":
            tx = d[0] / d[2] - p[0] / s["focal"]
            ty = d[1] / d[2] - p[1] / s["focal"]
            length = math.sqrt(tx * tx + ty * ty + 1)
            d = [tx / length, ty / length, 1 / length]
        else:
            d = refract(d, normal(s, p[0], p[1]), n[j], n[j + 1])
            if d is None:
                return None
        z_vertex += s["thickness"]
    return p, d


def image_point(system, nm, field, px, py, z_image, primary_fo):
    r = trace(system, nm, field, px, py, primary_fo)
    if r is None:
        return None
    p, d = r
    t = (z_image - p[2]) / d[2]
    return p[0] + t * d[0], p[1] + t * d[1]


def fixed_image_z(system):
    return sum(s["thickness"] for s in system["surfaces"])


# ------------------------------------------------------- prescriptions used

def base(surfaces, epd=10.0, fields=(0.0,), wavelengths=PRIMARY_LINES, primary=1, focus="fixed"):
    return {"format": "opticalsetup-lens", "version": 1,
            "object": {"atInfinity": True, "distanceMm": 100.0},
            "aperture": {"type": "epd", "value": epd},
            "fields": {"type": "angle", "values": list(fields)},
            "wavelengthsNm": list(wavelengths), "primaryWavelength": primary,
            "image": {"focus": focus, "offsetMm": 0.0},
            "surfaces": surfaces}


COOKE = base([
    {"radius": 22.01359, "thickness": 3.25896, "material": "nsk16"},
    {"radius": -435.76044, "thickness": 6.00755, "material": "air"},
    {"radius": -22.21328, "thickness": 0.99997, "material": "f2"},
    {"radius": 20.29192, "thickness": 4.75041, "material": "air", "stop": True},
    {"radius": 79.68360, "thickness": 2.95208, "material": "nsk16"},
    {"radius": -18.39533, "thickness": 42.20778, "material": "air"},
], epd=10.0, fields=(0.0, 14.0, 20.0), wavelengths=(480.0, 550.0, 650.0))

ACHROMAT = base([
    {"radius": 60.65, "thickness": 6.0, "material": "nbk7", "stop": True},
    {"radius": -61.02, "thickness": 3.5, "material": "nsf11"},
    {"radius": -131.55, "thickness": 97.0, "material": "air"},
], epd=20.0, fields=(0.0, 2.0))

ASPHERE = base([
    {"radius": 30.0, "conic": -0.6, "asphere": [-2e-6, 1e-9], "thickness": 6.0, "material": "nbk7", "stop": True},
    {"radius": -200.0, "conic": 3.0, "asphere": [4e-6], "thickness": 52.0, "material": "air"},
], epd=16.0, fields=(0.0, 4.0))


def finite_pcx():
    s = base([
        {"radius": 51.68, "thickness": 4.0, "material": "nbk7"},
        {"radius": 0.0, "thickness": 190.0, "material": "air"},
    ], epd=10.0, fields=(0.0, 5.0))
    s["object"] = {"atInfinity": False, "distanceMm": 200.0}
    s["fields"] = {"type": "height", "values": [0.0, 5.0]}
    s["surfaces"][1]["stop"] = True
    return s


def far_pupil():
    """A stop 44 mm behind a plano-convex lens puts the entrance pupil beyond
    the first surface's centre of curvature (review of PR #267)."""
    return base([
        {"radius": 51.68, "thickness": 4.0, "material": "nbk7"},
        {"radius": 0.0, "thickness": 40.0, "material": "air"},
        {"radius": 0.0, "thickness": 50.0, "material": "air", "stop": True},
    ], epd=10.0, fields=(0.0, 3.0), wavelengths=(587.5618,), primary=0)


def pcx(curved_first, thickness):
    rows = [{"radius": 51.68, "thickness": thickness, "material": "nbk7", "stop": True},
            {"radius": 0.0, "thickness": 100.0, "material": "air"}]
    if not curved_first:
        rows = [{"radius": 0.0, "thickness": thickness, "material": "nbk7", "stop": True},
                {"radius": -51.68, "thickness": 100.0, "material": "air"}]
    return base(rows, epd=10.0, wavelengths=(587.5618,), primary=0, focus="paraxial")


def plano_hyperbolic():
    n = n_of("nbk7", 587.5618)
    f = 100.0
    return base([
        {"radius": 0.0, "thickness": 5.0, "material": "nbk7", "stop": True},
        {"radius": -(n - 1) * f, "conic": -n * n, "thickness": f, "material": "air"},
    ], epd=40.0, wavelengths=(587.5618,), primary=0)


# --------------------------------------------------------------- the checks

def welford_thin_si(n, K, y, B, C):
    """Welford's thin-lens S_I in the shape (B) and conjugate (C) variables."""
    return y ** 4 * K ** 3 / 4 * ((n / (n - 1)) ** 2 + (n + 2) / (n * (n - 1) ** 2) * B ** 2
                                  + 4 * (n + 1) / (n * (n - 1)) * B * C + (3 * n + 2) / n * C ** 2)


def fitted_si(system, nm):
    """S_I from the real trace alone: fit TA(rho) = a3 rho^3 + a5 rho^5 + a7 rho^7
    to the meridional transverse aberration at the paraxial focus, then
    S_I = 2 n' u' a3 (the third-order relation between the two)."""
    fo = first_order(system, nm)
    z_img = sum(s["thickness"] for s in system["surfaces"][:-1]) + fo["imageDistance"]
    u_img = fo["uImage"]  # paraxial marginal slope in image space (air)
    rhos = [0.05 * k for k in range(1, 9)]
    ta = [image_point(system, nm, 0.0, 0.0, r, z_img, fo)[1] for r in rhos]
    # Least squares on the three odd powers.
    rows = [[r ** 3, r ** 5, r ** 7] for r in rhos]
    ata = [[sum(row[i] * row[j] for row in rows) for j in range(3)] for i in range(3)]
    atb = [sum(row[i] * t for row, t in zip(rows, ta)) for i in range(3)]
    a3 = solve3(ata, atb)[0]
    return 2 * u_img * a3


def solve3(a, b):
    m = [row[:] + [v] for row, v in zip(a, b)]
    for i in range(3):
        p = max(range(i, 3), key=lambda r: abs(m[r][i]))
        m[i], m[p] = m[p], m[i]
        for r in range(3):
            if r != i:
                f = m[r][i] / m[i][i]
                m[r] = [x - f * y for x, y in zip(m[r], m[i])]
    return [m[i][3] / m[i][i] for i in range(3)]


def cases():
    out = []
    for name, system in [("Cooke triplet", COOKE), ("cemented achromat", ACHROMAT),
                         ("aspheric singlet", ASPHERE), ("plano-convex at a finite object", finite_pcx())]:
        nm = system["wavelengthsNm"][system["primaryWavelength"]]
        fo = first_order(system, nm)
        out.append({
            "name": f"{name}: first-order data at {nm} nm",
            "inputs": {"kind": "first-order", "system": system},
            "expected": {k: fo[k] for k in ["efl", "bfl", "zEp", "zXp", "xpd", "imageDistance"]},
            "tolerance": {k: 1e-9 for k in ["efl", "bfl", "zEp", "zXp", "xpd", "imageDistance"]},
            "absolute": True,
        })
    for name, system, rays in [
        ("Cooke triplet", COOKE, [(20.0, 0.0, 1.0, 480.0), (20.0, 0.6, -0.7, 650.0), (14.0, -1.0, 0.0, 550.0), (0.0, 0.3, 0.9, 480.0)]),
        ("aspheric singlet", ASPHERE, [(0.0, 0.0, 1.0, 587.5618), (4.0, 0.7, 0.7, 486.1327), (4.0, 0.0, -0.95, 656.2725)]),
        ("plano-convex at a finite object", finite_pcx(), [(5.0, 0.0, 1.0, 587.5618), (5.0, 0.8, -0.5, 486.1327)]),
        ("entrance pupil beyond the first centre of curvature", far_pupil(), [(0.0, 0.0, 0.0, 587.5618), (0.0, 0.0, 1.0, 587.5618), (3.0, 0.6, -0.8, 587.5618)]),
    ]:
        primary = first_order(system, system["wavelengthsNm"][system["primaryWavelength"]])
        z_img = fixed_image_z(system)
        for field, px, py, nm in rays:
            x, y = image_point(system, nm, field, px, py, z_img, primary)
            out.append({
                "name": f"{name}: real ray field {field}, pupil ({px}, {py}), {nm} nm",
                "inputs": {"kind": "ray", "system": system, "field": field, "px": px, "py": py, "nm": nm},
                "expected": {"x": x, "y": y},
                "tolerance": {"x": 1e-9, "y": 1e-9},
                "absolute": True,
            })
    nd = n_of("nbk7", 587.5618)
    for curved_first in (True, False):
        system = pcx(curved_first, 0.0)
        K = (nd - 1) / 51.68
        B = 1.0 if curved_first else -1.0
        out.append({
            "name": f"thin plano-convex, {'curved' if curved_first else 'flat'} side first: Seidel S_I against Welford's thin-lens formula",
            "inputs": {"kind": "seidel", "system": system},
            "expected": {"SI": welford_thin_si(nd, K, 5.0, B, -1.0)},
            "tolerance": {"SI": 1e-9},
        })
        thick = pcx(curved_first, 4.0)
        out.append({
            "name": f"4 mm plano-convex, {'curved' if curved_first else 'flat'} side first: Seidel S_I against the real-ray fit",
            "inputs": {"kind": "seidel", "system": thick},
            "expected": {"SI": fitted_si(thick, 587.5618)},
            "tolerance": {"SI": 1e-5},
            "note": "the fit to rho^3, rho^5 and rho^7 leaves a ninth-order residue near 1e-7 relative",
        })
    hyp = plano_hyperbolic()
    fo = first_order(hyp, 587.5618)
    z_img = fixed_image_z(hyp)
    pts = [image_point(hyp, 587.5618, 0.0, px, py, z_img, fo) for px, py in [(0, 1), (0.6, 0.6), (-0.9, 0.2), (0.1, -0.4), (0, 0.5)]]
    out.append({
        "name": "plano-hyperbolic singlet (k = -n^2): on-axis spot of an aberration-free surface",
        "inputs": {"kind": "spot", "system": hyp},
        "expected": {"rms": math.sqrt(sum(x * x + y * y for x, y in pts) / len(pts))},
        "tolerance": {"rms": 1e-9},
        "absolute": True,
    })
    return out


MODEL = {
    "id": "lens-design",
    "title": "Lens designer: first-order data, real skew rays, Seidel spherical aberration",
    "app": "calculators/lens-design/engine/paraxial.js: firstOrder, seidelSums; calculators/lens-design/engine/trace.js: traceRay; calculators/lens-design/engine/analyze.js: analyzeSystem",
    "reference": "ABCD ray-transfer matrices; bisection surface intersections with tangential-component refraction; Welford's thin-lens S_I; a polynomial fit to real transverse ray aberration",
    "citations": [
        "W. T. Welford, Aberrations of Optical Systems (Adam Hilger, 1986), ch. 7-8: Seidel sums, the conic/aspheric term, and the thin-lens S_I in shape and conjugate variables",
        "W. J. Smith, Modern Optical Engineering, 4th ed. (McGraw-Hill, 2008), ch. 2-3 and 10: paraxial matrices, pupils, real ray tracing",
        "E. Hecht, Optics, 5th ed., section 6.2: ray-transfer matrices",
        "Optiland v0.5.5 (MIT licence), samples/objectives.py CookeTriplet: the Cooke prescription (the OpticStudio 'Cooke 40 degree field' sample)",
    ],
    "provenance": "Textbook relations evaluated here; the plano-hyperbolic singlet is the classical aplanatic surface (Descartes ovoid for an object at infinity), whose image is a point.",
    "domain": "Rotationally symmetric refracting systems in air, objects at infinity and at 200 mm, fields up to 20 deg, F/2.5 to F/10, visible wavelengths.",
    "convergence": "Bisection to 200 halvings (far past double precision); the surface normal from a 1e-6 mm central difference, accurate to about 1e-12 in direction.",
    "tolerance_rationale": "1e-9 mm (absolute: an exit pupil can sit exactly on a vertex) is two independent evaluations of the same geometry in double precision; 1e-5 on the fitted S_I is the truncation of the odd-power fit.",
    "outside_scope": "Mirrors, tilts, decentres and diffraction are outside this model.",
    "fidelity": "computed",
    "scope": "Geometric optics: paraxial first-order data and exact skew-ray tracing of spherical, conic and even-aspheric refracting surfaces, plus third-order theory.",
}
