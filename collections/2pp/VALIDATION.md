# Collection validation — 2026-09-05

- `npm test`: 775 tests passed, zero failed.
- JavaScript syntax checks passed for every `sketch/js/*.js`, `serve.mjs`, the
  service worker, new 2PP tools, and the sitemap generator.
- `git diff --check` passed.
- All 18 downloaded source PDFs matched the reviewed SHA-256 manifest.
- All 15 apparatus files loaded and survived save/parse round trips. Their
  sources emitted no traced rays; dashed paths remained manual annotations.
- All 14 partial presets passed against the actual companion destination parser.
- Desktop browser inspection covered the Kiefer editable drawing and inspector.
  Changing its microlens focal length from 40 to 55 mm worked; undo restored 40.
- At 1024 pixels, the toolbar, palette, canvas, inspector, landing navigation,
  collection table and Gu page stayed within the viewport. The three array
  teaching models displayed traced rays. No browser console warnings or errors
  were observed in these checks.
- The companion site's seven import tests passed. Its full production build
  could not run on this Mac: the existing build script requires GNU `timeout`.
  The companion PR's Linux CI must establish full application validation.

These checks establish file, interaction and limited model behavior. They do
not validate complete experimental optical prescriptions or material response.
Dong, Yang and Yan full texts, Gu's main PDF and the other source-specific
unknowns in `papers.json` remain unresolved.
