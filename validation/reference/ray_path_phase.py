# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Spectral phase along traced ray paths: the GDD of plates, prism pairs,
grating pairs and a grating stretcher, as the tracer reports it at a detector.

The model (docs/physics/ray-path-phase.md): each wavelength of a pulse is a
ray; its phase on a common plane is

    phi(omega) = 2 pi [ (L + n s + Lambda) / lambda + sum m x / d ]

with L the phase optical path sum n(lambda) l, s = u . (p0 - p) the distance
along the colour's direction u from its arrival p to its wavefront through
the centre wavelength's arrival p0,
Lambda = -h^2 / (2 f) per ideal thin lens, and m x / d the cycles a grating
adds to order m at position x along it. GDD = d^2 phi / d omega^2 at the
pulse's centre frequency.

Method, independent of the JavaScript:
- an own two-dimensional ray tracer (nearest hit over line segments, Snell's
  law in vector form, the grating equation in tangential components, the
  thin-lens tangent mapping), in 40-digit decimal arithmetic, with the glass
  indices from material_dispersion.py (the published Sellmeier forms);
- phi'' by a five-point central difference in angular frequency at
  h = 1e-4 omega_0 (truncation ~1e-17 relative; round-off ~1e-25 relative),
  where the app fits a polynomial to five or nine wavelength samples.

Closed forms written from the sources, asserted inside cases() so that the
reference's own tracer is checked before it is trusted:
- tilted plane-parallel plate: phi = (omega/c) t sqrt(n^2 - sin^2 theta) plus
  terms linear in omega (plane-wave phase matching);
- parallel grating pair, single and double pass: phi = (omega/c) G cos beta
  (the plane-wave form of Treacy 1969), and Treacy's explicit
  GDD = -m^2 lambda^3 G / (2 pi c^2 d^2 cos^3 beta);
- prism pair, single and double pass, any insertion: Fork, Martinez and
  Gordon's apex path, P = l cos beta per pass, with l the apex-to-apex
  distance and beta the angle between the apex line and the colour's ray
  between the prisms (exact by the theorem of Malus and Dupin; Fork et al.
  1984), with beta from the analytic prism angle formulas rather than the
  vector tracer; a single prism by the same argument, (omega/c)(P0 - A).u;
- grating stretcher between ideal lenses: a parallel grating pair of
  perpendicular separation (s1 + s2 - 2 f) cos beta (Martinez 1987), to
  paraxial order only, so asserted at 1 %.

Error budget for the app: it samples the spectrum at five wavelengths across
+-3 sigma of the Gaussian and interpolates the phase with a quartic. The
reference evaluates that same discretisation on its own trace and quotes the
difference from the exact derivative; each tolerance is twice that
difference, floored at 1e-6 (double-precision ray tracing in the app).
"""
from decimal import Decimal as D, getcontext
import math

from common import sig
from material_dispersion import index as sellmeier_index

getcontext().prec = 40
PI = D("3.141592653589793238462643383279502884197")
C_NM_PER_FS = D("299.792458")
EPS = D("1e-20")


# ---------------------------------------------------------------- numbers

def _sin(x):
    x = x % (2 * PI)
    term, total, k = x, x, 1
    while abs(term) > D("1e-45"):
        term *= -x * x / ((2 * k) * (2 * k + 1))
        total += term
        k += 1
    return total


def _cos(x):
    return _sin(x + PI / 2)


def rad(deg):
    return D(repr(deg)) * PI / 180


def vec(x, y):
    return (D(repr(x)) if not isinstance(x, D) else x, D(repr(y)) if not isinstance(y, D) else y)


def add(a, b): return (a[0] + b[0], a[1] + b[1])
def sub(a, b): return (a[0] - b[0], a[1] - b[1])
def mul(a, k): return (a[0] * k, a[1] * k)
def dot(a, b): return a[0] * b[0] + a[1] * b[1]
def cross(a, b): return a[0] * b[1] - a[1] * b[0]
def unit(a): return mul(a, 1 / dot(a, a).sqrt())


def rotate(p, deg):
    a = rad(deg)
    c, s = _cos(a), _sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


def glass(material, wl_nm):
    return sellmeier_index(material, wl_nm)


# ------------------------------------------------------------ the layouts

def element_segments(el):
    """Line segments of one element in world coordinates, from the element
    conventions the scene format documents (local frame rotated by `rot`
    degrees, then shifted to x, y)."""
    kind, p = el["type"], el["params"]
    origin = vec(el["x"], el["y"])
    world = lambda x, y: add(origin, rotate(vec(x, y), el.get("rot", 0)))
    out = []

    def seg(a, b, surface, **data):
        out.append({"a": world(*a), "b": world(*b), "kind": surface, "el": el["id"], **data})

    if kind == "prism":
        h = max(D(5), D(repr(p["psize"])))
        apex = min(80, max(10, p["apex"]))
        half = rad(apex) / 2
        hb = h * _sin(half) / _cos(half)
        top, left, right = (0, -h / 2), (-hb, h / 2), (hb, h / 2)
        for a, b in ((left, top), (top, right), (right, left)):
            seg(a, b, "refract", material=p["material"])
    elif kind == "freeglass":
        scale = D(repr(p.get("scale", 1)))
        pts = [(D(repr(v["x"])) * scale, D(repr(v["y"])) * scale) for v in p["vertices"]]
        for i, a in enumerate(pts):
            seg(a, pts[(i + 1) % len(pts)], "refract", material=p["material"])
    elif kind == "mirror":
        half = D(repr(p["length"])) / 2
        seg((0, -half), (0, half), "mirror")
    elif kind == "retroreflector":
        half = D(repr(p["length"])) / 2
        seg((0, 0), (-half, half), "mirror")
        seg((0, 0), (-half, -half), "mirror")
    elif kind == "grating":
        half = D(repr(p["length"])) / 2
        seg((0, -half), (0, half), "grating", groove_nm=D(10) ** 6 / D(repr(p["lines"])),
            order=int(p["orders"]), transmissive=bool(p.get("transmissive", False)))
    elif kind == "lens":
        half = D(repr(p["dia"])) / 2
        seg((0, -half), (0, half), "lens", f=D(repr(p["f"])))
    elif kind == "detector":
        half = D(repr(p["aperture"])) / 2
        seg((-19, -half), (-19, half), "detector")
    else:
        raise ValueError(kind)
    return out


def scene_segments(scene):
    return [s for el in scene["elements"] for s in element_segments(el)]


WALL = D(100000)
FAR_WALL = [{"a": a, "b": b, "kind": "detector", "el": "_wall"} for a, b in (
    ((-WALL, -WALL), (WALL, -WALL)), ((WALL, -WALL), (WALL, WALL)),
    ((WALL, WALL), (-WALL, WALL)), ((-WALL, WALL), (-WALL, -WALL)))]


def trace(scene, wl_nm, segments=None):
    """Follow one wavelength from the source to the detector."""
    segments = segments or scene_segments(scene)
    src = scene["source"]
    p, d = vec(src["x"], src["y"]), rotate(vec(1, 0), src.get("rot", 0))
    wl = D(repr(wl_nm)) if not isinstance(wl_nm, D) else wl_nm
    medium, opl, lens, cycles, last, hits, points = None, D(0), D(0), D(0), None, [], []
    for _ in range(64):
        best = None
        for i, s in enumerate(segments):
            if i == last:
                continue
            e = sub(s["b"], s["a"])
            den = cross(d, e)
            if abs(den) < EPS:
                continue
            w = sub(s["a"], p)
            t, u = cross(w, e) / den, cross(w, d) / den
            if t > D("1e-12") and -EPS <= u <= 1 + EPS and (best is None or t < best[0]):
                best = (t, i)
        if best is None:
            raise RuntimeError(f"ray at {wl} nm left the scene after {hits}")
        t, i = best
        s = segments[i]
        n_here = glass(medium[1], wl) if medium else D(1)
        opl += n_here * t
        p = add(p, mul(d, t))
        last = i
        hits.append(s["el"])
        points.append(p)
        tangent = unit(sub(s["b"], s["a"]))
        normal = (-tangent[1], tangent[0])
        if s["kind"] == "detector":
            return {"p": p, "d": d, "opl": opl, "lens": lens, "cycles": cycles, "n": n_here,
                    "hits": hits, "points": points}
        if s["kind"] == "mirror":
            d = sub(d, mul(normal, 2 * dot(d, normal)))
        elif s["kind"] == "refract":
            inside = medium is not None and medium[0] == s["el"]
            n_glass = glass(s["material"], wl)
            n1, n2 = (n_glass, D(1)) if inside else (D(1), n_glass)
            nn = normal if dot(d, normal) < 0 else mul(normal, -1)  # against the ray
            cos_i = -dot(d, nn)
            ratio = n1 / n2
            k = 1 - ratio * ratio * (1 - cos_i * cos_i)
            if k < 0:
                raise RuntimeError(f"total internal reflection at {s['el']}")
            d = unit(add(mul(d, ratio), mul(nn, ratio * cos_i - k.sqrt())))
            medium = None if inside else (s["el"], s["material"])
        elif s["kind"] == "grating":
            # Tangential wavevector k sin(theta) gains 2 pi m / d.
            s_in = dot(d, tangent)
            s_out = s_in + s["order"] * wl / s["groove_nm"]
            if abs(s_out) >= 1:
                raise RuntimeError(f"order {s['order']} is evanescent at {s['el']}")
            side = 1 if dot(d, normal) >= 0 else -1
            side = side if s["transmissive"] else -side
            d = add(mul(normal, side * (1 - s_out * s_out).sqrt()), mul(tangent, s_out))
            cycles += s["order"] * dot(sub(p, s["a"]), tangent) / (s["groove_nm"] / D(10) ** 6)
        elif s["kind"] == "lens":
            mid = mul(add(s["a"], s["b"]), D("0.5"))
            h = dot(sub(p, mid), tangent)
            axis = normal if dot(d, normal) >= 0 else mul(normal, -1)
            slope = dot(d, tangent) / dot(d, axis) - h / s["f"]
            d = unit(add(axis, mul(tangent, slope)))
            lens -= h * h / (2 * s["f"])
    raise RuntimeError("too many interactions")


def omega_of(wl_nm):
    return 2 * PI * C_NM_PER_FS / wl_nm


def wl_of(omega):
    return 2 * PI * C_NM_PER_FS / omega


def phase_fn(scene):
    """phi(omega) at the centre wavelength's arrival point: each colour's
    phase at its own arrival, carried along its direction to its wavefront
    through that point."""
    segments = scene_segments(scene)
    ref = trace(scene, D(repr(scene["source"]["wavelengthNm"])), segments)

    def phi(omega):
        wl = wl_of(omega)
        r = trace(scene, wl, segments)
        if r["hits"] != ref["hits"]:
            raise RuntimeError(f"{wl} nm took another route: {r['hits']} vs {ref['hits']}")
        # The colour's wave carried along its own direction to its wavefront
        # through the reference point.
        s = dot(sub(ref["p"], r["p"]), r["d"])
        path_mm = r["opl"] + r["n"] * s + r["lens"]
        return 2 * PI * (path_mm / (wl / D(10) ** 6) + r["cycles"])
    return phi, ref


def second_derivative(f, x0, h):
    v = {k: f(x0 + k * h) for k in (-2, -1, 0, 1, 2)}
    return (-v[2] + 16 * v[1] - 30 * v[0] + 16 * v[-1] - v[-2]) / (12 * h * h)


def exact_gdd(scene):
    phi, _ = phase_fn(scene)
    w0 = omega_of(D(repr(scene["source"]["wavelengthNm"])))
    return second_derivative(phi, w0, w0 * D("1e-4"))


def sampled_gdd(scene):
    """The app's discretisation, evaluated on this trace: five wavelengths
    equally spaced across +-3 sigma of the Gaussian, phase interpolated by a
    quartic in omega - omega_0, GDD = 2 a_2."""
    phi, _ = phase_fn(scene)
    lam0, fwhm = D(repr(scene["source"]["wavelengthNm"])), D(repr(scene["source"]["bandwidthNm"]))
    sigma = fwhm / (2 * (2 * D(2).ln()).sqrt())
    w0 = omega_of(lam0)
    xs, ys = [], []
    for i in range(5):
        wl = lam0 - 3 * sigma + 6 * sigma * i / 4
        xs.append(omega_of(wl) - w0)
        ys.append(phi(omega_of(wl)))
    # Solve the 5x5 Vandermonde system by Gaussian elimination.
    rows = [[x ** j if j else D(1) for j in range(5)] + [y] for x, y in zip(xs, ys)]
    for c in range(5):
        piv = max(range(c, 5), key=lambda r: abs(rows[r][c]))
        rows[c], rows[piv] = rows[piv], rows[c]
        for r in range(5):
            if r != c:
                f = rows[r][c] / rows[c][c]
                rows[r] = [a - f * b for a, b in zip(rows[r], rows[c])]
    return 2 * rows[2][5] / rows[2][2]


# --------------------------------------------------------- closed forms

def plate_gdd(material, thickness, theta_deg, lam0):
    def phi(omega):
        n = glass(material, wl_of(omega))
        s = _sin(rad(theta_deg))
        return omega / C_NM_PER_FS * D(10) ** 6 * D(repr(thickness)) * (n * n - s * s).sqrt()
    w0 = omega_of(D(repr(lam0)))
    return second_derivative(phi, w0, w0 * D("1e-4"))


def grating_pair_gdd(lines, order, incidence_deg, separation, lam0, passes=1):
    """Treacy's pair in its plane-wave form, (omega/c) G cos beta, and his
    explicit GDD; both returned so they can be compared."""
    groove = D(10) ** 6 / D(repr(lines))
    s_in = _sin(rad(incidence_deg))
    G = separation if isinstance(separation, D) else D(repr(separation))

    def phi(omega):
        sb = s_in + order * wl_of(omega) / groove
        return omega / C_NM_PER_FS * D(10) ** 6 * G * (1 - sb * sb).sqrt()
    lam = D(repr(lam0))
    w0 = omega_of(lam)
    sb = s_in + order * lam / groove
    cb = (1 - sb * sb).sqrt()
    treacy = -D(order * order) * (lam / D(10) ** 6) ** 3 * G / (2 * PI * (C_NM_PER_FS * D(10) ** -6) ** 2
                                                               * (groove / D(10) ** 6) ** 2 * cb ** 3)
    return passes * second_derivative(phi, w0, w0 * D("1e-4")), passes * treacy


def prism_apex_gdd(material, apex_deg, theta_in_deg, apex_a, apex_b, axis_deg, lam0, passes=1, mirror=False):
    """Fork, Martinez and Gordon: P = l cos beta between the wavefront through
    apex A before the first prism and the one through apex B after the
    second. The colour's direction between the prisms comes from the prism
    angle formulas: theta2 = asin(sin theta1 / n), theta3 = alpha - theta2,
    theta4 = asin(n sin theta3), deviation theta1 + theta4 - alpha, turned
    toward the first prism's base (+y in the layouts here, rotated by the
    input axis). `mirror` is the mirror-image pair of a four-prism line,
    which turns the colours back toward -y."""
    a, b = vec(*apex_a), vec(*apex_b)
    alpha, th1 = rad(apex_deg), rad(theta_in_deg)

    def asin(x):
        # Newton on sin(y) = x.
        y = D(math.asin(float(x)))
        for _ in range(8):
            y -= (_sin(y) - x) / _cos(y)
        return y

    def phi(omega):
        n = glass(material, wl_of(omega))
        th2 = asin(_sin(th1) / n)
        th4 = asin(n * _sin(alpha - th2))
        dev = th1 + th4 - alpha
        u = rotate((_cos(dev), -_sin(dev) if mirror else _sin(dev)), axis_deg)
        return omega / C_NM_PER_FS * D(10) ** 6 * dot(sub(b, a), u)
    w0 = omega_of(D(repr(lam0)))
    return passes * second_derivative(phi, w0, w0 * D("1e-4"))


# ------------------------------------------------- building the layouts
# Placement uses floating point: it only decides where elements go. The
# numbers it writes are the scene, and both the reference and the app read
# them back exactly.

def r9(x):
    return round(float(x), 9)


def frot(p, deg):
    a = math.radians(deg)
    return (p[0] * math.cos(a) - p[1] * math.sin(a), p[0] * math.sin(a) + p[1] * math.cos(a))


def element(kind, eid, x, y, rot, **params):
    return {"type": kind, "id": eid, "x": r9(x), "y": r9(y), "rot": r9(rot), "params": params}


def new_scene(wl, bw):
    return {"source": {"x": 0, "y": 0, "rot": 0, "wavelengthNm": wl, "bandwidthNm": bw}, "elements": []}


def leg(scene):
    """The centre ray's last interaction point and its direction after it."""
    r = trace(scene, D(repr(scene["source"]["wavelengthNm"])), scene_segments(scene) + FAR_WALL)
    p = r["points"][-2] if len(r["points"]) > 1 else vec(scene["source"]["x"], scene["source"]["y"])
    return (float(p[0]), float(p[1])), (float(r["d"][0]), float(r["d"][1]))


def ahead(scene, distance, offset=0.0):
    """A point `distance` mm along the centre ray past its last optic,
    shifted `offset` mm to the ray's left; and the ray direction."""
    p, d = leg(scene)
    return (p[0] + d[0] * distance - d[1] * offset, p[1] + d[1] * distance + d[0] * offset), d


def angle(d):
    return math.degrees(math.atan2(d[1], d[0]))


def add_detector(scene, distance, aperture=40):
    face, d = ahead(scene, distance)
    scene["elements"].append(element("detector", "det", face[0] + 19 * d[0], face[1] + 19 * d[1], angle(d),
                                     aperture=aperture))
    scene["detectorId"] = "det"
    return scene


def add_retro(scene, distance, offset, length=40):
    point, d = ahead(scene, distance, offset)
    scene["elements"].append(element("retroreflector", "retro", point[0], point[1], angle(d), length=length))


def add_pickoff(scene, x, length=6):
    """A 45-degree mirror at x across the returning beam, which travels -x."""
    p, d = leg(scene)
    y = p[1] + d[1] * (x - p[0]) / d[0]
    scene["elements"].append(element("mirror", "pickoff", x, y, 45 if y > 0 else -45, length=length))


def brewster(material, wl):
    theta_b = math.degrees(math.atan(float(glass(material, wl))))
    return theta_b, 180 - 2 * theta_b


def prism_at(eid, material, apex, psize, rot, hit, face, depth):
    """A prism whose `face` ('left' or 'right' side in its own frame) is
    crossed at world point `hit`, `depth` mm from the apex along the face.
    Returns the element and its apex in world coordinates."""
    hb = psize * math.tan(math.radians(apex) / 2)
    top, corner = (0.0, -psize / 2), ((-hb if face == "left" else hb), psize / 2)
    e = (corner[0] - top[0], corner[1] - top[1])
    ln = math.hypot(*e)
    w = frot((top[0] + e[0] / ln * depth, top[1] + e[1] / ln * depth), rot)
    el = element("prism", eid, hit[0] - w[0], hit[1] - w[1], rot, apex=r9(apex), psize=psize, material=material)
    a = frot(top, el["rot"])
    return el, (el["x"] + a[0], el["y"] + a[1])


def prism_pair(scene, material, separation, depth1, depth2, psize=25.4, x1=150.0, names=("p1", "p2"), mirror=False):
    """A Brewster-cut pair at minimum deviation for the centre wavelength:
    the second prism inverted, its faces parallel to the first's. `mirror`
    builds the pair's mirror image (the second half of a four-prism line)."""
    wl = scene["source"]["wavelengthNm"]
    theta_b, apex = brewster(material, wl)
    rot1 = theta_b - apex / 2
    if mirror:
        rot1, first_face, second_face = 180 - rot1, "right", "left"
    else:
        first_face, second_face = "left", "right"
    # The first pair starts x1 mm from the source; a second pair x1 mm past
    # the first.
    hit1 = ahead(scene, x1)[0] if scene["elements"] else (x1, 0.0)
    p1, a1 = prism_at(names[0], material, apex, psize, rot1, hit1, first_face, depth1)
    scene["elements"].append(p1)
    hit2, _ = ahead(scene, separation)
    p2, a2 = prism_at(names[1], material, apex, psize, rot1 + 180, hit2, second_face, depth2)
    scene["elements"].append(p2)
    # The incidence the scene actually holds (its rotation is rounded).
    written = 180 - p1["rot"] if mirror else p1["rot"]
    return {"apexes": (a1, a2), "theta": written + p1["params"]["apex"] / 2, "apex": p1["params"]["apex"]}


def grating_at(eid, hit, rot, lines, order, length=60):
    return element("grating", eid, hit[0], hit[1], rot, lines=lines, orders=str(order), length=length,
                   transmissive=False)


def exits_parallel(scene):
    """True when two wavelengths 2 nm apart leave in the same direction."""
    wl = scene["source"]["wavelengthNm"]
    try:
        dirs = [trace(scene, D(repr(w)), scene_segments(scene) + FAR_WALL)["d"] for w in (wl - 1, wl + 1)]
    except RuntimeError:
        return False
    return abs(cross(dirs[0], dirs[1])) < D("1e-12")


# -------------------------------------------------------------- the cases

def plate_case(material, thickness, theta, wl, bw):
    scene = new_scene(wl, bw)
    half = 30
    verts = [{"x": -thickness / 2, "y": -half}, {"x": thickness / 2, "y": -half},
             {"x": thickness / 2, "y": half}, {"x": -thickness / 2, "y": half}]
    scene["elements"].append(element("freeglass", "plate", 150, 0, theta, vertices=verts, scale=1, material=material))
    add_detector(scene, 150)
    closed = plate_gdd(material, thickness, theta, wl)
    return scene, closed, f"{thickness} mm {material} plate at {theta} deg"


def prism_pair_case(material, wl, bw, separation, depth1, depth2, psize=25.4):
    scene = new_scene(wl, bw)
    pair = prism_pair(scene, material, separation, depth1, depth2, psize)
    add_detector(scene, 150)
    closed = prism_apex_gdd(material, pair["apex"], pair["theta"], *pair["apexes"], 0, wl)
    return scene, closed, f"Brewster {material} prism pair, {separation} mm, single pass"


def four_prism_case(material, wl, bw, separation, depth1, depth2, gap=100, psize=25.4):
    scene = new_scene(wl, bw)
    first = prism_pair(scene, material, separation, depth1, depth2, psize)
    second = prism_pair(scene, material, separation, depth2, depth1, psize, x1=gap, names=("p3", "p4"), mirror=True)
    add_detector(scene, 150)
    closed = (prism_apex_gdd(material, first["apex"], first["theta"], *first["apexes"], 0, wl)
              + prism_apex_gdd(material, second["apex"], second["theta"], *second["apexes"], 0, wl, mirror=True))
    return scene, closed, f"four Brewster {material} prisms, {separation} mm pairs"


def prism_retro_case(material, wl, bw, separation, depth1, depth2, offset, psize=40):
    scene = new_scene(wl, bw)
    pair = prism_pair(scene, material, separation, depth1, depth2, psize)
    add_retro(scene, 100, offset)
    add_pickoff(scene, 60)
    add_detector(scene, 100)
    closed = prism_apex_gdd(material, pair["apex"], pair["theta"], *pair["apexes"], 0, wl, passes=2)
    return scene, closed, f"Brewster {material} prism pair, {separation} mm, double pass through a roof reflector"


def grating_pair_case(lines, wl, bw, incidence, separation, double=False):
    scene = new_scene(wl, bw)
    scene["elements"].append(grating_at("g1", (150.0, 0.0), incidence, lines, 1))
    _, d1 = leg(scene)
    t = frot((0.0, 1.0), incidence)
    normal = (-t[1], t[0])
    cos_beta = abs(d1[0] * normal[0] + d1[1] * normal[1])
    hit2, _ = ahead(scene, separation / cos_beta)
    scene["elements"].append(grating_at("g2", hit2, incidence, lines, -1))
    if double:
        # An in-plane roof reflector reverses the colours' order across the
        # beam, so the return pass doubles the spatial chirp rather than
        # undoing it (a roof folding out of the plane would undo it). The
        # GDD along the central ray is still exactly twice Treacy's.
        add_retro(scene, 100, 4)
        add_pickoff(scene, 60, 16)
        add_detector(scene, 100, 30)
    else:
        add_detector(scene, 300, 20)
    # The separation the scene actually holds (positions are rounded).
    g1, g2 = scene["elements"][0], scene["elements"][1]
    n_dec = rotate(vec(-1, 0), incidence)
    written = abs(dot(sub(vec(g2["x"], g2["y"]), vec(g1["x"], g1["y"])), n_dec))
    closed, treacy = grating_pair_gdd(lines, 1, -incidence, written, wl, passes=2 if double else 1)
    assert abs(closed / treacy - 1) < D("1e-12"), (closed, treacy)
    passes = "double pass through a roof reflector" if double else "single pass"
    return scene, closed, f"{lines} l/mm grating pair, G = {separation} mm, {passes}"


def stretcher_case(lines, wl, bw, incidence, focal, s1, s2):
    scene = new_scene(wl, bw)
    scene["elements"].append(grating_at("g1", (150.0, 0.0), incidence, lines, 1))
    _, axis = leg(scene)
    point, _ = ahead(scene, s1)
    scene["elements"].append(element("lens", "l1", point[0], point[1], angle(axis), f=focal, dia=50))
    point, _ = ahead(scene, 2 * focal)
    scene["elements"].append(element("lens", "l2", point[0], point[1], angle(axis), f=focal, dia=50))
    point, _ = ahead(scene, s2)
    # The second grating lies along the image of the first: its line is the
    # first one's reflected about the lens axis.
    t1 = frot((0.0, 1.0), incidence)
    along = t1[0] * axis[0] + t1[1] * axis[1]
    t2 = (2 * along * axis[0] - t1[0], 2 * along * axis[1] - t1[1])
    rot2 = math.degrees(math.atan2(-t2[0], t2[1]))
    for order in (1, -1):
        trial = dict(scene, elements=scene["elements"] + [grating_at("g2", point, rot2, lines, order)])
        if exits_parallel(trial):
            scene = trial
            break
    else:
        raise RuntimeError("no order of the second grating recombines the colours")
    add_detector(scene, 150, 30)
    normal = (-t1[1], t1[0])
    cos_beta = abs(axis[0] * normal[0] + axis[1] * normal[1])
    equivalent, _ = grating_pair_gdd(lines, 1, -incidence, (s1 + s2 - 2 * focal) * cos_beta, wl)
    label = f"{lines} l/mm grating stretcher, f = {focal} mm, gratings {s1} and {s2} mm from the lenses"
    return scene, equivalent, label


def single_prism_case(material, wl, bw, depth, distance):
    """Angular dispersion remains. By the same theorem as the pair, a colour's
    phase at the reference point P0 is (omega/c) (P0 - A) . u(omega), A the
    apex: the virtual ray through A crosses no glass, and P0 lies on the
    colour's wavefront through itself."""
    scene = new_scene(wl, bw)
    theta_b, apex = brewster(material, wl)
    p1, a1 = prism_at("p1", material, apex, 25.4, theta_b - apex / 2, (150.0, 0.0), "left", depth)
    scene["elements"].append(p1)
    add_detector(scene, distance)
    p0 = trace(scene, D(repr(wl)))["p"]
    closed = prism_apex_gdd(material, p1["params"]["apex"], p1["rot"] + p1["params"]["apex"] / 2, a1, p0, 0, wl)
    return scene, closed, f"one Brewster {material} prism, detector {distance} mm after it"


def tolerance_for(exact, sampled, floor=1e-6):
    error = abs(float(sampled) / float(exact) - 1)
    tol = max(floor, 2 * error)
    digits = -math.floor(math.log10(tol))
    return math.ceil(tol * 10 ** digits) / 10 ** digits, error


def cases():
    out = []
    specs = [
        (plate_case, ("silica", 10, 55.47, 800, 10), 1e-12),
        (plate_case, ("nsf10", 20, 45, 1030, 30), 1e-12),
        (prism_pair_case, ("silica", 800, 10, 500, 3, 4), 1e-12),
        (four_prism_case, ("silica", 800, 30, 400, 3, 5), 1e-12),
        (prism_retro_case, ("nsf10", 800, 10, 300, 20, 5, -2.5), 1e-12),
        (grating_pair_case, (1200, 800, 10, 35, 150), 1e-12),
        (grating_pair_case, (1000, 1030, 10, 40, 100, True), 1e-12),
        (stretcher_case, (1200, 800, 10, 35, 300, 200, 200), 1e-2),
        (single_prism_case, ("nsf10", 800, 10, 4, 300), 1e-12),
    ]
    for build, args, closed_tol in specs:
        scene, closed, label = build(*args)
        exact = exact_gdd(scene)
        if closed is not None:
            assert abs(exact / closed - 1) < D(repr(closed_tol)), (label, exact, closed)
        sampled = sampled_gdd(scene)
        tol, error = tolerance_for(exact, sampled)
        out.append({
            "name": f"{label}, {scene['source']['bandwidthNm']} nm FWHM at {scene['source']['wavelengthNm']} nm",
            "inputs": {"kind": "scene", **scene},
            "expected": {"gddFs2": sig(float(exact))},
            "tolerance": {"gddFs2": tol},
            "note": (f"Five-sample quartic, as the app samples: {error:.2g} relative from the exact derivative; "
                     f"tolerance twice that, floored at 1e-6."
                     + f" Closed form agrees to {closed_tol:g}."),
        })
    # A zero-dispersion stretcher (gratings in the focal planes): zero to
    # paraxial order. The ideal lens's tangent bend and its -h^2/2f path
    # agree to second order, so a small residual remains; checked absolutely.
    scene, _, label = stretcher_case(1200, 800, 10, 35, 300, 300, 300)
    exact = exact_gdd(scene)
    sampled = sampled_gdd(scene)
    out.append({
        "name": f"{label} (zero-dispersion line), 10 nm FWHM at 800 nm",
        "inputs": {"kind": "scene", **scene},
        "expected": {"gddFs2": sig(float(exact))},
        "tolerance": {"gddFs2": sig(max(0.01, 2 * abs(float(sampled - exact))), 2)},
        "absolute": True,
        "note": (f"Paraxially zero; the exact model leaves {float(exact):.3g} fs^2. The five-sample quartic, as the "
                 f"app samples, reads {float(sampled):.3g} fs^2 (phase beyond fourth order); absolute tolerance "
                 "twice that, in fs^2, floored at 0.01."),
    })
    return out


MODEL = {
    "id": "ray-path-phase",
    "title": "Spectral phase from the ray paths: GDD of plates, prism pairs, grating pairs and a grating stretcher",
    "app": "sketch/js/raytrace.js: traceScene, detectorReading (pulse.gddFs2); sketch/js/path-phase.js: pathPhaseFit",
    "reference": "Own 2D ray tracer in 40-digit decimal arithmetic, phase differentiated in angular frequency by central differences; closed forms of Treacy (grating pair), Fork, Martinez and Gordon (prism pair) and plane-wave phase matching (tilted plate) asserted on the same layouts",
    "citations": [
        "E. B. Treacy, IEEE J. Quantum Electron. 5(9), 454-458 (1969), doi:10.1109/JQE.1969.1076303 (grating pair)",
        "R. L. Fork, O. E. Martinez and J. P. Gordon, Opt. Lett. 9(5), 150-152 (1984) (prism pair, apex path P = l cos beta)",
        "O. E. Martinez, IEEE J. Quantum Electron. 23(1), 59-64 (1987), doi:10.1109/JQE.1987.1073201 (grating stretcher with lenses)",
        "I. H. Malitson, J. Opt. Soc. Am. 55, 1205 (1965); SCHOTT optical glass catalogue (N-SF10) for the indices, as in material_dispersion.py",
    ],
    "fidelity": "computed",
    "scope": "In-plane layouts of flat mirrors, roof reflectors, prisms, plane-parallel glass, plane gratings and ideal thin lenses; Gaussian pulses sampled at five wavelengths",
    "outside_scope": "A family of wavelength samples that meets an element without a modelled path phase, changes wavelength, or arrives twice at one wavelength keeps each ray's glass GDD (the previous behaviour)",
    "provenance": "Element geometry from the scene format (prism vertices, mirror, roof and grating lines, thin-lens line, detector face); glass indices from the published Sellmeier forms; every layout has a closed form asserted on it (the stretcher's only to paraxial order).",
    "domain": "Fused silica and N-SF10 at 800 and 1030 nm, 10 and 30 nm FWHM; plates at 45 and 55.47 degrees; Brewster pairs 300-500 mm with 3-12 mm insertion, single, double (roof reflector) and four-prism; 1000 and 1200 l/mm pairs at 35-40 degrees, single and double pass; a 1200 l/mm stretcher with f = 300 mm, gratings 200 and 300 mm from the lenses.",
    "convergence": "Five-point central difference at h = 1e-4 omega_0 in 40-digit arithmetic: truncation about 1e-17 relative, round-off about 1e-25. The app's own discretisation (a quartic through five wavelengths across +-3 sigma) is evaluated on the reference trace and quoted per case.",
    "tolerance_rationale": "Twice the app's five-sample discretisation error measured on the reference trace, floored at 1e-6 relative for double-precision tracing; the zero-dispersion stretcher is absolute, in fs^2.",
}
