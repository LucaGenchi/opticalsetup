# OpticalSetup

A 2D optical-setup sketch builder for scientific illustrations, with live ray tracing.

**➡ Try it in your browser: https://opticalsetup.com/sketch/**
(mirror: https://lucagenchi.github.io/optics-sketch/sketch/)

Search or browse optical elements, select one, and place it on a virtual optical table
(top view). Set its parameters
(focal lengths, wavelengths, transmission bands, angles...), and the beam paths are
ray-traced live: mirrors fold, lenses focus, dichroics split by wavelength, gratings
and prisms disperse, samples fluoresce, fibers re-emit. Export publication-ready
figures as SVG or PNG.

## Highlights

- **Progressive workbench detail**: continuous zoom reaches 64×. The 25 mm
  optical-table holes remain visible at overview, then 5 mm and 1 mm sketch
  subdivisions and matching snap precision appear as you zoom in. Optical
  strokes stay fine on screen at close inspection while shapes retain their
  underlying geometry.
- **Direct manipulation**: selecting any component reveals size-backed blue
  edge/corner handles, a rotation handle, and a component-specific purple tuning
  knob. Freeform glass also exposes its actual boundary vertices. Right-click offers
  duplicate, rotate, and delete without leaving the canvas.
- **Element palette**: lasers (line or sized beam, monochromatic / broadband /
  supercontinuum, continuous-wave or pulsed), a first-class pulsed supercontinuum
  laser, directional LED, broadband point source, mirrors (flat with reflectivity,
  convex/concave, true parabolic,
  galvo), lenses, telescopes, objectives, dichroics, filters, beamsplitters,
  polarization optics (polarizers, waveplates, PBS, isolator), gratings, prisms,
  diffusers, wavefront shapers (SLM, DMD, deformable mirror) with composable
  optical functions, modulators (AOM/AOTF/EOM/chopper), mechanical pulse-delay lines,
  nonlinear crystals (SHG, THG,
  supercontinuum, OPO), fibers with per-end output specs, detectors, a focusing
  human eye, straight-sided freeform glass/prisms, and free annotations (arrows,
  labels, beam probes, and a canvas-only figure frame).
- **Honest capability states**: the component library and inspector distinguish
  simulated elements, elements that need setup, and intentionally diagram-only
  annotations. An unset EOM, nonlinear crystal, or SLM is labeled as needing setup;
  arrows and text labels never affect rays.
- **Pulsed timing**: pulsed lasers animate wavelength-colored packets along the
  traced path. Physical mode uses optical-path delay and the configured repetition
  rate; schematic mode keeps packets visible at workbench scale while detector
  delays remain physical. Mechanical delay lines add folded optical path, while AOMs
  support square gating or graded sinusoidal intensity modulation. Playback can be
  paused, reset, and time-scaled.
- **2PP write preview**: a sample holder can be set to photocurable resin. Pulsed
  arrivals leave bounded voxel markers at the traced sample hit while an optional
  2D Y-stage scan translates the mounted sample. It is a visual writing preview,
  not a dose, threshold, curing, or 3D fabrication model.
- **Qualitative detector readouts**: photodetectors, PMTs, and cameras report
  relative ray signal, spectrum, polarization, and spot span at their front face;
  pulsed paths add optical-path delay and path spread. PMTs include qualitative
  gain/saturation, cameras provide a 1D sensor profile, and the eye reads its retina.
- **Physics that responds**: thin-lens/paraxial transfer, spectral band arithmetic at
  filters, Malus's law, grating equation, Cauchy prism dispersion, cavity round trips
  with partial mirrors, image formation with magnification (arrow / letter F / tree
  objects and their computed images).
- **Examples menu**: pedagogical image-formation setups (telescope, microscope,
  camera + depth of field, Scheimpflug, vignetting...) and laboratory sketches
  (Michelson, Mach–Zehnder, laser cavity, OPO...).
- **Paper-ready export**: sketches save/load as `.json` files; figures export as
  SVG/PNG. An optional resizable Figure frame sets the exact export crop and never
  appears in the exported artwork.
- **Self-contained share links and QR codes**: the Share action compresses the
  current sketch into the URL fragment, copies the link, and generates a downloadable
  QR code. Opening it restores the setup without an account or server-side scene storage.

## Simulation scope

OpticalSetup is a qualitative geometric-optics workbench, not a calibrated optical
design package. It models ray paths, bounded relative power, spectral bands, Stokes
polarization, thin-lens elements, refractive boundaries, timed pulse trains, and
simple detector responses. It does not model coherent carrier phase, interference,
diffraction-limited propagation, material dispersion beyond the stated simplified
models, or laboratory-specific calibration. Paraxial image markers do not account
for downstream clipping. Animated pulse packets are a canvas aid;
SVG and PNG exports intentionally remain static and deterministic.

The 2PP resin preview records pulsed ray arrivals at the stage sample plane and
shows their positions in the moving 2D sample. It does not calculate focal volume,
two-photon absorption, threshold dose, cure kinetics, voxel overlap, or a hidden
third axis.

Freeform glass is a directly editable, straight-segment boundary with constant-index
or qualitative BK7-like dispersion, per-surface transmission, source-inside handling,
and total internal reflection. Exact corner hits stop safely because their surface
normal is ambiguous. Nested or overlapping glass bodies are not surface-merged, and
the model does not include Fresnel reflection, coatings, stress birefringence, phase,
or manufacturing tolerances.

## Feedback

Use the app, then send your exported `.json` sketch and notes to Luca. The canvas
autosaves in your own browser, so you can't break anything for anyone else.

The sanitized Codex conversations behind the major development passes are available
in the [work-trace index](docs/codex-sessions/README.md).

## Site structure

The repo root is a static marketing/SEO landing page (`index.html`,
`robots.txt`, `sitemap.xml`); the actual app lives under `sketch/`
(`sketch/index.html`, `sketch/js/`, `sketch/css/`). Both are plain static
files with no build step.

## Run locally

```bash
node serve.mjs        # landing page: http://localhost:5182
                       # app: http://localhost:5182/sketch/
npm test               # runs the regression suite
```

(Any static file server works; ES modules require http(s), not file://.)
