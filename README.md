# OpticalSetup

A 2D optical workbench in the browser: draw a setup, watch the light being
traced through it live, read what the detectors receive, and export a
paper-ready figure or a self-contained share link.

**➡ Try it in your browser: https://opticalsetup.com/sketch/**
(mirror: https://lucagenchi.github.io/opticalsetup/sketch/)

No account, no installation and no server-side storage: the app is plain
static files that run entirely in your browser.

## What you can do

- **Build a setup.** Search or browse the element palette and place components
  on a virtual optical table seen from above: sources (lasers, LEDs, lamps,
  pulsed and supercontinuum lasers), mirrors, lenses and objectives, filters,
  dichroics and beamsplitters, polarization optics, gratings and prisms,
  modulators, nonlinear crystals and parametric sources, fibers, samples,
  detectors, and free-form glass.
- **See the light.** Beams are ray-traced live as you edit: mirrors fold,
  lenses focus, dichroics split by wavelength, gratings and prisms disperse,
  samples fluoresce, fibers re-emit. Beam colour follows wavelength.
- **Tune components.** Select an element to drag, rotate, resize or adjust it
  on the canvas, or set exact values (focal length, wavelength, transmission
  band, angle…) in the inspector.
- **Measure.** Photodiodes, PMTs, cameras, spectrometers, beam probes and the
  eye report power, spectrum, polarization, beam profile and pulse timing at
  their position; a linked display shows a reading directly on the canvas.
- **Animate pulses.** Pulsed sources play wavelength-coloured packets along the
  traced path, with timing from the optical path length and duration that
  follows the dispersion accumulated along the way.
- **Learn from examples.** The Examples menu opens ready-made setups — imaging
  systems (telescopes, microscopes, cameras), interferometers, laser cavities,
  OPOs and ultrashort-pulse systems — each with an explanatory page.
- **Export and share.** Save and load setups as `.json`; export figures as SVG
  or PNG, or animations as GIF; share a setup as a link (and QR code) that
  carries the whole scene.
- **Work offline.** Install it as an app on desktop or mobile; after the first
  visit it keeps working without a network, and your sketch autosaves in the
  browser.

## How it works

1. **Scene.** A setup is a list of components, each with a position, rotation
   and parameters. A component registry defines every element: its drawing,
   its optical surfaces, its defaults and whether it is simulated, needs
   setup, or is a diagram-only annotation (arrows and labels never touch the
   light).
2. **Tracing.** Each source emits rays that are propagated surface by surface
   in 2D. At each hit the element decides what happens — reflection,
   refraction on the true curved surface, wavelength-dependent splitting or
   diffraction, polarization changes (Stokes), absorption or conversion — and
   the ray carries on with its wavelength, power weight, polarization and
   accumulated optical path and dispersion.
3. **Readouts.** Detectors collect the light that reaches their surface and
   turn it into readings using their own model; these are recomputed every
   time the scene changes.
4. **Rendering and export.** The canvas draws the components and traced beams;
   the same geometry produces the SVG, PNG and GIF exports, so a figure matches
   what you saw.

### Scope

OpticalSetup computes what it shows, within stated limits: rays come from the
surfaces on the canvas, dispersion from catalogue glass data, and readings from
the traced light. It is built for designing, understanding and communicating
setups — not as a replacement for optical design software. It works in 2D and
does not do tolerancing, lens optimization or full diffraction and wave
propagation; power readings are relative unless the sources' powers are set.
Each component's limits are listed on its [wiki page](https://opticalsetup.com/wiki/),
and the full per-model notes are in [docs/model-details.md](docs/model-details.md).

Selected quantitative models are checked against independent Python
reference implementations; see [docs/validation.md](docs/validation.md) and
[docs/adding-physics.md](docs/adding-physics.md).

## Beyond the editor

- **Wiki** — one page per component: the real-world physics and how the app
  simplifies it.
- **Example setups** — background, model limits and references for each
  built-in example.
- **Calculators** — interactive pages for individual physical models, running
  the same code as the app.
- **Community** — propose your own setup from the toolbar; accepted
  submissions get their own page and appear in the app's community menu.

These pages are generated from content files; see the
[site structure notes](docs/model-details.md#site-structure).

## Run locally

```bash
npm ci                # once: dev dependencies (KaTeX) for the page generators
node serve.mjs        # landing page: http://localhost:5182
                       # app: http://localhost:5182/sketch/
npm test               # runs the regression suite
```

(Any static file server works; ES modules require http(s), not file://.)

## Feedback and contributing

Use the app, then send your exported `.json` sketch and notes to Luca. The
canvas autosaves in your own browser, so you can't break anything for anyone
else. Contributor guidance is in [AGENTS.md](AGENTS.md); maintainers publishing
a community submission should follow
[docs/community-setup-review.md](docs/community-setup-review.md). The
sanitized Codex conversations behind the major development passes are in the
[work-trace index](docs/codex-sessions/README.md).

## License

OpticalSetup is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

Copyright (C) 2026 Luca Genchi and the OpticalSetup contributors.
