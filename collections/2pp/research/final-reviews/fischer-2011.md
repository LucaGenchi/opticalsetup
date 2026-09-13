# Fischer 2011 — fresh integrated review

Reviewer: `final_fischer_browser`, independent of the original branch review and
scene rework. Date: 2026-09-13. Review branch:
`codex/2pp-curated-integration`; initial local checkpoint:
`3d36b98cc555a017c9ae40127dd4b29a5e1d3529`, whose exact tree was published as
`ca2e5e2834c0aab48cfccc36d1f32e456e2f550f`. Initial native scene SHA-256:
`3291c0cf4388d7c15140cbfc121545c546d1cd31ba2738f8162954909bd97b2b`.
After the two text-only review fixes below, the scene SHA-256 is
`f919f1310a4041787a6116b635e9299b547151b8b95640977cff66f7f32015c8`.
Optical parameters and geometry are unchanged.

**Result: native optical behavior and exported layout pass; live-browser
acceptance is blocked by the browser connection.** Both provenance wording
findings were corrected and rechecked.

## Scope and evidence

Read `AGENTS.md`, `README.md`, the collection's `STYLE.md`, the complete
[apparatus evidence note](../fischer-2011.md), the native scene and its focused
integrated test. Inspected the shared phase-zone implementation and actual
sample-arrival collector. No scene or shared code was edited by this reviewer.

`node --test test/2pp-fischer-integrated.test.js`: **7/7 pass**. A fresh native
SVG export was independently rasterized and inspected at 720 px and 500 px
width. These are native export checks, not screenshots of the editor or proof
of its responsive layout.

## Independent optical and control checks

| Check | Observed result |
| --- | --- |
| Entire 5.6 mm aperture, each source separately | 41/41 independent line probes, including both edges, arrive at `(629, 310)` through the NA 1.4 objective. Sampled focal span is zero within numerical precision. |
| Deliberate 8.4 mm overfill, each source separately | 27/41 probes arrive; the 14 out-of-pupil probes are rejected. Surviving arrivals still cross the objective and meet at the nominal sample. |
| Pupil relay | The full mask → L1 → L2 → actual BFP matrix is `[-1, 0; 0, -1]`. Stop and BFP coincide at `(625, 310)`; neither is a clamped barrel proxy. |
| Excitation off and excitation zero power | CW illumination remains; pulsed writing arrivals disappear. |
| Depletion off and depletion zero power | The excitation path and its single pulsed writing channel remain. |
| Both sources off | The focused regression verifies no sample or writing arrivals and an empty detail view. |
| AOM duty 1%, 3%, 99% | Independently checked both line and sized-beam modes with each chopped-display setting. The excitation pulse gate retains the exact duty and 4 kHz rate; CW relative intensity after the shared relay is exactly 0.01, 0.03 or 0.99. Display style does not change transmission. |
| Central pupil area 0, 0.25, 0.5, 1 | Diameter fractions are respectively 0, 0.5, `sqrt(0.5)` and 1. Zero and full zones have no differential phase; intermediate zones have the step. Both geometric focal positions remain unchanged. |
| OPD off / oversized uniform zone | The focused regression verifies zero differential readout and unchanged geometric arrivals. No inhibition field or shrinking voxel is synthesized. |
| Transverse stage scan | The focused regression verifies actual sample-coordinate arrivals at +50, 0 and −50 µm and a static-mode stop. Inferred 0.1 mm triangle travel at 0.5 Hz gives the reported 100 µm/s between reversals. |
| Axial displacement | A 0.05 mm offset retains the sampled 140 µm support in each color, rather than replacing it with a sharp centroid marker. |
| Save/reload | In addition to the default round trip, independently changed the two AOM duties to 99% and 1%, central area to 0.25, OPD to 0.133 µm and the stage to static. Native JSON serialization and parsing preserve the full modified state and signal hits exactly. This does not exercise the browser file controls. |

Both default full-beam channels retain 25 spatial samples in the arrival
inset. The CW channel is illumination, not a second pulsed writing focus.
Finite sampled coordinates and termination at the intended resin plane are
covered by the focused test. Polarization checks find circular polarization
for both input colors after their respective quarter-wave plates.

## Native visual inspection

The 720 × 540 frame is compact and follows the common source-to-sample reading
order. Its two real beam colors, folded excitation path, common relay and
mounted resin are distinguishable. Text remains readable in the 500 px
raster, with no cut-off title, overlapping component labels or escaping
post-sample fan. The small physical phase plate is identified by the `π pupil`
label; its numerical area and phase controls require the inspector. The
fixed ±60 µm inset displays two actual arrival channels without implying a
calculated voxel diameter.

The scene and companion note explicitly limit the model to geometric paths,
polarization, phase steps and arrivals. They disclaim vectorial PSFs,
stimulated-emission depletion, chemical kinetics, curing and voxel sizes.
The default source timing and powers are qualified as illustrative or proxy
settings, and the configured-value handoff is disabled.

## Resolved wording findings

1. The evidence table initially described the interpreted combiner as
   **long-pass**, although the native component correctly implements a
   **short-pass** combiner transmitting 532 nm and reflecting 810 nm. The
   integration author corrected the table; this reviewer verified the text.
2. The abbreviated design-choice key initially used an ambiguous generic
   “timing” qualifier. The integration author replaced it with the collection's
   full “Design choice = free interpretation; not specified in the paper”
   definition. This reviewer rerendered the changed scene and inspected the
   500 px raster: the full key is readable and remains within the frame.

## Live-browser acceptance

This reviewer received an exclusive browser slot and followed the
`control-browser` skill. One fresh documented bootstrap selected Chrome,
CDP browser ID 1, and returned its complete guidance. The first tab-discovery
call, `browser.tabs.list()`, failed with this exact error:

```text
CDP operation refresh tabs timed out after 20000ms
```

The intended review target was the fixture at published checkpoint
`ca2e5e2834c0aab48cfccc36d1f32e456e2f550f`,
`tools/review-2pp.html?paper=fischer-2011&width=1280`. No tab was obtained and
that target was not navigated or inspected. The documented troubleshooting
guidance was read; no reset, browser reselection, alternate control mechanism
or repeated connection attempt was used. The slot was released to the next
reviewer.

The following therefore remain **blocked, not passed**: desktop and
approximately 1024 px editor fit; toolbar, palette and inspector overflow;
clicking the actual controls and observing animation; browser save/reload;
console errors; and browser screenshots. No browser screenshot was produced.
This connection failure does not establish an application defect. Native
tests and raster exports above do not satisfy these outstanding checks.
