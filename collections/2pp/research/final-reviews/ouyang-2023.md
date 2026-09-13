# Ouyang 2023 — fresh final integration review

Reviewer: independent final-review agent `final_ouyang_browser`, 2026-09-13.
Branch: `codex/2pp-curated-integration`. This reviewer did not author the scene.

**Native verdict: KEEP. Browser acceptance remains pending.** The scene presents
a useful, bounded central-wavelength lesson: actual DMD-selected angular orders
pass through the Fourier filter and a pupil relay, producing separate geometric
arrivals. It does not claim to reconstruct a CGH field, dispersion compensation,
temporal confinement or cured voxels.

## Reviewed material and scope

Read the collection style rules, the integrated [source and design note](../ouyang-2023.md),
the complete scene JSON and all six focused tests. Rechecked the provided article
and supplement text for 800 nm / 100 fs / 1 kHz / 4 W, 600 lines/mm, 49.43° grating
incidence, the four reported focal lengths, and the 40× oil / NA 1.3 / WD 0.24 mm
objective. The note correctly preserves the supplement's L1/L2 ordering conflict
instead of silently resolving it.

The focal lengths and source operating values retain their reported status.
The five extra folding mirrors, apertures, two-millimetre input beam, DMD display,
geometric order angles and layout are explicit design choices. The 589 nm
observation branch is explicitly omitted, with its source topology in the note.
The pupil is underfilled, so the label NA 1.3 identifies the configured objective
rating rather than an achieved high-NA focus.

## Native optical verification

`node --test test/2pp-ouyang-integrated.test.js`: **6 tests passed, 0 failed**.
In addition, the reviewer ran an independent sweep of all eight order counts
at steering −1°, 0° and +1°. Each of the 24 cases used 25 separate line probes
across the complete configured source width, then a normal sized-beam trace.
This verifies full bundles rather than relying on the displayed group marker.

| Check | Independently observed result |
| --- | --- |
| Full aperture, 1–8 orders × three steering settings | Every probe reaches every configured order; sized-beam traces retain 25 arrivals per order, up to 200. |
| Largest focal support across the sweep | `1.14 × 10⁻¹³ mm`, numerical round-off at the sample plane. |
| Largest pupil-centre displacement | `3.41 × 10⁻¹³ mm`; steering changes focus position while the pupil remains centred. |
| Largest pupil radius reached | `1.534888 mm`, inside the true `6.5 mm` pupil radius. |
| Total normalized arrival weight | `0.82` for every order count and tested steering setting; no multiplication of total power. |
| Reported upstream relay | Grating → L1 = 225 mm; L1 → L2 = 475 mm; L2 → actual DMD face = 250 mm, including all folds. |
| Actual DMD face → true BFP | L3/L4 matrix `A = −4/3`, `B = 0`, `C = 0`, `D = −3/4`; the tilted device body centre is not substituted for its face. |
| Fourier filter 16 → 4 mm | Three full orders become the central order; its weight stays `0.82/3`, without redistribution of blocked light. |
| Source off / zero power / HWP 45° | No writing; the rejected PBS port terminates in its physical beam dump. |
| Positive source power 4 → 2 W | Geometry and normalized arrival weights are unchanged, as documented for source metadata. |
| Binary frame change / all-OFF frame | Real aperture samples are gated; order geometry remains separate from frame data. All-OFF removes arrivals. |
| Reduced NA / excessive steering | Finite apertures clip or reject the appropriate rays; no bypassed unfocused rays become writing markers. |
| Axial sample shift / displaced L4 | Actual arrival supports broaden; the display does not retain a fictitious sharp centroid. |
| Native save / parse round trip | Shared controls and scene state persist exactly; the restored scene produces an identical trace. This is not a browser file-import check. |
| Sample termination | Writing rays terminate at the resin boundary, without a post-sample fan. |
| Configured-value handoff | The final source explicitly sets `handoffEnabled: false`; the native handoff helper returns no URL. Verified paper parameters remain available on the companion page. |

## Visual review

Generated a fresh SVG through the repository's native exporter and inspected
its rasterization at 1440 px and at a fitted width of 500 px. The title fits,
component labels remain readable, the path follows a compact folded bench, and
the source and sample have clear positions. The current DMD frame and sampled
column are visible in the shared inset. The 220-unit-high arrival inset shows
three separate actual routes within its fixed ±250 µm field; its axis labels
fit and do not collide with the optical bench.

The author removed a duplicate three-line control/legend block below the scope
note; the companion page already contains the experiments and lens units. The
reviewer regenerated and inspected the shortened final figure at both widths.
Its scope note remains complete, its text has more breathing room, and no new
overlap or clipping was introduced.

Native SVG inspection establishes figure layout only. It provides no evidence
about editor overflow, inspector operation, console errors, browser save/reload
or runtime screenshots.

## Real-browser gate

The reviewer is waiting for the serialized browser slot and the final public
integration checkpoint. No browser result is claimed yet.

| Required final gate | Status |
| --- | --- |
| Desktop editor, toolbar, palette, canvas and inspector | Pending browser access |
| Approximately 1024 px editor, fit and overflow | Pending browser access |
| Source, order, steering, frame and filter controls through the UI | Pending browser access |
| Browser save and reload | Pending browser access |
| Browser console inspection | Pending browser access |
| Real browser screenshots at both widths | Pending browser access |

The native optical and figure checks support keeping this scene. Final
browser acceptance must remain open until the checks above can be observed.
