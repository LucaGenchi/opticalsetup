# Basic 2PP — fresh final review

Reviewer: `final_basic_browser`, independent of scene implementation. Native
review dated 2026-09-13 at local commit
`3d36b98cc555a017c9ae40127dd4b29a5e1d3529` on
`codex/2pp-curated-integration`. Scene SHA-256:
`e5ae4fed83015bf3cf09b84e7980aa904977de4ff7244aa35e29fcb8197c83e3`.

**Native checks pass. Browser acceptance is blocked.** No scene or shared
component code was edited by this reviewer.

## Native evidence

Read the collection style, Basic companion note, scene and integrated tests.
Ran `node --test test/2pp-basic-integrated.test.js test/sample-arrival-detail.test.js`:
**10/10 passed**. These cover both complete scanner-to-pupil relays, every one
of 25 source-aperture probes, source off/zero power, polarization extinction,
actual Z defocus, persistence, inset clearing, finite bounds and export.

Independent additional checks, recorded in
[native-checks.json](evidence/basic-native-checks.json):

- All nine simultaneous combinations of X/Y mechanical angles −0.25°, 0°
  and +0.25° retain all 25 source samples in one physical path and focus
  them to the same sample coordinate. The focus spans −43.638 to +43.638 µm.
- Forty-one native animated exports over one Z cycle retain all 25 samples,
  finite geometry and one physical path. Actual transverse support changes
  from zero to 48.003 µm as the sample moves through focus. The default
  motion stays inside the fixed ±60 µm detail field.
- Source-off and zero-power states remove arrivals; 45° half-wave-plate
  rotation extinguishes the path at the polarizer. Save/parse round-trip
  retains the scene and its traced arrivals in the integrated regression.

Inspected the freshly generated native SVG at 1000 px and at a 500 px
rendered width. The folded beam train, source, two galvos, relays, objective,
resin and fixed-scale arrival detail fit the frame. Component labels and
the short explanatory block are legible, without overlapping labels or
cropped text. See the [500 px native render](evidence/basic-native-500.png)
and [native SVG](../../previews/basic-2pp.svg). These are native export
evidence, **not browser screenshots**.

The introductory claims match the implementation: all choices are
illustrative; both galvos are represented in one meridional section;
the stage really moves the sample; the arrival detail exposes the full
traced support. The scene does not claim calculated voxel dimensions,
polymerization, dose, or a physical 3D raster.

## Browser acceptance — blocked

The coordinator supplied public integrated commit
`ca2e5e2834c0aab48cfccc36d1f32e456e2f550f` (the same code tree as the native
review commit) and granted an exclusive browser slot. The intended target
was that commit's `tools/review-2pp.html?paper=basic-2pp&width=1280` fixture.

Read the control-browser skill and the selected browser's complete API
documentation. The fresh reviewer session bootstrapped successfully to
Chrome / CDP ID 1. Its single `browser.tabs.list()` call failed with the
exact tool error:

> CDP operation refresh tabs timed out after 20000ms

Read the documented interaction troubleshooting. The error did not report
a disconnection; no reset, browser reselection or alternate control mechanism
was attempted. The exclusive slot was released after this failure.

The page could not be inspected. Desktop and near-1024 px editor layout,
live inspector controls, mechanical playback, UI save/reload, console
inspection and browser screenshots are all **unverified**. No browser
screenshot is supplied. Native exports do not close these gates.

## Verdict

Keep on native optical and visual evidence. Final browser acceptance is an
open gate and is not implied by the passing native checks.
