# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Frequency identities in SI, independently derived from the NIST sources.

Compute in Hz and metres, then convert back to nm / THz / cm^-1. This
reference predates the calculator implementation and does not import JS.
Algebraic double precision; 1e-9 relative leaves room for round-off only.
The exact worked cases separately anchor factors of two and 10^7.
"""
from common import C_M_PER_S, sig


def cases():
    out = []
    for mode, nm in (("fundamental", 1064), ("harmonic", 532),
                     ("fundamental", 1030.25), ("harmonic", 100),
                     ("fundamental", 20000)):
        frequency = C_M_PER_S / (nm * 1e-9)
        fundamental = frequency if mode == "fundamental" else frequency / 2
        harmonic = 2 * fundamental
        values = {
            "fundamentalNm": sig(C_M_PER_S / fundamental * 1e9),
            "harmonicNm": sig(C_M_PER_S / harmonic * 1e9),
            "fundamentalTHz": sig(fundamental / 1e12),
            "harmonicTHz": sig(harmonic / 1e12),
        }
        out.append({"name": f"SHG {mode} {nm} nm", "inputs": {
            "kind": "shg", "mode": mode, "wavelengthNm": nm},
            "expected": values, "tolerance": {k: 1e-9 for k in values}})
    for pump, stokes, probe, shift in (
            (800, 1000, 800, None), (800, 1000, 700, None),
            (800, None, 800, 2500), (800, None, 700, 2500),
            (1000, 20000, 20000, None), (1030.25, 1200.75, 900.5, None),
            (19900, None, 19900, 0.1)):
        p = C_M_PER_S / (pump * 1e-9)
        q = C_M_PER_S / (probe * 1e-9)
        s = C_M_PER_S / (stokes * 1e-9) if stokes else p - shift * C_M_PER_S * 100
        vibration = p - s
        values = {"pumpNm": pump, "stokesNm": sig(C_M_PER_S / s * 1e9),
                  "probeNm": probe, "ramanShiftCm": sig(vibration / C_M_PER_S / 100),
                  "antiStokesNm": sig(C_M_PER_S / (q + vibration) * 1e9),
                  "ramanTHz": sig(vibration / 1e12)}
        inputs = {"kind": "cars", "pumpNm": pump, "probeNm": probe,
                  "separateProbe": probe != pump,
                  "mode": "shift" if shift is not None else "wavelengths"}
        inputs.update({"ramanShiftCm": shift} if shift is not None else {"stokesNm": stokes})
        out.append({"name": f"CARS {inputs['mode']} pump {pump} probe {probe}",
                    "inputs": inputs, "expected": values,
                    "tolerance": {k: 1e-9 for k in values}})
    # Exact algebra anchors rather than just a second implementation.
    out.append({"name": "CARS exact rational wavelength and shift anchor",
                "inputs": {"kind": "cars", "mode": "wavelengths", "pumpNm": 800, "stokesNm": 1000},
                "expected": {"ramanShiftCm": 2500, "antiStokesNm": 2000 / 3},
                "tolerance": {"ramanShiftCm": 1e-9, "antiStokesNm": 1e-9}})
    return out


MODEL = {
    "id": "wavelength-conversion",
    "title": "SHG and CARS vacuum-wavelength conversions",
    "app": "calculators/shg/shg-calculator.js: computeShg; calculators/cars/cars-calculator.js: computeCars",
    "reference": "SI frequency arithmetic plus exact rational wavelength anchors",
    "citations": [
        "NIST, Frequency Conversion Interfaces for Photonic Quantum Systems, 1064 to 532 nm example — https://www.nist.gov/programs-projects/frequency-conversion-interfaces-photonic-quantum-systems",
        "NIST, Broadband Coherent Anti-Stokes Raman Scattering Microscopy, omega_as = omega_p - omega_s + omega_probe — https://www.nist.gov/programs-projects/broadband-coherent-anti-stokes-raman-scattering-bcars-microscopy",
    ],
    "provenance": "Frequency conservation derived from NIST's SHG and CARS explanations; exact c = 299792458 m/s.",
    "domain": "Both SHG directions; CARS wavelength and shift modes, same and distinct probe, fractional wavelengths and input endpoints.",
    "convergence": "Closed-form arithmetic; no discretisation or iteration.",
    "tolerance_rationale": "1e-9 relative for floating-point frequency identities, not experimental accuracy.",
    "scope": "Vacuum wavelengths, frequency identities only; no phase matching, yield or resonance spectrum.",
    "outside_scope": "Declines non-finite or out-of-range inputs, non-positive Raman shifts and impossible inferred Stokes frequencies; outputs may lie outside the input interval.",
    "fidelity": "computed",
}
