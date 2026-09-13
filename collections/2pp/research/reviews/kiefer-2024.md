# Kiefer 2024 — original PR #126 review

Reviewed **`72f0323d38ff8afa3e375e87e861c262b1399456`** on 2026-09-13. The original worktree was clean and remained unchanged. This evaluates the original scene, not the shared integration or promised rework.

**Material finding:** both scanner relays are conjugate, but the full input beam does not implement one DOE beamlet per lenslet. The seven default writing markers count representative rays, not seven verified focused bundles. This is the main selection concern.

## Primary evidence and optical train

Read the branch evidence note, scene, relevant native components and tests. Reopened the publisher's [article](https://www.light-am.com/article/doi/10.37188/lam.2024.003) and [14-page PDF](https://www.light-am.com/article/pdf/preview/LAM2023080053.pdf); SHA-256 matches the note: `55ac959947738f905ce52252e777686ac17609a303a6a75f167769ce4350be02`. Visually inspected Fig. 2 on PDF p. 4, Fig. 3 on p. 6, and the prescription discussion on p. 5.

| Evidence | Original-scene assessment |
| --- | --- |
| PDF p. 4, Fig. 2a: Chameleon → L1/L2 → AOM first order → L3/L4 → DOE → L5/L6 → L7 → MLA → LG1 → GX → LG2/LG3 → GY → LG4/LG5 → objective/sample. | Functional order preserved, including AOM zero-order dump, two separate galvos and a real observation branch. Packaging folds, collection lens and isolation filters are disclosed interpretations. |
| PDF pp. 3–4: low-dispersion DOE supplies 7×7 beamlets; separate refractive MLA increases effective separation from M=3 to about 300. | Correctly distinguished from an SLM and from a stronger DOE alone. Native splitter plus paraxial lenslets cannot calculate this improvement or its PSF advantage. |
| PDF p. 5: MLA R=4.64 mm, K=17.50; pupil diameter 11.55 mm. Fig. 2b–c shows custom multielement LG1/LG5. | These are not recovered prescriptions. The branch's ideal f=15 mm lenslets and equivalent scan groups are design choices; the evidence note should retain the reported partial MLA prescription. |
| PDF pp. 4–5: 790 nm, 80 MHz, 140 fs sech², 3.7 W source; 954 mW total and estimated 19.5 mW/focus before a 70%-transmitting 40×/NA1.4 oil objective. | Power planes are correctly separated in the notes. Positive source power is metadata, not calibrated ray weight or curing power. Handoff correctly omits the out-of-range 3700 mW source value. |

The native objective has EFL 5 mm, WD 0.19 mm, BFP/stop x=611.19, equivalent plane x=616.19 and nominal focus x=621.19. The resin is at x=621.20: a **0.01 mm axial offset**. The reported 11.55 mm pupil value appears as `frontAperture`, while the native rated pupil is **14 mm = 2·EFL·NA**. Thus the 40× label identifies the reported objective; pupil size, magnification and focus spacing are not a calibrated reconstruction. The seven-marker span of 0.875 mm also does not reproduce six 60 µm intervals. The plain resin sample is not a mounted stage, contrary to the collection style.

## Native verification

`node --test test/kiefer-2024-setup.test.js test/2pp-array-elements.test.js test/2pp-voxel-preview.test.js`: **27/27 passed**. Native load/save/reload was equal and every tested trace had finite coordinates.

| Control/check | Measured original result |
| --- | --- |
| Default | Seven writing references; span 0.875184 mm; every reference carries NA1.4 objective-path metadata. LED camera signal 0.00336927 relative units. |
| Source off / exactly 0 W | Zero writing arrivals; camera signal unchanged. |
| Source 3.7 → 1.85 W | Seven arrivals, identical coordinates and normalized weights. This is not a dose control. |
| DOE orders → `0` | One **writing reference**. Full-beam support remains spread across several lenslets; do not describe this as proof of one focus. |
| MLA f=15 → 3000 mm | Seven references; span 0.815351 mm, only 6.8% smaller. The paper's central separation advantage is weakly expressed. |
| Weak MLA plus DOE lines=100 | Four references survive, demonstrating finite-aperture clipping. |
| GX and GY independently ±0.2° mechanical | Full scene retains seven references and moves the row. Both act in the same meridional plane; this is not an independent XY raster. |

Re-ran `tools/audit-2pp-relays.mjs` against the original modules. GX→GY has 52.5/52.5 mm focal lengths and correct focal-plane distances. GY→BFP has 68.531667/137.063333 mm focal lengths and correct distances. **Both B≈0 and C≈0 pass.** At each ±0.2° command, nine independent rays spanning 2 mm at the tested pivot retain a pupil centre within 3×10⁻¹⁴ mm, a roughly 4 mm pupil width and a zero-width nominal geometric focus shifted by ±0.017453576 mm. This audit isolates downstream relays and does not validate upstream beam conditioning.

A separate full-train check sampled the actual **4 mm source diameter** with nine independent native line rays, paused both galvos at zero and enabled one DOE order at a time. For order 0, the beam footprint at the MLA spans **11.407897 mm**, against **18/7 = 2.571429 mm** lenslet pitch, and crosses **five lenslets**. Seven probe rays reach the resin across **0.527964 mm**; their span at the nominal focus remains **0.518614 mm**. Outer orders also span multiple lenslets and clip. These are geometric failures to establish the intended beamlet/lenslet mapping, not unmodelled diffraction. The existing centre-reference test misses them.

## Browser evidence — incomplete

The real desktop editor loaded at the exact original hash. Its DOM exposed the complete component palette, toolbar, canvas labels, pulse controls and inspector; the fitted view reported 95% zoom. Its 760×760 square figure conflicts with the landscape style, and 9–10 mm annotations at that zoom imply small text.

The next interaction failed with **“CDP operation refresh tabs was superseded by browser recovery.”** The coordinator paused browser work to avoid competing recovery calls. No screenshot bytes were captured, and **desktop visual inspection, interactive control verification, console inspection, and the ~1024 px fixture remain pending**. No browser pass is claimed. Required evidence files, when completed: `evidence/kiefer-original-desktop.jpg` and `evidence/kiefer-original-1024.jpg`.

## Scores and selection

Scores measure this original; the last two increase with burden. Visual clarity is provisional until browser completion.

| Axis | 0–5 | Reason |
| --- | ---: | --- |
| Source completeness | 4 | Strong apparatus evidence; partial MLA prescription omitted from the branch note. |
| Optical-train confidence | 3 | Correct topology and scanner relays; full-beam MLA mapping/focusing fails. |
| Distinctiveness | 4 | Static hybrid diffractive/refractive splitting is distinct from adaptive illumination. |
| 2D compatibility | 3 | Routing can be taught; dispersion/PSF advantage is not computed. |
| Educational value | 2 | Source and order controls work, but markers conceal the central geometric defect. |
| Visual clarity | 2 | Provisional: square frame and small fitted notes; browser checks pending. |
| Free interpretation required | 4 | Extensive inferred beam conditioning, prescriptions, sizes and spacings. |
| Maintenance complexity | 3 | Shared components help, but a long optical train has several coupled conjugates. |

Compared with Gu, Kiefer offers a distinctive static architecture and avoids programmable-mask machinery. However, this original is **not yet the cleaner alternative**: the dense inferred relay train produces overlapping bundles and its MLA control changes the marker span only modestly. Gu's amplitude selection followed by independent metalens focusing offers a more direct native control story, subject to its own review. Kiefer is a reserve candidate unless rework makes its static hybrid mechanism demonstrably clear.

**KEEP AFTER REWORK:** establish one finite beamlet per MLA lenslet and focused full-bundle delivery; align the resin with the nominal focus; state reported versus model pupil/prescription values; adopt the landscape frame, mounted sample and required provenance key; and complete both native browser widths, controls, persistence and console checks. If those corrections require retaining a largely illustrative mechanism, **DROP from the five-scene selection** rather than treating seven markers as validation.
