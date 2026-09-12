# Research workspace validation — 2026-09-05

The earlier batch-generated reconstructions have been removed. Earlier
scene-validation results describe superseded drafts and are not evidence of
accepted setups. New individual setup work records its own checks.

- `npm test`: 774 passed, zero failures. The test specific to the removed
  apparatus scenes was removed; component and research-record tests remain.
- Syntax checks passed for every `sketch/js/*.js`, `serve.mjs`, the service
  worker and the research-page generator. `git diff --check` passed.
- All 151 existing local research files retained their exact SHA-256 hashes,
  including the 18 validated PDFs, extracted text and figure renders.
- `papers.json` and `sources.json` are unchanged from the research commit.
- Research pages contain scene embeds, JSON downloads or paper handoffs only
  for individually reconstructed setups present under `collections/2pp/setups/`.
- The generated 2PP Examples directory, scene manifest and layout recipes are
  absent. The existing nine examples remain in the application manifest.
- Browser inspection verified the preserved Fischer notes at desktop width
  and all 17 references at 1024 pixels, with no horizontal overflow, setup
  controls, or browser console warnings/errors.

The local research directory now also has an index and one Markdown dossier per
reference for future individually assigned work. The records are working notes
that must be checked against primary documents before any new reconstruction.
Dong, Yang and Yan full texts, Gu's main PDF and the source-specific unknowns
in `papers.json` remain unresolved.

## Kiefer 2024 individual reconstruction

- Primary PDF identity, SHA-256 and pages 3–5 were rechecked; Fig. 2 was rendered
  and visually inspected before authoring the scene.
- `node --test`: 778 passed, zero failures, including four Kiefer-specific tests
  for both traced paths, save/reload equivalence, source/DOE/MLA controls, moving
  galvos and paper-handoff units.
- Syntax checks passed for every `sketch/js/*.js`, `serve.mjs` and both changed
  collection builders; `git diff --check` passed.
- The native exporter produced deterministic default, DOE-order-0 and weak-MLA
  SVG evidence from the actual scene.
- Live cloud-browser verification was attempted at desktop width, but this
  environment rejected both loopback host forms with `ERR_BLOCKED_BY_CLIENT`.
  No browser screenshot or 1024 px claim is made. Reproduce with
  `node serve.mjs`, then open `/collections/2pp/kiefer-2024/` and
  `/sketch/?paper=kiefer-2024` at desktop and 1024 px widths.
