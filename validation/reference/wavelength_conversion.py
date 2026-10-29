# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Nonlinear frequency conversion and coherent Raman scattering, in SI.

Energy conservation is computed in Hz and metres and converted back to nm,
THz, cm^-1 and eV; this reference does not import the JavaScript. Exact
rational cases anchor the factors of 2, 3 and 10^7 separately.

The coherent-Raman resolution formula (Mohseni, Polzer and Hellerer, Opt.
Express 26, 10230 (2018), Eq. (5)) is checked from its definition instead of
being re-typed: the driving term F(t) = E_p(t) E_S*(t) of two Gaussian
pulses (intensity FWHM tau, so the field goes as exp(-2 ln2 t^2/tau^2)) is
Fourier transformed by direct quadrature, and the FWHM of |F(Omega)| is
found by bisection. Both pulses may carry the same linear chirp, which must
cancel. The trapezoid rule is spectrally accurate for these smooth,
rapidly decaying integrands, so 1e-9 relative is round-off only.

The conversion page's bandwidths are checked the same way, without the
quadrature-sum rule: each input is a Gaussian pulse whose intensity
spectrum, drawn against wavelength, has the entered FWHM in nm (both
half-maximum wavelengths found by bisection on the curve, with no nm-to-THz
formula), with or without a linear chirp; the generated field is the
product the process forms (E^2, E^3, E1 E2, E1 E2*, Ep Eout* for the OPO
partner, Ep^2 ES* for CARS or ES^2 Ep* for CSRS), the FWHM of its
intensity spectrum |F(Omega)|^2 is found by quadrature and bisection, and
read back to nm on its curve against wavelength the same way.
"""
import cmath
import math
from fractions import Fraction

from common import C_M_PER_S, sig

C_CM_PER_S = C_M_PER_S * 100
H_PLANCK = 6.62607015e-34       # J s, exact (SI 2019)
E_CHARGE = 1.602176634e-19      # C, exact (SI 2019)


def hz(nm):
    return C_M_PER_S / (nm * 1e-9)


def wave(role, frequency):
    return {"Nm": sig(C_M_PER_S / frequency * 1e9), "THz": sig(frequency / 1e12),
            "Ev": sig(H_PLANCK * frequency / E_CHARGE)}


def conversion_case(name, inputs, waves, extra=None):
    expected = {}
    for i, (role, frequency) in enumerate(waves):
        for key, value in wave(role, frequency).items():
            expected[f"wave{i}{key}"] = value
    expected.update(extra or {})
    return {"name": name, "inputs": {"kind": "conversion", **inputs}, "expected": expected,
            "tolerance": {k: 1e-9 for k in expected}}


def crs_case(name, inputs, pump, stokes):
    """Two-color CRS, pump and Stokes in Hz: the pump scatters into CARS,
    the Stokes beam into CSRS."""
    vib = pump - stokes
    cars = pump + vib
    csrs = stokes - vib
    expected = {"pumpNm": sig(C_M_PER_S / pump * 1e9), "stokesNm": sig(C_M_PER_S / stokes * 1e9),
                "ramanShiftCm": sig(vib / C_CM_PER_S), "ramanTHz": sig(vib / 1e12),
                "antiStokesNm": sig(C_M_PER_S / cars * 1e9)}
    if csrs > 0:
        expected["csrsNm"] = sig(C_M_PER_S / csrs * 1e9)
    return {"name": name, "inputs": {"kind": "crs", **inputs}, "expected": expected,
            "tolerance": {k: 1e-9 for k in expected}}


def excitation_amplitude_fwhm_cm(tau_p_ps, tau_s_ps, chirp_per_ps2=0.0):
    """FWHM of |FT[E_p E_S*]| in cm^-1, by quadrature and bisection."""
    a = 2 * math.log(2)
    width = 1 / math.sqrt(1 / tau_p_ps ** 2 + 1 / tau_s_ps ** 2)   # ps, sets the grid
    n, span = 4001, 14 * width
    dt = 2 * span / (n - 1)
    ts = [-span + i * dt for i in range(n)]
    # Same chirp on both fields: their product's phase cancels numerically.
    field = [cmath.exp(-a * t * t / tau_p_ps ** 2 + 1j * chirp_per_ps2 * t * t)
             * (cmath.exp(-a * t * t / tau_s_ps ** 2 + 1j * chirp_per_ps2 * t * t)).conjugate() for t in ts]

    def amplitude(omega):  # omega in rad/ps; trapezoid, math.fsum for version-stable sums
        terms = [f * cmath.exp(1j * omega * t) for f, t in zip(field, ts)]
        return abs(complex(math.fsum(z.real for z in terms), math.fsum(z.imag for z in terms))) * dt

    peak = amplitude(0.0)
    lo, hi = 0.0, 1.0
    while amplitude(hi) > peak / 2:
        hi *= 2
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if amplitude(mid) > peak / 2 else (lo, mid)
    omega_fwhm = 2 * (lo + hi) / 2 * 1e12                 # rad/s
    return omega_fwhm / (2 * math.pi * C_CM_PER_S)


def pulse_exponent(width_thz, chirp_ratio=0.0):
    """Complex exponent G of exp(-G t^2), t in ps, for a Gaussian pulse whose
    intensity spectrum has FWHM width_thz; chirp_ratio = Im/Re of G. The
    spectrum goes as exp(-omega^2 Re(1/G) / 2), so its FWHM in THz is
    sqrt(2 ln2 / Re(1/G)) / pi."""
    re_inverse = 2 * math.log(2) / (math.pi * width_thz) ** 2
    a = 1 / (re_inverse * (1 + chirp_ratio ** 2))
    return complex(a, -chirp_ratio * a)


def generated_width_thz(factors):
    """Intensity-spectrum FWHM (THz) of prod exp(-G t^2) over `factors`
    (complex G; a conjugated field enters as G.conjugate())."""
    total = sum(factors)
    scale = 1 / math.sqrt(total.real)                     # ps, sets the grid
    n, span = 4001, 14 * scale
    dt = 2 * span / (n - 1)
    ts = [-span + i * dt for i in range(n)]
    field = [cmath.exp(-total * t * t) for t in ts]

    def power(omega):
        terms = [f * cmath.exp(1j * omega * t) for f, t in zip(field, ts)]
        return abs(complex(math.fsum(z.real for z in terms), math.fsum(z.imag for z in terms))) ** 2

    peak = power(0.0)
    lo, hi = 0.0, 1.0 / scale
    while power(hi) > peak / 2:
        hi *= 2
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if power(mid) > peak / 2 else (lo, mid)
    return 2 * (lo + hi) / 2 / (2 * math.pi)            # rad/ps -> THz


def drawn_fwhm_nm(nm, thz):
    """FWHM against wavelength of a Gaussian in frequency (FWHM thz) centred
    at nm, as the page draws it: each half-maximum wavelength is found by
    bisection on the curve itself."""
    if thz == 0:
        return 0.0
    c_nm_thz = C_M_PER_S * 1e9 / 1e12
    centre = c_nm_thz / nm

    def above_half(lam):
        return math.exp(-4 * math.log(2) * ((c_nm_thz / lam - centre) / thz) ** 2) > 0.5

    def edge(inside, outside):
        for _ in range(200):
            mid = (inside + outside) / 2
            inside, outside = (mid, outside) if above_half(mid) else (inside, mid)
        return (inside + outside) / 2

    return edge(nm, 100 * nm) - edge(nm, nm / 100)


def width_thz(nm, bandwidth_nm):
    """The frequency FWHM whose drawn curve is bandwidth_nm wide at nm,
    by bisection on drawn_fwhm_nm (increasing in the width)."""
    if bandwidth_nm == 0:
        return 0.0
    lo, hi = 0.0, 2 * C_M_PER_S * 1e9 / 1e12 / nm      # the curve keeps nu > 0 below 2 nu
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if drawn_fwhm_nm(nm, mid) < bandwidth_nm else (lo, mid)
    return (lo + hi) / 2


def bandwidth_case(name, inputs, waves):
    """waves: (wavelength nm, frequency FWHM THz) in the page's order."""
    expected = {}
    for i, (nm, thz) in enumerate(waves):
        expected[f"wave{i}BwTHz"] = sig(thz)
        expected[f"wave{i}BwNm"] = sig(drawn_fwhm_nm(nm, thz))
    return {"name": name, "inputs": {"kind": "conversion", **inputs}, "expected": expected,
            "tolerance": {k: 1e-9 for k in expected}}


def cases():
    out = []
    for order, process in ((2, "shg"), (3, "thg")):
        for known, nm in (("fundamental", 1064), ("harmonic", 532), ("fundamental", 1030.25),
                          ("harmonic", 100), ("fundamental", 20000)):
            given = hz(nm)
            fundamental = given if known == "fundamental" else given / order
            out.append(conversion_case(f"{process.upper()} {known} {nm} nm",
                                       {"process": process, "known": known, "harmonicInputNm": nm},
                                       [("fundamental", fundamental), ("harmonic", order * fundamental)]))
    for process, a, b in (("sfg", 800, 1040), ("sfg", 1030, 1030), ("sfg", 1550.5, 3100.25),
                          ("dfg", 800, 1040), ("dfg", 1040, 800), ("dfg", 1064, 1064.5), ("dfg", 100, 20000), ("dfg", 1030, 1030.001)):
        # Exact rational difference, as for the OPO partner below.
        total = hz(a) + hz(b) if process == "sfg" else float(abs(Fraction(C_M_PER_S) * 10 ** 9 * (1 / Fraction(a) - 1 / Fraction(b))))
        out.append(conversion_case(f"{process.upper()} {a} and {b} nm",
                                   {"process": process, "wave1Nm": a, "wave2Nm": b},
                                   [("1", hz(a)), ("2", hz(b)), ("out", total)]))
    for pump, known in ((1030, 1550), (1030, 4000), (532, 800), (1030, 2060), (800, 19999.5), (1030, 1030.001)):
        # Exact rational difference: near the pump the float subtraction
        # would cancel most digits of the partner frequency.
        partner = float(Fraction(C_M_PER_S) * 10 ** 9 * (1 / Fraction(pump) - 1 / Fraction(known)))
        signal, idler = max(hz(known), partner), min(hz(known), partner)
        out.append(conversion_case(f"OPO pump {pump} nm, known output {known} nm",
                                   {"process": "opo", "pumpNm": pump, "outputNm": known},
                                   [("pump", hz(pump)), ("signal", signal), ("idler", idler)],
                                   {"signalShare": sig(signal / hz(pump)), "idlerShare": sig(idler / hz(pump)),
                                    "degeneracyNm": sig(2 * pump)}))
    # Two-color CARS and CSRS on the conversion page: the pump scatters to
    # 2 nu_p - nu_S, the Stokes beam to 2 nu_S - nu_p while that is positive.
    for pump, stokes in ((1030, 1458), (800, 1040), (1064.5, 1180.25), (600, 1300)):
        p, s = hz(pump), hz(stokes)
        waves = [("pump", p), ("stokes", s), ("cars", 2 * p - s)] + ([("csrs", 2 * s - p)] if 2 * s > p else [])
        out.append(conversion_case(f"CRS pump {pump} nm, Stokes {stokes} nm",
                                   {"process": "crs", "ramanPumpNm": pump, "stokesNm": stokes}, waves,
                                   {"ramanShiftCm": sig((p - s) / C_CM_PER_S)}))
    out.append({"name": "THG exact anchor: 1064 nm gives 1064/3 nm",
                "inputs": {"kind": "conversion", "process": "thg", "known": "fundamental", "harmonicInputNm": 1064},
                "expected": {"wave1Nm": 1064 / 3}, "tolerance": {"wave1Nm": 1e-12}})
    out.append({"name": "OPO exact anchor: 1030 pump, 1550 signal",
                "inputs": {"kind": "conversion", "process": "opo", "pumpNm": 1030, "outputNm": 1550},
                "expected": {"wave2Nm": 1030 * 1550 / 520}, "tolerance": {"wave2Nm": 1e-12}})

    # Bandwidths from the generated field's spectrum. A linear chirp must not
    # change the harmonic's width; SFG and DFG are checked with
    # transform-limited inputs, the case the page states.
    for process, order in (("shg", 2), ("thg", 3)):
        for nm, bw, chirp in ((1064, 1, 0.0), (800, 30, 2.5), (1030.25, 7.5, -0.7), (1064, 500, 0.0)):
            g = pulse_exponent(width_thz(nm, bw), chirp)
            out.append(bandwidth_case(f"{process.upper()} bandwidth, {bw} nm at {nm} nm" + (f", chirp ratio {chirp}" if chirp else ""),
                                      {"process": process, "known": "fundamental", "harmonicInputNm": nm, "harmonicBandwidthNm": bw},
                                      [(nm, width_thz(nm, bw)), (nm / order, generated_width_thz([g] * order))]))
        # From the harmonic: the fundamental is the width whose harmonic matches,
        # scaled through the numerical ratio for a unit fundamental.
        nm_h, bw_h = 1064 / order, 0.5
        ratio = generated_width_thz([pulse_exponent(1.0)] * order)
        out.append(bandwidth_case(f"{process.upper()} bandwidth from a {bw_h} nm harmonic at {nm_h:.6g} nm",
                                  {"process": process, "known": "harmonic", "harmonicInputNm": nm_h, "harmonicBandwidthNm": bw_h},
                                  [(1064, width_thz(nm_h, bw_h) / ratio), (nm_h, width_thz(nm_h, bw_h))]))
    for process, a, b, bw_a, bw_b in (("sfg", 800, 1040, 10, 10), ("sfg", 1550, 1030, 40, 0), ("sfg", 800, 1040, 400, 10),
                                      ("dfg", 800, 1040, 10, 10), ("dfg", 1040, 1550.5, 5, 25)):
        ga, gb = pulse_exponent(width_thz(a, bw_a)) if bw_a else 0j, pulse_exponent(width_thz(b, bw_b)) if bw_b else 0j
        out_hz = hz(a) + hz(b) if process == "sfg" else abs(hz(a) - hz(b))
        out_width = generated_width_thz([ga, gb if process == "sfg" else gb.conjugate()])
        out.append(bandwidth_case(f"{process.upper()} bandwidth, {bw_a} nm at {a} nm and {bw_b} nm at {b} nm",
                                  {"process": process, "wave1Nm": a, "wave2Nm": b, "bandwidth1Nm": bw_a, "bandwidth2Nm": bw_b},
                                  [(a, width_thz(a, bw_a)), (b, width_thz(b, bw_b)), (C_M_PER_S / out_hz * 1e9, out_width)]))
    # OPO: the entered output keeps its width; the partner is E_p E_out*.
    for pump, known, bw_p, bw_k in ((1030, 1550, 1, 10), (1030, 4000, 2, 30), (515, 800, 0, 25)):
        gp = pulse_exponent(width_thz(pump, bw_p)) if bw_p else 0j
        gk = pulse_exponent(width_thz(known, bw_k)) if bw_k else 0j
        partner_nm = C_M_PER_S / (hz(pump) - hz(known)) * 1e9
        partner_width = generated_width_thz([gp, gk.conjugate()])
        outputs = sorted([(known, width_thz(known, bw_k)), (partner_nm, partner_width)])   # signal first
        out.append(bandwidth_case(f"OPO bandwidth, pump {bw_p} nm at {pump} nm, output {bw_k} nm at {known} nm",
                                  {"process": "opo", "pumpNm": pump, "outputNm": known, "pumpBandwidthNm": bw_p, "outputBandwidthNm": bw_k},
                                  [(pump, width_thz(pump, bw_p)), *outputs]))
    # CARS is E_p^2 E_S*, CSRS E_S^2 E_p*, for transform-limited pulses.
    for pump, stokes, bw_p, bw_s in ((1030, 1458, 1, 1), (800, 1040, 2, 5), (600, 1300, 1, 3)):
        gp, gs = pulse_exponent(width_thz(pump, bw_p)), pulse_exponent(width_thz(stokes, bw_s))
        p_hz, s_hz = hz(pump), hz(stokes)
        waves = [(pump, width_thz(pump, bw_p)), (stokes, width_thz(stokes, bw_s)),
                 (C_M_PER_S / (2 * p_hz - s_hz) * 1e9, generated_width_thz([gp, gp, gs.conjugate()]))]
        if 2 * s_hz > p_hz:
            waves.append((C_M_PER_S / (2 * s_hz - p_hz) * 1e9, generated_width_thz([gs, gs, gp.conjugate()])))
        out.append(bandwidth_case(f"CRS bandwidth, pump {bw_p} nm at {pump} nm, Stokes {bw_s} nm at {stokes} nm",
                                  {"process": "crs", "ramanPumpNm": pump, "stokesNm": stokes, "ramanPumpBandwidthNm": bw_p, "stokesBandwidthNm": bw_s},
                                  waves))

    pump, stokes = hz(800), hz(1040)
    out.append(crs_case("CRS pump/Stokes 800/1040 nm", {"mode": "pump-stokes", "pumpNm": 800, "stokesNm": 1040}, pump, stokes))
    for pump_nm, shift in ((800, 2850), (1064, 1003), (1030.25, 1600.5), (19900, 0.1)):
        p = hz(pump_nm)
        out.append(crs_case(f"CRS pump {pump_nm} nm and shift {shift} cm-1",
                            {"mode": "pump-shift", "pumpNm": pump_nm, "ramanShiftCm": shift}, p, p - shift * C_CM_PER_S))
    for stokes_nm, shift in ((1040, 2850), (1064, 2845), (1200.75, 999.5), (20000, 9999.5)):
        s = hz(stokes_nm)
        out.append(crs_case(f"CRS Stokes {stokes_nm} nm and shift {shift} cm-1",
                            {"mode": "stokes-shift", "stokesNm": stokes_nm, "ramanShiftCm": shift}, s + shift * C_CM_PER_S, s))
    out.append(crs_case("CRS without CSRS: shift above the Stokes frequency",
                        {"mode": "pump-stokes", "pumpNm": 600, "stokesNm": 1300}, hz(600), hz(1300)))
    out.append({"name": "CARS and CSRS exact anchors: 800/1000 nm",
                "inputs": {"kind": "crs", "mode": "pump-stokes", "pumpNm": 800, "stokesNm": 1000},
                "expected": {"ramanShiftCm": 2500, "antiStokesNm": 2000 / 3, "csrsNm": 4000 / 3},
                "tolerance": {"ramanShiftCm": 1e-12, "antiStokesNm": 1e-12, "csrsNm": 1e-12}})

    for tau_p, tau_s, chirp in ((2, 2, 0.0), (1, 3, 0.0), (0.1, 0.1, 0.0), (5, 1.2, 0.8), (2, 2, 3.0)):
        out.append({"name": f"resolution, {tau_p} ps pump and {tau_s} ps Stokes" + (f", equal chirp {chirp} rad/ps^2" if chirp else ""),
                    "inputs": {"kind": "resolution", "pumpPs": tau_p, "stokesPs": tau_s},
                    "expected": {"resolutionCm": sig(excitation_amplitude_fwhm_cm(tau_p, tau_s, chirp))},
                    "tolerance": {"resolutionCm": 1e-9}})
    out.append({"name": "resolution prefactor anchor: 20.8 ps cm^-1 (paper, 3 figures)",
                "inputs": {"kind": "resolution", "pumpPs": 1, "stokesPs": 10000},
                "expected": {"resolutionCm": 20.8}, "tolerance": {"resolutionCm": 0.0025},
                "note": "The published prefactor is quoted to three figures; half a unit in the last place is 0.24 %."})
    return out


MODEL = {
    "id": "wavelength-conversion",
    "title": "Nonlinear frequency conversion and coherent Raman scattering",
    "app": "calculators/nonlinear-conversion/conversion-calculator.js: computeConversion (SFG through sketch/js/parametric.js: mixWavelength); calculators/coherent-raman/crs-calculator.js: computeCrs, computeResolution",
    "reference": "SI frequency arithmetic with exact rational anchors; resolution from a quadrature Fourier transform of the pump-Stokes driving term; conversion bandwidths from a quadrature Fourier transform of the generated field",
    "citations": [
        "R. W. Boyd, Nonlinear Optics, 4th ed., Academic Press (2020), chapters 1-2 (energy conservation, Manley-Rowe)",
        "J.-X. Cheng and X. S. Xie, J. Phys. Chem. B 108, 827-840 (2004), doi:10.1021/jp035693v (CARS)",
        "S. Heuke and H. Rigneault, Nat. Commun. 14, 3337 (2023), doi:10.1038/s41467-023-38941-4 (CSRS at 2 omega_S - omega_p)",
        "M. Mohseni, C. Polzer and T. Hellerer, Opt. Express 26, 10230-10241 (2018), doi:10.1364/OE.26.010230, Eq. (5) (resolution)",
    ],
    "provenance": "Energy conservation written from Boyd; CARS and CSRS frequencies from Cheng and Xie and Heuke and Rigneault; the conversion bandwidths are recomputed from their definition, the spectrum of the product field of Gaussian input pulses; the resolution check recomputes the excitation-amplitude width that Eq. (5) of Mohseni et al. expresses in closed form, and the paper's 20.8 ps cm^-1 prefactor anchors it.",
    "domain": "SHG and THG both directions; SFG; DFG in both input orders and near degeneracy; OPO from signal, idler and the degenerate point; two-color CARS and CSRS on the conversion page, with and without a CSRS solution; coherent Raman (two-color) in all three input modes, with and without a CSRS solution; resolution for equal, unequal, short and equally chirped pulses; SHG and THG bandwidths from the fundamental (with and without linear chirp, narrow and 500 nm wide) and from the harmonic; SFG and DFG bandwidths of transform-limited inputs, including one zero-width input and one input 400 nm wide; OPO partner bandwidths with the entered output as signal or idler and a zero-width pump; CARS and CSRS bandwidths of transform-limited pulses, with and without a CSRS solution; nm widths measured on each spectrum drawn against wavelength.",
    "convergence": "Closed-form arithmetic; the resolution and bandwidth quadratures use 4001 points over +/-14 effective widths and an 80-step bisection; the nm widths use 200-step bisections on the curve against wavelength.",
    "tolerance_rationale": "1e-9 relative for floating-point identities and for the spectrally accurate quadrature; exact rational anchors at 1e-12; the published three-figure prefactor at half a unit in its last place (0.25 %).",
    "outside_scope": "Declines non-finite or out-of-range inputs, input bandwidths above half their wavelength, equal DFG inputs, an OPO output not longer than the pump, reversed or equal pump and Stokes, non-positive shifts and inferred pump or Stokes wavelengths outside 100-20000 nm; CSRS alone is omitted when the Raman frequency is not below the probing frequency.",
    "fidelity": "computed",
    "scope": "Vacuum wavelengths and energy conservation; Gaussian spectra for the bandwidths (whole spectrum phase-matched; SFG, DFG, OPO partner, CARS and CSRS transform-limited, with an instantaneous Raman response) and Gaussian, transform-limited or equally chirped pulses for the resolution; no phase matching, yield, resonance spectrum or chirp mismatch. Generated spectra reaching zero frequency get no bandwidth (checked in the JavaScript tests).",
}
