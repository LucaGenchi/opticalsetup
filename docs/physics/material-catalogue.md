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

A3 is split in two pull requests. A3a, this one, moves the existing records
and states their provenance. It changes no index, no range and no reading. A3b adds
new data: calcite, YVO₄, LiNbO₃ and Verdet constants.

## Records

Each record is one material:

- **isotropic:** one dispersion fit.
- **uniaxial:** an ordinary and an extraordinary fit, the principal indices
  for light polarized perpendicular and parallel to the optic axis, and the
  optical sign. The orientation of the axis belongs to the element that will
  use the crystal (P3, P4, P6), not to the record.

Two kinds are reserved for the steps that need them: `biaxial` (P7) and a
tabulated complex index (P8). The optional Verdet block arrives with the
first Verdet data in A3b.

Every fit keeps its source's own formula: the Sellmeier form
n² − 1 = A + Σ Bλ²/(λ² − C), or Ciddor's form n − 1 = Σ B/(C − λ⁻²) for air,
with λ in µm. It also keeps its domain in nm, its conditions and what its
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

The canvas glass elements list the twelve glasses and crystals that have
always been canvas glasses (the ten SCHOTT glasses, fused silica and CaF₂),
in the same order. A glass element traces one index, so it lists only
isotropic records. A birefringent crystal is never offered there with a
single index. The dispersion calculator lists a uniaxial crystal as its two
principal entries, each marked birefringent, as before.

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
