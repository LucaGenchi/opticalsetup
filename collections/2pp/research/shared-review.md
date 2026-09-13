# Shared architecture review

The integration starts from main `3242a2fe6a84ca155b9f97b4b399ecc24666c0b4`
and foundation #108 `9a4a967bb8dafa811f5bbc87092b9d21ecaea9bc`. It follows
[Luca's latest review](https://github.com/LucaGenchi/opticalsetup/pull/108#issuecomment-5647623099),
then inspects the exact current heads of #125–135. Historical PR descriptions
are not treated as implementation evidence. Individual scene branches remain
unchanged; only reusable behavior is consolidated here.

## Scanner acceptance

Use the [shared criterion](scan-relay-criterion.md): evaluate the actual scanner
pivot, all intervening propagation and lenses, and the objective BFP. A scan
requires both B≈0 (stationary pupil) and C≈0 (collimated pupil illumination).
Check X and Y separately, including finite apertures and sample-plane focus.
Mask-to-sample imaging and mask-to-array imaging have different conjugate
planes; they must not be mislabeled as scanner-to-pupil relays.

The native objective also had an escape path: a ray could pass its pupil but
miss its equivalent focusing segment and continue unrefracted to the sample.
Two finite absorbing boundaries now close that path. They conservatively
bound the equivalent model, not a resolved objective prescription.

The follow-up original-scene review exposed a second inconsistency: clipping
the equivalent pupil's position to the drawn barrel broke conjugacy in 13 of
the 23 objective presets. The integrated aperture now stays at the BFP, with
the finite annulus and bore preserved even for outside-housing equivalent
planes. Pupil fill is measured at that same BFP, including rejected rays.
This intentionally corrects acceptance when old saved objectives are loaded;
their EFL, WD, NA and nominal focus are preserved. Gittard's old actual stop
at y=277 becomes its BFP y=282.13, and Fischer's old mask-to-stop relay must be
retargeted from x=500 to its objective BFP. Historical original-branch reviews
and numerical evidence retain their original geometry and are not rewritten
to imply that those branches received this fix.

## Programmable devices

The [shared DMD/SLM frame contract](../../../docs/programmable-masks.md) separates
the visible 2D pixel frame, discrete playback, sampled tracer column, and
optional angular/spectral optical effects. Paper-specific DMD implementations
are not merged. Legacy scene fields migrate into the shared contract.

## Conflict and consistency decisions

| Current branch | Finding | Integration decision |
| --- | --- | --- |
| #130 Dong | Duplicate `d`, `intensity`, `tag`, `wl`, `bw` keys survived conflict resolution. Lenslet writing groups were collapsed to an unweighted centroid, even away from focus. | Use one shared shaper path, preserve spectrum metadata, group actual arrivals and retain the traced support. Never call a centroid a calculated focus. |
| #132 Gittard | Duplicate spectral keys; all-aperture focus-grid branching is meaningfully different from partitioned lenslets. Weak-power and representative-order metadata must survive children. | Keep a reusable focus-grid layer, preserve both supported weak-power contracts and spectrum/GDD fields. Shared arrival grouping replaces paper-specific row deduplication. |
| #135 Gu | An amplitude layer adds intensity attenuation; setting every metalens ray as a writing reference makes preview density depend on ray sampling. | Migrate amplitude layers into shared frame data with the same intensity semantics. Group the actual arrivals per illuminated metalens with finite spread. |
| #134 Ouyang | Device SVG depicts the tracer's 1D hologram proxy; independent DMD helpers and metadata diverge from other branches. | Use shared 2D binary frames and separately named geometric angular orders. The displayed frame is not claimed to solve those orders. |
| Splitter | Existing code redistributes power among propagating orders, while text said unavailable orders lose power. | Describe the existing lossless equal-power proxy accurately, including the zero-order fallback. |
| Chopper / AOM | Controls and transmission allow 1–99%; chopper drawing still stopped at 5–95%. | Draw the same 1–99% duty range. Test schema, persistence, drawing angle and measured transmission at normal and boundary values. |

## Collection-wide claims

The workbench traces a two-dimensional geometric section with bounded relative
power. A writing marker means a pulsed ray arrival on the sample. For grouped
orders and lenslets it represents an actual arrival and its traced support;
its graphic size is not a measured voxel. Stage-depth appearance is an
illustration, not a calibrated exposure calculation.

Scenes may illustrate mechanism or topology, but must not claim arbitrary
3D CGH fields, vectorial high-NA PSFs, calibrated voxel dimensions,
polymerization kinetics, STED depletion chemistry, temporal-focusing
confinement, metalens electromagnetic fields, proximity effects or calibrated
throughput. Phase colors and sampled wavelength paths do not calculate a
wave field. A useful limitation must appear beside the mechanism it qualifies.

Reported values require primary-source evidence. Design choices remain
explicitly identified as free interpretation. The canonical Basic scene is
entirely illustrative and has no paper-derived calibration.

## Regression coverage

Shared changes have focused tests for scanner conjugacy and finite apertures,
objective edge escape, duty extremes, bounded frame data and migration,
spectral/GDD propagation, weak orders, discrete device display, save/reload,
and grouped arrivals under defocus. Exact full-suite results and real-browser
scene evidence are recorded with the final integration review.
