# Somers 2021 — fresh final integrated review

Reviewed 2026-09-13 by the fresh `final_somers_browser` reviewer on
`codex/2pp-curated-integration`, checkpoint
`ca2e5e2834c0aab48cfccc36d1f32e456e2f550f`.
Scene SHA-256: `758fee1bcd408b747730a9e67ccf14d0909821c0c59e8c4c346ce75f1c745a02`.
Only this report was edited by the reviewer.

**Native optics and export-layout review: PASS. Browser acceptance: BLOCKED.**
No optical or native-layout blocker was found. This is not a browser pass:
desktop, approximately 1024 px, UI controls, browser save/reload, console and
real-app screenshots remain separate gates below.

## Independent optical checks

Read the collection style, integrated evidence note, scene JSON and focused
test. Ran `node --test test/2pp-somers-integrated.test.js`: **7/7 passed**.
An additional independent native audit used the actual folded coordinates,
81 source-line positions across the complete 4.5 mm input, monochromatic
pupil probes, direct sample-plane shifts and normalized save/reload.

| Check | Observed result |
| --- | --- |
| DMD field plane to resin conjugacy | Unfolded distances are 300 mm, 302 mm and 2 mm. Independently multiplied matrix is `[−1/150, 0; 0, −150]`; the required field-imaging term B is zero. |
| Full illuminated field | The 81 independent input positions produced 243 admitted spectral hits. Within each field point, the three wavelengths had zero resolved transverse spread. The largest error against the −1/150 field mapping was 5.7 × 10⁻¹⁴ mm. |
| Real aperture location | Objective BFP/stop `(568,420)`, equivalent lens `(570,420)`, resin `(572,420)`; pupil radius 2.98 mm. |
| Spectral acceptance | Approximately 772/828 nm reach pupil heights ±3.893 mm and are blocked. Approximately 786/814 nm reach ±1.947 mm and are admitted with 800 nm. Edge/center field walk was at most 1.2 × 10⁻¹³ mm. |
| Deliberate geometry failure | The focused test's 330 mm L3 destroys spectral coincidence. Reaching the resin holder alone is not used as proof of a focused image. |
| Default image support | 57 actual samples on one physical route, spanning 49.259 µm. The inset includes off-center rays rather than relying on center-only signal markers. |
| Source/polarization controls | Source disabled and zero source power both remove arrivals and CCD signal. HWP 22.5° halves the relative CCD reading, from 0.37643 to 0.18822; HWP 45° extinguishes the writing path. |
| Four discrete frames | Static frames 0–3 give 57, 30, 75 and 24 admitted samples. Outline/ring center rays are OFF while off-center arrivals remain visible. Native playback stays on frame 0 through 1.999 s and advances at 2 s. |
| Separate spectral control | Disabling the carrier preserves the spatial mask support while collapsing the spectral fan. It does not turn the device frame into a wave-field calculation. |
| Physical axial displacement | Direct ±50 µm resin shifts broaden support to 146.587 µm from 49.259 µm at the nominal plane. The sample remains beyond the objective front tip. |
| Persistence | Normalized JSON roundtrip was exact, including frame and inset parameters, and produced identical native arrival/CCD readings. This is not a browser file-action test. |

The supplied focused tests additionally exercise an OFF column, an all-OFF
frame, finite output, termination at the actual resin plane and containment
of every component's visual bounds within the figure.

## Native visual and interpretation review

Generated a fresh SVG through `tools/render-2pp-preview.mjs` into temporary
audit storage and rasterized it at **1520 px and 500 px wide**. Inspected both
images. These are native export inspections, not browser screenshots.

The 760 × 570 figure follows the shared compact bench style: source at upper
left, real folds, writing objective and mounted resin at lower right. The
18-unit labels and 28.8-unit title remain readable at 500 px. Labels,
explanation text and both shared insets fit without clipping or material
overlap. The enlarged DMD frame shows its binary state, frame count and the
orange traced column. The separate arrival inset uses a fixed ±80 µm scale
and displays actual sampled support. The physical DMD aperture stays small;
its inset does not alter ray geometry.

The CCD receives a real incident-light branch and is labeled **CCD incident**.
The evidence note explicitly distinguishes it from reflected-sample imaging.
The πShaper annotation and short note that shaping is untraced are honest.
The scene also states that temporal confinement, dose and curing are not
modeled, and that optional reversing Z motion, frame playback and pulses
are not synchronized. No high-NA PSF or cured voxel is asserted.

The coordinator regenerated the stored preview during this review. Its
SHA-256 is now `471fddd6a0939f9f01706722ef3c0760e71d84bf0740ce9ac4ef6a0a5a49a9dc`,
identical to the fresh export inspected here, including the shared inset's
current readable typography.

## Browser gate

After receiving the exclusive browser slot, this reviewer followed the
`control-browser` skill's normal one-time setup and read its complete browser
guidance. Setup selected **Chrome, CDP, ID 1** successfully. The first
`browser.tabs.list()` attempt failed with the exact error:

> CDP operation refresh tabs timed out after 20000ms

The connection failed before the supplied Somers editor fixture could be
navigated or inspected. This is a browser-service failure, not evidence of
a scene error, site rejection or clean console. The documented troubleshooting
guidance was read; no reset, browser reselection, alternate control mechanism
or repeat loop was used. The exclusive slot was released immediately.
No browser screenshot or browser acceptance pass is claimed.

| Required final browser check | Status |
| --- | --- |
| Desktop native editor, fit and labels | Blocked before navigation |
| Approximately 1024 px editor, toolbar/palette/canvas/inspector overflow | Blocked before navigation |
| Source, DMD frames/carrier and Z controls through the UI | Blocked; native checks above do not substitute |
| Browser save/reload and restored controls | Blocked; JSON roundtrip does not substitute |
| Browser console | Unavailable; no clean-console claim |
| Real native-app screenshots | Not captured |
