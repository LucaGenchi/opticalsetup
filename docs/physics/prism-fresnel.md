# Fresnel transmission at prism faces

## Why

A prism face transmitted a fixed 98 % of the light whatever its angle or
polarization. That hides what makes Brewster-cut prisms the standard for
pulse compressors: at Brewster's angle the p-polarized light (in the plane of
incidence, the canvas plane) crosses each face with no reflection loss, while
s-polarized light loses about 24 % per face in N-SF10 at 800 nm (13 % in
fused silica). A four-prism compressor has eight faces.

## Model and conventions

At each prism face the transmitted power fraction for the two linear
eigen-polarizations is one minus the Fresnel reflectance of a lossless,
non-magnetic interface:

    r_s = (n₁ cos θ₁ − n₂ cos θ₂) / (n₁ cos θ₁ + n₂ cos θ₂)
    r_p = (n₂ cos θ₁ − n₁ cos θ₂) / (n₂ cos θ₁ + n₁ cos θ₂)
    T_s = 1 − r_s²,   T_p = 1 − r_p²

with θ₁ the angle of incidence, θ₂ the refraction angle from Snell's law, and
n₁, n₂ the indices on each side at the ray's wavelength (the glass's exact
Sellmeier index; 1 in air). Beyond the critical angle the ray is totally
internally reflected (next section).

**Polarization.** The canvas is the plane of incidence of every face, so p is
the app's 0° (in the plane, the polarizing beamsplitter's transmitted state)
and s is 90°. The face is a partial polarizer with its axis along 0°. For a
normalized Stokes vector (s₁, s₂, s₃), with s₁ = +1 for p:

    T  = ½ (T_p + T_s) + ½ (T_p − T_s) s₁
    s₁′ = [½ (T_p − T_s) + ½ (T_p + T_s) s₁] / T
    s₂′ = √(T_p T_s) s₂ / T,   s₃′ = √(T_p T_s) s₃ / T

Unpolarized light (no Stokes vector) transmits ½ (T_p + T_s) and leaves
partly p-polarized, with s₁′ = (T_p − T_s) / (T_p + T_s). Linear light stays
linear; its azimuth turns toward p.

The reflected part is not traced (it was not before either): a prism face is
not a beamsplitter in the app.

## Total internal reflection

Beyond the critical angle |r_s| = |r_p| = 1: no power is lost, but s and p
come back with different phases. In the basis p̂ = ŝ × k̂ of each ray, with
Born and Wolf's signs (a perfect conductor gives r_p = +1, r_s = −1, the
ideal mirror of step A2), the reflection is the Mueller matrix of the
complex coefficients (`fresnelReflectionMueller` in `sketch/js/mueller.js`):

    M = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, Re(r_p r_s*), −Im(r_p r_s*)],
         [0, 0, Im(r_p r_s*), Re(r_p r_s*)]]

The phase difference Δ = arg r_s − arg r_p follows the closed form of Born and
Wolf, §1.5.4, tan(Δ/2) = cos θ √(sin²θ − n²) / sin²θ with n = n₂/n₁. At a
face that follows Fresnel this matrix replaces the ideal mirror. p and s stay
p and s; any other state changes: two reflections at 54.6° in glass of index
1.51 (a Fresnel rhomb) turn linear 45° into circular light. Unpolarized light
stays unpolarized. Glass carries no coherent carrier phase in the tracer, so
only the polarization state changes.

## Bare glass on other glass elements

The thick lens, aspheric lens, lens group and freeform glass take a choice of
**Surfaces**: *Per-surface transmission* (the default, a flat percentage at
every face, and the ideal mirror at total internal reflection) or *Bare glass
(Fresnel)*, which applies the model above, transmission and total internal
reflection alike, at every face. The glass rod has the same choice, its
default being its fixed transmission of 96 % per face. Scenes saved before the
choice existed open on the default and read as before.

## Scope

- Prism faces, and the faces of glass set to bare glass. Glass on per-surface
  transmission keeps its flat percentage and the ideal mirror.
- Uncoated, lossless faces: no absorption, no anti-reflection coatings, no
  surface scatter.
- The index is the real part of the Sellmeier fit; absorption bands are not
  modelled.

## Effect on saved scenes

Prisms in scenes saved before this model transmit by Fresnel too, instead of
2 % loss per face. A prism used at Brewster's angle with p-polarized light now
loses nothing. Otherwise the loss depends on the glass, the angle and the
polarization: at normal incidence about 3 % (CaF₂, fused silica) to 7 %
(N-SF10) per face; s-polarized light at Brewster's angle 12–24 %; more toward
grazing incidence, and none at all past the critical angle, where the ray is
totally reflected. Power and polarization readings behind prisms change
accordingly; nothing else does.

At exactly the critical angle, where Snell's law gives a grazing exit ray,
the Fresnel transmission is zero and that ray carries nothing.

**Modulated polarization.** Light an electro-optic modulator switches between
two states crosses each face once per state, with that state's transmission.
A pulse train carries the difference as a gate (as an analyzer does);
continuous light carries each state's share of the power to the next
analyzer.

## Checks

Traced scenes (step P1): a plane-parallel plate of bare glass at 30° and at
Brewster's angle, for p, s and linear 45°, and a Fresnel rhomb of n = 1.51 at
54.6°, on bare glass and on per-surface transmission. The reference follows
the field through each face with the Jones matrices of
`validation/reference/mueller.py`; the app traces the same layout to a
detector.

`validation/reference/fresnel.py` computes T_s and T_p from the amplitude
transmission coefficients, `T = (n₂ cos θ₂)/(n₁ cos θ₁) |t|²` (a different
route from the app's `1 − |r|²`), and checks the analytic limits: normal
incidence `T = 4 n₁ n₂ / (n₁ + n₂)²`, `T_p = 1` at Brewster's angle
`tan θ_B = n₂/n₁` from either side, and `T_s = T_p` at normal incidence.

## Sources

- M. Born and E. Wolf, *Principles of Optics*, 7th ed., §1.5.2 (Fresnel
  formulae).
- E. Hecht, *Optics*, 5th ed., §4.6.2.
- M. Born and E. Wolf, *Principles of Optics*, 7th ed., §1.5.4 (total
  reflection and its phase change).
- D. Mawet et al., "Fresnel rhombs as achromatic phase shifters for
  infrared nulling interferometry," *Optics Express* 15, 12850 (2007),
  doi:10.1364/OE.15.012850 (open access). Eq. 2 is the s–p phase shift of
  total internal reflection used here, with the same magnitude as
  δ_p − δ_s; §2.2 states that a bare rhomb's achromaticity is limited by the
  dispersion of its glass.
- M. Mansuripur, OPTI 501, University of Arizona, solution to chapter 7
  problem 22: the same phase difference in closed form, its minimum
  (tan²θ = 2/(n² − 1)), and the rhomb angles 50.23° and 53.25° for n = 1.5,
  which the closed form here reproduces (written there as 135° per
  reflection, because its r_p carries an extra factor −1).
- M. Lintz, J. Guéna, M.-A. Bouchiat and D. Chauvat, "Demonstration of an
  optical polarization magnifier with low birefringence," *Review of
  Scientific Instruments* 76, 043102 (2005), doi:10.1063/1.1879292 (preprint
  arXiv:physics/0410044). A pile of uncoated plates at Brewster incidence
  passes p whole and attenuates s; for n = 1.45 the s amplitude falls by
  0.8737 a plate, i.e. (1 − R_s) with R_s the per-face reflectance used here.
  The paper also shows the interference inside each plate, which the tracer
  does not model.
