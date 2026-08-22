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
- **Instrument-grade inspector**: the panel leads with the selected element's own
  settings, with bounded numeric ranges getting a slider synced to an exact-entry
  field; position and label controls collapse into their own disclosure sections.
- **Light or dark workbench**: follows your system appearance by default, with a
  persistent toggle; the toolbar, palette, canvas, and inspector restyle together
  while exported SVG/PNG keep their original colors regardless of theme.
- **Element palette**: lasers (line or sized beam, monochromatic / broadband /
  supercontinuum, continuous-wave or pulsed), a first-class pulsed supercontinuum
  laser, directional LED, broadband point source, mirrors (flat with reflectivity,
  convex/concave, true parabolic,
  galvo), paraxial lenses, spherical thick singlets, editable surface-table lens
  groups (including traced crown–flint achromats), telescopes, objectives,
  dichroics, filters, beamsplitters,
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
- **Pulsed timing**: pulsed lasers animate wavelength-colored packets along the
  traced path. Physical mode uses optical-path delay and the configured repetition
  rate; schematic mode keeps packets visible at workbench scale while detector
  delays remain physical. Mechanical delay lines add folded optical path, while AOMs
  support square gating or graded sinusoidal intensity modulation. Playback can be
  paused, reset, and time-scaled. A chopper gates pulse trains in time and draws
  CW light as a chunked on/off pattern matching its duty cycle (in Hz, matching a
  real mechanical wheel), visible identically on the live canvas and in exports.
- **2PP write preview**: a sample holder can be set to photocurable resin. Pulsed
  arrivals leave bounded voxel markers at the traced sample hit while an optional
  2D Y-stage scan translates the mounted sample. It is a visual writing preview,
  not a dose, threshold, curing, or 3D fabrication model. An illuminated resin
  sample can continue into the dedicated Two-Photon Lithography Lab with the
  compatible pulsed-laser settings prefilled. When one objective is
  unambiguously present on the traced path, its NA is transferred too.
- **Qualitative detector readouts**: photodetectors, PMTs, cameras, and the eye
  report relative ray signal, spectrum, polarization, and spot span at their active
  surface; pulsed paths add optical-path delay and path spread. A data-only sensor
  display can be linked to any of them and mirrors the live output directly on the
  canvas. Its information density adapts to its drawn size, while power, sensor-input,
  and view controls live on the instrument itself. PMTs include qualitative
  gain/saturation; cameras provide a 1D profile whose bin colors show the qualitative
  wavelength mixture at each position. Scalar readouts use arbitrary relative
  ray-weight units rather than implying a calibrated percentage.
- **Physics that responds**: thin-lens/paraxial transfer, thick spherical singlets
  and multi-element surface tables with aperture stops and emergent axial colour,
  with exact circular-surface intersections and catalogue-glass dispersion,
  spectral band arithmetic at filters, Malus's law, grating equation, Cauchy
  prism dispersion, cavity round trips
  with partial mirrors, image formation with magnification (arrow / letter F / tree
  objects and their computed images).
- **Examples menu**: pedagogical image-formation setups (telescope, microscope,
  camera + depth of field, Scheimpflug, vignetting...) and laboratory sketches
  (Michelson, Mach–Zehnder, laser cavity, OPO...).
- **Community section**: propose your own setup for review directly from the
  toolbar; accepted submissions get their own page with a locked, click-to-inspect
  canvas embed, and a "From the community" menu loads them straight into the editor.
- **Paper-ready and animated export**: sketches save/load as `.json` files; figures
  export as SVG/PNG, while pulse and mechanical playback can be captured as a looping
  GIF with a chosen acquisition time, frame rate, and size. An optional resizable
  Figure frame sets the exact export crop and never appears in the exported artwork.
- **Self-contained share links and QR codes**: the Share action compresses the
  current sketch into the URL fragment and copies the link. When the complete URL fits
  in one QR code it also generates a downloadable QR; larger setups keep the link and
  offer a `.json` download instead. Opening a link restores the setup without an account
  or server-side scene storage.
- **Installable and offline-ready**: add OpticalSetup to a desktop or mobile home
  screen as a standalone app. After the first online visit, the workbench and its
  bundled examples continue to load without a network connection; sketches still
  autosave locally in the browser.

## Simulation scope

OpticalSetup is a qualitative geometric-optics workbench, not a calibrated optical
design package. It models ray paths, bounded relative power, spectral bands, Stokes
polarization, thin-lens elements, refractive boundaries, timed pulse trains, and
simple detector responses. Thick singlets and lens groups use a 2D meridional section
with spherical or flat faces; lens-group readouts follow the same aperture-aware
realized prescription as the trace, including the tracer-safe 0.06 mm air gap used at
nominally cemented interfaces. They do not model skew rays, aspheres, coatings, cement
index, or calibrated off-axis aberrations. The app does not model coherent carrier
phase, interference,
diffraction-limited propagation, material dispersion beyond the stated simplified
models, or laboratory-specific calibration. Paraxial image markers do not account
for downstream clipping. Animated pulse packets are qualitative playback aids. SVG
and PNG exports remain static and deterministic; GIF exports capture that illustrative
playback rather than claiming a calibrated high-speed recording.

The 2PP resin preview records pulsed ray arrivals at the stage sample plane and
shows their positions in the moving 2D sample. It does not calculate focal volume,
two-photon absorption, threshold dose, cure kinetics, voxel overlap, or a hidden
third axis.

Standalone objectives are set by effective focal length (EFL) — the focal length of
the whole assembly as one equivalent lens — plus a working distance no longer than EFL,
a front aperture, and a rated NA. Magnification is reported from EFL against a 200 mm
reference tube lens rather than typed in, because it belongs to the objective plus
whichever tube lens is actually in the sketch. The equivalent refracting plane sits at
`front tip + WD − EFL`, always inside the barrel, so collimated light focuses exactly
one working distance past the tip, an external tube lens produces the reported
magnification, and the back focal plane one EFL behind the plane is a real traced
conjugate that light focused on leaves collimated. Nothing is drawn at that plane; an
objective is an opaque barrel. Rated NA is the back pupil (2·f·NA) and is the aperture
stop, placed at the back focal plane where an infinity objective's entrance pupil
belongs: a beam that fills it converges at the rated angle, a beam that overfills it
loses the overflow to the barrel, and the inspector reports both the pupil fill and the
smaller effective NA an underfilled pupil actually delivers. The designed front medium
(dry/air capped at NA 0.85, water 1.27, oil 1.49, or a custom index) sets the index and
the NA ceiling, and gives the object-side acceptance half-angle `asin(NA/n)`; it never
rewrites working distance. The pupil is a paraxial stop in a thin-lens tracer, so a beam
filling it converges at `atan(NA)` rather than the sine-condition `asin(NA/n)` the rated
half-angle quotes — close at moderate NA, separating near the ceiling — and the single
plane is a first-order stand-in for a compound prescription, not the real internal
conjugates.

A non-air objective derives an exported immersion bridge to the nearest compatible
sample, stage-mounted sample, or facing fiber end; a moving stage carries that same
target while it remains aligned and in range, then disconnects rather than jumping
elsewhere. Cubic Bézier sides join the objective's front-aperture edges to the contacted
face to suggest a meniscus. That boundary is deliberately schematic: it does not move
components, solve wetting or surface tension, refract rays at the liquid boundary, or
model cover glass, index mismatch, focal shift, or immersion aberrations.

Freeform glass is a directly editable boundary of straight segments and exact
three-point circular arcs with constant index or selectable catalogue-glass,
two-term Cauchy dispersion. Those fits reproduce each glass's d-line index and Abbe
number but are only qualitative outside the visible reference lines. The model also
supports per-surface transmission (a percentage, like every other optic's transmission
efficiency), source-inside handling, and total internal reflection. Two glass bodies
must not be placed in contact: the tracer cannot resolve interfaces closer than
0.05 mm and silently skips one of them, so leave at least 0.06 mm between them — the
inspector warns when anything is closer.
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

Maintainers reviewing and publishing a community setup submission should follow
[docs/community-setup-review.md](docs/community-setup-review.md).

## Site structure

The repo root is a static marketing/SEO landing page (`index.html`,
`robots.txt`, `sitemap.xml`); the actual app lives under `sketch/`
(`sketch/index.html`, `sketch/js/`, `sketch/css/`). Both are plain static
files with no build step.

Three more static sections live alongside the app, each generated from a
content file rather than hand-written HTML:

- `wiki/` — one page per component covering its real-world physics and
  exactly how OpticalSetup simplifies it, generated by
  `tools/build-wiki.mjs` from `tools/wiki-content.mjs`.
- `example-setups/` — one page per curated Example with real-world
  background, an honest note on what the qualitative tracer won't show, and
  references, generated by `tools/build-examples-pages.mjs` from
  `tools/examples-content.mjs`. (Named `example-setups/`, not `examples/` —
  the source scene files live in `Examples/`, and the two names collide on
  any case-insensitive filesystem, macOS included.)
- `community/` — one page per approved community submission, generated by
  `tools/build-community.mjs` from `community-submissions/*.json`; the only
  one of the three with an automated publish pipeline (see
  `docs/community-setup-review.md`), since it's the only one accepting
  outside submissions.

Every page in all three links to a locked, click-to-inspect embed of the
actual live canvas (`sketch/?demo=`, `?example=`, or `?community=`). After
editing any of the three content files, or adding/removing an `Examples/`
or `community-submissions/` entry, rebuild the relevant generator(s) and
finish with `node tools/build-sitemap.mjs`, which assembles the combined
`sitemap.xml` from all three sources.

## Run locally

```bash
node serve.mjs        # landing page: http://localhost:5182
                       # app: http://localhost:5182/sketch/
npm test               # runs the regression suite
```

(Any static file server works; ES modules require http(s), not file://.)
