# Integration review

**Six native scenes are implemented; live-browser acceptance remains open.**
The final code passes **1,090/1,090 tests**. Six fresh reviewers independently
checked the integrated native optics, controls, persistence and exports.
Browser connection timeouts prevent the required live UI checks and final
browser screenshots. This document does not treat SVG exports as screenshots.

## Scope and history

The branch is `codex/2pp-curated-integration`, based on main
`3242a2fe6a84ca155b9f97b4b399ecc24666c0b4` and the shared foundation from
PR #108 head `9a4a967bb8dafa811f5bbc87092b9d21ecaea9bc`.
[Luca's latest review](https://github.com/LucaGenchi/opticalsetup/pull/108#issuecomment-5647623099)
and the exact heads of #125–135 took precedence over older PR descriptions.
The [source-head record](reviews/source-heads.json) preserves those inputs.
No original paper branch or main was changed.

The active collection is Basic 2PP plus Fischer, Gittard, Somers, Ouyang and
Gu. The builder and collection tests require exactly these six authored
setups. GT and every rejected native scene/public setup page are removed.
Useful excluded literature is [research-only](index.html), with no native
setup. [Selection](selection.md) records all eight original-review scores,
mechanism comparisons and exclusions.

## Shared behavior

- Both scanning pivots must satisfy the same [pupil criterion](scan-relay-criterion.md),
  including the actual BFP, beam apertures and full-bundle focus. The equivalent
  objective pupil is no longer clamped to its cosmetic barrel. Finite pupil
  and bore boundaries stop unfocused escape routes.
- One [programmable-mask contract](../../../docs/programmable-masks.md) serves
  DMD and SLM: a current 2D grid, discrete frame playback, a highlighted sampled
  column and separately configured geometric orders/spectral effects. Optional
  upright frame insets use those same pixels; they never alter optical size.
- Physical output ports preserve distinct arrival groups. Equal per-input
  weak-ray budgets prevent early source samples from starving later samples.
  AOM/AOD paths at 1% duty keep their real power, without rescaling survivors.
- Chopper drawing and transmission agree at 1–99% duty. The diffractive-splitter
  description now matches redistribution among propagating orders.
- [Arrival insets](../../../docs/sample-arrival-detail.md) show actual sample
  positions and full traced support on a fixed micrometer axis. There is no
  invented sharp centroid, PSF, exposure or cured voxel.

The central-pupil phase plate converts area fraction to meridional diameter.
Optional per-element labels and inset typography remain saved native values.
Legacy sketches keep their parameter values; corrected objective acceptance
and migrated mask semantics are explicitly documented in the shared review.

## Native evidence

| Scene and fresh review | Main independent result |
| --- | --- |
| [Basic](final-reviews/basic-2pp.md) | All 25 source samples survive nine combined scan settings and 41 animated snapshots. Focus movement and Z-induced support are visible on the fixed ±60 µm axis. |
| [Fischer](final-reviews/fischer-2011.md) | Both complete beams image the phase zone onto the true BFP and focus together. Dense pupil/overfill probes and 12 duty/display/source combinations preserve correct acceptance and power. |
| [Gittard](final-reviews/gittard-2011.md) | 1/4/8 orders retain 25 aperture samples per route across both scanner controls. Fourier selection, pupil conjugacy and independent CW observation are causal. |
| [Somers](final-reviews/somers-2021.md) | An independent 81-field sweep produces 243 admitted samples with zero spectral spread at each image point. Four discrete frames and ±50 µm defocus change actual support. |
| [Ouyang](final-reviews/ouyang-2023.md) | All 1–8 orders at −1°, 0° and +1° steering pass a 25-probe full-aperture sweep. The pupil stays centered and finite apertures/filter changes behave correctly. The view is explicitly 800 nm only. |
| [Gu](final-reviews/gu-2025.md) | Default/uniform/dark patterns select 6/7/0 channels; single-region selection follows relay inversion. Window-compensated field imaging and lenslet defocus are verified. |

The fresh reviewers inspected large exports and approximately 500 px native
renders, representing the fitted scene width in the narrow editor. They found
and verified corrections to Fischer's combiner/provenance wording, Gu's array
label/provenance key and Ouyang's annotation density. The coordinator also
cleared Gittard's camera/annotation overlap. These are native layout checks;
the actual 1024 px toolbar, palette and inspector remain unverified.

## Exact checks

The final code run completed on 2026-09-13:

```text
npm test
tests 1090; pass 1090; fail 0; cancelled 0; skipped 0; todo 0
duration 14398.815989 ms
```

All `sketch/js/*.js`, `serve.mjs`, the three changed collection/sitemap
builders and `tools/render-2pp-preview.mjs` passed `node --check`.
`git diff --check` passed. The three builders completed successfully with six
authored scenes, eleven research-only records and ninety sitemap URLs.
All six native SVG previews were regenerated using the current exporter.

Meaningful regression coverage includes both independent scanner pivots,
full beam support and finite objective boundaries, mask migration and bounded
frames, discrete playback, spectral/GDD retention, port grouping, weak-ray
budgets, 1/3/99% duty, phase-zone bounds, source-off/zero-power, defocus,
serialization, inspector rebuilding and native export bounds.

## Browser gate

The original eleven reviewers used the current paper heads. Original browser
work stalled partway through; the reports mark personal controls, console and
narrow-view checks that were not completed. Historical screenshots from
[Fischer](reviews/evidence/fischer-original-desktop.jpg),
[Gittard](reviews/evidence/gittard-original-desktop.jpg) and
[Pearre](reviews/evidence/pearre-original-1024.jpg) are original-scene evidence
only. They do not show these integrated reconstructions.

Fresh final browser attempts are serialized to avoid contention. Five fresh
sessions so far bootstrapped Chrome/CDP successfully, then their first tab-list
operation failed with:

```text
CDP operation refresh tabs timed out after 20000ms
```

The Ouyang final connection attempt is pending the final code checkpoint.
No final integrated page was reached by the five completed attempts. No
browser screenshot, console-clean claim or browser persistence pass is made.
The documented troubleshooting did not expose a permitted recovery beyond
the attempted connections; no alternate browser-control mechanism was used.

Remaining acceptance work is the same for each of the final six scenes:
desktop and 1024 px layout, live inspector controls and animation, browser
save/reload, console inspection and screenshots. Use the committed
`tools/review-2pp.html` fixture on the integrated head. The draft remains open
for those checks; native acceptance does not close this gate.
