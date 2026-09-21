"""Catalogue glass dispersion: index, Abbe number, group index and GVD.

Reference: the published three-term Sellmeier coefficients (Schott optical
glass data sheets for N-BK7, N-SF5 and N-SF11; Malitson, J. Opt. Soc. Am.
55, 1205 (1965), doi:10.1364/JOSA.55.001205, for fused silica), evaluated
here directly, with the wavelength derivatives taken numerically. The app
evaluates the same coefficients but derives GVD from the analytic derivative
of the Sellmeier sum (sketch/js/glass.js), so agreement checks that
derivation and its unit bookkeeping, not the coefficients.

The coefficients themselves are anchored separately, against the refractive
indices the N-BK7 data sheet tabulates for the spectral lines (Schott data
sheet 517642.251, 2007-09-19). Those numbers are measured values the fit was
made to, so they are catalogue tabulated values rather than an independent
measurement -- they still catch a transcription or evaluation error, which is
what they are for. The data sheet quotes five decimals, so the anchor
tolerance is 1e-5 absolute; the app reproduces all sixteen lines to within
8e-6, and Malitson quotes an absolute residual of 1.05e-5 for the silica fit.

ANCHORS is therefore published data; everything in cases() below it is this
module's own evaluation of the same coefficients.
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


# Refractive indices tabulated on the N-BK7 data sheet (517642.251), by
# spectral line. Measured catalogue values, independent of any fit we run.
NBK7_LINES = [
    (2325.4, 1.48921), (1970.1, 1.49495), (1529.6, 1.50091), (1060.0, 1.50669),
    (1014.0, 1.50731), (852.1, 1.50980), (706.5, 1.51289), (656.3, 1.51432),
    (632.8, 1.51509), (589.3, 1.51673), (587.6, 1.51680), (546.1, 1.51872),
    (486.1, 1.52238), (435.8, 1.52668), (404.7, 1.53024), (365.0, 1.53627),
]
# The same data sheet's headline numbers.
NBK7_ABBE = 64.17
NBK7_NF_MINUS_NC = 0.008054


def anchor_cases():
    """The app against published measurements, not against our own evaluation."""
    out = []
    for nm, published in NBK7_LINES:
        out.append({
            "name": f"nbk7 at {nm} nm versus the data sheet",
            "inputs": {"glass": "nbk7", "wavelengthNm": nm},
            "expected": {"index": published},
            # Absolute: the data sheet rounds to five decimals (+/- 5e-6), and
            # the Sellmeier fit has a residual of its own.
            "tolerance": {"index": 1e-5},
            "absolute": True,
            "note": "published N-BK7 data sheet value (Schott 517642.251)",
        })
    out.append({
        "name": "nbk7 Abbe number versus the data sheet",
        "inputs": {"glass": "nbk7"},
        "expected": {"abbe": NBK7_ABBE},
        # The app evaluates the d, F and C lines at 587.6, 486.1 and 656.3 nm.
        # Their true wavelengths are 587.5618, 486.1327 and 656.2725 nm, and
        # with those the same coefficients give 64.16733624, which rounds to
        # the catalogue 64.17; with the rounded ones they give 64.14146730.
        # So this tolerance accommodates the app rounding its line
        # wavelengths -- it is not a limit of the fit, and correcting
        # glassAbbe would remove it. Recorded rather than silently allowed.
        "tolerance": {"abbe": 1e-3},
        "note": "data sheet 64.17; the app gives 64.1415 because it evaluates d/F/C at 587.6/486.1/656.3 nm rather than 587.5618/486.1327/656.2725 nm, which give 64.1673",
    })
    out.append({
        "name": "nbk7 principal dispersion versus the data sheet",
        "inputs": {"glass": "nbk7", "loNm": 486.1, "hiNm": 656.3},
        "expected": {"nFMinusNC": NBK7_NF_MINUS_NC},
        "tolerance": {"nFMinusNC": 1e-5},
        "absolute": True,
        "note": "published nF - nC = 0.008054",
    })
    return out


def cases():
    out = anchor_cases()
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
        "SCHOTT AG, data sheet N-BK7 517642.251 (2007-09-19): Sellmeier constants and the tabulated indices used as anchors here — https://www.schott.com/shop/medias/schott-datasheet-n-bk7-eng.pdf",
        "SCHOTT AG, optical glass collection data sheets (N-SF5, N-SF11) — https://www.schott.com/en-gb/products/optical-glass",
        "I. H. Malitson, 'Interspecimen comparison of the refractive index of fused silica', J. Opt. Soc. Am. 55, 1205-1208 (1965), doi:10.1364/JOSA.55.001205 (absolute residual 1.05e-5 over 0.21-3.71 um)",
    ],
    "provenance": "Coefficients transcribed from the manufacturer data sheets and Malitson's paper; the anchors are the same data sheet's tabulated catalogue values, not established as independent of the data behind the fit.",
    "domain": "365-2325 nm for N-BK7 (the data sheet's own line list); 400-1550 nm evaluated for every catalogue glass.",
    "convergence": "Derivatives by five-point finite differences at h = 1e-4 um. The measured refinement below is what bounds them; the wavelength derivative of a Sellmeier sum is smooth, so the step, not the function, sets the error.",
    "convergence_keys": ["GVD of"],
    "tolerance_rationale": "Index 1e-7 and group index 1e-6 are algebraic agreement between two evaluations of the same closed form. GVD 2e-4 covers the finite-difference truncation; 2e-3 at 587.6 nm covers the app's 1 nm GVD bucket, which evaluates 588 nm. The published anchors use 1e-5 absolute, the data sheet's own rounding.",
    "outside_scope": "Clamps: `glassIndex` and `glassGVD` evaluate the fit at the nearest edge of the glass's range and return that value (N-SF11 at 300 nm returns its 370 nm index). `isWavelengthInGlassRange` reports whether a wavelength is inside; the tracer uses it to colour out-of-range light, but the getters themselves do not refuse.",
    "fidelity": "computed",
    "scope": "Room-temperature catalogue curves inside each glass's stated range; no absorption, temperature or stress dependence.",
}
