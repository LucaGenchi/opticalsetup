# Shared scan-relay and image-plane criterion

This is a first-order geometry check for the native 2D tracer. It does not
validate an optical prescription or a high-NA point-spread function.

## One rule for scanner relays

Use unfolded distance **along the nominal optical path**, including every
fold, between actual optical surfaces. For the ray vector `[height, slope]`,
free propagation is `P(d) = [1,d;0,1]` and a thin lens is
`L(f) = [1,0;−1/f,1]`. With scanner-to-scan-lens distance `p`, lens separation
`s`, and tube-lens-to-objective-BFP distance `q`, evaluate

`M = P(q) L(f_tube) P(s) L(f_scan) P(p) = [A,B;C,D]`.

Require both:

- **B = 0:** changing the scanner angle leaves the beam centred at the BFP.
- **C = 0:** a collimated input bundle stays collimated before the objective.

The canonical positive-lens solution is `p=f_scan`, `s=f_scan+f_tube`,
`q=f_tube`, yielding `A=−f_tube/f_scan`, `D=−f_scan/f_tube` and `B=C=0`.
For optical deflection `θ`, the nominal sample-plane displacement is
`f_objective D tan(θ)`. A mirror's optical deflection is twice its mechanical
rotation. Changing only `q` is not a complete conjugacy check.

For a collimated input beam of radius `r`, pupil centre is `B tan(θ)`, pupil
width is `2|A|r`, and nominal geometric focus width is `2 f_objective |C|r`.
Nonzero B can therefore leave a sharp geometric focus while causing pupil
walk and clipping. Conversely, incorrect lens separation can leave B zero
while C becomes nonzero and spreads the nominal focus. Check every finite
aperture as well as these matrix conditions; clipping is not focus quality.

`sketch/js/scan-relay.js` implements these operations, bounded small-angle
sampling, world objective planes, and measurements from actual native traced
polylines. Invalid and overflowing numerical inputs fail explicitly. Default
matrix tolerances are `|B| ≤ 1e−7 mm` and `|C| ≤ 1e−9 mm⁻¹`; meaningful scene
tolerances must additionally be assessed against pupil diameter and scan range.

## Objective and separate scanner pivots

The native objective uses local `+x` toward the specimen:

| Plane | Local coordinate |
| --- | --- |
| Front tip | `16 mm` |
| Equivalent refracting plane | `16 + WD − EFL` |
| Back focal plane | `16 + WD − 2 EFL` |
| Nominal focus | `16 + WD` |

Rotate and translate these coordinates by the element's own placement.
`objectiveScanPlanes()` returns all four useful optical planes, including the
aperture stop. **In the integrated model, `objectiveStopX()` equals the BFP for
every objective.** A cosmetic barrel shoulder must not alter conjugacy. The
finite blocking annulus and acceptance bore remain in place, including when
these equivalent planes lie outside the housing. They bound a first-order
model, not a physical internal prescription. The finite lens/bore can still
vignette tilted, nearly full-pupil bundles; test actual throughput separately.

The original paper branches audited below predate this correction. They clamp
some stops into the barrel, so their actual-stop measurements differ from BFP
measurements. The historical JSON evidence remains unchanged and records
`stopClamped: true` where applicable.

For distinct X and Y mirrors, verify X→Y imaging and Y→BFP imaging separately,
then verify their composition. A 1:1 inter-pivot relay has `B=C=0` and `A=D=−1`.
Two separated mirrors with only one downstream relay cannot both be exactly
pupil-conjugate. Calling them “XY” does not change that.

The canvas contains one meridional plane. Both drawn galvos rotate in that
plane; their effects are projected illustrations, not independent physical
X/Y directions or a simulated 2D raster. Label this explicitly. A stage's
existing `pzMode: 'z'` moves along local y, perpendicular to its sample plane;
the canvas rotates that displacement with the stage before tracing. At stage
rotation 90° it moves along the objective's horizontal propagation axis.

## Native validation and compact Basic geometry

`node --test test/scan-relay.test.js` exercises twelve deterministic cases,
including a real native galvo, lenses, objective, and resin. Nine independent
native line rays sample the finite collimated input beam; beam-mode drawn paths
alone expose only its two envelope edges.

For a 50/100 mm relay, 10 mm objective EFL, 2 mm input radius and optical angles
`−0.4°, 0°, +0.4°`, native tracing gives a pupil centre within `1e−8 mm` of zero,
an approximately 8 mm pupil width, and focus centres
`+0.03490715, 0, −0.03490715 mm`. Focus span stays below `1e−8 mm`; all nine rays
arrive. A 20 mm lens-separation error independently produces a 0.16 mm focal
span. Deliberate pupil misplacement produces finite-aperture clipping.

The last two-scanner test additionally validates this compact, intentionally
inferred bench. It is not a paper prescription:

| Part | Position (mm) | Rotation | Optical parameters |
| --- | --- | --- | --- |
| Incoming source | `(80,150)` | `0°` | Collimated, input beam diameter 2.4 mm |
| X galvo | `(300,150)` | `135°` | Folds the incoming beam downward |
| Inter-pivot lens pair | `(300,230)` | `90°` | `f1=f2=40`; planes at y=190,270 |
| Y galvo | `(300,310)` | `135°` | Folds the beam rightward |
| Scan/tube lens pair | `(400,310)` | `0°` | `f1=40`, `f2=80`; planes at x=340,460 |
| Objective | `(532.5,310)` | `0°` | EFL=5, WD=1.5, NA=0.65, dry, front aperture=8 |
| BFP / stop | `(540,310)` | — | Radius 3.25 mm; centred beam diameter 4.8 mm |
| Resin plane | `(550,310)` | Stage `90°` | Nominal geometric focus |

Separately command each galvo to `−0.25°, 0°, +0.25°` mechanical. Both pivots
retain a centred pupil and all nine rays focus; the nonzero focus displacement
magnitude is `0.02181717 mm`. This displacement is much smaller than a typical
overview pixel: the figure must use an honest qualitative writing marker or
an inset/readout to make the motion legible. Do not enlarge only the optical
displacement while claiming the original scale. A Z travel around 0.1–0.2 mm
is sufficient to demonstrate physical defocus without a gigantic moving stage.

## Exact original branch audit, 2026-09-13

The following scan results use each original branch's own native tracer, with
nine probe rays across a 2 mm input diameter injected at the named pivot.
Only its downstream scanner/relay/objective elements are included; upstream
illumination, hologram orders and clipping are separate paper-review checks.
Each pivot is varied independently through ±0.2° mechanical (±0.4° optical).
Pupil walk below is the maximum absolute centre displacement, measured at the
calculated BFP; the focus is measured at its nominal plane, not a nearby resin.

The full numerical evidence, exact commit hashes, dirty-file status and optical
element lists are in [`scan-relay-measurements.json`](scan-relay-measurements.json).
Reproduce it with `node tools/audit-2pp-relays.mjs --worktrees /path/to/worktrees`.
That directory must contain the `pearre-2018`, `kiefer-2024` and `gittard-2011`
worktrees at the audited commits. The script reads each worktree's own source
scene and JavaScript modules and prints JSON without changing those worktrees.

| Exact branch | Pivot | Pupil walk (mm) | Finding |
| --- | --- | ---: | --- |
| Pearre `6b02bbfdb5db9273bf38915f3592e71fd124ca60` | Resonant X | 0.695350471 | Missing X→Y relay; effective `|B|=99.6 mm` |
| Pearre, same | Slow Y | 0.002792572 | Last distance is 99.6 rather than 100 mm; `|B|=0.4 mm` |
| Kiefer `72f0323d38ff8afa3e375e87e861c262b1399456` | X and Y | <1e−12 | Both conjugacies pass |
| Gittard `039b7726ca6363a4d721e722963077f03ce1a3f4` | X | 0.005236073 | Inter-pivot distances 67/16.5 vs focal lengths 66.8/16.7; `|B|=0.75 mm` |
| Gittard, same | Y | <1e−12 | Final pupil relay passes |

All these underfilled probe bundles retain nine rays and a nominal focus span
below `1e−8 mm`. That does not excuse pupil walk. Pearre's configured maximum
X scan is ±1.2° mechanical: its first-order pupil walk is about ±4.17 mm.
Its source expands from 8 to 16 mm diameter against a 12.8 mm pupil. Its resin
at y=695.7 is also 0.1 mm beyond the calculated y=695.6 focus. The hand
correction therefore improves Y substantially but does not repair X.

Minimal numerical correction for Gittard's inter-pivot relay: move its centre
x=481.75 to **481.55**, retaining both focal lengths and both scanner centres.
The final 35.5325/35.5325 mm relay is already exact. This statement addresses
the scanner geometry, not the upstream SLM order prescription.

### Integration correction and saved sketches

The original clamp affected 13 of the 23 built-in objective presets, including
ordinary 100× oil objectives. Its removal changes acceptance, not EFL, WD, NA,
element placement, or the saved-file schema:

| Objective parameters | Old local stop | Correct BFP / stop | Equivalent lens |
| --- | ---: | ---: | ---: |
| EFL 2, WD 0.13, NA 1.4 oil | 7 | 12.13 | 14.13 |
| EFL 2, WD 12, NA 0.5 dry | 7 | 24 | 26 |
| EFL 40, WD 20, NA 0.2 dry | −20 | −44 | −4 |

For Gittard, this moves the actual stop y=277 to the existing BFP y=282.13.
After the 0.2 mm inter-pivot correction, both scanner pupils are stationary at
the accepted plane. This does **not** repair the broad upstream SLM/Fourier
bundles found in the [original review](reviews/gittard-2011.md).

Fischer's original mask relay imaged its mask to the old stop x=500, not the
nominal BFP x=505.13; the integrated scene must retune that image plane. Its
unchanged on-axis geometric focus is not evidence of correct phase-pupil
imaging. See the [original Fischer review](reviews/fischer-2011.md).

Existing saved objectives load the same authored parameters and retrace with
this deliberate optical correction; there is no hidden legacy clamp. The
regression checks retain on-axis focus, configured transmission, observable
overfill, finite outside-envelope behavior and forward/reverse propagation.
High-NA and long-WD sampled scan bundles also verify that a centred BFP stays
centred. Pupil-fill readout now projects rays to the BFP, including rejected
annulus/bore rays, instead of treating their displacement at the lens plane as
pupil growth. Its diameter is twice the maximum distance from the pupil axis;
for decentered or disjoint beams this is an occupancy envelope, not a fitted
beam diameter or calibrated transmitted power.

The other families need the correct **kind** of conjugacy:

| Branch | Required check | Current geometric result |
| --- | --- | --- |
| Somers `79d3966d7f6f75fdcc073b16d47e35edf15f208e` | DMD field plane→resin image, not scanner→BFP | The reflective proxy is at local x=−9, hence world y=735. L3 at y=435 gives 300 mm. With objective equivalent plane y=132.87 and resin y=130.87, the complete image matrix has B=0 and magnification −2/300. Spectral separation at the pupil is intentional; temporal confinement is not computed. |
| Ouyang `9cf0f93fe2a16238450ef17b9204a2352ffe24fe` | DMD holographic angular output→objective pupil, and Fourier-order selection | Effective DMD centre is `(599.877658,0.012017)`, about 149.877658 mm before L3. L3/L4 focal lengths and separation are 150/200/350 mm; L4→BFP is 200.24 mm. The centred unfolded approximation gives B=−0.0168771 mm, C≈0. A reworked scene should use exact optical-surface coordinates; the tilted device's finite footprint and selected orders still require native tracing. |
| Gu `6788ffc987cc59cf214c6a7f2c054520abc3c374` | SLM amplitude field→metalens-array plane, not observation-objective BFP | Effective reflective SLM plane x=570 gives a 75 mm folded path to L1; L1/L2 separation is 275 mm and L2→array 200 mm. The air-only 75/200 relay has B=C=0. Two native 1 mm silica windows leave B=0 but give C≈−4.159×10⁻⁵ mm⁻¹ at 800 nm; account for this small curvature when checking beamlet focus. The separate observation objective is not the writing pupil. |

The programmable masks' effective surface offsets are part of these numbers;
using their element centres silently adds 9 mm and can produce a false audit.
Spatial-mask image conjugacy requires B=0 from mask to image. It must not be
replaced with the scanner rule B=0 from mask to objective BFP.

Collection claims remain limited to routed geometric rays, pupil coverage,
first-order focal intersections and qualitative resin markers. None of these
checks computes high-NA vector fields, arbitrary 3D CGHs, temporal-focusing
confinement, a calibrated voxel, polymerization, or throughput.
