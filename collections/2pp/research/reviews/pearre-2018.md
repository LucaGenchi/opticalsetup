# Pearre 2018 original review

Reviewed 2026-09-13. PR #125, exact head
`6b02bbfdb5db9273bf38915f3592e71fd124ca60`; original worktree was clean and
remained unchanged. This assesses the original, not a redesigned scene.

## Source and provenance

Personally read the supplied 23-page primary preprint and rendered/inspected
Fig. 1 on PDF p. 3. Its SHA-256 matches the original evidence note:
`2b51881c09f7bf66d1b2afbb452511926c0e4b3d2d58d406c2508d75c48118e6`.
Also read the original scene, evidence note, resonant component and native
tests, plus the integration style, review protocol and shared relay criterion.

The source supports fs laser → Pockels intensity control → 2× Galilean
expander → resonant X/slow Y → dichroic → shared objective → photoresist,
with a PMT return branch and objective piezo Z. Fig. 1b–c makes intensity
addressing during the raster central to the mechanism. [Primary preprint,
p. 3, Fig. 1](https://arxiv.org/pdf/1803.07135v1#page=3).

Reported settings are 7.91 kHz X, 3.33 MHz DAC, 80 MHz laser, approximately
120 fs, typically 780 nm, a 25×/NA 0.8 immersion objective, and approximately
0.6–1 W laser output. The paper separates those rates and describes a sampled
power monitor, but gives no analyzer arrangement, beam diameter, relay
prescription or conjugate distances. [Primary preprint, p. 4,
§2.1](https://arxiv.org/pdf/1803.07135v1#page=4).

Sinusoidal position, restricted usable fraction, nonuniform spatial addresses
and velocity-dependent power correction are the distinctive teaching content;
the original scene does not calculate them. The paper reports D = 0.9 and at
most 152 X addresses. [Primary preprint, pp. 5–7,
§§2.3–2.4](https://arxiv.org/pdf/1803.07135v1#page=5).

The original labels its 0.8 W, analyzer, 2% pickoff, relay/fold, scan amplitudes,
EFL, WD and immersion medium as free interpretation. Other inferred inputs
include the 8 mm source diameter, 5 nm bandwidth and 30 Hz slow-Y preview.
The evidence note is stale: it says a 50 mm relay, while the exact JSON uses
100/100 mm lenses. The companion page's numeric reported-input table also
drops the wavelength/duration qualifiers that its prose preserves. The
reviewed calculator subset correctly transfers only 80 MHz and NA 0.8.

## Optical and native checks

`node --test test/pearre-2018.test.js test/resonant-scanner.test.js` passes
**11/11** on the original head. These tests confirm the center marker, not
the complete finite beam.

The actual objective BFP and unclamped stop are at `(560,679.6)`, its
equivalent lens at `(560,687.6)`, and its geometric focus at `(560,695.6)`.
The resin is at y = 695.7, 0.1 mm beyond that focus.

Re-ran `node tools/audit-2pp-relays.mjs --worktrees
/workspace/scratch/aa6661f637b8/worktrees`, which imports each original's own
tracer. Nine independent rays spanning a 2 mm bundle, with each pivot varied
separately by ±0.2° mechanical, reproduce:

| Pivot | Pupil walk at ±0.4° optical | Interpretation |
| --- | ---: | --- |
| Resonant X | 0.695350471 mm | No X→Y relay; effective \|B\| = 99.6 mm |
| Slow Y | 0.002792572 mm | Last distance 99.6 rather than 100 mm; \|B\| = 0.4 mm |

Both have C ≈ 0 and nine sharp nominal-focus intersections, so focus alone
does not validate conjugacy. In unfolded coordinates X→Y is 100 mm of free
propagation. Y→BFP uses p/s/q = 100/200/99.6 mm with f1 = f2 = 100 mm;
it has A = D = −1, B = 0.4 mm, C = 0. X→BFP then has B = −99.6 mm.
At the configured ±1.2° X mechanical limit, chief-ray pupil walk is about
4.17 mm. See [shared criterion and numerical evidence](../scan-relay-criterion.md).

For the **complete original illumination**, repeated native tracing with one
line source at each of the original source's 25 transverse sample positions
(`y = 180 − 4 + 8i/24`, i = 0…24). Kept every optical element and original
source timing/spectrum, holding the unused scanner at zero. This exposes
individual paths concealed by beam-envelope drawing and center-only markers:

| State | Actual result |
| --- | --- |
| Default, scanners centered | All 25 rays reach the BFP plane across 16 mm; the pupil is only 12.8 mm. Six are blocked, 19 focus within 1.2×10⁻¹³ mm at y = 695.6. Those 19 span **0.1500 mm at the actual resin**. |
| X = ±1.2°, Y held | 19 rays reach the wide resin, but only **15** refract at the objective. One passes the pupil and misses its finite equivalent lens, reaching the resin 6.8510 mm off axis. Three outer rays miss both relay lenses and the objective and reach the resin 28.2868–29.6213 mm off axis. Total resin support is **36.4723 mm**. |
| Y = ±0.15°, X held | 19 rays refract and arrive; nominal-focus displacement is ±0.0418883 mm and actual resin support remains 0.150002 mm wide. |

For example, at X = +1.2° the source sample at y = 181 passes the actual
BFP within its clear radius but has no objective-lens vertex and arrives at
`(553.148977,695.7)` without objective-NA metadata. The y = 183.333333 ray
travels from Y directly to `(588.286754,695.7)`, missing the relay and objective.
Thus the original's one writing marker is neither the full arrival support
nor proof that all arriving light has focused. The shared objective boundary
repair addresses the internal escape; it does not fix the missing X relay or
the rays that miss the entire downstream train.

| Native control | Observed outcome |
| --- | --- |
| Laser off / zero average power | 0 drawables and 0 new resin arrivals; restoring the source restores the trace. |
| Pockels duty 0.1 → 0.9 | Monitor relative signal 0.0179980 → 0.00200684, approximately ninefold reduction. The square polarization/analyzer gate is not a PrintImage address stream. |
| X sweep 1.2° → 0° | Full trace becomes time invariant with Y held. With X restored, the center resin marker ranges from x = 559.716882 to 560.283118. |
| Y triangle → static, X held | Center marker shifts between x = 559.958086 and 560.041914 for the triangle, and stays at 560 when held. |
| Usable fraction 0.1 → 0.9 | Complete trace is identical; this is annotation only. |
| Persistence / finite values | Original parse→serialize→parse equality passes. All inspected native drawable coordinates stay finite. |

PMT has no incident signal, consistent with the explicit absence of a return
emission model. Both scanner motions occupy the same meridional plane, not
independent simulated physical X/Y axes. Resin dots are qualitative arrivals,
not calculated voxels or evidence of polymerization.

## Visual and browser status

Personally inspected the coordinator's actual-browser screenshot
`audit/browser/pearre-original-1024.jpg`: the 1024×800 editor fits its toolbar,
palette, canvas and inspector, but the fitted 765×725 frame makes most
mechanism/limit text tiny. The nearly square crop and long vertical relay do
not follow the compact landscape collection style. Objective, focus and resin
are compressed together at overview scale; the center marker conceals the
full-beam defects above.

**Personal browser checks pending:** direct component selection, three UI
controls, console inspection, save/reload through the UI, and personal desktop
and approximately-1024 layout checks. Browser initialization was deliberately
deferred at the coordinator's request because the shared connection stalled.
The screenshot inspection and native controls above do not substitute for
those checks. The visual score is provisional until they finish.

## Scores and selection

First six: higher is better. Final two: higher is greater burden; do not sum.

| Axis | Score / 5 | Reason |
| --- | ---: | --- |
| Source completeness | 4 | Primary apparatus diagram and methods available; no relay prescription. |
| Optical-train confidence | 2 | Main topology grounded; X conjugacy, finite apertures and sample focus fail. |
| Distinctiveness | 2 | Resonant sinusoid adds a motion law to the Basic serial scanner architecture. |
| 2D compatibility | 3 | A resonant meridional sweep is honest; XY raster and address scheduling are absent. |
| Educational value | 3 | Useful source/modulator/scanner controls, but the distinctive timing-to-space lesson is missing. |
| Visual clarity | 2 | Coherent route, very small fitted text and unclear full-beam focus. |
| Free interpretation required | 4 | Relay, conjugates, apertures, scan amplitudes and objective geometry are inferred. |
| Maintenance complexity | 2 | Small native sinusoidal component with tests; no reconstructed controller, but extra animation plumbing. |

**DROP from the five-paper selection.** Relative to the new Basic serial
scanner, resonance changes scan kinematics without adding another optical
architecture. The original does not expose its strongest distinctive content:
sinusoidal speed, unequal spatial address spacing, usable-sweep gating and
synchronized intensity addressing. Its extra slot is not justified by the
current behavior, especially with unresolved full-beam errors.

Reconsider only if that distinct causal lesson is explicitly required, both
scanner conjugacies and finite-aperture paths are corrected, the resin is at
the actual focus, reported/inferred wording is consistent, and the pending
browser checks pass. These are acceptance conditions, not a redesign performed
in this review.
