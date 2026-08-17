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
  knob. Freeform glass also exposes its blue boundary anchors and purple circular-arc
  nodes. Right-click offers duplicate, rotate, and delete without leaving the canvas.
  Large examples can expose named setup regions beside Fit, keeping dense subsystems
  one click away without changing the saved optical scene.
- **Instrument-grade inspector**: the panel leads with the selected element's own
  settings, with bounded numeric ranges getting a slider synced to an exact-entry
  field; position and label controls collapse into their own disclosure sections.
- **Light or dark workbench**: follows your system appearance by default, with a
  persistent toggle; the toolbar, palette, canvas, and inspector restyle together
  while exported SVG/PNG keep their original colors regardless of theme.
- **Element palette**: lasers (line or sized beam, monochromatic / broadband /
  supercontinuum, continuous-wave, pulse-train, or single-shot), a first-class pulsed supercontinuum
  laser, directional LED, broadband point source, mirrors (flat with reflectivity,
  convex/concave, true parabolic,
  galvo), lenses, telescopes, objectives, dichroics, filters, beamsplitters,
  polarization optics (polarizers, waveplates, PBS, isolator), gratings, prisms,
  diffusers, wavefront shapers (SLM, DMD, deformable mirror) with composable
  optical functions, modulators (AOM/AOTF/EOM/chopper), mechanical pulse-delay lines,
  nonlinear crystals (SHG, THG,
  supercontinuum, OPO), fibers with per-end output specs, detectors, a focusing
  human eye, freeform glass/prisms with straight or circular-arc sides, and free
  annotations (arrows, labels, beam probes, and a canvas-only figure frame).
- **Honest capability states**: the component library and inspector distinguish
  simulated elements, elements that need setup, and intentionally diagram-only
  annotations. An unset EOM, nonlinear crystal, or SLM is labeled as needing setup;
  arrows and text labels never affect rays.
- **Pulsed timing**: pulse-train and single-shot lasers animate wavelength-colored
  packets along the traced path. A single shot crosses each path once and can be
  re-armed; it never wraps into a train. Physical mode uses optical-path delay and,
  for trains, the configured repetition rate; schematic mode keeps packets visible
  at workbench scale while detector delays remain physical. Mechanical delay lines add folded optical path, while AOMs
  support square gating or graded sinusoidal intensity modulation. Playback can be
  paused, reset, and time-scaled. A chopper gates pulse trains in time and draws
  CW light as a chunked on/off pattern matching its duty cycle (in Hz, matching a
  real mechanical wheel), visible identically on the live canvas and in exports.
- **2PP write preview**: a sample holder can be set to photocurable resin. Pulsed
  arrivals leave bounded voxel markers at the traced sample hit while an optional
  2D Y-stage scan translates the mounted sample. It is a visual writing preview,
  not a dose, threshold, curing, or 3D fabrication model.
- **Qualitative detector readouts**: photodetectors, PMTs, cameras, and the eye
  report relative ray signal, spectrum, polarization, and spot span at their active
  surface; pulsed paths add optical-path delay and path spread. A data-only sensor
  display can be linked to any of them and mirrors the live output directly on the
  canvas. Its information density adapts to its drawn size, while power, sensor-input,
  and view controls live on the instrument itself. PMTs include qualitative
  gain/saturation; cameras provide a 1D profile whose bin colors show the qualitative
  wavelength mixture at each position. Scalar readouts use arbitrary relative
  ray-weight units rather than implying a calibrated percentage.
- **Physics that responds**: thin-lens/paraxial transfer, spectral band arithmetic at
  filters, Malus's law, grating equation, Cauchy prism dispersion, cavity round trips
  with partial mirrors, image formation with magnification (arrow / letter F / tree
  objects and their computed images).
- **Examples menu**: pedagogical image-formation and laboratory sketches, plus a
  zoomable NIF teaching scene assembled from standard optics with 11 live
  representative ports and a traced VISAR-style optical diagnostic.
- **Community section**: propose your own setup for review directly from the
  toolbar; accepted submissions get their own page with a locked, click-to-inspect
  canvas embed, and a "From the community" menu loads them straight into the editor.
- **Paper-ready export**: sketches save/load as `.json` files; figures export as
  SVG/PNG. An optional resizable Figure frame sets the exact export crop and never
  appears in the exported artwork.
- **Self-contained share links and QR codes**: the Share action compresses the
  current sketch into the URL fragment, copies the link, and generates a downloadable
  QR code. Opening it restores the setup without an account or server-side scene storage.
- **Installable and offline-ready**: add OpticalSetup to a desktop or mobile home
  screen as a standalone app. After the first online visit, the workbench and its
  bundled examples continue to load without a network connection; sketches still
  autosave locally in the browser.

## Simulation scope

OpticalSetup is a qualitative geometric-optics workbench, not a calibrated optical
design package. It models ray paths, bounded relative power, spectral bands, Stokes
polarization, thin-lens elements, refractive boundaries, timed pulse trains and
single shots, and simple detector responses. It does not model coherent carrier
phase, interference,
diffraction-limited propagation, material dispersion beyond the stated simplified
models, or laboratory-specific calibration. Paraxial image markers do not account
for downstream clipping. Animated pulse packets are a canvas aid;
SVG and PNG exports intentionally remain static and deterministic.

The NIF example is an instructive optical construction, not an ignition simulation.
It uses only the normal component library: one 1053 nm single-shot laser, staged
beamsplitters, 11 fiber-fed paths, collimators, timing trims, EOMs, glass slabs,
idealized 1053 → 526.5 → 351 nm conversion, final-focus lenses, an absorbing sample,
and a qualitative drive detector. A separate 659.5 nm laser, splitter/recombiner,
delayed reference arm, target-return mirrors, and camera form a traced VISAR-style
diagnostic. The model reports optical return and path-delay spread, but not coherent
fringe phase or velocity. Amplifier gain and four-pass PEPC switching, the literal
192-beam/48-port 3D cone geometry, DANTE x-ray response, neutron time of flight,
x-ray transport, implosion, fusion, yield, damage, and calibrated energetics remain
explicitly out of scope.

The 2PP resin preview records pulsed ray arrivals at the stage sample plane and
shows their positions in the moving 2D sample. It does not calculate focal volume,
two-photon absorption, threshold dose, cure kinetics, voxel overlap, or a hidden
third axis.

Freeform glass is a directly editable boundary of straight segments and exact
three-point circular arcs with constant-index or qualitative BK7-like dispersion,
per-surface transmission, source-inside handling, and total internal reflection.
Clicking adds a straight anchor; pressing, dragging, and releasing adds a point on
an arc plus its next anchor. Exact corner hits stop safely because their surface
normal is ambiguous. Nested or overlapping glass bodies are not surface-merged,
and the model does not include Fresnel reflection, coatings, stress birefringence,
phase, or manufacturing tolerances.

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
