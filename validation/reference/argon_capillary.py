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
N2_PER_ATM = 1.01e-23  # m^2/W, near-IR argon at 1 atm (Zahedpour et al., Table 1)


def argon_refractivity(wavelength_um, pressure_bar, temperature_k=293.15):
    """Peck & Fisher (1964), n-1 at 0 C and 1 atm, scaled by number density."""
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
        "E. R. Peck and D. J. Fisher, J. Opt. Soc. Am. 54, 1362 (1964), argon refractivity",
        "E. A. J. Marcatili and R. A. Schmeltzer, Bell Syst. Tech. J. 43, 1783 (1964), hollow dielectric waveguides",
        "S. Zahedpour, J. K. Wahlstrand and H. M. Milchberg, Opt. Lett. 40, 5794 (2015), argon n2",
    ],
    "fidelity": "computed",
    "scope": "468-2059 nm (the refractivity fit), smooth straight silica capillary, Gaussian effective-area convention pi (0.64 a)^2, n2 scaled with pressure only.",
}
