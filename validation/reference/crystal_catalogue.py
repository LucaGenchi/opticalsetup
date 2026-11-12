# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Crystal records and Verdet data of the material catalogue
(docs/physics/material-catalogue.md, step A3b of the Physics in 2D track).

Written from the sources, not from the JavaScript:

- Calcite and quartz: G. Ghosh, Opt. Commun. 163, 95 (1999). Table 1 gives
  n^2 = A + B l^2/(l^2 - C) + D l^2/(l^2 - F) with l in um. Tables 2-5 give,
  at each wavelength, the measured index (handbook data) and the index the
  fit computes, printed to six decimals. The expected values below are that
  printed computed column, at six to eight wavelengths per table, so the app
  is checked against numbers published in the source rather than against a
  second program. The module asserts that its own evaluation of Table 1
  reproduces every one of them to the printing (6e-7) and that the printed
  measured values lie within the residuals the paper reports.
- YVO4: T. S. Lomheim and L. G. DeShazer, J. Appl. Phys. 49, 5517 (1978),
  Eqs. (20) and (21): n^2 = 1 + B l^2/(l^2 - C). The paper tabulates no
  indices (its data are in an unpublished NASA report), so these cases are
  a transcription check of the equations, evaluated here at chosen
  wavelengths.
- TGG index: U. Schlarb and B. Sugg, Phys. Status Solidi B 182, K91 (1994),
  nine measured indices at 20 C, as the refractiveindex.info database
  (CC0) reproduces them. The app interpolates linearly between them; the
  cases check the nodes and one interpolated point.
- TGG Verdet constant: D. Vojna et al., Appl. Sci. 9, 3160 (2019), Eq. (13),
  |V| = F l0^2/(l^2 - l0^2) + G, with Table 2's F = 820.3 rad/(T m),
  G = -6.2 rad/(T m), l0 = 239.3 nm, and its tabulated |V| at 633 and 1064
  nm (130.6 and 37.5 rad/(T m)), which are the expected values. Vojna et al.
  take the parameters from O. Slezak et al., Opt. Mater. Express 6, 3683
  (2016), Table 2, sample NG6; the module asserts that Slezak's B, C, D and
  Tw give F and G at 295 K. The sign is negative, as Slezak et al. state.

Tolerances follow the printing: 1e-6 for six printed decimals, 0.06
rad/(T m) for a Verdet constant printed to one decimal, 1e-9 where the case
is the evaluation of a transcribed equation.
"""

from common import sig

# Ghosh, Table 1: A (with the 1 included), B, C (um^2), D, F (um^2).
GHOSH = {
    ("calcite", "ordinary"): (1.73358749, 0.96464345, 1.94325203e-2, 1.82831454, 120.0),
    ("calcite", "extraordinary"): (1.35859695, 0.82427830, 1.06689543e-2, 0.14429128, 120.0),
    ("quartz", "ordinary"): (1.28604141, 1.07044083, 1.00585997e-2, 1.10202242, 100.0),
    ("quartz", "extraordinary"): (1.28851804, 1.09509924, 1.02101864e-2, 1.15662475, 100.0),
}

# Ghosh, Tables 2-5: (wavelength um, measured, computed by the fit).
GHOSH_TABLES = {
    ("calcite", "ordinary", "Table 2"): [
        (0.2040, 1.88224, 1.882184), (0.3030, 1.71959, 1.719253), (0.4100, 1.68014, 1.679808),
        (0.5890, 1.65835, 1.658364), (0.8010, 1.64869, 1.648797), (1.0420, 1.64276, 1.642899),
        (1.5410, 1.63381, 1.633793), (2.1720, 1.62099, 1.620926)],
    ("calcite", "extraordinary", "Table 3"): [
        (0.2040, 1.57081, 1.570667), (0.3030, 1.51365, 1.513654), (0.4100, 1.49640, 1.496173),
        (0.5890, 1.48640, 1.486139), (0.8010, 1.48216, 1.481904), (1.0420, 1.47985, 1.479776),
        (1.4970, 1.47744, 1.477861), (2.1000, 1.47492, 1.476269)],
    ("quartz", "ordinary", "Table 4"): [
        (0.1980, 1.65087, 1.650902), (0.3400, 1.56747, 1.567554), (0.5893, 1.54424, 1.544206),
        (0.9914, 1.53514, 1.535126), (1.5414, 1.52781, 1.527813), (1.9457, 1.52184, 1.521832)],
    ("quartz", "extraordinary", "Table 5"): [
        (0.1980, 1.66394, 1.663972), (0.3400, 1.57737, 1.577457), (0.5080, 1.55746, 1.557478),
        (0.9914, 1.54392, 1.543901), (1.5414, 1.53630, 1.536292), (1.9457, 1.53004, 1.530055)],
}
# Largest |measured - computed| over each full table, as printed by Ghosh.
GHOSH_LARGEST_RESIDUAL = {"Table 2": 0.000923, "Table 3": 0.001349, "Table 4": 0.000090, "Table 5": 0.000091}

# Lomheim and DeShazer, Eqs. (20) and (21): B, C (um^2).
LOMHEIM = {"ordinary": (2.7665, 0.026884), "extraordinary": (3.5930, 0.032103)}

# Schlarb and Sugg: (wavelength um, n).
SCHLARB = [(0.40466, 2.0178), (0.43583, 2.0057), (0.54607, 1.9765), (0.63300, 1.9656), (1.07981, 1.9434),
           (1.08445, 1.9432), (1.14091, 1.9420), (1.15228, 1.9421), (1.17668, 1.9415)]

# Vojna et al., Table 2 (TGG) and Slezak et al., Table 2 (sample NG6).
VOJNA_TGG = {"F": 820.3, "G": -6.2, "l0_nm": 239.3, "V633": 130.6, "V1064": 37.5}
SLEZAK_NG6 = {"B": -252.0, "C": 31e4, "D": -1796.0, "Tw": 5.9}


def ghosh(key, um):
    A, B, C, D, F = GHOSH[key]
    l2 = um * um
    return (A + B * l2 / (l2 - C) + D * l2 / (l2 - F)) ** 0.5


def lomheim(ray, um):
    B, C = LOMHEIM[ray]
    l2 = um * um
    return (1 + B * l2 / (l2 - C)) ** 0.5


def schlarb(um):
    for (x1, n1), (x2, n2) in zip(SCHLARB, SCHLARB[1:]):
        if x1 <= um <= x2:
            return n1 + (n2 - n1) * (um - x1) / (x2 - x1)
    raise ValueError(um)


def vojna(nm):
    l0 = VOJNA_TGG["l0_nm"] ** 2
    return VOJNA_TGG["F"] * l0 / (nm * nm - l0) + VOJNA_TGG["G"]


def nm(um):
    return round(um * 1000, 6)


def cases():
    out = []
    # Ghosh: the printed computed column, and the module's own check of it.
    for (material, ray, table), rows in GHOSH_TABLES.items():
        for um, measured, computed in rows:
            assert abs(ghosh((material, ray), um) - computed) < 6e-7, (table, um)
            assert abs(measured - computed) <= GHOSH_LARGEST_RESIDUAL[table] + 1e-9, (table, um)
            out.append({
                "name": f"{material} {ray} at {nm(um):g} nm (Ghosh 1999, {table})",
                "inputs": {"kind": "index", "record": material, "ray": ray, "wavelengthNm": nm(um)},
                "expected": {"index": computed},
                "tolerance": {"index": 1e-6},
                "absolute": True,
                "note": f"the fit's value printed in the source to six decimals; measured {measured}",
            })
    # YVO4: transcription of Eqs. (20) and (21).
    for ray in ("ordinary", "extraordinary"):
        for um in (0.488, 0.6328, 1.064, 1.342, 2.0, 3.39):
            out.append({
                "name": f"YVO4 {ray} at {nm(um):g} nm (Lomheim and DeShazer 1978, Eq. {20 if ray == 'extraordinary' else 21})",
                "inputs": {"kind": "index", "record": "yvo4", "ray": ray, "wavelengthNm": nm(um)},
                "expected": {"index": sig(lomheim(ray, um), 12)},
                "tolerance": {"index": 1e-9},
                "absolute": True,
                "note": "transcription check: the source tabulates no indices",
            })
    # TGG index: the measured nodes and one interpolated point.
    for um, n in SCHLARB:
        out.append({
            "name": f"TGG at {nm(um):g} nm (Schlarb and Sugg 1994, measured)",
            "inputs": {"kind": "index", "record": "tgg", "ray": None, "wavelengthNm": nm(um)},
            "expected": {"index": n},
            "tolerance": {"index": 1e-12},
            "absolute": True,
        })
    out.append({
        "name": "TGG at 800 nm, linear interpolation between the 633 and 1079.81 nm measurements",
        "inputs": {"kind": "index", "record": "tgg", "ray": None, "wavelengthNm": 800},
        "expected": {"index": sig(schlarb(0.8), 12)},
        "tolerance": {"index": 1e-9},
        "absolute": True,
        "note": "linear interpolation, not a dispersion model",
    })
    # TGG Verdet constant.
    T = 295.0
    E = SLEZAK_NG6["B"] + SLEZAK_NG6["C"] / (T - SLEZAK_NG6["Tw"])
    F = SLEZAK_NG6["D"] / (T - SLEZAK_NG6["Tw"])
    assert abs(E - VOJNA_TGG["F"]) < 0.05 and abs(F - VOJNA_TGG["G"]) < 0.05, (E, F)
    for wavelength, printed in ((633, VOJNA_TGG["V633"]), (1064, VOJNA_TGG["V1064"])):
        assert abs(vojna(wavelength) - printed) < 0.05, (wavelength, vojna(wavelength))
        out.append({
            "name": f"TGG Verdet constant at {wavelength} nm (Vojna et al. 2019, Table 2; negative, Slezak et al. 2016)",
            "inputs": {"kind": "verdet", "record": "tgg", "wavelengthNm": wavelength},
            "expected": {"verdetRadPerTm": -printed},
            "tolerance": {"verdetRadPerTm": 0.06},
            "absolute": True,
            "note": "printed to one decimal in the source; sample NG6 at 295 K, other samples differ by up to about 10 %",
        })
    for wavelength in (532, 800, 1030):
        out.append({
            "name": f"TGG Verdet constant at {wavelength} nm (Vojna et al. 2019, Eq. 13 with Table 2)",
            "inputs": {"kind": "verdet", "record": "tgg", "wavelengthNm": wavelength},
            "expected": {"verdetRadPerTm": sig(-vojna(wavelength), 12)},
            "tolerance": {"verdetRadPerTm": 1e-9},
            "absolute": True,
            "note": "transcription check of the single-transition model",
        })
    return out


MODEL = {
    "id": "crystal-catalogue",
    "title": "Crystal records and Verdet data of the material catalogue",
    "app": "sketch/js/materials/catalogue.js: fitIndex, verdetConstant",
    "reference": "Indices printed in the sources (Ghosh's Tables 2-5, Schlarb's measurements) and Vojna's tabulated Verdet constants; Lomheim's equations and Vojna's model evaluated here",
    "citations": [
        "G. Ghosh, 'Dispersion-equation coefficients for the refractive index and birefringence of calcite and quartz crystals,' Opt. Commun. 163, 95-102 (1999), Tables 1-5",
        "T. S. Lomheim and L. G. DeShazer, 'Optical-absorption intensities of trivalent neodymium in the uniaxial crystal yttrium orthovanadate,' J. Appl. Phys. 49, 5517-5522 (1978), Eqs. (20) and (21)",
        "U. Schlarb and B. Sugg, 'Refractive index of terbium gallium garnet,' Phys. Status Solidi B 182, K91-K93 (1994), through the refractiveindex.info database (CC0)",
        "D. Vojna, O. Slezak, A. Lucianetti and T. Mocek, 'Verdet constant of magneto-active materials developed for high-power Faraday devices,' Appl. Sci. 9, 3160 (2019), Eq. (13) and Table 2 (CC BY 4.0)",
        "O. Slezak, R. Yasuhara, A. Lucianetti and T. Mocek, 'Temperature-wavelength dependence of terbium gallium garnet ceramics Verdet constant,' Opt. Mater. Express 6, 3683-3691 (2016), Table 2",
    ],
    "fidelity": "computed",
    "scope": "Principal indices of calcite (204-2172 nm), quartz (198-2053 nm) and YVO4 (488-3390 nm) at room temperature; the TGG index at 20 C between 404.66 and 1176.68 nm; the TGG Verdet constant at room temperature (295 K) between 500 and 1100 nm.",
    "outside_scope": "fitIndex and verdetConstant return null outside these ranges. No temperature dependence. The calcite extraordinary fit is up to 0.0013 below the measured index near 2.1 um; the TGG Verdet constant varies by about 10 % between samples. No canvas element uses these records yet.",
    "provenance": "Ghosh's printed computed indices are the expected values, and the module checks its own evaluation of his Table 1 against them; Vojna's F and G are derived in the module from Slezak's Table 2 at 295 K.",
    "domain": "Six to eight wavelengths per Ghosh table; six wavelengths per YVO4 ray; Schlarb's nine measurements and one interpolated point; five wavelengths for the Verdet constant.",
    "convergence": "Closed forms and linear interpolation; no discretisation.",
    "tolerance_rationale": "1e-6 for indices printed to six decimals; 0.06 rad/(T m) for Verdet constants printed to one decimal; 1e-9 or 1e-12 where the case is the evaluation of a transcribed equation or a tabulated value.",
}
