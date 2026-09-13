# Two-photon polymerization collection

Six editable native scenes form one educational collection:

| Scene | Lesson |
| --- | --- |
| [Basic 2PP](basic-2pp/) | A paper-independent serial writer with two pupil-conjugate galvos and a Z stage. |
| [Fischer 2011](fischer-2011/) | Excitation and a centrally phase-shaped depletion beam share an objective. |
| [Gittard 2011](gittard-2011/) | SLM multifocus orders followed by pupil-conjugate scanning. |
| [Somers 2021](somers-2021/) | Discrete DMD slice projection and sampled wavelength recombination. |
| [Ouyang 2023](ouyang-2023/) | Binary holographic multifocus, represented by separate geometric orders. |
| [Gu 2025](gu-2025/) | An intensity image selects independently focusing metalenses. |

The common [style](STYLE.md) distinguishes reported values from design
choices. Every scene has source, mechanism and geometry/pattern experiments.
The geometric model does not calculate a high-NA field, hologram, calibrated
voxel, dose or curing. A fixed-scale inset shows actual sampled ray arrivals.

## Evidence and architecture

- [Selection and exclusions](research/selection.md): eleven original branch
  reviews, all eight scores, and the reasons for retaining exactly five papers.
- [Shared review](research/shared-review.md): current-head conflict decisions,
  objective aperture corrections, power budgets and model limits.
- [Scanner criterion](research/scan-relay-criterion.md): separate X/Y pivot
  conjugacy, BFP illumination and native focus tests.
- [Programmable masks](../../docs/programmable-masks.md): one DMD/SLM 2D frame
  contract, discrete playback, sampled column and separate optical effects.
- [Actual-arrival detail](../../docs/sample-arrival-detail.md): the fixed
  micrometer display is sampled geometric support, never a computed PSF.
- [Research-only archive](research/): excluded literature has no native setup.
  Commercial GT is removed as a collection entry; its original audit remains
  only in the exclusion evidence.

`papers.json` contains Basic plus five paper records. `sources.json` contains
only their primary-source provenance, including URLs, hashes and page counts.
The complete OSTI author manuscript establishes Gu's 35 fs source duration.
`research/archive.json` preserves useful excluded literature separately.
Source PDFs and publisher figures are not committed.

Original reviews are historical observations of exact unmodified branch
heads. Integrated evidence notes describe the reworked scenes. Browser
acceptance remains pending where explicitly stated; native SVG inspection is
not substituted for real-browser screenshots.

## Rebuild and verify

```sh
node tools/build-2pp-collection.mjs
node tools/build-collections-index.mjs
node tools/build-sitemap.mjs
npm test
for file in sketch/js/*.js serve.mjs; do node --check "$file"; done
git diff --check
```

The collection builder requires Basic plus exactly five authored paper scenes.
`node tools/render-2pp-preview.mjs basic-2pp` exports a native SVG for layout
inspection. `tools/review-2pp.html` loads the real editable app at 1280 or
1024 px, with original heads pinned for reproducible historical reviews.
Final acceptance also requires live controls, save/reload and console checks
on all six integrated scenes.
