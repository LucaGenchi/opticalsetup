# OpticalSetup agent guide

## Purpose

OpticalSetup is a dependency-light, browser-based 2D optical workbench (the
app lives under `sketch/`; the repo root is a static marketing/SEO landing
page that links into it). Preserve the app's fast local workflow and keep the
UI honest about the difference between simulated, setup-dependent, and
diagram-only components.

## Start every task

1. Read `README.md` and this file.
2. Run `git status --short --branch` before editing. Existing changes belong to
   the user; do not discard or overwrite them.
3. Inspect the relevant implementation and tests with `rg`/`rg --files`.
4. Work on a focused branch named `codex/<short-topic>`; do not commit directly
   to `main`.

## Project map

- `index.html` — static marketing/SEO landing page at the site root (no app
  dependency; links to `/sketch/`).
- `robots.txt`, `sitemap.xml` — SEO plumbing for the landing page.
- `CNAME` — GitHub Pages custom domain (opticalsetup.com). Do not remove.
- `sketch/index.html` — the app shell and toolbar structure.
- `sketch/css/style.css` — complete responsive UI styling.
- `sketch/js/elements.js` — component registry, defaults, SVG geometry,
  optical surfaces, sources, and capability metadata.
- `sketch/js/raytrace.js` — ray propagation, interactions, detector readings,
  and generated drawables.
- `sketch/js/canvas.js` — canvas rendering and direct manipulation.
- `sketch/js/inspector.js` — selected-component controls and measurements.
- `sketch/js/main.js` — palette, search, file actions, examples, and app
  wiring.
- `sketch/js/state.js` — scene state, normalization, undo/redo, and
  persistence.
- `sketch/js/export.js` — SVG/PNG generation and fitted bounds.
- `sketch/js/examples.js` — built-in optical layouts.
- `sketch/js/share.js` — self-contained share links (`#sketch=` fragment).
- `test/` — dependency-free Node regression tests (import from `../sketch/js/`).
- `serve.mjs` — local static server on port 5182, serving both the landing
  page and `sketch/` from the repo root.

## Development commands

```bash
node serve.mjs       # http://localhost:5182 (landing) and /sketch/ (app)
npm test             # full regression suite
git diff --check     # whitespace and patch sanity
```

Before handing off JavaScript changes, also run:

```bash
for file in sketch/js/*.js serve.mjs; do node --check "$file"; done
```

For UI work, verify the affected interactions in a real browser at a desktop
width and near 1024 px. Check the browser console for errors and confirm that
the toolbar, palette, canvas, and inspector do not overflow.

## Engineering rules

- Keep the app build-free and avoid dependencies unless the user explicitly
  approves one.
- Use the component registry as the source of truth; do not duplicate component
  labels, defaults, or capability logic in the UI.
- Treat optical behavior as qualitative unless it is explicitly calibrated.
  UI copy and README claims must match what the tracer actually implements.
- Any new surface kind or physics behavior needs a deterministic regression test
  covering normal behavior and at least one boundary or failure case.
- Never allow non-finite coordinates, directions, intensity, or power into
  rendering/export code. Clamp user-controlled numerical inputs at their schema
  boundary.
- Diagram-only elements must not silently absorb or redirect rays.
- Normalize malformed sketches instead of assuming all fields are present.
- **A saved setup must keep opening.** A scene saved or shared today is
  expected to open and behave in a later version, either because the format
  stayed compatible or because the app converts it on load. Conversions that
  were explicitly approved stay: the pulsed-laser source controls (#148) and
  the argon fiber opening without `lossModel` at its computed loss (#143).
  Never delete or weaken an existing conversion to satisfy a policy sentence.
  A change that cannot stay compatible needs the scene version raised, a
  conversion on load, or — where the old scene genuinely cannot be
  reproduced — a clear "unsupported version" message naming what is missing,
  never a silent wrong result. Say in the PR description which of these a
  format change uses.
- Keep visual hierarchy workbench-like: the canvas is primary, wavelength color
  communicates optical energy, and controls should explain their current mode.
- Do not add advanced physics merely to make a component look functional. A
  clear capability note is preferable to misleading behavior.

## License

OpticalSetup is free software under the GNU General Public License,
version 3 or (at your option) any later version; see `LICENSE`. Every
contribution is accepted under the same terms. Do not add code or content
under a license that is incompatible with the GPL.

## Git and delivery

- `origin` is `https://github.com/LucaGenchi/opticalsetup.git`.
- Keep commits focused and describe behavior, not implementation trivia.
- Run the full verification above before committing or opening a PR.
- In PR descriptions, state user-visible behavior, physics limitations, and the
  exact checks performed.
- Do not push, open a PR, merge, or email anyone unless the user requests that
  delivery action.
