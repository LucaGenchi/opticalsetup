# Spectral phase from the ray paths

## Why

Until this model, the tracer gave a pulse only the GDD of the glass each ray
crossed: the group-velocity dispersion of the material times the length of
the path inside it. That is the whole story for a beam crossing a window at
normal incidence, and it is wrong wherever the colours of a pulse travel
along different paths. A prism pair read as positive GDD (the glass), when
its geometry gives it negative GDD; a grating pair, which has no glass, read
as none. The negative GDD of every prism and grating compressor and the
positive GDD of a grating stretcher come from that path difference, so the
tracer could not show any of them.

## Model and conventions

A broadband ray is split into wavelength samples at the first prism face or
grating it meets (the sampling already used to fan the colours out: 5 samples
below 200 nm of bandwidth, 9 above, equally spaced in wavelength across the
spectrum's support, ±3σ for a Gaussian). The samples of one split form a
*family*. Each sample is traced as a ray at its own wavelength, refracting by
the exact Sellmeier curve (not the 0.1 nm cache other light uses, whose
rounding would show in the GDD), and carries, besides its power, the phase it
has accumulated since the split:

    φ_k = 2π [ (L_k + n s_k + Λ_k) / λ_k + Σ m x / d ]

with, for sample k at vacuum wavelength λ_k (mm):

- `L_k` — the phase optical path, `Σ n(λ_k) ℓ` over every straight segment,
  with `n(λ_k)` the phase index of the medium the segment lies in (the
  catalogue glass's Sellmeier index; 1 in air);
- `s_k` — the distance, along the sample's own direction and in the medium of
  index `n` at the detector, from its arrival point to its wavefront through
  the common reference point (below);
- `Λ_k` — the path an ideal thin lens adds, `−h² / (2f)` at the height `h`
  where the ray crosses it (also used for a curved mirror drawn without its
  real surface);
- `m x / d` — the phase a grating adds to a diffracted order, in cycles:
  order `m` times the hit position `x` along the grating, in units of its
  groove spacing `d`. It is the term that makes the transverse wavevector
  satisfy the grating equation, `k sin θ_out = k sin θ_in + 2π m / d`, which
  is what the tracer uses to turn the ray.

This is the stationary-phase (ray-optics) spectral phase: the phase of each
colour's plane wave along its own ray. `φ(ω) = ω L(ω) / c` gives the
material's GDD `β₂ ℓ` for a fixed path, so the glass is included through the
index and is not added a second time.

**Reference point.** The arrival point `p₀` of the sample nearest the pulse's
centre wavelength. A sample arriving at `p_k` with direction `u_k` has
`s_k = u_k·(p₀ − p_k)`: its wave's phase at `p₀`. Reading a tilted colour
instead where its own ray crosses a common plane would give `kL/cos δθ` where
its wave at the point has `kL cos δθ`, and turn the negative GDD of angular
dispersion positive. For parallel colours the two are the same.

**From phase to GDD.** With `ω_k = 2πc/λ_k` and `x = ω − ω₀` at the pulse's
centre frequency ω₀, a polynomial of degree `min(N − 1, 4)` is fitted to the
N arriving samples (an exact interpolation for N = 5):

    φ(ω) ≈ a₀ + a₁ x + a₂ x² + a₃ x³ + a₄ x⁴,   GDD = 2 a₂,
    τ(ω) = dφ/dω,   delay spread = τ(ω_red edge) − τ(ω_blue edge).

The phases are taken relative to the sample nearest the centre,
`(L_k − L_ref)/λ_k + Δcycles`: the part left out, `L_ref/λ = L_ref ω/2πc`, is
linear in ω and carries no GDD, and kept in, its ~10⁷ rad would bury the
curvature of a narrow band.

Each sample is then given the fitted GDD at its own wavelength,
`2a₂ + 6a₃x + 12a₄x²`, as glass gives each sample its own, so the existing
duration, delay-spread, filtered-pulse and path-agreement rules apply
unchanged; the centre sample's is `2a₂`. The pulse duration model stays
quadratic, as it is for glass: it uses the GDD alone. When the fitted phase
beyond second order, `a₃x³ + a₄x⁴`, exceeds 0.5 rad at the edges of the
bandwidth's FWHM, the duration model line says that it is not included.

**What else adds GDD.** The pulse compressor box, the estimated glass of a
thin lens or objective, fibers and the source's own chirp keep adding their
GDD as before. Each sample's share of it is its running GDD minus the glass
GDD it picked up since the split (which the phase already contains).

**Sign.** φ increases with optical path (`exp[i(kz − ωt)]`), so normal
dispersion is positive GDD, as everywhere else in the app.

## Scope

The path phase is used for a family whose colours were turned apart: by a
diffracted grating order, or by refraction in dispersive glass whose angular
dispersion `|dθ/dλ|`, summed over the faces met, exceeds 2 × 10⁻⁶ rad/nm (a
Brewster prism face gives about 1.4 × 10⁻⁵; a window a few degrees off normal
about 10⁻⁶). Where the colours were not turned apart they took the same path,
and each ray's glass GDD, which the app already computes exactly, is kept.

It is used when every sample of such a family reaches the detector through
surfaces whose effect on the phase is modelled:

| Surface | Contribution |
| --- | --- |
| Flat, conic and spherical mirrors; prism and glass faces; windows | geometry and index only |
| Diffraction grating (reflective or transmissive) | geometry plus the grating term |
| Ideal thin lens, objective, curved mirror without its real surface | geometry plus the ideal-lens path |
| Pulse compressor box, filters, dichroics, beamsplitters, polarizers, waveplates, isolators, choppers, specimen-free attenuators | nothing beyond geometry (coating phase is not modelled anywhere in the app) |

A family that meets anything else (a metalens, an acousto-optic device, a
spatial light modulator, a fiber, a crystal or specimen that converts the
light, an etalon, a diffuser), or whose samples reach the detector more than
once at the same wavelength, or whose sample changes wavelength on the way,
keeps the previous behaviour: the glass GDD of each ray. Fewer than three
arriving wavelengths keep it too.

Limits of the model, stated where the reading is shown:

- **In-plane only.** The tracer is two-dimensional; folds out of the plane
  (a vertical roof mirror) are not represented.
- **Colours still diverging.** When the arriving samples are not parallel
  (angular dispersion remains, as after a single prism or grating), the
  duration depends on where it is read: the GDD shown is the central ray's,
  and the duration is unavailable with that reason.
- **Colours side by side.** When they are parallel but displaced (spatial
  chirp, as after a single pass of a prism or grating pair), the GDD is the
  spectral phase on the central ray and the duration is given, with the
  duration model line saying so.
- **Ideal lenses are paraxial.** The thin lens bends rays by
  `tan θ_out = tan θ_in − h/f`; its path `−h²/(2f)` agrees with that bend to
  second order in the ray angles, so a stretcher built from ideal lenses has
  the paraxial GDD. Real lens surfaces (thick lenses, lens groups) are
  traced through glass and carry their exact path.
- **Sampling.** Five samples across ±3σ resolve the phase to the accuracy
  quoted in `docs/validation.md`; the error grows with bandwidth and with the
  fourth and higher derivatives of the phase.
- **Rounding.** The paths are double-precision sums, so the colours' phase
  differences carry rounding of about four ulps of the largest path or
  coordinate (on the reference layouts this bounded the measured GDD error by
  5.7× or more). The fit propagates it to an uncertainty on the GDD. Where
  that exceeds 1 % of the GDD (or 0.01 fs²) — a band of a few hundredths of a
  nanometre or less, or a scene far from the origin — the fitted GDD is kept
  and shown with `± uncertainty`, and the duration is evaluated at both ends
  of that range: it is given only if the two agree to 1 %, and otherwise it
  is unavailable with that reason.
- **Probes, drawn pulses, the compressor box's input reading.** A probe on
  one sample whose colours were turned apart cannot see the others, so it
  states that the duration is read at a detector. The sample records the
  segment where its colours were turned apart, so a probe on an earlier
  segment of the same path reads as before. The pulse packets drawn
  along the beam, and the "GDD at input" a pulse compressor box shows, still
  use each sample's glass GDD.

## Checks

`validation/reference/ray_path_phase.py` traces the same layouts with its own
two-dimensional ray code in 40-digit decimal arithmetic and differentiates
the phase in angular frequency by central differences. It is checked against
closed forms written from the sources:

- a tilted plane-parallel plate: `φ = (ω/c) t √(n² − sin² θ)` between planes
  parallel to the plate (plane-wave phase matching), exact;
- a parallel grating pair: Treacy's phase `φ = (ω/c) G cos β(ω)` for
  perpendicular separation G (Treacy 1969, the plane-wave form), exact;
- a grating stretcher with ideal lenses: Martinez's result that it behaves
  as a grating pair of perpendicular separation `(s₁ + s₂ − 2f) cos β`,
  negative inside the focal planes, to paraxial order (Martinez 1987);
- a prism pair, single, double and four-prism, at any insertion: Fork,
  Martinez and Gordon's apex path `P = l cos β` per pass (Fork et al. 1984),
  exact by the theorem of Malus and Dupin, with β from the prism angle
  formulas; and a single prism by the same argument, `(ω/c)(p₀ − A)·u(ω)`.

## Sources

- E. B. Treacy, "Optical pulse compression with diffraction gratings,"
  IEEE J. Quantum Electron. 5(9), 454–458 (1969). doi:10.1109/JQE.1969.1076303
- R. L. Fork, O. E. Martinez and J. P. Gordon, "Negative dispersion using
  pairs of prisms," Opt. Lett. 9(5), 150–152 (1984).
- O. E. Martinez, "3000 times grating compressor with positive group velocity
  dispersion: application to fiber compensation in 1.3–1.6 µm region,"
  IEEE J. Quantum Electron. 23(1), 59–64 (1987). doi:10.1109/JQE.1987.1073201
