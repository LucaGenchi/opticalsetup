# Sample-plane arrival detail

A **Sample on piezo stage** can display an optional upright inset by enabling
**Sample-plane arrival detail → Show arrival-detail inset** in its inspector.
It is disabled by default and does not change the optical surfaces or existing
sketch behavior.

The horizontal axis is the specimen's local transverse coordinate, relative to
the current stage centre, in micrometres. The field stays fixed while the galvo
or stage moves. Native SVG is shared by the live canvas and SVG/PNG/GIF export;
automatic fitted bounds include the inset. An authored Figure frame still
defines its own crop.

| Saved parameter | Default | Meaning |
| --- | ---: | --- |
| `showArrivalDetail` | `false` | Enable the inset |
| `arrivalDetailRangeUm` | `100` | Fixed half-field, giving an axis from −100 to +100 µm |
| `arrivalDetailOffsetX` | `45` | Inset left edge, world mm right of the stage centre |
| `arrivalDetailOffsetY` | `-150` | Inset top edge, world mm below the stage centre; negative is above |
| `arrivalDetailWidth` | `220` | Inset width in world mm; minimum 210 |
| `arrivalDetailHeight` | `120` | Inset height in world mm; minimum 110 |
| `arrivalDetailFontSize` | `18` | Requested heading size in world mm, bounded to 12–36; all text and internal spacing scale together |

Offsets stay in world axes when the stage rotates, and the text stays upright.
The inset moves with the stage. For an upper-right placement, set a positive X
offset and a negative Y offset.

For a larger bench fitted into a small canvas, a 320 × 190 mm inset with
`arrivalDetailFontSize: 26` increases readability. Text size does not change the
saved outer width, height, offset or micrometre field. It is capped when needed
to retain a logical layout of at least 210 × 110 mm, so enlarge the panel to
accommodate larger type. Existing sketches retain the default 18/16 mm text.

Each row represents a native source and physical optical route, such
as an array order or lenslet. Increasing the numerical ray sample count does
not create extra channels. All spatial rays reaching the specimen contribute,
including the outer rays of a serial beam; a Z displacement therefore shows
the sampled geometric spread instead of retaining a sharp centre marker.

Ticks mark actual specimen-surface hits. The pale connecting bar spans their
sampled minimum and maximum, without implying a continuous intensity profile.
There is no calculated centroid marker. Mounting hardware is excluded. A source
that is off, blocked or no longer reaches the sample leaves an empty plot.
Off-field arrows indicate arrivals outside the chosen field; those arrivals
are not clamped into apparent edge hits.

This is a geometric sampling display, not a diffraction PSF, calibrated spot
size, voxel, exposure, cure threshold or dose calculation. Empty intervals
between ticks can be unresolved by the tracer. The inset shows at most eight
channel rows when its height permits; the header reports visible/total paths
when some rows do not fit. Font size remains independent of panel size up to
the limit needed to keep labels inside the panel.
Storage is bounded at 128 channels and
1,024 ticks per channel, with explicit truncation notices; min–max support for
stored channels continues to include later arrivals. Only the display settings
are saved; trace results are recomputed.
