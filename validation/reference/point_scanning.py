# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Point-scanning microscope: resolution of the scanned focus and galvo scan geometry.

Written from the sources, not from the JavaScript, with different numerics:

- Bessel functions from Bessel's integral J_n(x) = (1/2pi) int cos(x sin t - n t) dt
  over one period, by the trapezoid rule (spectrally accurate for a periodic
  integrand), instead of rational approximations.
- The focal intensity h(u, v) = |2 int_0^1 J0(v rho) exp(-i u rho^2/2) rho d rho|^2
  (So et al. 2000, Eq. 2) by composite Simpson in rho; its in-focus and on-axis
  limits [2 J1(v)/v]^2 and sinc^2(u/4) in closed form.
- The pinhole's lateral response D(r) = int_{|s|<=R} h_det(|r - s|) d^2 s as a
  one-dimensional integral over the distance q from the object point, weighted
  by the arc of the circle |q| that lies inside the pinhole, with a cosine
  substitution across the pinhole's edge (the app integrates over the pinhole
  area in polar coordinates); its axial response
  D(z) = int_0^R h_det(u, v) 2 pi v dv by Simpson in v.
- FWHM by bisection on each profile.

Optical units: v = 2 pi NA r / lambda, u = 4 pi (n - sqrt(n^2 - NA^2)) z / lambda;
the detected light's units scale with lambda_exc / lambda_det. 1 AU = 1.22 lambda_det / NA.

Scan geometry (Negrean and Mansvelder 2014; tube-lens convention from the
Olympus/Evident primer): f_obj = f_ref / M, optical angle = 2 x mechanical,
intermediate height h = f_SL tan(theta) or f_SL theta, sample displacement
x = h f_obj / f_TL, field of view FN / M.
"""
import math

from common import sig

C_TOL = 1e-5


def bessel(n, x):
    m = 64 + 2 * int(abs(x))
    return math.fsum(math.cos(x * math.sin(2 * math.pi * k / m) - n * 2 * math.pi * k / m) for k in range(m)) / m


def airy(v):
    if abs(v) < 1e-6:
        return 1.0
    a = 2 * bessel(1, v) / v
    return a * a


def sinc2(u):
    x = u / 4
    if abs(x) < 1e-8:
        return 1.0
    return (math.sin(x) / x) ** 2


def simpson(f, a, b, n):
    if n % 2:
        n += 1
    h = (b - a) / n
    s = f(a) + f(b)
    s += 4 * math.fsum(f(a + (2 * k - 1) * h) for k in range(1, n // 2 + 1))
    s += 2 * math.fsum(f(a + 2 * k * h) for k in range(1, n // 2))
    return s * h / 3


def half_width(f, step):
    lo, hi = 0.0, step
    while f(hi) > 0.5:
        lo, hi = hi, hi + step
    for _ in range(60):
        mid = (lo + hi) / 2
        if f(mid) > 0.5:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


class Pinhole:
    """Detection response of a pinhole of radius R (optical units of the detected light)."""

    def __init__(self, radius, rho_points=600, v_points=240):
        self.R = radius
        self.rho = [k / rho_points for k in range(rho_points + 1)]
        self.rho_w = [(1 if k in (0, rho_points) else 4 if k % 2 else 2) / (3 * rho_points) for k in range(rho_points + 1)]
        self.v = [radius * k / v_points for k in range(v_points + 1)]
        self.v_w = [radius * (1 if k in (0, v_points) else 4 if k % 2 else 2) / (3 * v_points) for k in range(v_points + 1)]
        self.j0 = [[bessel(0, v * p) * p * w for p, w in zip(self.rho, self.rho_w)] for v in self.v]
        self.lat0 = self._lateral(0.0)
        self.ax0 = self._axial(0.0)

    def _lateral(self, r):
        R = self.R

        def arc(q):
            if q <= R - r:
                return 2 * math.pi
            if q >= R + r or r == 0:
                return 0.0
            c = (q * q + r * r - R * R) / (2 * q * r)
            return 2 * math.acos(max(-1.0, min(1.0, c)))

        inner = max(0.0, R - r)
        total = 2 * math.pi * simpson(lambda q: airy(q) * q, 0.0, inner, 400) if inner > 0 else 0.0
        if r > 0:
            # Across the pinhole's edge the arc has square-root ends; with
            # q = c - d cos t they become smooth in t.
            lo, hi = abs(R - r), R + r
            c, d = (hi + lo) / 2, (hi - lo) / 2
            total += simpson(lambda t: airy(c - d * math.cos(t)) * arc(c - d * math.cos(t)) * (c - d * math.cos(t)) * d * math.sin(t), 0.0, math.pi, 400)
        return total

    def _axial(self, u):
        c = [math.cos(u * p * p / 2) for p in self.rho]
        s = [math.sin(u * p * p / 2) for p in self.rho]
        acc = []
        for row in self.j0:
            re = math.fsum(a * b for a, b in zip(row, c))
            im = math.fsum(a * b for a, b in zip(row, s))
            acc.append(4 * (re * re + im * im))
        return 2 * math.pi * math.fsum(a * v * w for a, v, w in zip(acc, self.v, self.v_w))

    def lateral(self, r):
        return self._lateral(r) / self.lat0

    def axial(self, u):
        return self._axial(u) / self.ax0


def resolution(ex_nm, det_nm, na, n, pinhole_au=None, order=1):
    axial_na = n - math.sqrt(n * n - na * na)
    beta = ex_nm / det_nm
    lat_um = lambda hv, lam: 2 * hv * lam / 1000 / (2 * math.pi * na)
    ax_um = lambda hu, lam: 2 * hu * lam / 1000 / (4 * math.pi * axial_na)
    out = {}
    if order > 1:
        out["lateralUm"] = lat_um(half_width(lambda v: airy(v) ** order, 0.05), ex_nm)
        out["axialUm"] = ax_um(half_width(lambda u: sinc2(u) ** order, 0.1), ex_nm)
        return out
    if pinhole_au is None:
        # No axial resolution without a pinhole (every plane is excited and
        # detected); the excitation focus still has an axial width.
        out["lateralUm"] = lat_um(half_width(airy, 0.05), ex_nm)
        out["excitationAxialUm"] = ax_um(half_width(sinc2, 0.1), ex_nm)
        return out
    if pinhole_au == 0:
        lat = lambda v: airy(v) * airy(beta * v)
        ax = lambda u: sinc2(u) * sinc2(beta * u)
        slice_hw = half_width(sinc2, 0.2)
    else:
        p = Pinhole(1.22 * math.pi * pinhole_au)
        lat = lambda v: airy(v) * p.lateral(beta * v)
        ax = lambda u: sinc2(u) * p.axial(beta * u)
        slice_hw = half_width(p.axial, 0.2)
    out["lateralUm"] = lat_um(half_width(lat, 0.05), ex_nm)
    out["axialUm"] = ax_um(half_width(ax, 0.1), ex_nm)
    out["sliceUm"] = ax_um(slice_hw, det_nm)
    return out


def stokes_nm(ex_nm, shift_cm):
    return 1 / (1 / ex_nm - shift_cm * 1e-7)


def scan(magnification, ref_mm, fn_mm, sl_mm, tl_mm, mapping, beam_mm, angle_deg, range_deg, mechanical, na):
    k = 2 if mechanical else 1
    f_obj = ref_mm / magnification

    def x_um(deg):
        t = math.radians(k * deg)
        h = sl_mm * (math.tan(t) if mapping == "tan" else t)
        return 1000 * h * f_obj / tl_mm

    h = x_um(angle_deg) / 1000 * tl_mm / f_obj
    return {
        "objectiveMm": f_obj,
        "displacementUm": x_um(angle_deg),
        "fieldUm": 2 * x_um(range_deg / 2),
        "objectFieldUm": 1000 * fn_mm / magnification,
        "pupilAngleDeg": math.degrees(math.atan(h / tl_mm)),
        "beamAtPupilMm": beam_mm * tl_mm / sl_mm,
        "fillRatio": beam_mm * tl_mm / sl_mm / (2 * f_obj * na),
    }


def case(name, inputs, expected, tolerance=C_TOL, note=None):
    c = {"name": name, "inputs": inputs, "expected": {k: sig(v) for k, v in expected.items()},
         "tolerance": {k: tolerance for k in expected}}
    if note:
        c["note"] = note
    return c


def res_case(name, app_inputs, ex_nm, det_nm, na, n, pinhole_au=None, order=1):
    return case(name, {"kind": "resolution", **app_inputs}, resolution(ex_nm, det_nm, na, n, pinhole_au, order))


def cases():
    out = [
        # Analytic anchors: half-maximum of [2J1(v)/v]^2 at v = 1.6163, of sinc^2(x) at x = 1.3916.
        res_case("one-photon, no pinhole: 488 nm, NA 1.0 water", {"mode": "linear", "wavelengthNm": 488, "na": 1.0, "immersion": "water", "pinhole": "open"},
                 488, 520, 1.0, 1.333),
        res_case("one-photon, no pinhole: 633 nm, NA 0.3 air", {"mode": "linear", "wavelengthNm": 633, "na": 0.3, "immersion": "air", "pinhole": "open"},
                 633, 520, 0.3, 1.0),
        res_case("confocal, point pinhole: 488/520 nm, NA 1.0 water", {"mode": "linear", "wavelengthNm": 488, "emissionNm": 520, "na": 1.0, "immersion": "water", "pinhole": "pinhole", "pinholeAu": 0},
                 488, 520, 1.0, 1.333, 0),
        res_case("confocal, 1 AU: 488/520 nm, NA 1.0 water", {"mode": "linear", "wavelengthNm": 488, "emissionNm": 520, "na": 1.0, "immersion": "water", "pinhole": "pinhole", "pinholeAu": 1},
                 488, 520, 1.0, 1.333, 1),
        res_case("confocal Raman, 0.5 AU: 532 nm + 2900 cm-1, NA 1.4 oil", {"mode": "linear", "wavelengthNm": 532, "detection": "raman", "ramanShiftCm": 2900, "na": 1.4, "immersion": "oil", "pinhole": "pinhole", "pinholeAu": 0.5},
                 532, stokes_nm(532, 2900), 1.4, 1.518, 0.5),
        res_case("confocal reflection, 3 AU: 633 nm, NA 0.5 air", {"mode": "linear", "wavelengthNm": 633, "detection": "elastic", "na": 0.5, "immersion": "air", "pinhole": "pinhole", "pinholeAu": 3},
                 633, 633, 0.5, 1.0, 3),
        res_case("confocal, 10 AU: 561/610 nm, NA 0.8 custom n 1.45", {"mode": "linear", "wavelengthNm": 561, "emissionNm": 610, "na": 0.8, "immersion": "custom", "immersionIndex": 1.45, "pinhole": "pinhole", "pinholeAu": 10},
                 561, 610, 0.8, 1.45, 10),
        res_case("two-photon: 920 nm, NA 1.0 water", {"mode": "nonlinear", "order": "2", "nlWavelengthNm": 920, "na": 1.0, "immersion": "water"},
                 920, 920, 1.0, 1.333, None, 2),
        res_case("three-photon: 1700 nm, NA 1.05 water", {"mode": "nonlinear", "order": "3", "nlWavelengthNm": 1700, "na": 1.05, "immersion": "water"},
                 1700, 1700, 1.05, 1.333, None, 3),
    ]
    scans = [
        ("20x/200 mm, 50/200 mm relay, 1 deg mechanical, tan", dict(magnification=20, tubeReference="200", fieldNumberMm=22, scanLensMm=50, tubeLensMm=200, mapping="tan", beamMm=5, angleKind="mechanical", angleDeg=1, rangeDeg=4),
         (20, 200, 22, 50, 200, "tan", 5, 1, 4, True)),
        ("25x/180 mm, 75/300 mm, 12 deg optical, f-theta", dict(magnification=25, tubeReference="180", fieldNumberMm=18, scanLensMm=75, tubeLensMm=300, mapping="ftheta", beamMm=3, angleKind="optical", angleDeg=12, rangeDeg=20),
         (25, 180, 18, 75, 300, "ftheta", 3, 12, 20, False)),
        ("63x custom 164.5 mm, -7.5 deg mechanical, tan", dict(magnification=63, tubeReference="custom", tubeReferenceMm=164.5, fieldNumberMm=25, scanLensMm=39, tubeLensMm=164.5, mapping="tan", beamMm=4, angleKind="mechanical", angleDeg=-7.5, rangeDeg=30),
         (63, 164.5, 25, 39, 164.5, "tan", 4, -7.5, 30, True)),
    ]
    for name, inputs, args in scans:
        expected = scan(*args, na=1.0)
        out.append({"name": name, "inputs": {"kind": "scan", "na": 1.0, **inputs},
                    "expected": {k: sig(v) for k, v in expected.items()},
                    "tolerance": {k: 1e-9 for k in expected}})
    return out


MODEL = {
    "id": "point-scanning",
    "title": "Point-scanning microscope resolution and galvo scan geometry",
    "app": "calculators/point-scanning/scanning-calculator.js: computeResolution, computeScan (point images in calculators/point-scanning/psf.js)",
    "reference": "Bessel functions from Bessel's integral (trapezoid over one period); focal field by Simpson in the pupil radius; the pinhole's lateral response as an arc-weighted integral over the distance from the object point; FWHM by bisection; scan geometry in closed form",
    "citations": [
        "S. Wilhelm, Confocal Laser Scanning Microscopy: Principles, Carl Zeiss Microscopy (2010), eqs. 1-8 (closed-form limits)",
        "P. T. C. So et al., Annu. Rev. Biomed. Eng. 2, 399-429 (2000), doi:10.1146/annurev.bioeng.2.1.399, Eq. 2 (focal intensity, two-photon PSF)",
        "T. Wilson and A. R. Carlini, Opt. Lett. 12, 227-229 (1987), doi:10.1364/OL.12.000227 (finite pinhole)",
        "M. Born and E. Wolf, Principles of Optics, 7th ed. (1999) (Airy pattern, field near focus)",
        "A. Negrean and H. D. Mansvelder, Biomed. Opt. Express 5, 1588 (2014), doi:10.1364/BOE.5.001588 (scan-lens mappings)",
    ],
    "provenance": "Optical coordinates and h(u, v) from So et al. Eq. 2; confocal product and pinhole integral from the Zeiss monograph's Eq. 1 and Wilson and Carlini; N-photon point image as h^N. The open and point-pinhole limits reproduce the monograph's rounded 0.51, 0.88, 0.37 and 0.64 coefficients (0.5145, 0.8859, 0.3693, 0.6378 here).",
    "domain": "One-photon without a pinhole (water, air), with a point pinhole and with 0.5, 1, 3 and 10 AU pinholes (fluorescence with a Stokes shift, spontaneous Raman in oil, elastic reflection in air, a custom index); two-photon at 920 nm and three-photon at 1700 nm; scan geometry for 200, 180 and custom reference tube lenses, mechanical and optical angles, negative angles, tan and f-theta mappings.",
    "convergence": "Bessel trapezoid with 64 + 2|x| nodes; Simpson with 600 pupil and 240 pinhole-radius intervals for the axial response and 400 intervals per segment for the lateral one; 60-step bisection. Doubling every grid moves no width by more than 1e-6 relative (the largest change, 9e-7, is the 10 AU slice thickness).",
    "tolerance_rationale": "1e-5 relative for the widths: the app's fixed Gauss-Legendre quadrature (64 x 48 nodes over the pinhole, 128 over the pupil) and its 1e-8 Bessel approximations, both well inside it; 1e-9 for the closed-form scan geometry.",
    "outside_scope": "Declines an NA not below the medium's index, wavelengths outside 200-3000 nm, a Raman Stokes line beyond 3000 nm, pinholes above 10 AU and optical deflections beyond +/-60 degrees.",
    "fidelity": "computed",
    "scope": "Scalar focus of a uniformly filled, aberration-free circular pupil with the n(1 - cos alpha) axial scale; incoherent point objects; ideal thin-lens scan relay.",
}
