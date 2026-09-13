# Gittard 2011 — fresh final review

Reviewer: `final_gittard_browser`, independent of the scene implementation.
Native review dated 2026-09-13 on `codex/2pp-curated-integration`, local
commit `ca2e5e2834c0aab48cfccc36d1f32e456e2f550f`. Reviewed scene SHA-256:
`b10ec1a8f1fb0d3c2332a81fbe3c9c59ed4fb875978fc679ffbe242f0771d9a3`.

**Native optical and visual checks pass. Browser acceptance is blocked by
the browser connection.**
This reviewer changed no scene, shared component, metadata or test code.

## Native optical and interaction evidence

Read the collection style, source-backed companion note, native JSON,
collection control descriptions and integrated regression. Independently ran
`node --test test/2pp-gittard-integrated.test.js`: **6/6 passed**.

| Check | Observed native result |
| --- | --- |
| Full illuminated aperture, 1 / 4 / 8 orders | Each requested order retains all 25 source samples for all nine combinations of X/Y commands −0.2°, 0°, +0.2°. Each support is below 1e−8 mm at the sample. |
| Independent aperture probes | Nine separate line probes across the complete 1 mm input beam each produce every requested order at the same sample coordinate. This is whole-aperture branching, not partitioned lenslet illumination. |
| Both scanner pupils | X-to-Y and Y-to-objective relays satisfy B=C=0. Independent native pivot probes remain centred and accepted at the actual BFP, x=550 mm, with radius 2.8 mm. |
| Fourier selection | The residual zero order reaches its absorber; selected orders pass the offset slit. Carrier −12°→0° produces zero write arrivals. Removing residual zero order removes its dump path and preserves target positions. |
| Source boundary and observation | Disabling the pulsed source or setting its power to zero removes writing. The independent 550 nm CW illumination still reaches the CMOS with relative signal 0.8. Its spot span is below 1e−8 mm. |
| Alignment and persistence | Moving the collimator +5 mm produces broadened supports above 1 µm and clipping. Restored order/scan settings survive exact JSON parse/save round-trip. |

Additional independent native checks used the real animated SVG export
path at 25 times over a 12-second playback cycle. Every frame retained four
writing channels with 25 samples each, plus one separate CW channel. All
writing supports stayed below 1e−5 µm and inside the fixed ±40 µm inset;
the first order moved through 22.348 µm. Exports contained no non-finite
coordinates. This confirms meaningful default mechanical motion in the
native export path, not a browser playback test.

The shared phase-frame control provides four distinct 16×16 frames. Changing
the phase frame leaves the configured geometric order positions and weights
unchanged, matching its explicit display-only semantics. At 0.5 frames/s,
the frame sequence at 0, 1.9, 2, 3.9, 4, 5.9, 6, 7.9 and 8 seconds was
`0, 0, 1, 1, 2, 2, 3, 3, 0`: discrete frame replacement, with no conveyor
translation. The device image and inset share this frame model and the
marked ninth sampled column of sixteen.

## Native layout and claims

Regenerated the native SVG from the current scene and inspected rasterized
versions at 1520 px and 500 px wide. The short title, source train, Fourier
selection, both galvos, pupil relay, writing objective, mounted resin and
independent green observation path fit the 760×570 frame. Component labels,
phase-frame inset, actual-arrival inset and concise model limits remain
readable at 500 px. The Resin label clears the CMOS. No default beam escapes
the frame. The existing [native SVG](../../previews/gittard-2011.svg) is
export evidence, **not a browser screenshot**.

The scene distinguishes four representative in-plane rows from the paper's
4×4 Venus experiment. The arrival inset correctly reports five physical
paths at default, with the companion caption identifying the extra CW
illumination channel. At eight writing orders it reports omitted paths
instead of merging them to fit the display. The objective's reported NA 1.40
is a rating; the companion note explicitly states the approximately 3.96 mm
illumination underfills the 5.6 mm pupil. The phase pixels are illustrative;
the separate angular-order settings do not purport to solve a CGH.

Reported specifications, the pulse-width bound, inferred geometry and the
qualitative LC attenuation are distinguished in the companion note. The
scene does not claim calculated 3D fields, PSFs, voxel dimensions, curing,
diffraction efficiency or calibrated throughput. No blocking native issue
was found.

## Browser acceptance

The coordinator provided public integration commit
`ca2e5e2834c0aab48cfccc36d1f32e456e2f550f` and an exclusive browser slot.
The intended target was its `tools/review-2pp.html` fixture with
`paper=gittard-2011&width=1280`, followed by the 1024 px setting.

Fresh control-browser bootstrap selected **Chrome, CDP ID 1** and returned
its documentation. The first browser connection attempt,
`browser.tabs.list()`, failed with the exact error:

> CDP operation refresh tabs timed out after 20000ms

The reviewer read the prescribed connection troubleshooting guidance and
stopped. No reset, alternate browser backend or source-code substitute was
used. The target page was not reached, so this is a browser-service failure,
not evidence of a scene or site failure.

| Required live check | Status |
| --- | --- |
| Desktop editor, toolbar, palette, canvas and inspector fit | Blocked before navigation |
| Approximately 1024 px editor layout and labels | Blocked before navigation |
| Source, 1 / 4 / 8 orders, scanner and Fourier-selection UI controls | Blocked; native equivalents passed above |
| Mechanical and discrete-frame playback in the editor | Blocked; native export/frame checks passed above |
| UI save/reload | Blocked; native JSON round-trip passed above |
| Browser console | Unread; no clean-console claim |
| Browser screenshots | None captured |

## Verdict

Keep on native optical and visual evidence. Final browser acceptance is an
open gate and must be rerun when the connection works; it is not implied by
the passing native checks.
