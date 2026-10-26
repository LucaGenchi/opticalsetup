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
internally reflected, as before.

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

## Scope

- Prism faces only. Glass rods, windows and freeform glass keep their own
  per-surface transmission setting.
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

`validation/reference/fresnel.py` computes T_s and T_p from the amplitude
transmission coefficients, `T = (n₂ cos θ₂)/(n₁ cos θ₁) |t|²` (a different
route from the app's `1 − |r|²`), and checks the analytic limits: normal
incidence `T = 4 n₁ n₂ / (n₁ + n₂)²`, `T_p = 1` at Brewster's angle
`tan θ_B = n₂/n₁` from either side, and `T_s = T_p` at normal incidence.

## Sources

- M. Born and E. Wolf, *Principles of Optics*, 7th ed., §1.5.2 (Fresnel
  formulae).
- E. Hecht, *Optics*, 5th ed., §4.6.2.
