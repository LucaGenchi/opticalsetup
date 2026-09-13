# Six-scene collection decision

The collection contains the new **Basic two-photon polymerization** scene and
exactly five paper architectures: **Fischer 2011, Gittard 2011, Somers 2021,
Ouyang 2023 and Gu 2025**. This agrees with the proposed shortlist after
testing it against eleven independent current-branch source/native reviews.
It is not an endorsement of the original scene geometry.

Selection uses source completeness, native full-beam behavior and mechanism
diversity. Real-browser acceptance is still an open gate: the shared browser
connection stalled during the original reviews. The reports distinguish
completed source/native work, any actual browser observations, and missing
desktop/narrow/control/console evidence. Native SVGs are not screenshots.

## Original-branch scores

Scores are 0–5. Higher is better in the first six columns. Higher
**interpretation** and **maintenance** scores mean more burden, not merit.
Do not sum these unlike criteria into a misleading rank. Visual scores are
provisional where a report records incomplete browser inspection.

| Current-head review | Source | Train | Distinct | 2D fit | Education | Visual | Interpretation | Maintenance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Dong 2007](reviews/dong-2007.md) | 1 | 1 | 3 | 4 | 3 | 3 | 5 | 2 |
| [Fischer 2011](reviews/fischer-2011.md) | 4 | 3 | 5 | 2 | 3 | 2 | 4 | 2 |
| [Gittard 2011](reviews/gittard-2011.md) | 5 | 2 | 5 | 3 | 3 | 2 | 4 | 4 |
| [Gu 2025](reviews/gu-2025.md) | 5 | 4 | 5 | 4 | 4 | 2 | 4 | 3 |
| [Kiefer 2024](reviews/kiefer-2024.md) | 4 | 3 | 4 | 3 | 2 | 2 | 4 | 3 |
| [Nanoscribe GT](reviews/nanoscribe-gt.md) | 2 | 2 | 1 | 3 | 3 | 3 | 5 | 2 |
| [Ouyang 2023](reviews/ouyang-2023.md) | 5 | 3 | 5 | 3 | 4 | 2 | 4 | 4 |
| [Pearre 2018](reviews/pearre-2018.md) | 4 | 2 | 2 | 3 | 3 | 2 | 4 | 2 |
| [Saha 2019](reviews/saha-2019.md) | 3 | 3 | 3 | 2 | 3 | 3 | 4 | 3 |
| [Somers 2021](reviews/somers-2021.md) | 5 | 4 | 3 | 3 | 3 | 2 | 3 | 4 |
| [Yan 2015](reviews/yan-2015.md) | 1 | 2 | 2 | 3 | 3 | 2 | 5 | 2 |

Each linked report records its exact PR head and source references. The
integrated evidence notes describe the subsequent reconstruction; original
reviews remain historical observations of unmodified branches.

## Retained after rework

| Paper | Distinct lesson | Required correction and limit |
| --- | --- | --- |
| Fischer | Excitation plus a centrally phase-shaped depletion beam share an objective. | Image the mask onto the true BFP; convert reported pupil area to meridional diameter. Phase changes optical path only. No depletion chemistry or vectorial focus is calculated. |
| Gittard | A reflective SLM configures multiple focus orders and the galvos translate them. | Replace unintended focus-grid curvature, establish both scanner conjugacies, select orders in a real Fourier plane and check the complete beam. The visible phase frame is not a solved CGH. |
| Somers | Changing DMD image slices project onto a sample image plane. | Replace moving stripes with discrete 2D frames; verify image conjugacy across the illuminated field and sampled wavelengths. No temporal confinement or curing is calculated. |
| Ouyang | Binary holographic orders illustrate random-access multifocus writing. | Correct pupil illumination and the actual tilted device reference plane. Explicitly limit any central-wavelength view rather than claiming unmodeled broadband compensation. No hologram optimization or single-pulse initiation is calculated. |
| Gu | An intensity image selects independent metalenses; the array makes the foci. | Preserve image conjugacy through the vacuum windows, expose actual full-beam support, and state the independent dimensional enlargement. The observation objective is not a writing optic. No metalens electromagnetic field is calculated. |

Basic supplies the missing canonical serial lesson with independently
pupil-conjugate X and Y scanners, a Z stage and qualitative ray arrivals.
All its values are educational design choices.

## Excluded original scenes

| Scene | Decision and evidence |
| --- | --- |
| Nanoscribe GT | Removed by explicit collection requirement. The retrieved product sheet does not disclose the internal prescription and is not evidence for an earlier instrument configuration. No public scene, collection entry or source card remains. Its original audit is retained only as decision evidence. |
| Pearre | Redundant with Basic for this compact collection. The original X relay walked the pupil by about 0.695 mm over the reviewed range; full beams also exposed sample defocus and objective bypass. Resonant address timing would need a further model to supply its distinctive lesson. |
| Kiefer | Strong reserve, excluded in favor of Gu. The original approximately 11.4 mm beam footprint crosses several 2.57 mm lenslet pitches; complete bundles do not reproduce the sharp central markers. A major DOE/MLA rebuild would be needed. Gu provides a clearer independent-array selection lesson. |
| Saha | Overlaps Somers. The full illuminated field in the original tilted-mask reconstruction did not share one image plane, and low-duty sampling hid light. Somers has stronger apparatus/observation evidence and a cleaner discrete projection demonstration. |
| Dong | Full apparatus evidence remains unavailable. Source parameters, lens prescriptions and the native train were invented. Correctly focusing generic lenslets alone cannot establish a paper reconstruction. |
| Yan | Accessible previews support the multifocus mechanism but not fabrication source parameters or a complete prescription. The 633 nm light is for characterization. The original order dump also intercepted desired beam bundles. Gittard has stronger apparatus evidence. |

## Other research-only records

Buckmann, Yang, Geng, Hahn, Jiao and Zhang were literature records, not among
the eleven authored branch candidates. They receive no native setup in this
six-scene collection. Their specific exclusions are recorded in
[the research index](index.html) and [archive metadata](archive.json):
undisclosed commercial optics, incomplete source access, redundant mechanism,
specialized compensation without a native prescription, or coherent/acoustic
behavior outside this geometric model. Retention of a research note is not
a promise of a later scene.

The old paper branches and PRs are unchanged. Consolidation occurs only on
`codex/2pp-curated-integration`; no merge to main is authorized.
