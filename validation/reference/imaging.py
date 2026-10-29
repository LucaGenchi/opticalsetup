# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Imaging calculator: the image of an object through one lens, ideal or a
spherical singlet (convex or concave, designed from f or given by its
radii), with its thin-lens model; and two lenses spaced afocal (Keplerian
and Galilean telescopes, the 4f relay) or at a set gap.

Reference methods, chosen to differ from the app's
(calculators/imaging/imaging.js), which multiplies ray-transfer matrices
(each singlet's from two y-u rays through its faces) and reads the image
from the product, s' = -(A d + B)/(C d + D), solves an equi-concave lens's
radius from a quadratic, and the afocal gap from the linear C(g) = 0:

- each singlet's f and principal planes from the closed forms of the
  thick-lens lensmaker's equation (thick_lens.lens; Wikipedia, "Lens"), the
  convex designs by thick_lens.design's secant method, an equi-concave
  radius by the secant method on the same closed-form power;
- one lens: the Gaussian formula 1/s + 1/s' = 1/f with distances from H
  and H', m = -s'/s, and Newton's x = s - f, x' = s' - f; the thin-lens
  model by the same formula from the lens's centre;
- two lenses: lens by lens, the image of the first the object of the
  second (BSc Optics, section 2.6), m the product; spaced afocal, the gap
  that puts H' of the first f1 + f2 before H of the second, and the image by
  Newton's form applied twice, x2' = -(f2/f1)^2 x1, m = -f2/f1; at a set
  gap, the pair's f by Gullstrand's equation with the distance e between
  H' of the first lens and H of the second, its principal planes f e/f2
  after H of the first and f e/f1 before H' of the second.
"""

from common import sig
from lens_design import n_of
from thick_lens import lens as thick, design, sag


def equi_concave(glass, nm, f, t):
    """The equi-concave radius R (R1 = -R, R2 = R) with focal length f < 0,
    by the secant method on the closed-form power."""
    n = n_of(glass, nm)
    a = -2 * (n - 1) * f
    b = 1.05 * a

    def g(r):
        return 1 / thick(glass, nm, -r, r, t)["f"] - 1 / f

    for _ in range(200):
        ga, gb = g(a), g(b)
        if gb == ga:
            break
        a, b = b, b - gb * (b - a) / (gb - ga)
        if abs(b - a) < 1e-15 * abs(b):
            break
    return b


def build(spec, nm):
    """A lens from the page's description: f, the principal planes (H from
    V1, H' from V2), back and front focal lengths, thickness and the
    thin-lens formula's f."""
    kind = spec["kind"]
    if kind == "ideal":
        f = spec["f"]
        return {"f": f, "h1": 0.0, "h2": 0.0, "bfl": f, "ffl": f, "t": 0.0, "thin": f}
    glass, dia = spec["glass"], spec["diameter"]
    flat_first = spec.get("orientation") == "plano"
    if kind in ("planoconvex", "biconvex"):
        if spec["spec"] == "focal":
            r1, r2, t = design(glass, nm, kind, spec["f"], dia, spec["edge"], "plano" if flat_first else "convex", spec.get("shape", "equi"))
        elif kind == "planoconvex":
            r, t = spec["radius"], spec["centre"]
            r1, r2 = (0.0, -r) if flat_first else (r, 0.0)
        else:
            r1, r2, t = spec["front"], -spec["back"], spec["centre"]
    else:
        t = spec["centre"]
        if kind == "planoconcave":
            r = (n_of(glass, nm) - 1) * -spec["f"] if spec["spec"] == "focal" else spec["radius"]
            r1, r2 = (0.0, r) if flat_first else (-r, 0.0)
        elif spec["spec"] == "focal":
            r = equi_concave(glass, nm, spec["f"], t)
            r1, r2 = -r, r
        else:
            r1, r2 = -spec["front"], spec["back"]
    d = thick(glass, nm, r1, r2, t)
    return {"f": d["f"], "h1": d["h1"], "h2": d["h2"], "bfl": d["bfl"], "ffl": d["ffl"], "t": t, "thin": d["thin"],
            "edge": t - (sag(r1, dia / 2) if r1 else 0.0) + (sag(r2, dia / 2) if r2 else 0.0)}


def thin_model(lens):
    """A thin lens of the thin-lens formula's f at the lens's centre: both
    principal planes there."""
    t = lens["t"]
    return {"f": lens["thin"], "h1": t / 2, "h2": -t / 2, "t": t}


def gaussian(lens, d):
    """Object d before V1: s from H, s' from H', the image after V2, m."""
    s = d + lens["h1"]
    s2 = 1 / (1 / lens["f"] - 1 / s)
    return {"s": s, "s2": s2, "fromLast": s2 + lens["h2"], "m": -s2 / s}


def through_pair(l1, l2, gap, d):
    """Lens by lens: the image by lens 1, z from its V1, is the object of
    lens 2, a distance before its H (negative: a virtual object)."""
    a = gaussian(l1, d)
    z_image = l1["t"] + l1["h2"] + a["s2"]
    s2 = l1["t"] + gap + l2["h1"] - z_image
    s2i = 1 / (1 / l2["f"] - 1 / s2)
    return {"fromLast": s2i + l2["h2"], "m": a["m"] * (-s2i / s2)}


def afocal_image(l1, l2, d):
    """Afocal pair: Newton's form twice. x1 before F of lens 1, x2' after F'
    of lens 2."""
    x1 = d - l1["ffl"]
    x2 = -(l2["f"] / l1["f"]) ** 2 * x1
    return {"fromLast": l2["bfl"] + x2, "m": -l2["f"] / l1["f"]}


def pair_system(l1, l2, gap):
    """Gullstrand: the pair's f and principal planes (H from lens 1's V1, H'
    from lens 2's V2), with e from H' of lens 1 to H of lens 2."""
    e = gap + l2["h1"] - l1["h2"]
    f = 1 / (1 / l1["f"] + 1 / l2["f"] - e / (l1["f"] * l2["f"]))
    h1 = l1["h1"] + f * e / l2["f"]
    h2 = l2["h2"] - f * e / l1["f"]
    return {"efl": f, "bfl": f + h2, "ffl": f - h1, "h1Mm": h1, "h2Mm": h2}


def kept(values):
    """Values of exactly zero (a principal plane on a vertex) need an
    absolute tolerance; the relative cases leave them out."""
    return {k: sig(v) for k, v in values.items() if abs(v) > 1e-9}


def one_case(name, nm, spec, d, h=3.0):
    lens = build(spec, nm)
    im = gaussian(lens, d)
    thin = gaussian(thin_model(lens), d)
    values = {"efl": lens["f"], "fromLast": im["fromLast"], "magnification": im["m"], "heightMm": im["m"] * h,
              "objectFromH": im["s"], "imageFromH2": im["s2"], "newtonX": im["s"] - lens["f"], "newtonX2": im["s2"] - lens["f"],
              "thinFromLast": thin["fromLast"], "thinMagnification": thin["m"]}
    if spec["kind"] == "ideal":
        for k in ("thinFromLast", "thinMagnification"):
            values.pop(k)
    expected = kept(values)
    return {"name": f"one lens: {name}", "inputs": {"kind": "one", "wavelengthNm": nm, "objectDistanceMm": d, "objectHeightMm": h, **page_inputs("lens", spec)},
            "expected": expected, "tolerance": {k: 1e-9 for k in expected}}


def page_inputs(p, spec):
    """The page's inputs, ids prefixed by p, for this lens."""
    names = {"kind": "Kind", "orientation": "Orientation", "spec": "Spec", "shape": "Shape", "glass": "Glass", "f": "FocalMm",
             "diameter": "DiameterMm", "edge": "EdgeMm", "centre": "CentreMm", "radius": "RadiusMm", "front": "FrontRadiusMm", "back": "BackRadiusMm"}
    return {p + names[k]: v for k, v in spec.items()}


def pair_case(name, nm, s1, s2, spacing="afocal", gap=None, light="infinity", d=None, beam=5.0, field=1.0, h=4.0):
    l1, l2 = build(s1, nm), build(s2, nm)
    t1, t2 = l1["t"], l2["t"]
    afocal = spacing == "afocal"
    g = l1["f"] + l2["f"] - l2["h1"] + l1["h2"] if afocal else gap
    tl1, tl2 = thin_model(l1), thin_model(l2)
    g_thin = l1["thin"] + l2["thin"] - t1 / 2 - t2 / 2 if afocal else g
    values = {"gapMm": g, "thinGapMm": g_thin, "lengthMm": t1 + g + t2}
    if afocal:
        values.update({"angular": -l1["f"] / l2["f"], "expansion": -l2["f"] / l1["f"]})
    else:
        values.update(pair_system(l1, l2, g))
        values["thinEfl"] = pair_system(tl1, tl2, g_thin)["efl"]
    inputs = {"kind": "pair", "pairWavelengthNm": nm, "spacing": spacing, "pairObject": light, **page_inputs("l1", s1), **page_inputs("l2", s2)}
    if gap is not None:
        inputs["gapMm"] = gap
    if light == "infinity":
        inputs.update({"beamDiameterMm": beam, "fieldDeg": field})
        if afocal:
            values.update({"beamDiameterMm": abs(l2["f"] / l1["f"]) * beam, "beamAngleDeg": -l1["f"] / l2["f"] * field})
        else:
            values["focusFromLast"] = values["bfl"]
    else:
        if light == "focal":
            d = l1["ffl"]
        else:
            inputs["pairDistanceMm"] = d
        inputs["pairHeightMm"] = h
        im = afocal_image(l1, l2, d) if afocal else through_pair(l1, l2, g, d)
        th = afocal_image(tl1 | {"ffl": tl1["f"] - tl1["h1"]}, tl2 | {"bfl": tl2["f"] + tl2["h2"]}, d) if afocal else through_pair(tl1, tl2, g_thin, d)
        values.update({"fromLast": im["fromLast"], "magnification": im["m"], "thinFromLast": th["fromLast"], "thinMagnification": th["m"]})
    expected = kept(values)
    return {"name": f"two lenses: {name}", "inputs": inputs, "expected": expected, "tolerance": {k: 1e-9 for k in expected}}


# Lenses as the page describes them.
BICONVEX = {"kind": "biconvex", "spec": "radii", "glass": "nbk7", "front": 20.0, "back": 20.0, "centre": 5.0, "diameter": 12.0}
BICONCAVE = {**BICONVEX, "kind": "biconcave"}
PCX50 = {"kind": "planoconvex", "spec": "focal", "glass": "nbk7", "f": 50.0, "diameter": 25.4, "edge": 2.0, "orientation": "convex"}
PCX150 = {**PCX50, "f": 150.0, "orientation": "plano"}
PCV50 = {"kind": "planoconcave", "spec": "focal", "glass": "nbk7", "f": -50.0, "diameter": 25.4, "centre": 3.0, "orientation": "convex"}


def boundary_cases():
    """The page's refusals, each boundary computed here and approached from
    both sides, 1e-6 relative inside and outside: the app accepts (1) or
    refuses (0)."""
    out = []

    def pair_of(name, accepted, nm, inputs):
        out.append({"name": f"refusal boundary: {name}: {'accepted' if accepted else 'refused'}", "inputs": inputs,
                    "expected": {"accepted": 1 if accepted else 0}, "tolerance": {"accepted": 0}, "absolute": True})

    nm, dia = 588.0, 20.0
    n = n_of("nbk7", nm)
    # A plano-concave lens needs R = (n - 1)|f| above the clear radius.
    f_least = dia / 2 / (n - 1)
    for k, ok in ((1 + 1e-6, True), (1 - 1e-6, False)):
        pair_of(f"plano-concave N-BK7, D = 20 mm, |f| = (D/2)/(n - 1) times {k:.6f}", ok, nm,
                {"kind": "one", "wavelengthNm": nm, **page_inputs("lens", {"kind": "planoconcave", "spec": "focal", "glass": "nbk7", "f": -f_least * k, "diameter": dia, "centre": 3.0})})
    # An equi-concave lens of thickness t: the f whose radius is the clear
    # radius, from the closed-form power.
    t = 3.0
    f_edge = thick("nbk7", nm, -dia / 2, dia / 2, t)["f"]
    for k, ok in ((1 + 1e-6, True), (1 - 1e-6, False)):
        pair_of(f"equi-concave N-BK7, D = 20 mm, t = 3 mm, f where R = D/2, times {k:.6f}", ok, nm,
                {"kind": "one", "wavelengthNm": nm, **page_inputs("lens", {"kind": "biconcave", "spec": "focal", "glass": "nbk7", "f": f_edge * k, "diameter": dia, "centre": t})})
    # A bi-convex lens by its radii: faces meet at the rim when t is both sags.
    t_least = sag(20.0, 6.0) + sag(30.0, 6.0)
    for k, ok in ((1 + 1e-6, True), (1 - 1e-6, False)):
        pair_of(f"bi-convex R1 = 20, R2 = -30 mm, D = 12 mm, centre thickness both sags times {k:.6f}", ok, nm,
                {"kind": "one", "wavelengthNm": nm, **page_inputs("lens", {**BICONVEX, "back": 30.0, "centre": t_least * k})})
    # Afocal spacing needs f1 + f2 > 0.
    for k, ok in ((1 - 1e-6, True), (1 + 1e-6, False)):
        pair_of(f"ideal lenses f1 = 50 mm, f2 = -50 mm times {k:.6f}, spaced afocal", ok, 633.0,
                {"kind": "pair", "pairWavelengthNm": 633.0, "spacing": "afocal", "pairObject": "infinity",
                 **page_inputs("l1", {"kind": "ideal", "f": 50.0, "diameter": 25.4}), **page_inputs("l2", {"kind": "ideal", "f": -50.0 * k, "diameter": 25.4})})
    # Two lenses touch at the smaller clear radius when the gap between the
    # vertices equals lens 1's back sag less lens 2's front sag there.
    s1 = {"kind": "planoconcave", "spec": "focal", "glass": "nbk7", "f": -50.0, "diameter": 25.4, "centre": 3.0, "orientation": "plano"}
    s2 = {**PCX150, "orientation": "convex"}
    r_back = (n_of("nbk7", 633.0) - 1) * 50.0
    r_front, _, _ = design("nbk7", 633.0, "planoconvex", 150.0, 25.4, 2.0, "convex", "equi")
    least = sag(r_back, 12.7) - sag(r_front, 12.7)
    base = {"kind": "pair", "pairWavelengthNm": 633.0, "spacing": "gap", "pairObject": "infinity", **page_inputs("l1", s1), **page_inputs("l2", s2)}
    out.append({"name": "refusal boundary: plano-concave flat side first then plano-convex curved side first: the least gap", "inputs": {**base, "gapMm": 10.0},
                "expected": {"minimumGapMm": sig(least)}, "tolerance": {"minimumGapMm": 1e-9}})
    for k, ok in ((1 + 1e-6, True), (1 - 1e-6, False)):
        pair_of(f"the same pair at the least gap times {k:.6f}", ok, 633.0, {**base, "gapMm": least * k})
    return out


def cases():
    out = boundary_cases() + [
        one_case("the example, bi-convex N-BK7 R = +/-20 mm, t = 5 mm, object 50 mm before V1, at 588 nm", 588.0, BICONVEX, 50.0),
        one_case("the example inside F: a virtual, enlarged image", 588.0, BICONVEX, 15.0),
        one_case("the same radii bi-concave", 588.0, BICONCAVE, 50.0),
        one_case("plano-convex N-BK7 designed for f = 50 mm, 2 mm edge, curved side first, object 120 mm away, at 633 nm", 633.0, PCX50, 120.0),
        one_case("the same flat side first, object 30 mm away (virtual)", 633.0, {**PCX50, "orientation": "plano"}, 30.0),
        one_case("best-form bi-convex fused silica, f = 100 mm, D = 25 mm, at 1064 nm, object 300 mm away", 1064.0,
                 {"kind": "biconvex", "spec": "focal", "shape": "best", "glass": "silica", "f": 100.0, "diameter": 25.0, "edge": 2.0}, 300.0),
        one_case("plano-concave N-BK7 designed for f = -40 mm, t = 3 mm, flat side first, object 60 mm away", 588.0,
                 {"kind": "planoconcave", "spec": "focal", "glass": "nbk7", "f": -40.0, "diameter": 20.0, "centre": 3.0, "orientation": "plano"}, 60.0),
        one_case("equi-concave N-SF11 designed for f = -75 mm, t = 2.5 mm, at 486 nm", 486.0,
                 {"kind": "biconcave", "spec": "focal", "glass": "nsf11", "f": -75.0, "diameter": 25.0, "centre": 2.5}, 90.0),
        one_case("plano-concave CaF2, R = 30 mm, t = 4 mm, curved side first, at 3000 nm", 3000.0,
                 {"kind": "planoconcave", "spec": "radii", "glass": "caf2", "radius": 30.0, "centre": 4.0, "diameter": 20.0, "orientation": "convex"}, 45.0),
        one_case("ideal thin lens, f = 40 mm, object 100 mm away", 588.0, {"kind": "ideal", "f": 40.0, "diameter": 25.0}, 100.0),
        one_case("ideal thin lens, f = -40 mm, object 30 mm away", 588.0, {"kind": "ideal", "f": -40.0, "diameter": 25.0}, 30.0),
        pair_case("Keplerian expander, plano-convex f = 50 and 150 mm at 633 nm (the example)", 633.0, PCX50, PCX150),
        pair_case("Galilean expander, plano-concave f = -50 mm then plano-convex 150 mm", 633.0, PCV50, PCX150),
        pair_case("Galilean reducer, plano-convex 150 mm then equi-concave -50 mm, at 1064 nm", 1064.0, {**PCX150, "orientation": "convex"},
                  {"kind": "biconcave", "spec": "focal", "glass": "nbk7", "f": -50.0, "diameter": 25.4, "centre": 3.0}),
        pair_case("the example as a 4f relay, object in lens 1's front focal plane", 633.0, PCX50, PCX150, light="focal"),
        pair_case("the example spaced afocal, object 100 mm before lens 1 (Newton's form twice)", 633.0, PCX50, PCX150, light="distance", d=100.0),
        pair_case("ideal lenses f = 100 and 200 mm as a 4f relay", 633.0, {"kind": "ideal", "f": 100.0, "diameter": 25.4}, {"kind": "ideal", "f": 200.0, "diameter": 25.4}, light="focal"),
        pair_case("the example at a 100 mm gap: the pair's f and principal planes", 633.0, PCX50, PCX150, spacing="gap", gap=100.0),
        pair_case("the example at a 30 mm gap, object 200 mm away (lens by lens)", 633.0, PCX50, PCX150, spacing="gap", gap=30.0, light="distance", d=200.0),
        pair_case("bi-convex then bi-concave singlets by their radii at a 10 mm gap, object 80 mm away", 588.0, BICONVEX,
                  {**BICONCAVE, "front": 60.0, "back": 40.0, "centre": 2.0, "diameter": 20.0}, spacing="gap", gap=10.0, light="distance", d=80.0),
    ]
    return out


MODEL = {
    "id": "imaging",
    "title": "Imaging with lenses: one lens and its thin-lens model, telescopes, the 4f relay and two lenses at any gap",
    "app": "calculators/imaging/imaging.js: buildLens, computeImaging, computePair",
    "reference": "Gaussian imaging from each lens's principal planes, lens by lens for a pair; Newton's form twice for an afocal pair; Gullstrand's equation and its principal planes at a set gap; the closed-form thick-lens data, and the concave designs by the secant method (the app: ray-transfer matrices multiplied, the image read from the product, the equi-concave radius from a quadratic, the afocal gap from C(g) = 0)",
    "citations": [
        "Wikipedia, \"Lens (optics)\": the thin-lens formula, magnification and Newton's form, the thick-lens lensmaker's equation and principal planes, two lenses a distance apart",
        "S. A. Konijnenberg, A. J. H. Adam and H. P. Urbach, BSc Optics (TU Delft Open, 2021), section 2.6: imaging with a thin lens, Newton's equation, two thin lenses (the image of the first is the object of the second), the thick lens's principal planes",
    ],
    "provenance": "The formulas written from the cited texts; the convex designs and thick-lens data are thick_lens.py's independent closed forms.",
    "domain": "The refusal boundaries, each computed here and approached from both sides (a plano-concave and an equi-concave lens whose radius reaches the clear radius, a bi-convex lens whose faces meet at the rim, an afocal pair with f1 + f2 = 0, two lenses touching at their rims, and that least gap itself); eleven single lenses (bi-convex, bi-concave and plano-concave by their radii; plano-convex, best-form bi-convex, plano-concave and equi-concave designed from f; ideal lenses of either sign) in N-BK7, fused silica, N-SF11 and CaF2 from 486 to 3000 nm, with real and virtual images; nine pairs: Keplerian and Galilean expanders and a Galilean reducer spaced afocal, a 4f relay with singlets and with ideal lenses, an afocal pair imaging an object outside the focal plane, and pairs at 100, 30 and 10 mm gaps.",
    "convergence": "Closed forms in double precision; the secant methods to 1e-15.",
    "tolerance_rationale": "1e-9 relative: two exact methods for the same paraxial quantities, differing only by round-off; expected values stored to 10 significant digits. The refusal boundaries are approached 1e-6 relative from each side, far beyond that round-off, and must be accepted or refused exactly.",
    "outside_scope": "The page refuses a wavelength outside a glass's fitted range, a focal length of the wrong sign for a convex or concave singlet, radii smaller than the clear radius, faces that cross before the clear diameter, an afocal spacing that would need f1 + f2 <= 0 or overlapping lenses, and a front focal plane of lens 1 that lies after it.",
    "fidelity": "computed",
    "scope": "Paraxial imaging by ideal thin lenses and spherical singlets in air, on the axis, at one wavelength, without apertures or aberrations.",
}
