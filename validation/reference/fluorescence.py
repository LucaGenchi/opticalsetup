# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""One-photon fluorescence: excitation, detection budget and saturation.

Written from the definitions, not from the JavaScript, and by other methods
wherever one exists:

- the absorption cross-section from Beer-Lambert attenuation of a slab
  (decadic extinction epsilon c l against exp(-sigma n l)), solved for sigma;
- the peak intensity of a diffraction-limited focus from the power in the
  Airy pattern, integrated numerically with Bessel functions evaluated here
  (power series below x = 12, Hankel's asymptotic expansion above); the same
  quadrature reproduces Born and Wolf's 83.8 % of the power inside the first
  dark ring, which anchors it;
- the two-level steady state by integrating the rate equation
  dN1/dt = k (1 - N1) - N1/tau with RK4 until it settles, and the
  saturation intensity by bisection on that steady state;
- the collection fraction of an isotropic emitter by Simpson quadrature over
  the solid angle;
- the fraction of a stored emission spectrum passed by hard-edged filters
  exactly, piece by piece (the stored curve is linear between its 1 nm
  samples and the filters are constant between their edges), and through
  logistic edges by Simpson quadrature on a 0.002 nm grid;
- the average over an LED band by Simpson quadrature, and a band's
  leakage through hard filters by the closed-form integral of lambda times
  a Gaussian;
- pulsed excitation by integrating the rate equation through trains of
  finite Gaussian pulses until the state after a pulse repeats;
- the narrowest notch that reaches its blocking by bisection;
- a band's excitation at the centre of a focus, each wavelength weighted
  by its own Airy peak, by Simpson quadrature;
- the detector curves against the values their datasheets tabulate,
  converting cathode radiant sensitivity S to quantum efficiency as
  QE = S h c / (e lambda).

The stored EGFP spectrum is read from sketch/data/fluorophores/egfp.json:
that file is data (FPbase's curve), not the app's code.
"""
import json
import math
import os

from common import C_M_PER_S, sig

H_PLANCK = 6.62607015e-34       # J s, exact (SI 2019)
E_CHARGE = 1.602176634e-19      # C, exact (SI 2019)
AVOGADRO = 6.02214076e23        # 1/mol, exact (SI 2019)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EGFP = json.load(open(os.path.join(ROOT, "sketch", "data", "fluorophores", "egfp.json"), encoding="utf-8"))


# ---------------- Bessel functions ----------------

def _series(nu, x):
    term = (x / 2) ** nu / math.factorial(nu)
    total, k = term, 0
    while abs(term) > 1e-18 * max(1.0, abs(total)):
        k += 1
        term *= -(x / 2) ** 2 / (k * (k + nu))
        total += term
    return total


def _hankel(nu, x):
    mu = 4 * nu * nu
    p, q, term, k = 0.0, 0.0, 1.0, 0
    while True:
        if k % 2 == 0:
            p += (-1) ** (k // 2) * term
        else:
            q += (-1) ** ((k - 1) // 2) * term
        k += 1
        nxt = term * (mu - (2 * k - 1) ** 2) / (k * 8 * x)
        if abs(nxt) < 1e-17 or abs(nxt) > abs(term):
            break
        term = nxt
    chi = x - (nu / 2 + 0.25) * math.pi
    return math.sqrt(2 / (math.pi * x)) * (p * math.cos(chi) - q * math.sin(chi))


def bessel_j(nu, x):
    return _series(nu, x) if x < 12 else _hankel(nu, x)


def simpson(f, a, b, n):
    n += n % 2
    h = (b - a) / n
    s = f(a) + f(b) + sum((4 if i % 2 else 2) * f(a + i * h) for i in range(1, n))
    return s * h / 3


AIRY_FIRST_ZERO = 3.8317059702075123    # first zero of J1


def airy_integrand(v):
    # [2 J1(v)/v]^2 v, the radial power density of the Airy pattern in v.
    return 4 * bessel_j(1, v) ** 2 / v if v > 0 else 0.0


def airy_total():
    """The integral of [2 J1(v)/v]^2 v dv over all v, numerically: to V =
    400 by Simpson, then the tail, where 4 J1(v)^2 / v averages 4/(pi v^2)."""
    upper = 400.0
    body = simpson(airy_integrand, 0.0, upper, 80000)
    return body + 4 / (math.pi * upper)


AIRY_TOTAL = airy_total()
_first_ring = simpson(airy_integrand, 0.0, AIRY_FIRST_ZERO, 4000) / AIRY_TOTAL
# Born and Wolf, Principles of Optics, section 8.5.2: 83.8 % inside the first
# dark ring (three figures).
assert abs(_first_ring - 0.838) < 0.0005, _first_ring


# ---------------- cases ----------------

def cross_section_case(extinction):
    # A slab of concentration c (mol/L) and length l (cm) transmits
    # 10^(-epsilon c l) = exp(-sigma n l), n = c N_A / 1000 molecules per cm^3.
    c, l = 1e-6, 1.0
    transmission = 10 ** (-extinction * c * l)
    n = c * AVOGADRO / 1000
    sigma = -math.log(transmission) / (n * l)
    return {"name": f"cross-section, epsilon = {extinction:g} M^-1 cm^-1",
            "inputs": {"kind": "crossSection", "extinctionM": extinction},
            "expected": {"crossSectionCm2": sig(sigma)}, "tolerance": {"crossSectionCm2": 1e-9}}


def focus_case(power_w, wavelength_nm, na):
    # I(r) = I0 [2 J1(v)/v]^2, v = (2 pi NA / lambda) r; P = I0 2 pi (lambda/(2 pi NA))^2 * total.
    lam_cm = wavelength_nm * 1e-7
    i0 = power_w / (2 * math.pi * (lam_cm / (2 * math.pi * na)) ** 2 * AIRY_TOTAL)
    return {"name": f"focus peak intensity, {power_w:g} W, {wavelength_nm:g} nm, NA {na:g}",
            "inputs": {"kind": "focus", "powerW": power_w, "wavelengthNm": wavelength_nm, "na": na},
            "expected": {"intensityWcm2": sig(i0)}, "tolerance": {"intensityWcm2": 1e-5},
            "note": "The Airy-power quadrature and its averaged tail agree with the exact total of 2 to about 1e-6."}


def widefield_case(power_w, diameter_um):
    r_cm = diameter_um * 1e-4 / 2
    area = simpson(lambda r: 2 * math.pi * r, 0.0, r_cm, 2)    # exact for a linear integrand
    return {"name": f"widefield intensity, {power_w:g} W over {diameter_um:g} um",
            "inputs": {"kind": "widefield", "powerW": power_w, "diameterUm": diameter_um},
            "expected": {"intensityWcm2": sig(power_w / area)}, "tolerance": {"intensityWcm2": 1e-9}}


def steady_state(k, tau):
    """N1 after integrating dN1/dt = k (1 - N1) - N1/tau from 0 for 60
    relaxation times, by RK4; the residual e^-60 is below round-off."""
    rate = k + 1 / tau
    steps, t_end = 6000, 60 / rate
    h, n1 = t_end / steps, 0.0
    f = lambda y: k * (1 - y) - y / tau
    for _ in range(steps):
        a = f(n1); b = f(n1 + h * a / 2); c = f(n1 + h * b / 2); d = f(n1 + h * c)
        n1 += h * (a + 2 * b + 2 * c + d) / 6
    return n1


def rates_case(intensity, wavelength_nm, sigma, lifetime_ns, qy):
    photon_j = H_PLANCK * C_M_PER_S / (wavelength_nm * 1e-9)
    flux = intensity / photon_j
    k = sigma * flux
    tau = lifetime_ns * 1e-9
    n1 = steady_state(k, tau)
    lo, hi = 1e-3, 1e12     # intensity (W/cm^2) where N1 = 1/2, by bisection on log I
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if steady_state(sigma * mid / photon_j, tau) < 0.5:
            lo = mid
        else:
            hi = mid
    expected = {"photonFlux": sig(flux), "absorptionRate": sig(k), "excitedFraction": sig(n1),
                "emissionRate": sig(qy * n1 / tau), "saturationIntensityWcm2": sig(math.sqrt(lo * hi))}
    return {"name": f"two-level steady state, {intensity:g} W/cm^2 at {wavelength_nm:g} nm, tau {lifetime_ns:g} ns",
            "inputs": {"kind": "rates", "intensityWcm2": intensity, "wavelengthNm": wavelength_nm,
                       "crossSectionCm2": sigma, "lifetimeNs": lifetime_ns, "quantumYield": qy},
            "expected": expected, "tolerance": {key: 1e-8 for key in expected}}


def collection_case(na, n):
    theta = math.asin(na / n)
    # The fraction of the full sphere inside the cone: (2 pi / 4 pi) times the
    # integral of sin over [0, theta].
    fraction = simpson(math.sin, 0.0, theta, 2000) / 2
    return {"name": f"collection, NA {na:g} in n = {n:g}",
            "inputs": {"kind": "collection", "na": na, "mediumIndex": n},
            "expected": {"fraction": sig(fraction)}, "tolerance": {"fraction": 1e-9}}


def stored_value(spectrum, nm):
    u = (nm - spectrum["startNm"]) / spectrum["stepNm"]
    v = spectrum["values"]
    if u < 0 or u > len(v) - 1:
        return 0.0
    k = min(len(v) - 2, int(math.floor(u)))
    return (v[k] + (v[k + 1] - v[k]) * (u - k)) / 1000


def excitation_case(nm):
    return {"name": f"EGFP excitation curve at {nm:g} nm",
            "inputs": {"kind": "excitation", "nm": nm},
            "expected": {"relative": sig(stored_value(EGFP["excitation"], nm))}, "tolerance": {"relative": 1e-12}}


def hard_filter(spec):
    """Transmission of a hard-edged generic filter (edge width 0)."""
    tp, tb = spec["peakTransmission"], 10 ** -spec["blockingOd"]
    if spec["type"] == "longpass":
        return lambda nm: tp if nm > spec["edgeNm"] else tb
    if spec["type"] == "shortpass":
        return lambda nm: tp if nm < spec["edgeNm"] else tb
    lo, hi = spec["centerNm"] - spec["widthNm"] / 2, spec["centerNm"] + spec["widthNm"] / 2
    inside = lambda nm: lo < nm < hi
    return (lambda nm: tb if inside(nm) else tp) if spec["type"] == "notch" else (lambda nm: tp if inside(nm) else tb)


def edges(spec):
    if spec["type"] in ("longpass", "shortpass"):
        return [spec["edgeNm"]]
    return [spec["centerNm"] - spec["widthNm"] / 2, spec["centerNm"] + spec["widthNm"] / 2]


def exact_fraction(spectrum, filters, qe):
    """Exact integral of the piecewise-linear stored curve times a stack of
    hard-edged filters and a flat QE, over the whole curve, divided by the
    curve's own integral: every piece between samples and edges is a line
    times a constant, integrated by its midpoint."""
    start, step, n = spectrum["startNm"], spectrum["stepNm"], len(spectrum["values"])
    points = sorted({start + i * step for i in range(n)} | {e for f in filters for e in edges(f) if start < e < start + (n - 1) * step})
    stack = [hard_filter(f) for f in filters]
    total = passed = 0.0
    for a, b in zip(points, points[1:]):
        mid = (a + b) / 2
        area = stored_value(spectrum, mid) * (b - a)    # exact for a linear piece
        total += area
        t = 1.0
        for f in stack:
            t *= f(mid)
        passed += area * t
    return passed / total, passed * qe / total


def detection_case(name, filters, qe=None):
    transmitted, detected = exact_fraction(EGFP["emission"], filters, 1.0 if qe is None else qe)
    expected = {"transmitted": sig(transmitted), "detected": sig(detected)}
    return {"name": f"EGFP emission, {name}", "inputs": {"kind": "detection", "filters": filters, "qe": qe},
            "expected": expected, "tolerance": {key: 1e-9 for key in expected}}


def logistic_case(name, filters):
    w9 = 2 * math.log(9)

    def rise(nm, at, width):
        z = (nm - at) * w9 / width
        return 1 / (1 + math.exp(-z)) if z > -700 else 0.0

    def transmission(nm):
        t = 1.0
        for f in filters:
            tp, tb = f["peakTransmission"], 10 ** -f["blockingOd"]
            if f["type"] == "longpass":
                s = rise(nm, f["edgeNm"], f["edgeWidthNm"])
            elif f["type"] == "shortpass":
                s = 1 - rise(nm, f["edgeNm"], f["edgeWidthNm"])
            else:
                band = rise(nm, f["centerNm"] - f["widthNm"] / 2, f["edgeWidthNm"]) * (1 - rise(nm, f["centerNm"] + f["widthNm"] / 2, f["edgeWidthNm"]))
                s = 1 - band if f["type"] == "notch" else band
            t *= tb + (tp - tb) * s
        return t

    s = EGFP["emission"]
    lo, hi = s["startNm"], s["startNm"] + (len(s["values"]) - 1) * s["stepNm"]
    # Simpson on 0.002 nm, split at the 1 nm samples where the curve kinks.
    total = passed = 0.0
    for i in range(int(hi - lo)):
        a = lo + i
        total += simpson(lambda nm: stored_value(s, nm), a, a + 1, 2)
        passed += simpson(lambda nm: stored_value(s, nm) * transmission(nm), a, a + 1, 500)
    return {"name": f"EGFP emission, {name}", "inputs": {"kind": "detection", "filters": filters, "qe": None},
            "expected": {"transmitted": sig(passed / total)}, "tolerance": {"transmitted": 2e-5},
            "note": "The app integrates by the trapezoidal rule on 0.05 nm. Its error, h^2/12 times the integral of |f''|, is dominated by the logistic edges, whose |s''| integrates to ln 9 / width per edge: taking the curve at its peak at every edge, at most 7e-6 of the total for two 3 nm edges and 2e-5 for two 1 nm edges, the narrowest used here."}


def qe_case(detector, nm, sensitivity_ma_w=None, qe=None, digits=None):
    """A datasheet value at one wavelength. Radiant sensitivity converts
    exactly; the app stores QE to three decimals, so half a unit in the
    third decimal plus the conversion's own rounding (6e-4 absolute) is the
    tolerance; a QE quoted in percent to two figures allows 0.005."""
    value = sensitivity_ma_w * 1e-3 * H_PLANCK * C_M_PER_S / (E_CHARGE * nm * 1e-9) if qe is None else qe
    source = f"{sensitivity_ma_w:g} mA/W" if qe is None else f"{qe * 100:g} %"
    return {"name": f"{detector} QE at {nm:g} nm from its datasheet ({source})",
            "inputs": {"kind": "qe", "detector": detector, "nm": nm},
            "expected": {"qe": sig(value)}, "tolerance": {"qe": 6e-4 if qe is None else 0.005}, "absolute": True}


def gauss(nm, center, fwhm):
    sigma = fwhm / (2 * math.sqrt(2 * math.log(2)))
    return math.exp(-0.5 * ((nm - center) / sigma) ** 2)


def led_excitation_case(center, fwhm):
    """The stored EGFP excitation curve averaged over a Gaussian band's
    photons (power per nm times lambda), by Simpson on 0.005 nm over
    +/-6 FWHM."""
    lo, hi = center - 6 * fwhm, center + 6 * fwhm
    n = int(round((hi - lo) / 0.005))
    num = simpson(lambda nm: gauss(nm, center, fwhm) * nm * stored_value(EGFP["excitation"], nm), lo, hi, n)
    den = simpson(lambda nm: gauss(nm, center, fwhm) * nm, lo, hi, n)
    return {"name": f"EGFP excitation averaged over a {center:g} nm band, {fwhm:g} nm FWHM",
            "inputs": {"kind": "sourceExcitation", "source": {"kind": "led", "centerNm": center, "bandwidthNm": fwhm}},
            "expected": {"relative": sig(num / den)}, "tolerance": {"relative": 1e-4},
            "note": "The app integrates by the trapezoidal rule on 0.05 nm, across the stored curve's 1 nm kinks, which its grid does not hit: an error of order h^2 times the slope changes, below 1e-5 here."}


def band_integral(a, b, center, sigma):
    """Integral of lambda * exp(-(lambda - c)^2 / (2 sigma^2)) over [a, b], in closed form."""
    g = lambda x: math.exp(-0.5 * ((x - center) / sigma) ** 2) if math.isfinite(x) else 0.0
    z = lambda x: (x - center) / (sigma * math.sqrt(2))

    def erf_diff(lo, hi):
        # erf(hi) - erf(lo) without cancellation in a tail, where both are
        # near +-1: as a difference of erfc on the side the interval lies on.
        zl, zh = z(lo), z(hi)
        if zl >= 0:
            return math.erfc(zl) - math.erfc(zh)
        if zh <= 0:
            return math.erfc(-zh) - math.erfc(-zl)
        return math.erf(zh) - math.erf(zl)

    return sigma ** 2 * (g(a) - g(b)) + center * sigma * math.sqrt(math.pi / 2) * erf_diff(a, b)


def leak_case(name, source, filters):
    """The fraction of a Gaussian band's photons a stack of hard-edged
    filters passes: piecewise constant transmission times the closed-form
    integral of lambda times the Gaussian over each piece."""
    center = source["centerNm"]
    fwhm = source["bandwidthNm"] if source["kind"] == "led" else 0.441 * center ** 2 / (C_M_PER_S * 1e-6 * source["pulseFs"])
    sigma = fwhm / (2 * math.sqrt(2 * math.log(2)))
    cuts = sorted({e for f in filters for e in edges(f)})
    bounds = [-math.inf, *cuts, math.inf]
    stack = [hard_filter(f) for f in filters]
    passed = 0.0
    for a, b in zip(bounds, bounds[1:]):
        mid = (a + b) / 2 if math.isfinite(a) and math.isfinite(b) else (b - 1 if math.isfinite(b) else a + 1)
        t = 1.0
        for f in stack:
            t *= f(mid)
        passed += t * band_integral(a, b, center, sigma)
    total = center * sigma * math.sqrt(2 * math.pi)
    return {"name": f"source leakage, {name}", "inputs": {"kind": "sourceLeak", "source": source, "filters": filters},
            "expected": {"transmission": sig(passed / total)}, "tolerance": {"transmission": 1e-4},
            "note": "The app splits its trapezoid at the hard edges; the error left, h^2/12 times the jump in slope there, is below 4e-5 of the total for a 3.5 nm band and far less for wider ones."}


def pulse_train_case(fluence_photons, sigma, rep_mhz, pulse_fs, lifetime_ns, qy):
    """A two-level molecule under Gaussian pulses: RK4 through each pulse
    (+/-4 FWHM, 4000 steps, decay included), exact decay until the next
    one, repeated until the state after a pulse stops changing."""
    tau, period, tp = lifetime_ns * 1e-9, 1e-6 / rep_mhz, pulse_fs * 1e-15
    peak = fluence_photons * 2 * math.sqrt(math.log(2) / math.pi) / tp     # photons cm^-2 s^-1 at the pulse peak
    k = lambda t: sigma * peak * math.exp(-4 * math.log(2) * t * t / (tp * tp))
    f = lambda t, y: k(t) * (1 - y) - y / tau
    steps, span = 4000, 8 * tp
    h = span / steps
    before = 0.0
    for _ in range(2000):
        y, t, emitted = before, -span / 2, 0.0
        for _ in range(steps):
            a = f(t, y); b = f(t + h / 2, y + h * a / 2); c = f(t + h / 2, y + h * b / 2); d = f(t + h, y + h * c)
            y_next = y + h * (a + 2 * b + 2 * c + d) / 6
            emitted += h * (y + y_next) / 2 / tau
            y, t = y_next, t + h
        after = y
        rest = period - span
        emitted += after * (1 - math.exp(-rest / tau))
        next_before = after * math.exp(-rest / tau)
        if abs(next_before - before) < 1e-16:
            break
        before = next_before
    # The state is read 4 FWHM after the pulse peak; the app's "after the
    # pulse" is at the pulse itself, so the decay since the peak is undone.
    expected = {"excitedAfterPulse": sig(after * math.exp(span / 2 / tau)), "emissionRate": sig(rep_mhz * 1e6 * qy * emitted)}
    return {"name": f"pulse train, sigma F = {sigma * fluence_photons:g}, {rep_mhz:g} MHz, {pulse_fs:g} fs, tau {lifetime_ns:g} ns",
            "inputs": {"kind": "pulsed", "fluence": fluence_photons, "crossSectionCm2": sigma, "repRateMHz": rep_mhz,
                       "pulseFs": pulse_fs, "lifetimeNs": lifetime_ns, "quantumYield": qy},
            "expected": expected, "tolerance": {key: 1e-4 for key in expected},
            "note": "The app's per-pulse model neglects decay during the pulse, a relative error of order pulse/lifetime (at most 4e-5 in these cases); the integration itself converges to 1e-9."}


def focus_factor_case(center, pulse_fs):
    """How much more a transform-limited pulse excites EGFP at the centre of
    an Airy focus, where each wavelength's peak goes as P(lambda)/lambda^2,
    than its photon-averaged cross-section at the central wavelength gives;
    Simpson on 0.005 nm over +/-6 FWHM."""
    fwhm = 0.441 * center ** 2 / (C_M_PER_S * 1e-6 * pulse_fs)
    lo, hi = max(1.0, center - 6 * fwhm), center + 6 * fwhm
    n = int(round((hi - lo) / 0.005))
    w = lambda nm: gauss(nm, center, fwhm) * stored_value(EGFP["excitation"], nm)
    centre = simpson(lambda nm: w(nm) / nm, lo, hi, n)
    average = simpson(lambda nm: w(nm) * nm, lo, hi, n)
    return {"name": f"focus spectral factor, EGFP, {center:g} nm {pulse_fs:g} fs pulse",
            "inputs": {"kind": "focusFactor", "source": {"kind": "pulsed", "centerNm": center, "pulseFs": pulse_fs}},
            "expected": {"factor": sig(center ** 2 * centre / average)}, "tolerance": {"factor": 1e-4},
            "note": "As for the band averages: the app's 0.05 nm trapezoid across the curve's 1 nm kinks."}


def notch_case(edge, peak, od):
    """The width at which a logistic notch's centre reaches OD - 0.1, by
    bisection on the notch written from its definition."""
    w9, tb = 2 * math.log(9), 10 ** -od

    def centre_od(width):
        s = 1 / (1 + math.exp(-(width / 2) * w9 / edge))
        band = s * s
        return -math.log10(tb + (peak - tb) * (1 - band))

    lo, hi = 0.0, 100 * edge
    for _ in range(200):
        mid = (lo + hi) / 2
        if centre_od(mid) < od - 0.1:
            lo = mid
        else:
            hi = mid
    return {"name": f"narrowest notch, {edge:g} nm edges, T {peak:g}, OD {od:g}",
            "inputs": {"kind": "notch", "edgeWidthNm": edge, "peakTransmission": peak, "blockingOd": od},
            "expected": {"widthNm": sig((lo + hi) / 2)}, "tolerance": {"widthNm": 1e-9}}


def cases():
    egfp_sigma = cross_section_case(55900)["expected"]["crossSectionCm2"]
    bandpass = {"type": "bandpass", "centerNm": 525, "widthNm": 50, "edgeWidthNm": 0, "peakTransmission": 0.95, "blockingOd": 6}
    dichroic = {"type": "longpass", "edgeNm": 495, "edgeWidthNm": 0, "peakTransmission": 0.93, "blockingOd": 1.5}
    notch = {"type": "notch", "centerNm": 532, "widthNm": 17, "edgeWidthNm": 0, "peakTransmission": 0.98, "blockingOd": 6}
    shortpass = {"type": "shortpass", "edgeNm": 540.5, "edgeWidthNm": 0, "peakTransmission": 0.9, "blockingOd": 4}
    soft = lambda spec, width: {**spec, "edgeWidthNm": width}
    return [
        cross_section_case(55900), cross_section_case(1000), cross_section_case(250000),
        focus_case(1e-4, 488, 1.2), focus_case(2e-3, 640, 0.5), focus_case(5e-6, 405, 1.45),
        widefield_case(0.01, 200), widefield_case(1, 5000),
        rates_case(1.9e5, 488, egfp_sigma, 2.6, 0.6), rates_case(50, 561, 3.8e-16, 3.9, 0.7),
        rates_case(4e6, 640, 1e-16, 1.0, 0.3),
        collection_case(1.2, 1.33), collection_case(0.5, 1.0), collection_case(1.4, 1.518), collection_case(0.95, 1.0),
        excitation_case(488), excitation_case(488.5), excitation_case(405.25), excitation_case(250), excitation_case(700),
        detection_case("no filters", []),
        detection_case("hard 525/50 bandpass", [bandpass]),
        detection_case("hard 525/50 bandpass after a 495 nm dichroic, 40 % flat QE", [dichroic, bandpass], 0.4),
        detection_case("hard notch at 532/17", [notch]),
        detection_case("hard shortpass at 540.5 nm between sample points", [shortpass]),
        logistic_case("525/50 bandpass with 3 nm edges", [soft(bandpass, 3)]),
        logistic_case("495 nm longpass with 1 nm edges and a 525/50 bandpass with 5 nm edges", [soft(dichroic, 1), soft(bandpass, 5)]),
        qe_case("bialkali", 400, 110), qe_case("gaasp", 420, 108), qe_case("gaasp", 550, 176),
        qe_case("gaas", 420, 15), qe_case("gaas", 550, 50), qe_case("gaas", 800, 90),
        qe_case("scmos", 550, qe=0.95),
        led_excitation_case(470, 25), led_excitation_case(405, 15), led_excitation_case(530, 60),
        leak_case("470 nm LED, 25 nm, into a dichroic and a 525/50 bandpass", {"kind": "led", "centerNm": 470, "bandwidthNm": 25}, [dichroic, bandpass]),
        leak_case("505 nm LED, 30 nm, into a 525/50 bandpass", {"kind": "led", "centerNm": 505, "bandwidthNm": 30}, [bandpass]),
        leak_case("488 nm 100 fs pulses into a dichroic and a 525/50 bandpass", {"kind": "pulsed", "centerNm": 488, "pulseFs": 100}, [dichroic, bandpass]),
        pulse_train_case(1e14, 2e-16, 80, 100, 2.6, 0.6), pulse_train_case(5e15, 2.13e-16, 80, 100, 2.6, 0.6),
        pulse_train_case(2e15, 2e-16, 1000, 100, 4.0, 1.0),
        notch_case(3, 0.95, 6), notch_case(1, 0.9, 4), notch_case(5, 0.98, 2),
        focus_factor_case(560, 5), focus_factor_case(488, 20), focus_factor_case(488, 100),
    ]


MODEL = {
    "id": "fluorescence",
    "title": "One-photon fluorescence: excitation, detection and saturation",
    "app": "sketch/js/fluorescence.js: absorptionCrossSectionCm2, focusPeakIntensityWcm2, widefieldIntensityWcm2, moleculeRates, pulsedMoleculeRates, collectionFraction, spectrumValue, detectionFractions, detectorQe, sourceAverage, sourceTransmission, notchMinimumWidthNm (used by calculators/fluorescence/)",
    "reference": "Beer-Lambert slab for sigma; Airy-pattern power by Bessel quadrature; RK4 two-level steady state with bisection for saturation, and RK4 through trains of finite Gaussian pulses; solid-angle quadrature; exact piecewise integration of the stored spectrum through hard filters and Simpson quadrature through logistic edges; band averages by Simpson quadrature and by the closed-form Gaussian integral; notch width by bisection; datasheet sensitivities converted to QE",
    "citations": [
        "J. R. Lakowicz, Principles of Fluorescence Spectroscopy, 3rd ed., Springer (2006), ISBN 978-0-387-31278-1: chapters 1-2 (extinction, quantum yield, lifetime)",
        "M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 8.5.2 (Airy pattern; 83.8 % inside the first dark ring)",
        "NIST DLMF, chapter 10 (Bessel functions: power series 10.2.2, Hankel expansion 10.17.3)",
        "Hamamatsu Photonics, H10720/H10721 series datasheet TPMO1062E (super bialkali, 110 mA/W at 400 nm)",
        "Hamamatsu Photonics, H7422 series datasheet (GaAsP -40: 108 and 176 mA/W at 420 and 550 nm; GaAs -50: 15, 50 and 90 mA/W at 420, 550 and 800 nm)",
        "Hamamatsu Photonics, ORCA-Fusion BT (C15440-20UP) catalogue SCAS0143J (95 % QE at 550 nm)",
        "T. J. Lambert, Nat. Methods 16, 277-278 (2019), doi:10.1038/s41592-019-0352-8 (FPbase; the EGFP curves used as data)",
    ],
    "provenance": "Cross-section and photon flux written from the Beer-Lambert law and E = hc/lambda with the exact SI constants; the focus from Born and Wolf's Airy pattern, whose first-ring fraction the quadrature reproduces to three figures; the steady state from the two-level rate equation in Lakowicz; detector values from the tables of the datasheets named.",
    "domain": "Cross-sections for epsilon from 1e3 to 2.5e5 M^-1 cm^-1; foci at NA 0.5-1.45 and 405-640 nm; widefield fields of 0.2 and 5 mm; steady states from kt = 0.01 to 50; pulse trains from sigma F = 0.02 to 1.1, at 80 MHz and 1 GHz; LED bands of 15-60 nm and a 100 fs pulse, averaged and leaking through hard filters; notch widths for OD 2-6; collection at NA 0.5-1.4 in air, water and oil; the EGFP excitation curve on, between and outside its samples; EGFP emission through no filters, a bandpass, a dichroic plus bandpass with flat QE, a notch and an edge between samples, hard and with 1-5 nm logistic edges; seven datasheet QE values.",
    "convergence": "Airy power: Simpson on 80000 intervals to v = 400 plus the averaged tail 4/(pi v); RK4 with 6000 steps over 60 relaxation times and a 200-step bisection; 4000 RK4 steps through each pulse, iterated until the post-pulse state changes by under 1e-16; Simpson on 2000 intervals for the solid angle and on 0.002 nm for logistic edges; hard edges exactly.",
    "tolerance_rationale": "1e-9 relative for algebra and exact integrals, 1e-8 for the integrated steady state, 1e-5 for the focus (its quadrature tail), 2e-5 for logistic edges and 1e-4 for band averages (the app's trapezoid error bounds, stated in the cases), 1e-4 for pulse trains (the per-pulse model's neglect of decay during the pulse, of order pulse/lifetime); datasheet values at 6e-4 absolute (three stored decimals) or 0.005 for a two-figure percentage.",
    "outside_scope": "The calculator declines wavelengths outside 250-1000 nm, a blocking level not below the peak transmission, an NA above the sample index, and missing extinction coefficients or quantum yields; a spectrum is zero outside its measured range.",
    "fidelity": "computed",
    "scope": "One-photon excitation by a CW line, a Gaussian LED band or transform-limited Gaussian pulses much shorter than the lifetime; stored curves linear between 1 nm samples; generic filters with logistic edges; two-level steady state; scalar paraxial Airy focus; isotropic emitter. Not the fluorophore data themselves, which are FPbase's.",
}
