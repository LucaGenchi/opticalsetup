# Photonic Professional GT technical data (benchmark datasheet)

## Source identity

- Apparatus ID: `nanoscribe-gt`
- Benchmark year: 2014
- Primary source: Nanoscribe, *Photonic Professional GT* data sheet, `DS/GT/V04_2016`
- Source URL: <https://mdpi-res.com/d_attachment/polymers/polymers-10-00011/article_deploy/polymers-10-00011-s001.pdf?version=1513942821>
- Reviewed file SHA-256: `471bd66e9974798b34f58c4098c8a12450d239d3aeea25838a8da59b60755d6f`
- Conflict: the retrieved source is a 2016 revision. It documents a GT product family, but does not prove the exact configuration used for the benchmark labelled 2014.

## Evidence table

| Claim | Source location | Status |
| --- | --- | --- |
| Two writing modes move the focus relative to the photoresist: piezo for arbitrary 3D trajectories and galvo for layer-by-layer structuring | p. 1, opening product description | Reported |
| Turnkey NIR fibre laser, ultra-fast XY galvo scanner, motorized XY stage, XYZ piezo stage, microscope/objectives and microscope camera | p. 1, labelled system photograph | Reported as system components; not an optical-train prescription |
| Automatically exchangeable scanning objectives are an option | p. 1, Options, Accessories & Consumables | Reported; objective model and NA are not given |
| Typical beam scanning speed 10 mm/s | p. 2, Technical details / Printing performance | Reported |
| Typical piezo scanning speed 100 um/s | p. 2, Technical details / Printing performance | Reported |
| Motorized-stage accessible print area 100 x 100 mm2 | p. 2, Technical details / Printing performance | Reported |
| XYZ piezo range 300 x 300 x 300 um3 | p. 2, Technical details / Printing performance | Reported |
| Galvo scan range 200-600 um diameter, dependent on scanning objective | p. 2, Technical details / Printing performance | Reported; no specific objective/range pair is given |
| Laser source is NIR femtosecond | p. 2, Laser source & safety | Reported; wavelength, repetition rate, duration and optical power are absent |
| Average power consumption below 500 W | p. 2, Electrical properties | Electrical input only; not optical laser power |
| Document revision | p. 2 footer, `DS/GT/V04_2016` | Reported; establishes 2016 revision, not an exact 2014 build |

## Functional interpretation

The scene implements an interpreted optical order through the documented subsystems: NIR femtosecond source, proprietary beam delivery, serial XY galvo scanner, relay to an exchangeable objective, and a resin sample carried by a fine XYZ piezo stage on a coarse XY positioning system. The p. 1 photograph only labels product subsystems. It does not reveal the internal attenuator, polarization optics, beam-expansion ratio, scanner separation, scan/tube-lens prescriptions, pupil conjugates, objective catalogue number, detection path, or proprietary laser architecture.

To make the workbench trace and animate, the native scene adds a 780 nm, 100 fs, 80 MHz, 80 mW source; two packaging folds; two moving galvos; an 80 mm + 80 mm 4f relay; and a generic 40x oil, NA 1.4 objective. Every one of those values or components is labelled **Free interpretation - not specified in the datasheet**. The relay images the projected scanner region toward the objective pupil and the objective forms a traced focus in the resin. The two physical scanner axes are perpendicular in the instrument; OpticalSetup is a 2D meridional workbench, so both axes are deliberately projected into the same drawn plane. This shows that both mirror commands move the computed focus, but it does not reproduce an XY field map or calibrated scan geometry.

The optional piezo control uses 0.3 mm travel. A triangle sweep at 1/6 Hz has a constant leg speed `2 x 0.3 mm x 1/6 Hz = 0.1 mm/s = 100 um/s`, matching the reported typical piezo speed. It remains static by default so the galvo mechanism is visually isolated. The illustrated galvo drive frequencies and angular amplitudes are invented for a watchable preview; the 10 mm/s linear beam speed cannot determine a mirror frequency without a scan field and trajectory.

## Controls to try

1. **Laser enable:** select the pulsed laser and turn off **Emit traced rays**. The entire computed route and new write arrivals disappear. Zero average power has the same effect. Changing positive average power changes source/peak-power readouts, but OpticalSetup does not calibrate voxel dose or curing.
2. **Galvo hold:** set both galvos to **Static** with a 0 degree centre command. The beam remains centred and the sample is still reached, but the focus stops scanning. Re-enable the sine scans to see both mirrors move and the downstream hit shift.
3. **One projected axis:** leave the X galvo moving and set the Y galvo amplitude to zero, then swap them. Each mirror independently changes the computed downstream path. Because both real axes are collapsed into the drawing plane, this is a mechanism check rather than an XY calibration.
4. **Piezo mode:** set the sample stage to **XY - long axis**. The mounted resin moves through the fixed focus over the reported 300 um range at the configured 100 um/s leg speed. **XYZ sync - raster** is an educational raster proxy, not a disclosed Nanoscribe trajectory.
5. **Relay conjugation:** change either free-interpretation relay focal length away from 80 mm. The objective-pupil fill and sample hit change or clip, demonstrating why scanner/pupil relay geometry matters; it does not reveal Nanoscribe's proprietary prescription.

## Supported and unsupported handoff

The native resin scene retains `handoffBasis=interpretation` on its source, but numeric transfer is disabled. The companion currently cannot preserve that provenance; sending `basis=interpretation` is insufficient because an unsupported query value can be ignored. The invented 780 nm, 80 mW, 80 MHz, 100 fs and NA 1.4 inputs therefore stay in this teaching scene. The resin inspector explains the disabled transfer. There is no paper preset: the verified vendor settings object is empty because none of those optical quantities is specified. Scan speed, piezo travel and motorized area are apparatus controls and are unsupported by the calculator contract. The workbench preview is geometric only; it does not establish a calibrated 2PP prediction.

## Model limits

- No vendor optical prescription, polarization state, diffraction model, vector PSF, aberration, resin threshold, dose accumulation, cure kinetics, autofocus, observation return path or camera image is reconstructed.
- The two-axis scanner is serial and animated, but the single drawing plane collapses orthogonal X and Y deflections.
- The native voxel marker records pulsed arrivals at a resin plane. It is not a feature-size, resolution or throughput calculation.
- The 2016 sheet cannot establish the exact 2014 machine configuration.

## Verification renders

- [Default animated-galvo frame](../verification/nanoscribe-gt-default.png)
- [Both galvos held static](../verification/nanoscribe-gt-static-galvos.png)
- [Laser disabled](../verification/nanoscribe-gt-laser-off.png)

These PNGs were rasterized from OpticalSetup's own deterministic SVG export of the native scene and the stated control mutations. They are not redrawn beam paths or a substitute workbench.


## PR 127 review — 2026-09-05

Re-read both supplied datasheet pages and visually inspected the labelled system photograph. The source is still the 2016 revision; the optical source values, objective and relay remain interpretations. The text now distinguishes an interpreted optical order from the vendor’s documented subsystems.

Fixed a provenance loss: the companion does not support `basis=interpretation`, so adding that query parameter did not guarantee that invented settings would remain labelled. The URL builder now refuses interpreted sources and the illuminated resin inspector explains the disabled transfer. This survives save/reload and also protects an interpreted source moved to another sample. Ordinary user-configured handoffs still work.

Repositioned the title/source and resized the crop to prevent clipped bounds, moved the objective label above the sample bracket to remove their collision, and regenerated all three native preview images. Applied the shared source correction so zero optical power no longer emits light or leaves resin arrivals.

Validation: `npm test` passed (782 tests); every `sketch/js/*.js` and `serve.mjs` passed `node --check`; `git diff --check` passed. Regressions cover each galvo independently, held scanners, the 300 um piezo moving the material through a fixed focus, laser off/zero power, save/reload, unsupported-provenance handoff and inspector copy, and every component/text bound inside the Figure frame. Updated [default](../verification/nanoscribe-gt-default.png), [held galvos](../verification/nanoscribe-gt-static-galvos.png) and [laser-off](../verification/nanoscribe-gt-laser-off.png) PNGs were generated from native SVG exports and visually inspected. Live browser verification is recorded separately by the collection reviewer; these exports do not claim browser UI coverage.


## Shared collection integration

The common loader now resolves existing `paper`, `setup` and `collection` links to the same native scene. Explicit edit links open the workbench; embed links stay locked and do not replace autosave. The common builder discovers authored files so this contribution can coexist with other paper scenes. The service worker revision updates the loader for returning users. The source record is preserved and an additive reviewed handoff object has an empty settings subset: the datasheet supplies no supported numeric optical settings, so no paper calculator preset is generated.

Final integration checks: `npm test` passed (806 tests), all workbench JavaScript and `serve.mjs` passed syntax checks, and `git diff --check` passed. Collection pages were rebuilt with the common builder.

Current-workbench integration keeps embedded previews inert (`embedMode`), while explicit edit links preserve the existing workbench through replacement consent and undo recovery. A shared snapshot is retired only after successful autosave. The native scientific scene and its reviewed controls are unchanged.
