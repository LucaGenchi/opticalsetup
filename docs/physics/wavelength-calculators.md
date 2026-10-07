# Dispersion, SHG and CARS calculators

All wavelengths below are vacuum wavelengths in nm. These pages evaluate
catalogue fits or frequency identities; they do not predict whether a setup
will generate light, its efficiency, or a measured spectrum.

## Sellmeier dispersion

For wavelength λ in µm, the room-temperature three-term fit is
`n² = 1 + Σ B_i λ²/(λ² − C_i)`. B is dimensionless and C is in µm².
The calculator takes the coefficients and supported domains from the app's
glass catalogue: N-BK7 300–2500 nm, fused silica 210–3710 nm, N-SF5
380–2500 nm, and N-SF11 370–2500 nm. These are fit domains, not claims
about transmission throughout the interval. No temperature, absorption,
stress, coatings or batch tolerances are modelled.

With derivatives taken with respect to wavelength, `n_g = n − λ dn/dλ`
and `β₂ = λ³/(2πc²) d²n/dλ²`. With λ in µm and the second derivative
in µm⁻², multiply the latter by 10²¹ to get fs²/mm, using
`c = 299792458 m/s`. For a thickness L in mm, `GDD = L β₂` in fs².
Positive β₂ is normal dispersion; negative β₂ is anomalous dispersion.
GDD is a local second-order coefficient, not a broadband pulse simulation.

The calculator evaluates the app's analytic Sellmeier terms without the
tracer's 0.1 nm index or 1 nm GVD cache buckets. It refuses unknown glass,
non-finite input and wavelengths or plot intervals outside the supported
domain; it never plots a clamped edge as a dispersion curve. The existing
tracer getters retain their cache and clamping behavior. Saved scenes and
their computed ray behavior are unchanged.

The independent Python reference evaluates the published coefficients with
five-point finite differences for the derivatives, extended to endpoints,
fractional wavelengths and near fused silica's zero-GVD crossing. Index and
group-index tolerances are 1e-7 and 1e-6 relative; GVD is 2e-4 relative,
or 2e-4 fs²/mm absolute near zero. These cover finite-difference round-off
and truncation, not uncertainty in a real glass sample. Published N-BK7
indices remain separate anchors with 1e-5 absolute tolerance.

Sources:

- [SCHOTT optical glass catalogue](https://www.schott.com/shop/medias/schott-optical-glass-collection-datasheets-english-march2018.pdf?context=bWFzdGVyfHJvb3R8NTQwMzA2MXxhcHBsaWNhdGlvbi9wZGZ8aDllL2hlZS84ODE3NDA4ODY4MzgyLnBkZnw2Y2VlYjY0Njk3YzBkYzU4NDliOGMxMzVmNjgwZmRiYzdlYWMxYmJmZDU1NjdmYjIxYzU5MTQ4NmE1YjhmMGQ2), dispersion constants for N-BK7, N-SF5 and N-SF11.
- I. H. Malitson, *Interspecimen comparison of the refractive index of fused
  silica*, JOSA 55, 1205 (1965), [doi:10.1364/JOSA.55.001205](https://doi.org/10.1364/JOSA.55.001205).

The wavelength pages also reuse the workbench’s `sumFrequencyWl`,
`ramanStokesWl` and `carsAntiStokesWl` helpers where applicable. The distinct
CARS probe relation extends the existing two-color calculation on the page.

## Second-harmonic generation

`ν_SH = 2ν_f` gives `λ_SH = λ_f/2`; the reverse calculation is
`λ_f = 2λ_SH`. Frequencies in THz are `299792.458/λ_nm`. Both directions
accept finite wavelengths from 100 to 20000 nm; the calculated output may
fall outside the input interval. This numerical interval is a UI scope,
not a material transparency or phase-matching range. Refractive index is
irrelevant to this vacuum-wavelength energy relation. Phase matching,
crystal selection, bandwidth, power and conversion efficiency are absent.

Source: [NIST, Frequency Conversion Interfaces for Photonic Quantum
Systems](https://www.nist.gov/programs-projects/frequency-conversion-interfaces-photonic-quantum-systems), including the published 1064 → 532 nm example.

## Coherent anti-Stokes Raman scattering

The positive Raman shift is `Ω = ν_p − ν_s`; its spectroscopic wavenumber
in cm⁻¹ is `Δσ = 10⁷(1/λ_p − 1/λ_s)`. The emitted frequency is
`ν_as = ν_probe + Ω`, so
`1/λ_as = 1/λ_probe + 1/λ_p − 1/λ_s`. If probe and pump are the same
wave this reduces to `1/λ_as = 2/λ_p − 1/λ_s`.

Two input modes are supported: pump/Stokes wavelengths, or pump wavelength
and positive Raman shift. In the latter, `λ_s = 10⁷/(10⁷/λ_p − Δσ)`.
The denominator must be positive. Pump, Stokes and an optional distinct
probe must be in 100–20000 nm; the shift must be in 0–10000 cm⁻¹ and
strictly positive. Equal pump/Stokes and reversed ordering are declined.
Inferred Stokes values beyond the wavelength input scope are declined too.
The anti-Stokes output can be outside that input interval. These are
numerical UI limits, not a claim about available lasers or vibrational modes.

No resonance strengths, linewidths, nonresonant background, χ³, phase
matching, polarization, pulse overlap or conversion efficiencies are
computed. The Python reference computes frequency differences in Hz and
converts back, with 1e-9 relative tolerance. Analytic examples (800/1000 nm
gives 2500 cm⁻¹ and 2000/3 nm anti-Stokes) separately anchor the units.

Source: [NIST, Broadband Coherent Anti-Stokes Raman Scattering
Microscopy](https://www.nist.gov/programs-projects/broadband-coherent-anti-stokes-raman-scattering-bcars-microscopy), pump–Stokes excitation and distinct probe frequency relation.
