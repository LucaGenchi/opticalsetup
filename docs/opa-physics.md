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
- C. Manzoni and G. Cerullo, *Design criteria for ultrafast optical parametric
  amplifiers*, J. Opt. **18**, 103501 (2016), open access,
  https://doi.org/10.1088/2040-8978/18/10/103501. Equations 2.9–2.13 give the
  same Gamma (written with omega_1 omega_2 / c^3) and the same general gain
  `G = 1 + [Gamma sinh(g L)/g]^2`; section 2.3.1 explains why the gain exists
  only during the pump pulse and how group-velocity mismatch ends it after the
  pulse-splitting length. G. Cerullo and S. De Silvestri, *Ultrafast optical
  parametric amplifiers*, Rev. Sci. Instrum. **74**, 1 (2003),
  https://doi.org/10.1063/1.1523642, is the longer review.
- I. N. Ross, P. Matousek, G. H. C. New and K. Osvay, *Analysis and
  optimization of optical parametric chirped pulse amplification*, JOSA B
  **19**, 2945 (2002), https://doi.org/10.1364/JOSAB.19.002945: gain evaluated
  across the pump's temporal profile, the basis of the quasi-static timing
  below.
- G. Arisholm, R. Paschotta and T. Südmeyer, *Limits to the power scalability
  of high-gain optical parametric oscillators and amplifiers*, JOSA B **21**,
  578 (2004), https://doi.org/10.1364/JOSAB.21.000578: gain guiding, one of the
  transverse effects this plane-wave model leaves out.
- RP Photonics Encyclopedia, *Optical parametric amplifiers* and *Parametric
  amplification*, https://www.rp-photonics.com/optical_parametric_amplifiers.html:
  instantaneous saturation, no energy storage, seeding, degenerate
  phase-sensitive gain.

Checked independently for review: the gain core agrees with a direct RK4
integration of the plane-wave coupled-amplitude equations to 4e-12 relative
error over Gamma L = 0.1–6 and Delta k/(2 Gamma) = 0–10, including the
oscillatory regime. The same integration with pump depletion shows what the
budget clamp below omits: past the optimum length, the plane-wave pump
regenerates (back-conversion) while the clamp holds full conversion.

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
caller supplies each seed's `gammaPerM` at the **peak** local pump intensity
(for a CW pump, its intensity), its `deltaKPerM`, and the interaction
`lengthM`. A zero-power pump cannot
amplify even if a caller mistakenly supplies nonzero gamma.

Parametric gain has no energy storage, so the allocator is **quasi-static in
time**: each instant of the seed is amplified by the pump intensity present at
that instant. Over one pulse period it integrates

```
Gamma(t) = Gamma_peak * sqrt(I_p(t) / I_peak)
dP_pump(t) = min( P_seed(t) * [G(Gamma(t)) - 1] / signalShare ,  maxDepletion * P_pump(t) )
```

on Gaussian intensity envelopes (401-point trapezoid over the window where the
pump still gives gain and the seed still has power). A pulsed train holds its
whole average power inside the pulse envelope; a CW beam holds only
`f_rep * dt` of it in each slice. Consequences, all tested against an
independent quadrature:

- a short seed on a long pump sees nearly the peak gain;
- a long seed on a short pump is amplified only where the pump is
  (1 ps seed, 100 fs pump, Gamma_peak L = 5: G = 258, not cosh²(5) = 5507);
- a delayed seed sees the pump's wing, so the gain falls much faster than the
  envelope overlap (100 fs pulses, 100 fs delay: 248 versus 2313 at zero delay);
- a CW seed with an 80 MHz, 100 fs pump gains only while the pump pulse is
  there (average-power gain 1.022 at Gamma_peak L = 5);
- a CW pump can only lose the energy that meets the seed pulses.

Dividing the extra signal by the Manley–Rowe signal share converts it into a
pump debit; each slice may give up at most its own share of
`pumpPowerW * maxDepletion`, so the saturation is local in time, as it is in a
real OPA. When several seeds together exhaust the pump, all requests are
reduced by a common factor (exact for one seed, an allocation rule for
several). The result includes original seed plus its gain, generated idler, and
the actual pump debit. This conserves energy and generated photon flux, and it
has no spontaneous noise floor. Processing keys in sorted order makes the
result independent of input order. Logs avoid overflow before the clamp.

The model reuses `mixOverlap()` for pulse arrival and nearest-period
coincidence, including the existing 0.02 visibility floor below which the
channel is reported `unsynchronized`. Unequal repetition rates return
`repetitionUnsupported`; they are not asserted never to overlap in reality.
Gates and unknown pulse durations are rejected explicitly because this
allocator does not solve gate epochs or unknown temporal envelopes.

Limits of the timing model: the pulses are Gaussian and unchirped at the
crystal; group-velocity mismatch (which stops the interaction after the
pulse-splitting length, Manzoni & Cerullo 2016, section 2.3.1), the spatial
beam profile and gain guiding are not modelled; the per-slice clamp is not the
depleted coupled-field solution and never back-converts. The caller must use
one consistent power convention for the budget and state how its supplied peak
intensity was obtained. This layer never infers peak intensity from `powerW`.

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
