# Basic Two-Photon Polymerization

This is a paper-independent educational design. All optical choices, source
settings and motion ranges are illustrative. It is not a fabrication recipe.

The trace follows a 780 nm, 120 fs, 80 MHz source through a half-wave plate /
polarizer attenuator, a 2× Galilean expander, two galvos, two pupil relays,
a dry NA 0.65 objective and photoresist on a Z stage. Positive source power
is metadata; polarization controls change the traced relative power. Turning
emission off or setting source power to zero removes writing arrivals.

## Optical design

The expander uses −20 / +40 mm lenses with 20 mm separation, expanding the
1.2 mm source beam to 2.4 mm. The X and Y pivots are at (300,150) and
(300,310), with a 40 / 40 mm relay between them. Each pivot is one focal
length outside the relay. A 40 / 80 mm relay then images Y onto the objective
BFP at (540,310), giving a 4.8 mm beam inside the 6.5 mm pupil. Both complete
scanner→pupil maps have B=0 and C=0 under the [shared criterion](scan-relay-criterion.md).

The objective's EFL is 5 mm and working distance 1.5 mm. Its equivalent lens
plane is (545,310), front tip (548.5,310), BFP (540,310), and nominal sample
focus (550,310). The two folded controls are projected into one meridional
section; their combination is not a solved physical X/Y raster.

The Z stage translates the actual sample plane through a 0.1 mm range. Its
motion is a reversible illustration, not a calibrated write trajectory or
pulse-synchronized exposure. The optional detail view uses an explicitly
labeled fixed micrometer range and actual traced arrivals. It magnifies the
readout, not the optical coordinates or focal length.

## Try three controls

1. Select **fs source** and turn off **Emit traced rays**, or set power to zero.
   The writing path and new arrivals disappear. Rotate the half-wave plate
   to 45° to extinguish the path through the fixed linear polarizer.
2. Select a galvo and change its center angle. The focus moves laterally at
   the resin while its pupil stays centered. The default ±0.25° mechanical
   sweeps produce micrometer-scale motion; inspect the sample detail.
3. Play **Mechanics** to move the Z stage, or select **Static** to stop it.
   Away from the focus the traced arrival support broadens. Move the final
   relay along its axis to disturb pupil conjugacy and compare acceptance.

Two-photon excitation depends strongly on local intensity and is concentrated
near a focused ultrashort pulse. A voxel is a small exposed material volume;
the native marker is only a qualitative pulsed arrival. The model calculates
neither a high-NA PSF nor voxel dimensions, dose, cure threshold, kinetics or
throughput. The configured-value calculator handoff is disabled for this
illustrative design.

Native full-beam/relay, controls and persistence checks live in
`test/2pp-basic-integrated.test.js`. Browser acceptance is recorded separately.
