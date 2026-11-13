# Mueller and Jones kernel

## Why

Polarization used to be computed in three places, each with its own
formulas: the Stokes retarder and analyzer (`sketch/js/polarization.js`),
the Fresnel transmission at prism faces (`sketch/js/fresnel.js`) and the
Jones overlap of interference on cameras (`sketch/js/camera-profile.js`).
Step A1 of the [Physics in 2D track](../roadmap.md#physics-in-2d) puts the
basis, the sign conventions and the matrices in one module,
`sketch/js/mueller.js`. Those three now call it. The later steps that apply
polarization at reflections (A2), the Fresnel choice on glass elements (P1)
and the crystals (P3 onward) build on it.

Step A1 changed no reading: the functions that delegate to the kernel gave
the results they had given before (see "Checks" below).

## Basis and conventions

- **Jones vectors** are (E_p, E_s). p lies in the drawing plane,
  perpendicular to the ray; s points out of the plane. The app's polarization
  angle is measured from p, so 0° is p and 90° is s.
- **Time dependence:** the field is E(t) = Re{J exp(−iωt)}, so a longer
  optical path adds the phase e^(+ikL).
- **Directions:** k̂ along the ray, ŝ = +ẑ out of the screen (the canvas's y
  axis points down), p̂ = ŝ × k̂, so (p̂, ŝ, k̂) is right-handed. The full
  statement, with reflections and backward crossings, is the polarization
  basis in [model-details.md](../model-details.md).
- **Stokes vectors** are S = (S₀, S₁, S₂, S₃) with

      S₀ = |E_p|² + |E_s|²,   S₁ = |E_p|² − |E_s|²,
      S₂ = 2 Re(E_p E_s*),    S₃ = 2 Im(E_p E_s*).

  Rays carry the normalized part (s₁, s₂, s₃) = (S₁, S₂, S₃) / S₀, and `null`
  for unpolarized light, which the kernel reads as (1, 0, 0, 0).
- **Retardance sign:** Goldstein's published matrices, adopted in step A2:
  the Jones matrix R(−θ) diag(1, e^(+iδ)) R(θ) for an element whose fast axis
  is at θ, with R(a) = [[cos a, sin a], [−sin a, cos a]]; under exp(−iωt) the
  slow axis lags by e^(+iδ). A quarter-wave plate with its fast axis at 45°
  turns linear 0° into s₃ = +1, right circular in Born and Wolf's sense (the
  field turns clockwise as seen looking towards the source), which is what the
  readout calls it. Until A2 the app used δ → −δ, so that the set angle
  behaved as the slow axis and every circular label was swapped; powers
  through polarizers were the same either way.
- **Fresnel signs** are those of Born and Wolf (§1.5.2). In the p, s basis
  above, with p̂ = ŝ × k̂ on the incident and on the reflected ray, a perfect
  conductor gives r_p = +1 and r_s = −1 at every angle. That is the ideal
  mirror, Jones diag(1, −1), Mueller diag(1, 1, −1, −1).

## Matrices

The kernel writes each matrix in closed form:

- **Rotator** by an angle α (azimuth turned from p towards s): s₁ and s₂
  turn by 2α.
- **Linear retarder** with fast axis θ and retardance δ: a rotation of
  (s₁, s₂, s₃) by −δ about the axis (cos 2θ, sin 2θ, 0) of the Poincaré
  sphere (Rodrigues' formula); +δ before step A2.
- **Reciprocal element** (light crossing it backwards, step A2):
  J_back = Q·Jᵀ·Q with Q = diag(1, −1) (Bhandari 2008), in Stokes terms
  D·Mᵀ·D with D = diag(1, 1, −1, 1). A retarder or polarizer at θ becomes the
  same element at −θ; a reciprocal rotation keeps its sense.
- **Linear diattenuator** that transmits t_max along its axis θ and t_min
  across it (Goldstein, ch. 6). With m = (t_max + t_min)/2,
  d = (t_max − t_min)/2, x = √(t_max t_min), c = cos 2θ, s = sin 2θ:

      [ m      d c               d s               0 ]
      [ d c    m c² + x s²       (m − x) c s       0 ]
      [ d s    (m − x) c s       m s² + x c²       0 ]
      [ 0      0                 0                 x ]

- **Ideal polarizer:** the diattenuator with t_max = 1, t_min = 0.
- **Ideal mirror:** diag(1, 1, −1, −1).
- **Jones to Mueller:** M_ij = ½ tr(J† σ_i J σ_j), with σ₀ the identity,
  σ₁ = diag(1, −1), σ₂ = [[0, 1], [1, 0]] and σ₃ = [[0, i], [−i, 0]]. This σ₃
  is the sign that gives E† σ₃ E = 2 Im(E_p E_s*).
- **Fresnel coefficients** of a lossless, non-magnetic interface between
  real indices n₁ (incident side) and n₂:

      r_s = (n₁ cos θ₁ − n₂ cos θ₂) / (n₁ cos θ₁ + n₂ cos θ₂)
      r_p = (n₂ cos θ₁ − n₁ cos θ₂) / (n₂ cos θ₁ + n₁ cos θ₂)
      t_s = 2 n₁ cos θ₁ / (n₁ cos θ₁ + n₂ cos θ₂)
      t_p = 2 n₁ cos θ₁ / (n₂ cos θ₁ + n₁ cos θ₂)

  Beyond the critical angle, cos θ₂ = +iκ with κ = √(sin²θ₂ − 1). That is the
  branch whose transmitted field decays away from the face for exp(−iωt).
  Then |r_s| = |r_p| = 1, no transmission coefficients are returned, and the
  phase difference Δ = arg r_s − arg r_p is the retardance of total internal
  reflection, which agrees with Born and Wolf's closed form (§1.5.4):

      tan(Δ/2) = cos θ₁ √(sin²θ₁ − n²) / sin²θ₁,   n = n₂ / n₁.

- **Fresnel reflection matrix:** the Mueller matrix of diag(r_p, r_s):

      [ (R_p + R_s)/2   (R_p − R_s)/2   0        0      ]
      [ (R_p − R_s)/2   (R_p + R_s)/2   0        0      ]
      [ 0               0               Re ρ    −Im ρ   ]
      [ 0               0               Im ρ     Re ρ   ]

  with R = |r|² and ρ = r_p r_s*. It applies beyond the critical angle as
  well.
- **Fresnel transmission matrix:** below the critical angle t_s and t_p are
  real and positive, so the face is the diattenuator along p with
  T_p = 1 − r_p² and T_s = 1 − r_s², as
  [prism-fresnel.md](prism-fresnel.md) describes. Beyond it there is none.

The Fresnel functions do not validate their inputs; they return `null` only
when the formulas give no finite coefficient, so they never return a
non-finite number. That happens for a NaN index or cosine, an infinite
index, or n₂ = 0. The absolute value of the cosine is clamped to [0, 1], so
an infinite cosine counts as normal incidence. An incident index of zero, or
a negative index, is not rejected and gives finite but unphysical
coefficients; the callers pass the positive indices of glass and air. This
is how `fresnelTransmittances` behaved before the kernel, kept unchanged.

## What the tracer uses

| Kernel function | Used by | Since |
|---|---|---|
| Linear retarder | waveplates, retarders and electro-optic modulators, and the phase channel of specimens (`retarder` in `polarization.js`) | before A1 |
| Ideal polarizer | polarizers and the two ports of the polarizing beamsplitter (`analyzerTransmission`) | before A1 |
| Fresnel transmission, diattenuator along p | prism faces (`fresnelTransmittances`, `throughFace`) | before A1 |
| Linear Jones vector, normalization, overlap | interference on cameras (`camera-profile.js`) | before A1 |
| Rotator, ideal mirror, Jones to Mueller, Fresnel reflection | nothing yet | added for A2, P1 and P2 |

No element applies the mirror, the rotator or the Fresnel reflection matrix
in this step. Mirrors and beamsplitter reflections still leave the Stokes
vector unchanged; step A2 changes that.

## Scope

- Fully polarized states through ideal linear elements. Depolarizing
  elements and circular diattenuation are not modelled.
- Lossless, non-magnetic interfaces between real indices. Absorbing media
  (complex indices, metals) come with step P8; coatings are not modelled.

## Sources

- D. H. Goldstein, *Polarized Light*, 3rd ed. (CRC Press, 2011), ch. 5 and
  6: Jones and Mueller matrices of rotators, retarders and diattenuators.
- M. Born and E. Wolf, *Principles of Optics*, 7th ed. (Cambridge University
  Press, 1999), §1.5.2 (Fresnel coefficients and their signs) and §1.5.4
  (total internal reflection and the Fresnel rhomb).

## Checks

- `validation/reference/mueller.py` builds every Mueller matrix a different
  way: it sends four pure states through the defining Jones matrix and
  reads the Stokes vectors that come out. It evaluates the Fresnel
  coefficients in complex arithmetic and the transmission from t with the
  obliquity factor (n₂ cos θ₂ / n₁ cos θ₁)|t|². It asserts Brewster's angle
  (R_p = 0), the sign change of r_p there, the unit modulus beyond the
  critical angle, the closed-form retardance of total internal reflection
  and the perfect-conductor limit. Its cases are listed in
  [docs/validation.md](../validation.md). Among them: a bare dielectric that
  reflects circular light below Brewster's angle reverses s₃ as the ideal
  mirror does, and above it keeps s₃'s sign. A Fresnel rhomb (n = 1.51,
  54.6°) retards by 45.01° per reflection, so two reflections turn linear
  45° into s₃ = −0.99999991.
- `test/mueller-kernel.test.js` compares the functions that now delegate
  with frozen copies of their previous formulas. The analyzer, the Fresnel
  transmittances, the face and the camera's Jones vector agree bit for bit;
  the retarder, now a matrix product instead of Rodrigues' rotation written
  out, agrees to better than 1e-15. The test also checks each closed-form
  matrix against the Jones matrix that defines it, and the edge cases.
- The golden snapshots of every bundled scene are unchanged.
