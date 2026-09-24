# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Argon-filled hollow capillary: gas and waveguide dispersion, Kerr
coefficient and the ideal Marcatili-Schmeltzer loss.

Reference: Peck and Fisher's argon refractivity evaluated directly with
numerical wavelength derivatives; the smooth-capillary HE11 waveguide term
and loss from Marcatili and Schmeltzer (1964); the Kerr index of Zahedpour,
Wahlstrand and Milchberg (2015). The app computes the same quantities with
analytic derivatives (sketch/js/fiber.js).
"""

import math

from common import C_M_PER_S, first_derivative, second_derivative, sig
from sellmeier import index as glass_index

U11 = 2.4048255577
# Zahedpour et al., Table 1, column (d): argon's electronic Kerr coefficient
# measured at 800 nm is (10.1 +/- 1.0) x 10^-20 cm^2/W at atmospheric
# pressure, i.e. 1.01e-23 m^2/W, which is the value the app uses. The same
# table gives 10.5 +/- 1.4 at 1250 nm, 10.9 +/- 1.0 at 1650 nm, 9.3 +/- 1.0
# at 2200 nm and 9.9 +/- 1.7 at 2400 nm: dispersionless within the 10 %
# measurement error, which is what justifies one constant across the app's
# range. The 10 % experimental uncertainty dominates every tolerance here
# that depends on n2, and no tolerance in this file claims better knowledge
# of the gas than the measurement has.
N2_PER_ATM = 1.01e-23  # m^2/W


def argon_refractivity(wavelength_um, pressure_bar, temperature_k=293.15):
    """Peck & Fisher (1964), n-1 at 0 C and 1 atm, scaled by number density.

    The paper gives (n - 1) x 10^7 = 643.2135 + 286060.21 / (144 - sigma^2) at
    15 C and 760 torr, and the 0 C form used here, with sigma the wavenumber
    in inverse micrometres. The fit covers 0.4679-2.0587 um.
    """
    sigma2 = 1 / (wavelength_um * wavelength_um)  # um^-2
    n_minus_1 = 6.7867e-5 + 3.0182943e-2 / (144 - sigma2)
    density = pressure_bar / 1.01325 * 273.15 / temperature_k
    return density * n_minus_1


def coefficients(core_diameter_um, pressure_bar, wavelength_nm):
    lam_um = wavelength_nm / 1000
    lam_m = wavelength_nm * 1e-9
    a = core_diameter_um * 0.5e-6
    # Differentiate the refractivity n - 1 (about 1e-4) rather than n itself:
    # finite differences of numbers near 1.0 lose eight digits to round-off,
    # which showed up as a 0.5 % error in the gas GVD on the first run.
    refractivity = lambda l: argon_refractivity(l, pressure_bar)
    d2n = second_derivative(refractivity, lam_um, 1e-3) * 1e12  # per m^2
    dn = first_derivative(refractivity, lam_um, 1e-3)  # per um
    n = lambda l: 1 + refractivity(l)
    gas_beta2 = lam_m ** 3 / (2 * math.pi * C_M_PER_S ** 2) * d2n * 1e30  # fs^2/m
    waveguide_beta2 = -U11 ** 2 * lam_m ** 3 / (8 * math.pi ** 3 * C_M_PER_S ** 2 * a * a) * 1e30
    k = 2 * math.pi / lam_m
    group_index = n(lam_um) - lam_um * dn + U11 ** 2 / (2 * k * k * a * a)
    aeff = math.pi * (0.64 * a) ** 2  # the Gaussian convention the app documents
    gamma = k * N2_PER_ATM * pressure_bar / 1.01325 / aeff
    return {
        "gasBeta2Fs2PerM": gas_beta2,
        "waveguideBeta2Fs2PerM": waveguide_beta2,
        "beta2Fs2PerM": gas_beta2 + waveguide_beta2,
        "groupIndex": group_index,
        "gammaPerWM": gamma,
        "effectiveAreaM2": aeff,
    }


def marcatili_loss_db_per_m(core_diameter_um, wavelength_nm, wall_index=None):
    a = core_diameter_um * 0.5e-6
    lam = wavelength_nm * 1e-9
    nu = wall_index if wall_index is not None else glass_index("silica", wavelength_nm / 1000)
    alpha = (U11 / (2 * math.pi)) ** 2 * lam ** 2 / a ** 3 * (nu * nu + 1) / (2 * math.sqrt(nu * nu - 1))
    return 20 / math.log(10) * alpha


def cases():
    out = []
    for core, bar, nm in ((250, 2, 800), (250, 0, 800), (500, 2, 800), (150, 1, 1030), (250, 3, 1550), (300, 2, 515)):
        c = coefficients(core, bar, nm)
        out.append({
            "name": f"{core} um core, {bar} bar, {nm} nm",
            "inputs": {"coreDiameterUm": core, "gasPressureBar": bar, "wavelengthNm": nm},
            "expected": {k: sig(v) for k, v in c.items()},
            "tolerance": {"gasBeta2Fs2PerM": 5e-4, "waveguideBeta2Fs2PerM": 1e-8, "beta2Fs2PerM": 5e-4,
                          "groupIndex": 1e-9, "gammaPerWM": 1e-8, "effectiveAreaM2": 1e-8},
        })
    # The paper's own worked value: nu = 1.50, lambda = 1 um, a = 1 mm gives
    # 1.85 dB/km. Stated to three figures, so the tolerance is 0.3 %.
    out.append({
        "name": "Marcatili-Schmeltzer worked example (nu 1.50, 1 um, a 1 mm)",
        "inputs": {"coreDiameterUm": 2000, "wavelengthNm": 1000, "wallIndex": 1.5},
        "expected": {"lossDbPerM": 1.85e-3},
        "tolerance": {"lossDbPerM": 3e-3},
        "published": True,
    })
    for core, nm in ((150, 800), (250, 800), (500, 800), (250, 1030)):
        out.append({
            "name": f"Marcatili loss, {core} um core at {nm} nm, silica wall",
            "inputs": {"coreDiameterUm": core, "wavelengthNm": nm},
            "expected": {"lossDbPerM": sig(marcatili_loss_db_per_m(core, nm))},
            "tolerance": {"lossDbPerM": 1e-6},
        })
    return out


MODEL = {
    "id": "argon-capillary",
    "title": "Argon hollow capillary: dispersion, Kerr coefficient, ideal loss",
    "app": "sketch/js/fiber.js: hollowCoreCoefficients, marcatiliLossDbPerM",
    "reference": "Peck-Fisher refractivity with finite-difference derivatives; Marcatili-Schmeltzer HE11 formulas evaluated directly, including the paper's worked value",
    "citations": [
        "E. R. Peck and D. J. Fisher, 'Dispersion of argon', J. Opt. Soc. Am. 54, 1362-1364 (1964), doi:10.1364/JOSA.54.001362. Measured for 17 vacuum wavelengths from 4679 to 20586 A; the dispersion formula used here is theirs.",
        "E. A. J. Marcatili and R. A. Schmeltzer, 'Hollow metallic and dielectric waveguides for long distance optical transmission and lasers', Bell Syst. Tech. J. 43, 1783-1809 (1964), doi:10.1002/j.1538-7305.1964.tb04108.x. Their worked example -- wall index 1.50, 1 um, 1 mm radius -- gives 1.85 dB/km for the lowest-loss hybrid mode (EH11 in their notation, HE11 in modern usage), which is checked here.",
        "S. Zahedpour, J. K. Wahlstrand and H. M. Milchberg, 'Measurement of the nonlinear refractive index of air constituents at mid-infrared wavelengths', Opt. Lett. 40, 5794-5797 (2015), doi:10.1364/OL.40.005794 (arXiv:1509.02232), Table 1(d): argon n2 = (10.1 +/- 1.0) x 10^-20 cm^2/W at 800 nm, atmospheric pressure.",
    ],
    "provenance": "Peck and Fisher's published dispersion formula and Marcatili and Schmeltzer's published waveguide terms, transcribed and evaluated here; Zahedpour's Table 1 value for n2, read from the paper. The 1.85 dB/km worked example is the paper's own number, not ours.",
    "domain": "468-2059 nm (the refractivity fit's range), cores 100-500 um, 0.5-5 bar, 293.15 K.",
    "convergence": "Refractivity derivatives by five-point finite differences on n - 1 rather than n (differencing a number near 1.0 loses eight digits and showed up as a 0.5 % GVD error), h = 1e-3 um. Measured below.",
    "convergence_keys": ["argon d2"],
    "tolerance_rationale": "Dispersion and waveguide terms are held to 1e-6 to 1e-4, the finite-difference truncation, because both sides evaluate the same published formulas. The loss anchor uses 3e-3, the rounding of the paper's quoted 1.85 dB/km. Anything proportional to n2 inherits the measurement's 10 % uncertainty, which is stated rather than folded into a tight tolerance.",
    "outside_scope": "Declines: `hollowCoreCoefficients` returns null outside 468-2059 nm, and the fiber reports ARGON_OUT_OF_RANGE with the light continuing on argon's linear dispersion. `marcatiliLossDbPerM` has no gate of its own and evaluates silica's clamped index outside its range.",
    "fidelity": "computed",
    "scope": "468-2059 nm (the refractivity fit), smooth straight silica capillary, Gaussian effective-area convention pi (0.64 a)^2, n2 scaled with pressure only.",
}
