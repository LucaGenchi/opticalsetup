# Research workspace validation — 2026-09-05

The generated reconstructions have been removed. Earlier scene-validation
results describe superseded drafts and are not evidence of accepted setups.

- `npm test`: 774 passed, zero failures. The test specific to the removed
  apparatus scenes was removed; component and research-record tests remain.
- Syntax checks passed for every `sketch/js/*.js`, `serve.mjs`, the service
  worker and the research-page generator. `git diff --check` passed.
- All 151 existing local research files retained their exact SHA-256 hashes,
  including the 18 validated PDFs, extracted text and figure renders.
- `papers.json` and `sources.json` are unchanged from the research commit.
- All 18 research HTML pages contain no scene embeds, share payloads, example
  links, JSON scene downloads or numerical lab presets.
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
