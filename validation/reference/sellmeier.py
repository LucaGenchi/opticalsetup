"""Catalogue glass dispersion: index, Abbe number, group index and GVD.

Reference: the published three-term Sellmeier coefficients (Schott optical
glass data sheets for N-BK7, N-SF5 and N-SF11; Malitson, J. Opt. Soc. Am.
55, 1205 (1965) for fused silica), evaluated here directly, with the
wavelength derivatives taken numerically. The app evaluates the same
coefficients but derives GVD from the analytic derivative of the Sellmeier
sum (sketch/js/glass.js), so agreement checks that derivation and its unit
bookkeeping, not the coefficients.
"""

import math

from common import C_M_PER_S, first_derivative, second_derivative, sig

GLASSES = {
    "nbk7": {
        "B": [1.03961212, 0.231792344, 1.01046945],
        "C": [0.00600069867, 0.0200179144, 103.560653],
    },
    "silica": {
        "B": [0.6961663, 0.4079426, 0.8974794],
        "C": [0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2],
    },
    "nsf5": {
        "B": [1.52481889, 0.187085527, 1.42729015],
        "C": [0.011254756, 0.0588995392, 129.141675],
    },
    "nsf11": {
        "B": [1.73759695, 0.313747346, 1.89878101],
        "C": [0.013188707, 0.0623068142, 155.23629],
    },
}

FS_PER_MM_VACUUM = 1e12 / C_M_PER_S


def index(glass, wavelength_um):
    g = GLASSES[glass]
    l2 = wavelength_um * wavelength_um
    n2 = 1.0 + sum(B * l2 / (l2 - C) for B, C in zip(g["B"], g["C"]))
    return math.sqrt(n2)


def group_index(glass, wavelength_um):
    n = index(glass, wavelength_um)
    dn = first_derivative(lambda l: index(glass, l), wavelength_um, 1e-4)
    return n - wavelength_um * dn


def gvd_fs2_per_mm(glass, wavelength_um):
    """beta2 = lambda^3 / (2 pi c^2) d2n/dlambda2, converted to fs^2/mm."""
    d2n = second_derivative(lambda l: index(glass, l), wavelength_um, 1e-4)  # per um^2
    lam_m = wavelength_um * 1e-6
    d2n_m = d2n * 1e12  # per m^2
    beta2_s2_per_m = lam_m ** 3 / (2 * math.pi * C_M_PER_S ** 2) * d2n_m
    return beta2_s2_per_m * 1e30 / 1e3  # s^2/m -> fs^2/mm


def abbe(glass):
    nd = index(glass, 0.5876)
    nf = index(glass, 0.4861)
    nc = index(glass, 0.6563)
    return (nd - 1) / (nf - nc)


def cases():
    out = []
    for glass in GLASSES:
        for nm in (400, 587.6, 800, 1030, 1550):
            um = nm / 1000
            out.append({
                "name": f"{glass} at {nm} nm",
                "inputs": {"glass": glass, "wavelengthNm": nm},
                "expected": {
                    "index": sig(index(glass, um)),
                    "groupIndex": sig(group_index(glass, um)),
                    "gvdFs2PerMm": sig(gvd_fs2_per_mm(glass, um)),
                },
                # The app caches GVD on a 1 nm bucket (glass.js), so at the
                # d line (587.6 nm) it evaluates 588 nm: a 0.1 % offset that this
                # check documents rather than hides. Integer wavelengths are exact.
                "tolerance": {"index": 1e-7, "groupIndex": 1e-6, "gvdFs2PerMm": 2e-3 if nm % 1 else 2e-4},
                **({"note": "app buckets GVD to the nearest nm; 587.6 nm is evaluated at 588 nm"} if nm % 1 else {}),
            })
        out.append({
            "name": f"{glass} Abbe number",
            "inputs": {"glass": glass},
            "expected": {"abbe": sig(abbe(glass))},
            "tolerance": {"abbe": 1e-6},
        })
        # Group-delay difference between the endpoints of an 800 +/- 20 nm band
        # over one millimetre, the quantity the app uses for flat-top continua.
        delay = (group_index(glass, 0.820) - group_index(glass, 0.780)) * FS_PER_MM_VACUUM
        out.append({
            "name": f"{glass} group delay 780-820 nm per mm",
            "inputs": {"glass": glass, "loNm": 780, "hiNm": 820, "lengthMm": 1},
            "expected": {"groupDelayDifferenceFs": sig(delay)},
            "tolerance": {"groupDelayDifferenceFs": 1e-5},
        })
    return out


MODEL = {
    "id": "sellmeier",
    "title": "Catalogue glass dispersion (Sellmeier)",
    "app": "sketch/js/glass.js: glassIndex, glassGroupIndex, glassGVD, glassAbbe, glassGroupDelayDifferenceFs",
    "reference": "Published Sellmeier coefficients evaluated directly; derivatives by five-point finite differences",
    "citations": [
        "Schott AG, optical glass data sheets (N-BK7, N-SF5, N-SF11)",
        "I. H. Malitson, J. Opt. Soc. Am. 55, 1205 (1965), fused silica",
    ],
    "fidelity": "computed",
    "scope": "Room-temperature catalogue curves inside each glass's stated range; no absorption, temperature or stress dependence.",
}
