# Material catalogue

## Why

The glasses lived in `sketch/js/glass.js`, which the canvas and the lens
designer read. The crystals, water and air lived only in
`calculators/dispersion/materials.js`, so no canvas element could use them,
and none of the records said whether its primary source could be read
freely. Step A3 of the [Physics in 2D track](../roadmap.md#physics-in-2d)
puts every dispersion fit in one catalogue,
`sketch/js/materials/catalogue.js`, and brings the records the app already
shipped under the data rule of
[adding-physics.md](../adding-physics.md#third-party-data).

A3 is split in two pull requests. A3a moved the existing records and stated
their provenance; it changed no index, no range and no reading. A3b adds new
records (calcite, YVO₄ and terbium gallium garnet) and the first Verdet
data. No canvas element, calculator or lens designer lists the new records
yet: they become selectable in P2 (Faraday rotator), P3, P4 and P6, so A3b
changes no reading either.

## Records

Each record is one material:

- **isotropic:** one dispersion fit.
- **uniaxial:** an ordinary and an extraordinary fit, the principal indices
  for light polarized perpendicular and parallel to the optic axis, and the
  optical sign. The orientation of the axis belongs to the element that will
  use the crystal (P3, P4, P6), not to the record.

Two kinds are reserved for the steps that need them: `biaxial` (P7) and a
tabulated complex index (P8). A record may also carry a Verdet block
(below).

Every fit keeps its source's own formula: the Sellmeier form
n² − 1 = A + Σ Bλ²/(λ² − C), or Ciddor's form n − 1 = Σ B/(C − λ⁻²) for air,
with λ in µm, or, where the source gives measured indices and no formula,
the table itself (`tabulated`), interpolated linearly between its points and
never beyond them. `fitIndex(fit, wavelengthNm)` evaluates any form and
returns `null` outside the fit's domain. It also keeps its domain in nm, its conditions and what its
indices are relative to (air, vacuum, or not stated by the source).

| Record | Kind | Fits | Primary source | Access |
|---|---|---|---|---|
| N-BK7, N-FK51A, N-SK16, F2, N-SF5, N-SF10, N-SF11, N-SF14, N-SF57, N-LASF9 | isotropic | SCHOTT catalogue, 20 °C, relative to air | SCHOTT data sheets and Zemax catalogue (2017-01-20) | datasheet (free from the maker) |
| Fused silica | isotropic | Malitson | J. Opt. Soc. Am. 55, 1205 (1965) | closed |
| CaF₂ | isotropic | Malitson | Appl. Opt. 2, 1103 (1963) | closed |
| Sapphire | uniaxial, negative | Malitson and Dodge | J. Opt. Soc. Am. 62, 1405 (1972), a meeting abstract; formula in Dodge's CRC handbook (1986) | closed, both |
| Crystalline quartz | uniaxial, positive | Ghosh | Opt. Commun. 163, 95 (1999) | closed |
| BBO | uniaxial, negative | Tamošauskas et al. | Opt. Mater. Express 8, 1410 (2018) | gold |
| YAG | isotropic | Zelmon et al. | Appl. Opt. 37, 4933 (1998) | closed |
| ZnSe | isotropic | Connolly et al., fit by Tatian | Proc. SPIE 181, 141 (1979); Appl. Opt. 23, 4477 (1984) | closed, both |
| Silicon | isotropic | Salzberg and Villa, fit by Tatian | J. Opt. Soc. Am. 47, 244 (1957); Appl. Opt. 23, 4477 (1984) | closed, both |
| Water | isotropic | Daimon and Masumura, 20 °C, absolute | Appl. Opt. 46, 3811 (2007) | closed |
| Air | isotropic | Ciddor, standard dry air, absolute | Appl. Opt. 35, 1566 (1996) | closed |
| Calcite (A3b) | uniaxial, negative | Ghosh, 204–2172 nm | Opt. Commun. 163, 95 (1999) | closed |
| YVO₄ (A3b) | uniaxial, positive | Lomheim and DeShazer, one term per ray, 488–3390 nm | J. Appl. Phys. 49, 5517 (1978), Eqs. (20)–(21) | closed |
| TGG (A3b) | isotropic, tabulated | Schlarb and Sugg, nine indices at 20 °C, 404.66–1176.68 nm | Phys. Status Solidi B 182, K91 (1994) | closed |

The canvas glass elements list the twelve glasses and crystals that have
always been canvas glasses (the ten SCHOTT glasses, fused silica and CaF₂),
in the same order. A glass element traces one index, so it lists only
isotropic records. A birefringent crystal is never offered there with a
single index. The dispersion calculator lists a uniaxial crystal as its two
principal entries, each marked birefringent, as before.

## Verdet constants

A record's `verdet` block gives the Verdet constant's model, its
parameters, its sign, the wavelength range and temperature its source
measured, the sample, and the dataset and primary reference it comes from.
`verdetConstant(record, wavelengthNm)` returns the signed value in
rad/(T·m), or `null` outside that range or for a record without one.

- **TGG.** The single-transition model of Vojna et al. (2019, Eq. 13),
  |V(λ)| = F λ₀²/(λ² − λ₀²) + G, with F = 820.3 rad/(T·m), G = −6.2 rad/(T·m)
  and λ₀ = 239.3 nm from their Table 2. Vojna et al. take these from Slezák
  et al. (2016), Table 2, sample NG6, a 6 mm Northrop-Grumman single
  crystal: Slezák's B, C, D and T_w give exactly these F and G at 295 K. The
  model is valid from 500 to 1100 nm, the range Slezák measured. The sign
  is negative, as Slezák et al. state for TGG; Vojna et al. define a
  negative constant as a clockwise rotation when the beam travels along
  the field, without saying from which side the rotation is seen, so step
  A2 (handedness) and P2 (the Faraday rotator) fix the viewing direction.
  It gives −130.6 rad/(T·m) at 633 nm and −37.5 rad/(T·m) at 1064 nm, the
  values Vojna et al. tabulate. Slezák et al. measured six samples: at room
  temperature |V| ranged from 122.4 to 155.5 rad/(T·m) at 632 nm, so a value
  for an unspecified sample is good to about ±10 %.
- **Licence.** Vojna et al. publish under CC BY 4.0;
  `THIRD-PARTY-NOTICES.md` credits them. Both papers are open access
  (gold).

## Left out, and why

- **Congruent LiNbO₃.** The refractiveindex.info database (CC0) reproduces
  the fit of D. E. Zelmon, D. L. Small and D. Jundt, J. Opt. Soc. Am. B 14,
  3319 (1997), which is not open access. It is added in a later pull
  request, once the coefficients have been checked against the paper. That
  check matters: Gayer et al. (2008) report that the ordinary and
  extraordinary parameters of Zelmon's MgO-doped fit appear to have been
  swapped in the paper.
- **MgO-doped LiNbO₃.** Gayer et al., Appl. Phys. B 91, 343 (2008), give a
  temperature-dependent fit for 5 % MgO-doped congruent LiNbO₃, but its
  coefficients are published only in that paper, which is not open access,
  and no openly licensed dataset reproduces them. The data rule admits
  values only from a dataset or table with an open licence, so the fit is
  not added until one exists.
- **α-BBO.** No citable measurement or fit was found; supplier equations
  without a source do not meet the data rule.
- **The Verdet constant of fused silica.** No open primary source with a
  bulk dispersion law was found. The values available are for fibres, in
  a preprint or a thesis, and differ from one another by several percent.
- **Temperature dependence** of every index and of the Verdet constant:
  each record holds at the temperature its source states.

## Provenance

- **Dataset and licence.** Every coefficient was transcribed from the
  refractiveindex.info database (M. N. Polyanskiy, *Sci. Data* 11, 94 (2024),
  open access), which is dedicated to the public domain under CC0 1.0. The
  SCHOTT values in it are the manufacturer's Zemax catalogue. Each fit names
  the database file it corresponds to (`datasetRecord`).
- **Comparison.** On 2026-11-12 every fit was compared with the database at
  commit `e6d15e36`. All 23 fits agree to round-off (largest index difference
  2.2 × 10⁻¹⁶ over each fit's domain). Two domains differ from the database's,
  and the records keep their own:
  - **N-SF5:** 380–2500 nm here, 370–2500 nm in the database.
  - **Fused silica:** 210–3710 nm here, 210–6700 nm in the database, which
    cites a later check of the formula up to 6.7 µm. 3.71 µm is where
    Malitson's measurements end.
  The A3b records were compared with the same commit: the calcite and YVO₄
  coefficients and domains are identical to the database's, as is TGG's
  table of nine indices. The calcite and YVO₄ coefficients were also checked
  against their papers (Ghosh, Table 1; Lomheim and DeShazer, Eqs. 20–21),
  which are not open access and which Luca supplied; they are the
  database's. Schlarb and Sugg's paper was not consulted: the TGG table is
  the database's transcription of it.
- **Access.** The access status of each primary source is in
  `sketch/js/source-access.js`, keyed by DOI (or URL, or the description of
  a printed source). It was looked up in OpenAlex on 2026-11-12. The statuses
  are OpenAlex's own: gold, hybrid, bronze, green, closed. A manufacturer's
  datasheet, which is not a paper, is recorded as `datasheet`. A status says
  where a free copy was found on that date; the licence of the data is a
  separate field.

## Spectra

The same table states the access status of the spectra the app ships:

- **Raman reference spectra (84).** Three sources:
  - Flanagan and Glavin, *Sci. Data* (2025): gold.
  - The Raman Open Database paper, *J. Appl. Cryst.* (2019): hybrid.
  - Bērziņš et al., *Vib. Spectrosc.* (2020): closed. The data themselves
    are on Zenodo under CC BY 4.0.
- **Fluorophores (71)**, from FPbase. The FPbase paper, *Nat. Methods*
  (2019), is closed. The records cite 56 distinct papers: 13 closed, 12 gold,
  7 hybrid, 6 bronze and 18 green.

For 65 of the 71 fluorophore records, FPbase records no source for the
excitation and emission curves themselves. Those records credit the
protein's paper, and the curves' own source is unknown. The six records whose
curves FPbase attributes to a paper (Molina et al. 2019, for the R-GECO1,
jRGECO1a and jRCaMP1a states) name it in `spectraReferences`. Naming a source
for the other 65 needs a source that FPbase does not give. This step records
the gap rather than guess.

## Checks of the A3b records

`validation/reference/crystal_catalogue.py` (55 cases in
[docs/validation.md](../validation.md)):

- **Calcite and quartz** against the indices Ghosh's fit gives in his
  Tables 2–5, printed to six decimals, at six to eight wavelengths per table.
  The catalogue reproduces every row of the four tables to within
  5.2 × 10⁻⁷, the rounding of the printing. The module checks that the printed
  measured values lie within the residuals Ghosh reports. Those residuals
  reach 0.0013 for the extraordinary index of calcite near 2.1 µm, and the
  record says so.
- **YVO₄:** the source tabulates no indices; its measurements are in an
  unpublished NASA report. These cases check the transcription of its two
  equations.
- **TGG index:** Schlarb's nine measurements and one interpolated point.
- **TGG Verdet constant:** Vojna's tabulated values at 633 and 1064 nm, and
  the model at three other wavelengths. The module also derives Vojna's F
  and G from Slezák's Table 2.

## Checks

- `test/material-catalogue.test.js`:
  - every record states its kind, range, conditions, dataset record,
    licence, primary reference and access;
  - the optical sign of each uniaxial record matches its fits;
  - the canvas (`glassIndexUnbucketed`), the dispersion calculator and the
    lens designer return bit-identical indices for every canvas glass at 65
    wavelengths across its domain;
  - every fit reaches the calculator with its own coefficients;
  - the glass elements and the lens designer list only isotropic records.
- `test/source-access.test.js`: every Raman spectrum and fluorophore record
  has a licence and primary sources with an access status, and the table
  lists no source that nothing cites.
- A record without a licence, a primary source or an access status fails
  both tests through `dataRuleProblems` in `sketch/js/source-access.js`.
- The golden snapshots and the generated calculator pages are unchanged, and
  the existing Sellmeier validation rows pass.
