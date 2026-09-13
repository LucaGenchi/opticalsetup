# Programmable DMD and SLM frames

`sketch/js/programmable-mask.js` is the shared device-pattern boundary. DMD and
SLM instances have the same frame selection, playback, JSON-grid import, and
vertical tracer-column controls. Native icons show a two-dimensional pixel
panel. The inspector shows a larger version with the sampled column marked.

## Frame contract

`programmableMaskFrame(params, device, timeSeconds)` returns one normalized
current frame: `version`, `device`, `mode`, `pattern`, `index`, `count`, `grid`,
optional normalized `rowEdges`, `column`, and physical `length`.

| Field | Meaning |
| --- | --- |
| `maskPattern` | `uniform`, `stripes`, `checkerboard`, `spots`, `slices`, `hologram`, or `custom` |
| `maskFrames` | One JSON 2D grid or a list of 2D grids; normalized storage is always a list |
| `maskMode` | SLM `phase` (cycles from 0 to 1) or `amplitude` (intensity transmission from 0 to 1) |
| `maskLevel` | Uniform pixel value; DMD thresholds at 0.5 |
| `maskFrame` | Initial/current frame index, from 0; wraps within the available sequence |
| `maskPlayback`, `maskRateHz` | Optional discrete frame playback at an illustrative 0.05–10 frames/s |
| `maskSlice` | Horizontal position, 0–1, of the vertical column sampled by the 2D tracer |
| `pitch`, `duty` | Physical pitch and bright fraction of a static stripe frame |

Custom data is bounded to 16 frames of at most 32 × 32 pixels. A missing,
non-numeric, or non-finite pixel is zero; ragged rows are dark-padded. Numeric
values clamp to [0,1]. DMD values become binary at 0.5. Oversized JSON text is
rejected before parsing. Invalid interactive JSON leaves the existing frame
untouched and displays a field validation message. Empty imported custom data
becomes a dark frame.

Presets use small deterministic 2D grids. Slice frames are a filled square, a
square outline, a cross, and a ring. Playback uses
`floor(timeSeconds * maskRateHz)`; no continuously translated stripe phase
exists. Both the native visual and its optical surface receive the same clock.
Static exports use the selected starting frame, and animated exports use the
same explicit time argument as the live canvas. This clock illustrates frame
changes; it is not a calibrated DMD refresh or pulse synchronization model.

`sampleProgrammableFrame(frame, height, column)` returns the selected pixel,
its intensity transmission, and its displayed phase cycles. The coordinate
`height` runs along the physical active face. A DMD ON pixel routes to its
positive micromirror-tilt port; an OFF pixel is rejected or goes to the optional
OFF port. SLM amplitude values multiply **intensity**, not field amplitude.
Phase values alone preserve ray direction and power: the geometric tracer
does not infer a wavefront or CGH solution from those colors.

## Optical effects are separate

Both devices support optional bounded angular orders and either a linear
spectral-angle slope or a relative grating-carrier proxy. Selecting an
illustrative hologram image alone does not enable these effects. Likewise,
changing the configured angular orders does not claim to synthesize the
displayed hologram. The inspector names them as geometric controls.

| Effect | Behavior and boundary |
| --- | --- |
| `holographicOrders` | 1–8 equal-power angular branches, centered at `scanAngle` and spanning `focusSpan` |
| Linear spectrum | Bounded slope about `dispersionReferenceNm`, clipped at ±80° |
| Relative carrier | `asin(order * (wavelength - designWavelength) / spacing)` with finite grazing bounds |
| SLM `focusgrid` optical layer | Each illuminated aperture sample branches to every configured paraxial focus axis; it is not partitioned into lenslets |
| Existing SLM layers | Lenslets, gratings, steering and speckle retain their previous order and behavior |

The shared `shaper` interaction handles these operations without duplicating
the tracer for individual papers. Spectral cells, continuum bounds, pulse
GDD, weak-order retention, and optional SLM residual zeroth-order light survive
the composition. Sampling budgets include programmed orders and focus-grid
layers. When a stack exceeds the existing 24-direction budget with real
orders, it retains the strongest branches with deterministic tie breaking;
it does not increase their power to conceal the omitted directions.

The residual SLM zeroth order is an unmodulated bypass fraction, reserved
before the programmed mask. A dark amplitude frame therefore does not remove
an explicitly enabled residual reflection. DMD OFF light is routed separately
and does not acquire the ON-port holographic or spectral effects.

These controls calculate geometric paths and bounded relative power. They do
not calculate arbitrary 2D/3D CGH fields, high-NA vector PSFs, diffraction
efficiency, pulse-front tilt, temporal-focusing confinement, calibrated voxel
dimensions, polymerization, or throughput.

## Array and order arrival previews

`arrival-preview.js` groups resin arrivals by source, stage and optical
channel. Microlens cells, metalens cells, angular holographic orders and
all-aperture focus orders attach a reusable channel identity. Every sampled
ray in a channel contributes its existing normalized source-power weight.
Neither the number of source samples nor the number of wavelength samples
creates extra apparent writing channels.

Each channel returns one **actual sampled arrival** nearest its weighted
center, plus the full endpoints and span of all its traced arrivals and their
optical-path range. It does not return an unweighted centroid as a fictitious
focus. The canvas draws a marker at that sampled point and a line across the
actual traced support. Defocusing therefore broadens the support instead of
leaving a convincing point at the average position. The group marker does not
use the older arbitrary depth-dependent size heuristic. Its pulse timing is
the representative ray's timing; no group pulse envelope is synthesized.

Ordinary serial source reference markers retain their previous behavior.
Markers and their grouping remain a qualitative arrival preview, with no
voxel-size, absorption, or curing interpretation. A half-open shared-edge
rule aligns metalens cells with the mask and microlens pixel convention,
preventing an ON pixel on the next cell's boundary from spuriously reviving a
dark neighbour.

## Save compatibility

Migration runs before registry normalization discards retired fields:

| Existing format | Explicit conversion |
| --- | --- |
| Main DMD `pitch` / `duty` | Static stripe frame with exact band edges; the former ray-routing law is preserved |
| Saha `spectralDispersion` | `spectralMode: linear`, keeping its reference wavelength and slope |
| Somers `disperseSpectrum` | `spectralMode: carrier`, keeping density, order and design wavelength |
| Somers `sequence` / `sequenceHz` | Discrete `slices` preset and illustrative playback rate; the old conveyor animation is intentionally replaced |
| Ouyang `pattern: hologram` | Illustrative 2D hologram preset plus explicit geometric angular-order settings; its count/span/steering survive |
| Gittard `focusgrid` layer | Preserved as a reusable all-aperture geometric focus-order layer |
| Gu `amplitude` layer | Converted to intensity frame data; legacy band edges preserve the exact old attenuation, including products of multiple masks |

The hidden bounded `maskLegacyBands` migration field preserves irregular band
divisions without quantizing them onto a new grid. Editing custom JSON clears
this migration field, making the entered grids authoritative. Legacy DMD
generic layer fields remain rejected as on main; the new DMD optical effects
do not reactivate the retired layer-based DMD format.

## Verification

`test/programmable-mask.test.js` covers bounded grids and malformed data,
binary/amplitude/phase semantics, exact legacy stripe sampling, migrations,
discrete playback, two-dimensional native pixels, weak-power retention,
zeroth-order bypass, both spectral proxies, coarsened spectral cells through
a filter, GDD preservation, stable save/reload, and conditional inspector
controls. Existing component, SLM spectrum, speckle and state tests remain
applicable. Final scene browser checks must inspect the integrated branch.
`test/arrival-preview.test.js` checks source/order separation, actual sampled
representatives, weighted power, sampling-independent channel counts,
defocused spread, and a dark array channel.
