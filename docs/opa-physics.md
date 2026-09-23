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

## Seeded event allocation (second foundation PR)

`allocateParametricAmplifier()` in `sketch/js/parametric-amplifier.js` accepts
one pump and up to 256 eligible seed beam records. Every record uses an
explicit `powerW` on a common physical basis; seed keys must be unique. The
caller supplies each seed's `gammaPerM` at the current local pump intensity,
its `deltaKPerM`, and the interaction `lengthM`. A zero-power pump cannot
amplify even if a caller mistakenly supplies nonzero gamma.

For each supported seed, the requested extra signal power is
`seedPowerW * (G - 1) * overlap`; dividing by the Manley–Rowe signal share
converts that into a pump request. Each request is bounded by the overlapping
fraction of `pumpPowerW * maxDepletion`. When the requests together exhaust
the pump, all are reduced by a common factor. The result includes original
seed plus its gain, generated idler, and the actual pump debit. This conserves
energy and generated photon flux, and it has no spontaneous noise floor.
Processing keys in sorted order makes the result independent of input order.
The log excess from the gain core avoids overflow before saturation is applied.

The model reuses `mixOverlap()` for pulse arrival and Gaussian envelope
correlation, including nearest-period coincidence, the existing 0.02 overlap
floor, and the convention that CW light is always present. Unequal repetition
rates return `repetitionUnsupported`; they are not asserted never to overlap
in reality. Gates and unknown pulse durations are rejected explicitly because
this allocator does not solve gate epochs or unknown temporal envelopes.

This timing factor applied to output power is a teaching approximation. It is
not the time integral of nonlinear gain over the two pulse profiles; mixed CW
and pulsed operation is especially not a calibrated average-power prediction.
The caller must use one consistent power convention for the budget and state
how its supplied peak intensity was obtained. This layer never infers peak
intensity from `powerW`.

Same-wavelength degeneracy is reported as `degenerateUnsupported`, leaving the
seed and pump intact with no duplicate idler. Two populated conjugate inputs
are reported as `doubleSeedUnsupported`: their relative phase would affect
transfer, so adding two independent singly seeded gains is not defensible.
Independent supported seed channels can still share the remaining budget.
Invalid gain/wavelength/timing channels also pass unchanged with a status;
invalid batch structure, non-finite powers, duplicate keys or an unrepresentable
total input power reject the entire call with `null`.

`smallSignalGainCapped` and `achievedGainCapped` identify finite diagnostic
ceilings. Output powers are computed from the physical budget and are not
inferred from a capped gain readout. Saturation here means a conservative
budget allocation, not measured depletion dynamics or back-conversion.

### Required tracer adapter acceptance checks

1. Convert each source's incident ray weights to a common watt basis using
   supported source metadata; reject unknown calibration rather than guessing.
2. Establish spatial and directional eligibility at the same interaction
   region. Existing crystal mixing pairs colours over the aperture; it does
   not itself prove pump/seed spatial overlap.
3. Gather a complete pump event before allocating. One beam with more spatial
   samples must not acquire more pump power; two seeds must not spend the pump
   independently. A pump shared by multiple surfaces/stages needs one debit.
4. Preserve the original seed while routing generated signal/idler increments;
   carry the correct power provenance, pulse timing, spectra and gates to
   detectors, beam probes, drawing and export. Never relabel borrowed pump
   watts as a fraction of the seed's original laser power.
5. Solve or explicitly reject cascades that a passive probe pass cannot know.
   Broadband supercontinuum seeds require weighted spectral slices, not gain
   at the centroid applied to the whole continuum.
6. Verify seed-off, time-zero scan, pump-power scan, wavelength retuning,
   physical energy conservation, sampling/source-order independence and
   save/reload in the actual tracer before adding public OPA capability claims.
