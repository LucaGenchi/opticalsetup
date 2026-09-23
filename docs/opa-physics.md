# Seeded optical parametric amplification: implementation contract

Issue: https://github.com/LucaGenchi/opticalsetup/issues/141
Sibling: https://github.com/LucaGenchi/opticalsetup/issues/140

This is the first implementation tranche, **not a claim that an OPA element is
available**. The existing OPO uses authored conversion; the new gain helpers do
not silently change it into a threshold or cavity-dynamics model.

## Sources checked before coding

- Baumgartner & Byer, *Optical parametric amplification*, IEEE JQE **15**,
  432–444 (1979), https://doi.org/10.1109/JQE.1979.1070043.
  Author copy: https://web.stanford.edu/~rlbyer/PDF_AllPubs/1979/80.pdf.
  Equations 29 establish photon invariants; 44 gives matched undepleted gain;
  46 gives the gain coefficient. Equation 47 is a restricted mismatch
  approximation, not a general oscillatory-regime prescription. Figures 1–2
  and the depleted solutions distinguish real back-conversion from clamping.
- R. L. Byer, *Nonlinear Optics*, author-hosted chapter:
  https://web.stanford.edu/~rlbyer/PDF_AllPubs/Other/Nonlinear%20Optics%20Paper.pdf.
  The parametric-amplification section, equation 71, gives the general excess
  signal gain `Gamma² sinh²(g L)/g²`. This resolves the mismatch approximation
  in the issue brief and is the expression implemented here.

## Equations and units

`parametricPair(pumpWl, signalWl)` uses **nm** and returns the idler and
Manley–Rowe generated-power shares. The existing `opoWaves()` now calls this
same helper. Each converted pump photon generates one signal and one idler
photon, so `signalShare = lambda_p/lambda_s` and the idler gets the remainder.
These shares apply only to the generated increment; the original seed is not
split. The inherited idler-frequency cutoff rejects idlers at or above one
metre; it is a numerical support boundary, not crystal transparency data.

`parametricMismatch()` takes all three supplied refractive indices at their
respective wavelengths and returns `Delta k` in **rad/m**:

```
Delta k = 2 pi (n_p/lambda_p - n_s/lambda_s - n_i/lambda_i - 1/Lambda)
```

`polingPeriodUm = 0` disables QPM; positive periods are **micrometres** and
represent first-order QPM. This helper does not invent Sellmeier coefficients,
polarizations, temperatures, angles or transparency windows.

`parametricGainCoefficient()` takes local pump intensity in **W/m²**, effective
nonlinearity in **pm/V**, and returns `Gamma` in **1/m**:

```
Gamma² = 8 pi² d_eff² I_p / (epsilon_0 c lambda_s lambda_i n_p n_s n_i)
```

`d_eff` must already include the chosen polarization and any QPM Fourier
coefficient. Average laser power is not peak intensity. Computing it requires
an illuminated area and, for pulses, a declared envelope and duration.

`parametricSmallSignalGain()` takes length in **metres** and returns:

```
g² = Gamma² - (Delta k/2)²
G = 1 + Gamma² sinh²(g L)/g²
```

At zero mismatch this is `cosh²(Gamma L)`. At `g = 0` the excess is
`(Gamma L)²`; for negative `g²`, `sinh` becomes `sin` with the corresponding
real denominator. Thus a singly seeded nondegenerate amplifier has gain at
least one, with oscillatory excess under strong mismatch. Substituting
`cosh²(g L)` alone in the latter regime would incorrectly predict attenuation.
In the low-gain limit the excess approaches `(Gamma L)² sinc²(Delta k L/2)`;
its mismatch acceptance scales inversely with length. Sidelobes mean it is not
monotonic over all detunings. High gain changes the bandwidth; `pi/L` is a
scale, not a hard cutoff.

## Numerical and physical limits

Invalid/non-finite arguments return `null`. Zero pump intensity, zero effective
nonlinearity, zero interaction length and zero gain coefficient are valid.
The diagnostic gain is capped at `1e100`, with `capped: true`; this is a
numerical safeguard, **not saturation**. The log of the excess gain remains
available for conservative pump-budget allocation. Extremely large arguments
outside finite arithmetic are rejected.

No back-conversion, same-mode degenerate phase-sensitive amplification,
quantum noise/OPG, double seeding, material database, NOPA vector geometry,
walk-off, group-velocity mismatch or OPCPA propagation is calculated.
Degenerate wavelength arithmetic is supported for OPO compatibility, but an
OPA caller must explicitly decide whether it has distinct polarization modes;
it must not equate the nondegenerate gain with a same-mode degenerate gain.

## Integration work still required

The current tracer's `ray.power` is normalized separately for each source;
`pulse.avgPowerW` is separate metadata. Adding one source's normalized weight
to another's is not a physical watt transfer. The OPA needs an explicit common
power basis before it is connected to detector/export/beam-probe outputs.
The probe pre-pass already provides beam identities, spectra and mean arrivals;
`mixOverlap()` is the shared Gaussian-envelope timing implementation added
since issue #141 was written. Reuse it rather than the older pulseOverlap
approximation. Pump depletion must be computed once for all eligible seeds,
independently of source order and the number of spatial sampling rays.

After that foundation, remaining work is the discrete crystal conversion,
integrated registry element/readouts, material/phase-matching controls,
supercontinuum spectral-slice handling, native teaching scenes and generated
wiki/Examples pages. Cascaded amplifiers need an incident-state solution that
includes upstream gain and depletion; a single passive probe pre-pass is not
sufficient. The PWA cache must be bumped when runtime behavior is connected.
