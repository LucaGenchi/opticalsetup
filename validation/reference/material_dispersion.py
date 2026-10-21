# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Material dispersion of the dispersion calculator: n, n_g, GVD and TOD.

Written from the published dispersion formulas, not from the JavaScript.
Each material's coefficients are entered exactly as its source prints them,
in the refractiveindex.info database's formula conventions (the database is
CC0 and cites each primary source):

    formula 1   n^2 - 1 = A + sum B lam^2 / (lam^2 - C^2)    (C in um)
    formula 2   n^2 - 1 = A + sum B lam^2 / (lam^2 - C)      (C in um^2)
    formula 6   n - 1   = A + sum B / (C - lam^-2)           (C in um^-2)

so the app's own conversions (squaring formula-1 poles, rewriting Ciddor's
gas form as poles in lam^2) are checked rather than repeated.

Method: 50-digit decimal arithmetic. The propagation constant
k(omega) = n omega / c is differentiated numerically in angular frequency:
n_g = c dk/domega, beta_2 = d2k/domega2, beta_3 = d3k/domega3, with central
differences at h = 1e-7 omega. That route shares nothing with the app's
analytic wavelength derivatives. Truncation is O(h^2), about 1e-14 relative.
Round-off is not 50 digits: the differences cancel the leading digits of k,
the third difference most of all (eps k / (h^3 beta_3) is about 3e-28 for
fused silica at 800 nm, and grows near a zero of beta_3). Both stay far below
the 1e-9 tolerance, which is therefore floating-point agreement only.

Published anchors: SCHOTT's catalogue nd and Vd for every SCHOTT glass,
checked to half a unit of their last quoted digit.
"""
from decimal import Decimal as D, getcontext

from common import sig

getcontext().prec = 50
PI = D("3.14159265358979323846264338327950288419716939937510")
C = D(299792458)
LINE_D, LINE_F, LINE_C = D("587.5618"), D("486.1327"), D("656.2725")

# id: (formula, coefficients as printed, fit domain in nm, source)
MATERIALS = {
    "nbk7":   (2, "0 1.03961212 0.00600069867 0.231792344 0.0200179144 1.01046945 103.560653", (300, 2500), "SCHOTT"),
    "nfk51a": (2, "0 0.971247817 0.00472301995 0.216901417 0.0153575612 0.904651666 168.68133", (290, 2500), "SCHOTT"),
    "nsf5":   (2, "0 1.52481889 0.011254756 0.187085527 0.0588995392 1.42729015 129.141675", (380, 2500), "SCHOTT"),
    "nsf10":  (2, "0 1.62153902 0.0122241457 0.256287842 0.0595736775 1.64447552 147.468793", (380, 2500), "SCHOTT"),
    "nsf11":  (2, "0 1.73759695 0.013188707 0.313747346 0.0623068142 1.89878101 155.23629", (370, 2500), "SCHOTT"),
    "nsf14":  (2, "0 1.69022361 0.0130512113 0.288870052 0.061369188 1.7045187 149.517689", (365, 2500), "SCHOTT"),
    "nsf57":  (2, "0 1.87543831 0.0141749518 0.37375749 0.0640509927 2.30001797 177.389795", (370, 2500), "SCHOTT"),
    "nlasf9": (2, "0 2.00029547 0.0121426017 0.298926886 0.0538736236 1.80691843 156.530829", (365, 2500), "SCHOTT"),
    "silica": (1, "0 0.6961663 0.0684043 0.4079426 0.1162414 0.8974794 9.896161", (210, 3710), "Malitson 1965"),
    "caf2":   (1, "0 0.5675888 0.050263605 0.4710914 0.1003909 3.8484723 34.649040", (230, 9700), "Malitson 1963"),
    "sapphire-o": (1, "0 1.4313493 0.0726631 0.65054713 0.1193242 5.3414021 18.028251", (200, 5000), "Malitson and Dodge 1972"),
    "sapphire-e": (1, "0 1.5039759 0.0740288 0.55069141 0.1216529 6.5927379 20.072248", (200, 5000), "Malitson and Dodge 1972"),
    "quartz-o": (2, "0.28604141 1.07044083 1.00585997e-2 1.10202242 100", (198, 2053.1), "Ghosh 1999"),
    "quartz-e": (2, "0.28851804 1.09509924 1.02101864e-2 1.15662475 100", (198, 2053.1), "Ghosh 1999"),
    "bbo-o":  (2, "0 0.90291 0.003926 0.83155 0.018786 0.76536 60.01", (188, 5200), "Tamosauskas et al. 2018"),
    "bbo-e":  (2, "0 1.151075 0.007142 0.21803 0.02259 0.656 263", (188, 5200), "Tamosauskas et al. 2018"),
    "yag":    (2, "0 2.28200 0.01185 3.27644 282.734", (400, 5000), "Zelmon et al. 1998"),
    "znse":   (1, "0 4.45813734 0.200859853 0.467216334 0.391371166 2.89566290 47.1362108", (540, 18200), "Connolly et al. 1979 / Tatian 1984"),
    "si":     (1, "0 10.6684293 0.301516485 0.0030434748 1.13475115 1.54133408 1104", (1357, 11040), "Salzberg and Villa 1957 / Tatian 1984"),
    "water":  (2, "0 5.684027565E-1 5.101829712E-3 1.726177391E-1 1.821153936E-2 2.086189578E-2 2.620722293E-2 1.130748688E-1 1.069792721E1", (182, 1129), "Daimon and Masumura 2007"),
    "air":    (6, "0 0.05792105 238.0185 0.00167917 57.362", (230, 1690), "Ciddor 1996"),
}

# SCHOTT catalogue (2017-01-20) nd and Vd, as quoted.
SCHOTT_ANCHORS = {
    "nbk7": ("1.5168", "64.17"), "nfk51a": ("1.48656", "84.47"), "nsf5": ("1.67271", "32.25"),
    "nsf10": ("1.72828", "28.53"), "nsf11": ("1.78472", "25.68"), "nsf14": ("1.76182", "26.53"),
    "nsf57": ("1.84666", "23.78"), "nlasf9": ("1.85025", "32.17"),
}


def index(material, lam_nm):
    formula, text, _, _ = MATERIALS[material]
    c = [D(t) for t in text.split()]
    lam = D(lam_nm) / 1000
    total = c[0]
    for B, Cj in zip(c[1::2], c[2::2]):
        if formula == 1:
            total += B * lam * lam / (lam * lam - Cj * Cj)
        elif formula == 2:
            total += B * lam * lam / (lam * lam - Cj)
        else:
            total += B / (Cj - 1 / (lam * lam))
    return (1 + total).sqrt() if formula in (1, 2) else 1 + total


def k_of_omega(material, omega):
    lam_nm = 2 * PI * C / omega * D(10) ** 9
    return index(material, lam_nm) * omega / C


def dispersion(material, lam_nm):
    omega = 2 * PI * C / (D(lam_nm) * D(10) ** -9)
    h = omega * D("1e-7")
    k = {j: k_of_omega(material, omega + j * h) for j in (-2, -1, 0, 1, 2)}
    k1 = (k[1] - k[-1]) / (2 * h)
    k2 = (k[1] - 2 * k[0] + k[-1]) / (h * h)
    k3 = (k[2] - 2 * k[1] + 2 * k[-1] - k[-2]) / (2 * h ** 3)
    return {
        "index": float(index(material, lam_nm)),
        "groupIndex": float(C * k1),
        "gvdFs2PerMm": float(k2 * D(10) ** 27),
        "todFs3PerMm": float(k3 * D(10) ** 42),
    }


def abbe(material):
    nd, nf, nc = (index(material, lam) for lam in (LINE_D, LINE_F, LINE_C))
    return float((nd - 1) / (nf - nc))


def cases():
    out = []
    for material, (_, _, (lo, hi), source) in MATERIALS.items():
        # Both fit endpoints, a fractional interior point and 800 or 1550 nm.
        interior = 800 if lo <= 800 <= hi else 1550 if lo <= 1550 <= hi else (lo + hi) / 2
        for lam in sorted({lo, hi, interior, round(lo + (hi - lo) * 0.3721, 2)}):
            values = dispersion(material, lam)
            out.append({
                "name": f"{material} at {lam} nm ({source})",
                "inputs": {"kind": "point", "material": material, "wavelengthNm": lam},
                "expected": {k: sig(v) for k, v in values.items()},
                "tolerance": {k: 1e-9 for k in values},
            })
    # Near fused silica's zero-GVD wavelength: absolute tolerance on the
    # near-zero GVD, since relative agreement is meaningless at a crossing.
    values = dispersion("silica", "1272.7")
    out.append({"name": "silica near zero GVD, 1272.7 nm",
                "inputs": {"kind": "point", "material": "silica", "wavelengthNm": 1272.7},
                "expected": {"gvdFs2PerMm": sig(values["gvdFs2PerMm"])},
                "tolerance": {"gvdFs2PerMm": 1e-9}, "absolute": True,
                "note": "GVD crosses zero here; 1e-9 fs^2/mm absolute."})
    for material, (nd, vd) in SCHOTT_ANCHORS.items():
        nd_digits = len(nd.split(".")[1])
        out.append({"name": f"{material} catalogue nd and Vd",
                    "inputs": {"kind": "abbe", "material": material},
                    "expected": {"nd": float(nd), "abbe": float(vd)},
                    "tolerance": {"nd": 0.5 * 10 ** -nd_digits, "abbe": 0.005}, "absolute": True,
                    "note": "Published values, checked to half a unit of the last quoted digit."})
    # Through a thickness, with a transform-limited Gaussian pulse.
    for material, lam, bw, length in (("silica", 800, 30, 10), ("nsf11", 1030, 12, 25), ("water", 1000, 40, 2)):
        point = dispersion(material, lam)
        edges = [dispersion(material, lam - bw / 2), dispersion(material, lam + bw / 2)]
        gdd = length * point["gvdFs2PerMm"]
        tau0 = 0.441 * lam * lam / (299.792458 * bw)
        tau = tau0 * (1 + (4 * 0.6931471805599453 * gdd / tau0 ** 2) ** 2) ** 0.5
        out.append({
            "name": f"{length} mm {material}, {bw} nm FWHM at {lam} nm",
            "inputs": {"kind": "calculator", "material": material, "wavelengthNm": lam, "bandwidthNm": bw,
                       "thicknessMm": length, "shape": "gauss"},
            "expected": {"gddFs2": sig(gdd), "todFs3": sig(length * point["todFs3PerMm"]),
                         "delayVsVacuumFs": sig(length * (point["groupIndex"] - 1) * 1e12 / 299792458),
                         "delaySpreadFs": sig(length * (edges[0]["groupIndex"] - edges[1]["groupIndex"]) * 1e12 / 299792458),
                         "transformLimitFs": sig(tau0), "outputFs": sig(tau)},
            "tolerance": {"gddFs2": 1e-9, "todFs3": 1e-9, "delayVsVacuumFs": 1e-9, "delaySpreadFs": 1e-8,
                          "transformLimitFs": 1e-9, "outputFs": 1e-9},
            "note": "Delay spread is a difference of two group indices: 1e-8 for the cancellation.",
        })
    return out


MODEL = {
    "id": "material-dispersion",
    "title": "Material dispersion calculator: n, n_g, GVD, TOD and pulse stretching",
    "app": "calculators/dispersion/materials.js: materialDispersion, materialAbbe; calculators/dispersion/dispersion-calculator.js: computeDispersion",
    "reference": "Published dispersion formulas in their printed form, 50-digit decimal arithmetic, k(omega) differentiated numerically in angular frequency; SCHOTT catalogue nd and Vd",
    "citations": [
        "SCHOTT AG, optical glass Zemax catalogue 2017-01-20 and data sheets (N-BK7, N-FK51A, N-SF5, N-SF10, N-SF11, N-SF14, N-SF57, N-LASF9)",
        "I. H. Malitson, J. Opt. Soc. Am. 55, 1205 (1965), doi:10.1364/JOSA.55.001205 (fused silica)",
        "I. H. Malitson, Appl. Opt. 2, 1103 (1963), doi:10.1364/AO.2.001103 (CaF2)",
        "I. H. Malitson and M. J. Dodge, J. Opt. Soc. Am. 62, 1405 (1972); M. J. Dodge, Handbook of Laser Science and Technology IV (1986) (sapphire)",
        "G. Ghosh, Opt. Commun. 163, 95 (1999), doi:10.1016/S0030-4018(99)00091-7 (crystalline quartz)",
        "G. Tamosauskas et al., Opt. Mater. Express 8, 1410 (2018), doi:10.1364/OME.8.001410 (BBO)",
        "D. E. Zelmon, D. L. Small and R. Page, Appl. Opt. 37, 4933 (1998), doi:10.1364/AO.37.004933 (YAG)",
        "J. Connolly et al., Proc. SPIE 181, 141 (1979); B. Tatian, Appl. Opt. 23, 4477 (1984) (ZnSe and Si fits)",
        "C. D. Salzberg and J. J. Villa, J. Opt. Soc. Am. 47, 244 (1957), doi:10.1364/JOSA.47.000244 (Si)",
        "M. Daimon and A. Masumura, Appl. Opt. 46, 3811 (2007), doi:10.1364/AO.46.003811 (water, 20 C)",
        "P. E. Ciddor, Appl. Opt. 35, 1566 (1996), doi:10.1364/AO.35.001566 (standard dry air)",
        "M. N. Polyanskiy, Sci. Data 11, 94 (2024), doi:10.1038/s41597-023-02898-2 (refractiveindex.info database, CC0: transcription source)",
    ],
    "provenance": "Coefficients as printed in the refractiveindex.info database (CC0) for each primary source, entered in the database's own formula conventions; SCHOTT nd and Vd from the same catalogue release as the coefficients, so they check transcription and the Abbe evaluation, not the fit itself.",
    "domain": "Every material at both fit endpoints, a fractional interior wavelength and 800 or 1550 nm; fused silica at its zero-GVD crossing; three thickness and bandwidth cases for GDD, TOD, delays and Gaussian stretching.",
    "convergence": "Central differences in angular frequency at h = 1e-7 omega in 50-digit arithmetic: truncation about 1e-14 relative; cancellation in the differences leaves round-off of about 3e-28 relative in beta_3 (fused silica, 800 nm), larger near a zero of beta_3 but far below the tolerance.",
    "tolerance_rationale": "1e-9 relative is double-precision agreement with a numerically exact reference (1e-9 fs^2/mm absolute at the zero-GVD crossing; 1e-8 for the delay spread, a difference of two group indices). Catalogue anchors use half a unit of the last quoted digit.",
    "outside_scope": "Declines: `materialDispersion` and `computeDispersion` return null or an error outside each material's fit domain, for a bandwidth not smaller than the central wavelength, and for plot ranges outside the domain. A bandwidth edge outside the domain removes only the delay spread.",
    "fidelity": "computed",
    "scope": "Room-temperature published fits inside each stated domain; principal indices of birefringent crystals; transform-limited Gaussian input stretched by GDD only; no absorption, temperature, stress or air-to-vacuum correction.",
}
