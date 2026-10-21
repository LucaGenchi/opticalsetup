# Material dispersion, nonlinear conversion and coherent Raman calculators

All wavelengths are vacuum wavelengths in nm. These pages evaluate published
fits and frequency identities. They do not predict whether a setup generates
light, how efficiently, or what a measured spectrum looks like.

## Material dispersion (`calculators/dispersion/`)

`materials.js` holds the catalogue and the physics, DOM-free. Each material
keeps its source's formula form, with λ in µm:

- `sellmeier`: `n² − 1 = A + Σ B λ²/(λ² − C)`, C in µm²;
- `gas`: `n − 1 = Σ B/(C − λ⁻²)` (Ciddor's standard air), C in µm⁻².

Every term is rewritten as a pole `K/(λ² − s)` plus a constant, whose first
three derivatives are closed-form, and `n′`, `n″`, `n‴` follow from `S = n²`.
Then `n_g = n − λ n′`, `β₂ = λ³ n″/(2πc²)` and
`β₃ = −λ⁴ (3n″ + λ n‴)/(4π²c³)`, scaled by 10²¹ to fs²/mm and 10³⁰ to fs³/mm.

The four canvas glasses (N-BK7, fused silica, N-SF5, N-SF11) import their
coefficients and fit domains from `sketch/js/glass.js`, so the page and the
tracer share one curve; a test pins them to the tracer's getters at whole-nm
wavelengths, where the tracer's cache buckets land exactly. The app module
itself is unchanged. The other 17 entries are calculator-only. Their
coefficients were transcribed from the refractiveindex.info database (CC0,
Polyanskiy, Sci. Data 11, 94 (2024)), which cites each primary source:
SCHOTT (N-FK51A, N-SF10, N-SF14, N-SF57, N-LASF9), Malitson 1963 (CaF₂),
Malitson and Dodge 1972 (sapphire o/e), Ghosh 1999 (crystalline quartz o/e),
Tamošauskas et al. 2018 (BBO o/e), Zelmon et al. 1998 (YAG), Connolly et al.
1979 / Tatian 1984 (ZnSe), Salzberg and Villa 1957 / Tatian 1984 (Si), Daimon
and Masumura 2007 (water, 20 °C) and Ciddor 1996 (air). Light Conversion's
online toolbox, which lists similar materials, states no data licence and
was used only for numerical comparison.

`dispersion-calculator.js` adds the laser source. GDD and TOD are `L β₂` and
`L β₃`. The delay spread is `L [n_g(λ₀ − Δλ/2) − n_g(λ₀ + Δλ/2)]/c`, exact for
the material curve, and is omitted when a band edge leaves the fit domain.
The transform limit and stretched duration reuse the workbench's
`transformLimitedDurationFs` and `gaussianPulseDurationAfterGDD` /
`sech2PulseDurationAfterGDD`; they include GDD only. Outside a material's
domain, and for a bandwidth not smaller than λ₀, the page declines.

Not modelled: absorption, temperature, stress, batch tolerances, air-to-vacuum
index conversion (catalogue indices are relative to air; for N-BK7, converting
them adds 0.19 fs²/mm of GVD at 300 nm, 0.045 at 800 nm and 0.020 at 1300 nm,
where that is 1 %; the relative change is unbounded near a zero-GVD wavelength), angle-dependent
indices of birefringent crystals, spectral phase already on the pulse, and
TOD-induced reshaping.

## Nonlinear frequency conversion (`calculators/nonlinear-conversion/`)

SHG and THG (`λ/n`, both directions), SFG and DFG (`1/λ₃ = 1/λ₁ ± 1/λ₂`, via
the workbench's `mixWavelength`) and OPO signal and idler from the pump and
either output. DFG and OPO use `λ₁λ₂/(λ₂ − λ₁)`, which subtracts wavelengths
rather than reciprocals and skips the 1e-9 nm⁻¹ cutoff of the tracer's
`parametricPair`; a non-finite result is declined. The page shows the
Manley–Rowe shares `λ_p/λ_s` and `λ_p/λ_i` and the degeneracy wavelength
`2λ_p`. Each wave is
also shown as a frequency and a photon energy (`hc/e` from the exact SI
constants). Energy conservation only: no phase matching or efficiency.

## Coherent Raman scattering (`calculators/coherent-raman/`)

Any two of pump, Stokes and Raman shift give the third:
`Δν̃ = 10⁷(1/λ_p − 1/λ_S)`. Two-color CRS only: CARS at `2ν_p − ν_S` and CSRS
at `2ν_S − ν_p` (Heuke and Rigneault, Nat. Commun. 14, 3337 (2023)); a
distinct third probe beam is not offered. CSRS alone is omitted when `Ω` is not below the Stokes
frequency. Inferred pump or Stokes wavelengths must stay in 100–20000 nm.

The resolution panel evaluates Eq. (5) of Mohseni, Polzer and Hellerer,
Opt. Express 26, 10230 (2018):
`Δν̃ = 2√2 ln2/(πc) · √(τ_p⁻² + τ_S⁻²)`, about 20.8 ps·cm⁻¹ · √(…), with
intensity-FWHM durations of Gaussian pulses that are transform-limited or
equally chirped. For Gaussian fields it is the FWHM of the amplitude
spectrum of `E_p E_S*`; the power-spectrum FWHM is smaller by √2. Chirp
mismatch (the paper's Eq. (8)) is not included.

## Validation

`validation/reference/material_dispersion.py` evaluates every formula in its
printed database form in 50-digit decimal arithmetic and differentiates
`k(ω) = nω/c` numerically in angular frequency; agreement is 10⁻⁹ relative
(absolute at the zero-GVD crossing), and SCHOTT's quoted nd and Vd anchor each
SCHOTT glass. `validation/reference/wavelength_conversion.py` computes every
process in SI frequencies with exact rational anchors, and recomputes the
resolution as the FWHM of a quadrature Fourier transform of the driving term
for transform-limited and equally chirped pulses, anchored by the paper's
20.8 ps·cm⁻¹. `test/calculator-wavelengths.test.js` covers boundaries and
declines. See `docs/validation.md` for the generated table.
