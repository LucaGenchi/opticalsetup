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
"""
import cmath
import math

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


def crs_case(name, inputs, pump, stokes, probe=None):
    """pump/stokes/probe in Hz; probe None means two-color."""
    vib = pump - stokes
    cars = (probe if probe else pump) + vib
    csrs = (probe if probe else stokes) - vib
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
                          ("dfg", 800, 1040), ("dfg", 1040, 800), ("dfg", 1064, 1064.5), ("dfg", 100, 20000)):
        total = hz(a) + hz(b) if process == "sfg" else abs(hz(a) - hz(b))
        out.append(conversion_case(f"{process.upper()} {a} and {b} nm",
                                   {"process": process, "wave1Nm": a, "wave2Nm": b},
                                   [("1", hz(a)), ("2", hz(b)), ("out", total)]))
    for pump, known in ((1030, 1550), (1030, 4000), (532, 800), (1030, 2060), (800, 19999.5)):
        partner = hz(pump) - hz(known)
        signal, idler = max(hz(known), partner), min(hz(known), partner)
        out.append(conversion_case(f"OPO pump {pump} nm, known output {known} nm",
                                   {"process": "opo", "pumpNm": pump, "outputNm": known},
                                   [("pump", hz(pump)), ("signal", signal), ("idler", idler)],
                                   {"signalShare": sig(signal / hz(pump)), "idlerShare": sig(idler / hz(pump)),
                                    "degeneracyNm": sig(2 * pump)}))
    out.append({"name": "THG exact anchor: 1064 nm gives 1064/3 nm",
                "inputs": {"kind": "conversion", "process": "thg", "known": "fundamental", "harmonicInputNm": 1064},
                "expected": {"wave1Nm": 1064 / 3}, "tolerance": {"wave1Nm": 1e-12}})
    out.append({"name": "OPO exact anchor: 1030 pump, 1550 signal",
                "inputs": {"kind": "conversion", "process": "opo", "pumpNm": 1030, "outputNm": 1550},
                "expected": {"wave2Nm": 1030 * 1550 / 520}, "tolerance": {"wave2Nm": 1e-12}})

    pump, stokes = hz(800), hz(1040)
    out.append(crs_case("CRS pump/Stokes 800/1040 nm, two-color", {"mode": "pump-stokes", "pumpNm": 800, "stokesNm": 1040}, pump, stokes))
    out.append(crs_case("CRS pump/Stokes 800/1040 nm, 532 nm probe",
                        {"mode": "pump-stokes", "pumpNm": 800, "stokesNm": 1040, "separateProbe": True, "probeNm": 532}, pump, stokes, hz(532)))
    for pump_nm, shift in ((800, 2850), (1064, 1003), (1030.25, 1600.5), (19900, 0.1)):
        p = hz(pump_nm)
        out.append(crs_case(f"CRS pump {pump_nm} nm and shift {shift} cm-1",
                            {"mode": "pump-shift", "pumpNm": pump_nm, "ramanShiftCm": shift}, p, p - shift * C_CM_PER_S))
    for stokes_nm, shift in ((1040, 2850), (1064, 2845), (1200.75, 999.5), (20000, 9999.5)):
        s = hz(stokes_nm)
        out.append(crs_case(f"CRS Stokes {stokes_nm} nm and shift {shift} cm-1",
                            {"mode": "stokes-shift", "stokesNm": stokes_nm, "ramanShiftCm": shift}, s + shift * C_CM_PER_S, s))
    out.append(crs_case("CRS Stokes/shift with a 700 nm probe",
                        {"mode": "stokes-shift", "stokesNm": 1040, "ramanShiftCm": 2850, "separateProbe": True, "probeNm": 700},
                        hz(1040) + 2850 * C_CM_PER_S, hz(1040), hz(700)))
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
    "app": "calculators/nonlinear-conversion/conversion-calculator.js: computeConversion (through sketch/js/parametric.js: mixWavelength, parametricPair); calculators/coherent-raman/crs-calculator.js: computeCrs, computeResolution",
    "reference": "SI frequency arithmetic with exact rational anchors; resolution from a quadrature Fourier transform of the pump-Stokes driving term",
    "citations": [
        "R. W. Boyd, Nonlinear Optics, 4th ed., Academic Press (2020), chapters 1-2 (energy conservation, Manley-Rowe)",
        "J.-X. Cheng and X. S. Xie, J. Phys. Chem. B 108, 827-840 (2004), doi:10.1021/jp035693v (CARS)",
        "S. Heuke and H. Rigneault, Nat. Commun. 14, 3337 (2023), doi:10.1038/s41467-023-38941-4 (CSRS at 2 omega_S - omega_p)",
        "M. Mohseni, C. Polzer and T. Hellerer, Opt. Express 26, 10230-10241 (2018), doi:10.1364/OE.26.010230, Eq. (5) (resolution)",
    ],
    "provenance": "Energy conservation written from Boyd; CARS and CSRS frequencies from Cheng and Xie and Heuke and Rigneault; the resolution check recomputes the excitation-amplitude width that Eq. (5) of Mohseni et al. expresses in closed form, and the paper's 20.8 ps cm^-1 prefactor anchors it.",
    "domain": "SHG and THG both directions; SFG; DFG in both input orders and near degeneracy; OPO from signal, idler and the degenerate point; coherent Raman in all three input modes, with and without a distinct probe, with and without a CSRS solution; resolution for equal, unequal, short and equally chirped pulses.",
    "convergence": "Closed-form arithmetic; the resolution quadrature uses 4001 points over +/-14 effective widths and an 80-step bisection.",
    "tolerance_rationale": "1e-9 relative for floating-point identities and for the spectrally accurate quadrature; exact rational anchors at 1e-12; the published three-figure prefactor at half a unit in its last place (0.25 %).",
    "outside_scope": "Declines non-finite or out-of-range inputs, equal DFG inputs, an OPO output not longer than the pump, reversed or equal pump and Stokes, non-positive shifts and inferred pump or Stokes wavelengths outside 100-20000 nm; CSRS alone is omitted when the Raman frequency is not below the probing frequency.",
    "fidelity": "computed",
    "scope": "Vacuum wavelengths and energy conservation only; Gaussian, transform-limited or equally chirped pulses for the resolution; no phase matching, yield, resonance spectrum or chirp mismatch.",
}
