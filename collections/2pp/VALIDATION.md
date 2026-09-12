# 2PP collection validation - 2026-09-05

The rejected batch reconstructions remain removed. This validation covers the
one independently rebuilt apparatus, `nanoscribe-gt`, plus the preserved
research workspace.

- The supplied two-page GT datasheet was rendered and inspected. Its SHA-256 is
  `471bd66e9974798b34f58c4098c8a12450d239d3aeea25838a8da59b60755d6f`,
  matching `sources.json`. The footer reads `DS/GT/V04_2016`.
- `node --test`: 778 passed, zero failures. The environment blocked the
  `npm test` wrapper before execution with a network-approval error;
  `package.json` defines that wrapper as exactly `node --test`, which was run
  directly.
- Syntax checks passed for every `sketch/js/*.js`, `serve.mjs` and
  `sketch/service-worker.js`. `git diff --check` passed.
- The Nanoscribe-specific deterministic test loads and normalizes the native
  scene, checks save/reload equivalence, traces the default route to the resin,
  verifies both moving galvos shift the computed hit, verifies laser-off and
  static-galvo controls, and checks the 300 um / 100 um/s piezo configuration.
- Only `nanoscribe-gt` has a `setup` record. No sibling setup, scene recipe or
  rejected reconstruction was restored.
- The default, static-galvo and laser-off evidence PNGs were generated from the
  app's own SVG export and visually inspected at 1320 x 600. Labels stay inside
  the frame, the path reaches the stage, and the warnings remain readable.
- The cloud browser refused both `localhost:5182` and `127.0.0.1:5182` with
  `ERR_BLOCKED_BY_CLIENT`. Therefore desktop/1024 live browser layout, console
  and overflow checks were not claimed. Reproduce locally with `node serve.mjs`,
  then open `/collections/2pp/nanoscribe-gt/` and the editable setup action.

Dong 2007, Yang 2015 and Yan 2015 still lack full text; Gu still lacks the main
article PDF. Those preserved source-specific gaps are unchanged.
