# Gittard 2011: original-branch review

Reviewed 2026-09-13, PR #132, exact head `039b7726ca6363a4d721e722963077f03ce1a3f4`. The original worktree was clean before and after review; no original code or scene was edited. This assessment uses the branch's current evidence note, scene and native tracer, not the older foundation metadata. Browser review is **incomplete** because the shared browser connection failed after the desktop capture.

## Primary evidence and optical train

[Gittard et al., Biomedical Optics Express 2, 3167–3178 (2011)](https://doi.org/10.1364/BOE.2.003167), attached `03-gittard-2011.pdf`, SHA-256 `57aeb233979fa416a88854a4e398c1e7859dddfa6285c4b6aa9134baf1dea062`. Read PDF pp. 6–11 and visually inspected Fig. 1 on PDF p. 7 (journal p. 3173).

The supported sequence is Ti:sapphire source → energy control → expander → reflective phase-only SLM → Fourier lens / selected pattern at P with zero-order rejection → scanner → objective → sample on positioning stages. Fig. 1 also shows folds, a CMOS observation camera and illumination below the sample. The scene retains that functional sequence and models an independently illuminated camera. It replaces the figure's arrangement with many inferred folds, lenses, filters, apertures and relay distances; it is not a recovered apparatus prescription.

| Parameter or claim | Primary location | Assessment |
| --- | --- | --- |
| 780 nm, 80 MHz, 4 W; pulse width <150 fs | PDF p. 6, Experimental | Correct source facts. Scene 150 fs is explicitly an upper-bound proxy. Fig. 1 instead says <140 fs. |
| LC modulator plus PBS; expander; LC-R2500; 256 levels; 128×128 CGH tiled 6×6 | PDF p. 6 | Good documentation. Fig. 1 depicts a half-wave plate and polarizer instead; discrepancy is retained. Native EOM is an LC-retarder proxy. |
| First-order pattern at P and sample; zero order rejected at P | PDF pp. 6–7, Fig. 1 | Real native zero-order route and dump exist, but the chosen carrier and focusing functions do not compute a CGH or diffraction orders. |
| Venus: 4×4 foci, 8–12 mW/spot, 100× oil / NA 1.40, 100 nm layer/raster spacing, 1 mm/s | PDF p. 7, Results | Correct representative run; source and writing-plane powers remain distinct. EFL 2 mm and WD 0.13 mm are inferred. |
| Scaffold: four foci, 35 µm spacing, 20× / NA 0.4; separate powers and speeds | PDF pp. 8–9 | Correctly kept separate from the Venus default. |
| Microneedles: four foci, 5× / NA 0.13, 200 µm/s | PDF pp. 9–10 | Correctly treated as another experiment. |
| 1 W SLM input limit, most power in rejected zero order, ~20 Hz refresh, shared objective field limit | PDF p. 11 | Supported constraints. Default 70% zero order and scan rates are design choices. |

## Native optical findings

**Major issue: four reference-ray arrivals are being presented as four foci, although the complete bundles do not focus at the resin.** Independently trace nine line sources at the existing laser position with y offsets −4 through +4 mm, preserving all laser settings and the complete train; remove only the unrelated visible illumination. This samples the configured 8 mm input aperture without the sized-beam drawing or branch budget hiding rays. At the unchanged resin plane y=286.13 mm:

| Configured focus row | Arriving probes / 9 | Sample x minimum–maximum (mm) | Full span (mm) |
| --- | ---: | --- | ---: |
| 0 | 8 | 539.336090–540.719298 | 1.383208 |
| 1 | 8 | 539.343212–540.735934 | 1.392722 |
| 2 | 8 | 539.350428–540.752797 | 1.402368 |
| 3 | 9 | 539.160391–540.769891 | 1.609500 |

All recorded probe arrivals carry objective NA 1.4. The four central reference hits span only 0.033789 mm, with adjacent spacing about 0.0113 mm. Thus the roughly 1.4 mm overlapping supports cannot be called four geometric foci. The upstream SLM/Fourier train leaves a height-dependent output angle; scanner conjugacy alone does not establish pattern-plane imaging or collimated pupil illumination. The native reference-only `writeHits` bookkeeping hides that support. No PSF or polymerization conclusion follows from these intersections.

**Scanner audit:** reran `node tools/audit-2pp-relays.mjs --worktrees /workspace/scratch/aa6661f637b8/worktrees`, using the original tracer. Also measured its actual aperture stop. Nine collimated probe rays across 2 mm were injected before each pivot; each mirror was separately commanded to ±0.2° mechanical, with the other static.

| Pivot / model | Maximum BFP centre walk (mm) | Maximum actual-stop walk (mm) | Focus displacement magnitude (mm) |
| --- | ---: | ---: | ---: |
| X, original | 0.005236073 | 0.148495025 | 0.055851443 |
| Y, original | <1e−12 | 0.035814738 | 0.013962861 |
| X, diagnostic centre 481.55 | <1e−12 | 0.143258952 | 0.055851443 |

All nine underfilled probes survive; nominal focus spans are below 1e−8 mm. X→Y has `A=−0.25, B=0.75 mm, C=0, D=−4`: p=67 and q=16.5 mm differ from f1=66.8 and f2=16.7 mm. Moving the telescope centre 481.75→481.55 mm in memory makes that conjugacy exact. The final 35.5325/35.5325 mm relay already gives B=C=0 to the nominal BFP. However, this objective's **BFP is y=282.13 while its clamped stop is y=277**, radius 2.8 mm; lens plane y=284.13 and resin y=286.13. Both planes must remain in the acceptance test. The diagnostic centre correction leaves the actual-source spans essentially unchanged at 1.383–1.412 mm and clips the remaining −4 mm edge probe. It repairs neither full-aperture focus nor the shifted stop.

Both drawn galvos act in the same meridional plane. A nearby note must explicitly describe the projected representation of physical X/Y motion; their names alone imply independent axes.

## Controls, persistence and model honesty

`node --test test/gittard-2011-setup.test.js`: **5/5 passed**, including JSON save/reload, exact supported handoff values, finite bounds, source zero, camera independence and the four reference hits. Additional native controls:

| Control | Observed result |
| --- | --- |
| Foci per side 4→1 | Four reference arrivals become one; summed relative reference weight stays 0.0351471863. |
| Both galvos at 2.5 ms | Four arrivals remain; pattern mean shifts by 0.006702245 mm. |
| Zero-order reflection off | Dump route disappears; four selected positions stay fixed. Each selected weight rises from 0.008786797 to 0.029289322 because the model redistributes the rejected fraction. This is a configured power partition, not measured efficiency. |
| Source disabled or average power zero | No write arrivals; independent 550 nm CMOS signal remains 0.0533333333 relative units. |
| Foci per side 7 or 8, default sized beam | **Zero write arrivals.** The same optical settings with a line source give seven or eight. Counts 1–6 work in either mode. This is sampling-dependent behavior consistent with exhaustion of the source-wide 256 weak-child budget; it needs a scene-level regression. |

The full-aperture focus-grid branching is conceptually appropriate for a bounded multifocus proxy and distinct from partitioned lenslets. But the SLM graphic displays desired target spots on the device, not its phase mask. Call it a **target preview**, and use the shared frame contract before presenting it as a displayed hologram. Keep the explicit exclusions for CGH optimization, 3D fields/PSFs, efficiency, dose, curing and throughput. The 0.1 mm marker size is graphic, not a voxel measurement. Shared work should remove duplicate spectral keys, preserve weak-order and spectrum/GDD metadata, and replace first-reference row deduplication with actual arrival support.

## Real browser evidence and pending checks

Opened the [exact original editor](https://raw.githack.com/LucaGenchi/opticalsetup/039b7726ca6363a4d721e722963077f03ce1a3f4/sketch/?paper=gittard-2011&edit=1). Captured and visually inspected the same JPEG bytes saved as [gittard-original-desktop.jpg](evidence/gittard-original-desktop.jpg), 1363×936. DOM measurements show document scroll width equals viewport width. Toolbar, palette, inspector shell and frame fit on screen. The bench is compact but starts midway down the frame; explanatory type is tiny at 93% fit. Objective, BFP/WD/focal markers and resin labels overlap. The target grid is difficult to distinguish at overview, and the source sits at the lower left rather than following the collection's preferred upper-left reading order.

Pause was issued; selecting the SLM then timed out. Subsequent documented browser operations failed with recovery/refresh-tabs timeouts, including while this was the sole browser reviewer. No reset or alternate renderer was used. **Useful browser control verification, inspector contents, console inspection and the approximately 1024 px fixture remain pending, not passed.** No 1024 screenshot exists yet. Native controls above are not substitutes for those checks.

## Scores and selection

First six scores increase with quality; last two increase with burden. Scores assess the original, not promised repairs.

| Axis | Score / 5 |
| --- | ---: |
| Source completeness | 5 |
| Optical-train confidence | 2 |
| Distinctiveness | 5 |
| 2D compatibility | 3 |
| Educational value | 3 |
| Visual clarity | 2 |
| Free interpretation required | 4 |
| Maintenance complexity | 4 |

**KEEP AFTER REWORK.** It provides a well-sourced, distinctive example of one scan command moving an SLM-generated set of simultaneous targets. Selection is conditional on establishing actual pattern-to-sample focusing across the illuminated aperture, correcting X→Y conjugacy and checking the separate physical stop, fixing the seven/eight-row failure, adopting honest shared mask/arrival semantics, simplifying labels and completing both browser sizes plus console/control checks. Merely moving the relay by 0.2 mm or retaining four reference markers is insufficient. If that focused reconstruction cannot be achieved within the shared model, drop it from the five rather than claim multifocus writing from these broad bundles.
