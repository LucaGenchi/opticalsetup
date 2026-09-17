# Proposal: an integrated OPO element

Status: **implemented in #166**, with the design agreed in that PR. Luca
accepted bertona88's defaults with two changes: the unconverted pump is
discarded rather than given a port, and degeneracy uses the single signal port.
The sections below are the original proposal; **Agreed design** records what
was built where it differs.

## Agreed design

- **Ports:** signal S on the body axis, idler I a fixed 14 mm below it and
  parallel, both rotating with the body. There is no pump port: the
  unconverted pump, light outside the angular acceptance and pump outside the
  wavelength window are discarded inside the box. *Output idler* removes the
  idler's power; it is never handed to the signal.
- **Degeneracy:** everything generated leaves through the signal port and the
  idler toggle does not apply. Luca expects degeneracy not to be reached in
  use.
- **Input (simplified at Luca's request):** a rear aperture with a fixed ±20°
  angular acceptance, not a setting, as a geometric rule rather than a coupling
  calculation. There is no pump wavelength or pump window to set: whatever
  arrives is the pump, and the signal must be longer than it.
- **Output beams:** signal and idler each have an authored beam diameter
  (0 = a single line). A sized pump beam's samples keep their order across the
  output diameter, so clipping still costs power; a single-line pump is spread
  across the diameter with its power shared.
- **Timing:** the outputs take no path inside the box; their timing is
  referenced to the pump's arrival at the aperture. Pulse train identity,
  gates, declared chirp and the no-reconversion guard carry over.
- **Tuning:** a pure function of animation time (`opoSignalAt` in
  `parametric.js`). Sweep is at its minimum at t = 0, its maximum at T/2 and
  its minimum again at T; a collapsed range is fixed. Steps keep the authored
  order and duplicates, use index floor(t / dwell) mod N, and report entries
  that are not wavelengths; an empty list is "no valid tuning program". The
  saved signal wavelength is never rewritten, and the on-canvas λ knob only
  appears in Fixed mode. Spectrometers read the instantaneous line; they do not
  accumulate a sweep.
- **Shared model:** `opoConversion()` in `raytrace.js` holds the spectral,
  pulse, depletion and guard calculations for both the crystal and the element.
  The crystal routes its outputs collinearly as before; the element routes the
  same outputs to its ports.
- **Readouts:** no pump yet, pump rejected by angle, pump outside the
  wavelength window, no valid tuning program, invalid signal, zero depletion,
  and converting (with the signal set on the last trace).

## What is being asked for

On a real bench an optical parametric oscillator usually arrives as a closed
box: the pump goes in at the back, and the signal (and, optionally, the idler)
comes out of the front like a laser beam. Today OpticalSetup can only build an
OPO element by element: a crystal in OPO mode inside a hand-aligned cavity (see
*Synchronously pumped picosecond OPO* and *OPO ring cavity*). That is the right
teaching scene, but most setups that use an OPO only need its outputs.

Luca's request: a new element that **looks like the laser object** and **keeps
every capability the crystal's OPO mode has now**, packaged differently. It
should also let the signal wavelength, and with it the idler, either **sweep
across an interval** or **jump between wavelengths the user lists**.

## Behaviour

**Packaging.**
- A laser-style body with a pump input port on the back face and an output
  aperture on the front, labelled "OPO".
- It is not a source on its own. With no pump inside its acceptance window it
  emits nothing, and the readout says why. It is a transmissive element that
  converts the pump arriving at its input port.
- The signal leaves the front aperture along the body's axis.
- **Show idler** (checkbox, on by default) adds the idler as a separate line
  parallel to the signal, offset by a small fixed distance, as a real OPO's
  separate idler port would be. Off, the idler is not drawn: it is taken as
  dumped inside the box. Energy accounting stays Manley–Rowe either way.
- **Transmit residual pump** (checkbox, as in the crystal) sends the
  undepleted pump out of its own port or along the signal line. Which one is
  an open question below.

**Parameters carried over from the crystal's OPO mode (`parametric.js`),
with the same meaning:**
- pump λ and pump acceptance (± nm);
- signal λ, with the idler λ as a readout;
- output linewidths: signal as wide as the pump, signal width set with the
  idler derived, or both set, with their cm⁻¹ fields;
- output pulses: **transform-limited**, **duration set with spectral phase
  unknown**, or **duration set, positively chirped (assumed Gaussian)**, plus
  output duration (× pump duration);
- pump depletion, up to `MAX_OPO_DEPLETION`;
- readouts: *Oscillation* and *Outputs* (bandwidth in nm and cm⁻¹, and
  duration marked transform limited, chirped or phase unknown, for signal and
  idler).

**New: signal tuning.**
- *Tuning* is one of three choices:
  - **Fixed**: today's behaviour.
  - **Sweep**: the signal runs between a minimum and a maximum wavelength over
    a set period, as a triangle wave by default.
  - **Steps**: the user lists signal wavelengths (a list control like the
    AOTF channels) and a dwell time. The signal jumps between them in order.
- It is driven by the same animation clock the delay line and the stage use,
  so exports and GIFs are deterministic at a given time.
- The idler, its width, the pulse durations and the readouts follow the
  current signal at every instant. A wavelength that leaves no idler (signal
  at or shorter than the pump) makes that instant non-oscillating, as the
  crystal does now, rather than being clamped silently.
- The readouts show the current signal and idler, and in Sweep or Steps they
  also name the full tuning range or the list.

**Sharing the model.**
- The conversion is the crystal's: `opoWaves` and `opoPulse` in
  `parametric.js`, with the same "light is never converted twice by the same
  element" guard.
- The crystal's OPO branch in `raytrace.js` should become a shared helper that
  both elements call, not a copy, so the two cannot drift apart.

## What it should not claim

It is the same phenomenological model: no threshold, gain, build-up, cavity
length or synchronisation dependence, and no phase matching. The authored signal
wavelength is what tunes it, not a crystal angle, temperature or poling period.
A sweep is an authored tuning curve, not a prediction of how fast a real OPO
can be tuned or whether it stays oscillating across the range. The wiki
limitations should say so.

## Open questions for the PR

1. **Residual pump.** Should it leave through its own port (a third parallel
   line, like the idler) or along the signal axis?
2. **Idler offset.** Should the offset be fixed, or a parameter? Should the
   idler emerge on a side port at 90° instead?
3. **Pump coupling.** The input is a port the pump must hit within a small
   aperture and angle, like a fiber connector. Should a misaligned pump be
   rejected (the stricter, more honest choice) or accepted anywhere on the back
   face?
4. **Steps.** Hold each wavelength for the dwell time, or also offer a scanning
   "step and settle" with a readout per step, like the AOTF's sequential mode?
5. **Detectors.** While sweeping, a spectrometer reads the instantaneous line.
   Is an optional "accumulate over one period" view worth adding here, or
   should it be left to the detector work?

## Checklist

- [ ] `opo` element: body SVG, ports, params, readouts, direct-manipulation
      tune key (signal λ)
- [ ] shared OPO conversion helper used by both crystal and element; crystal
      tests unchanged
- [ ] idler as a parallel line with the toggle; residual pump port
- [ ] tuning: fixed / sweep / steps on the animation clock; determinism test at
      fixed times
- [ ] wiki page (real world, in OpticalSetup, limitations, references: the
      crystal page's OPO references, O'Donnell et al. 2019, and Genchi et al.
      2024 for a ps OPO pumped by a spectrally compressed green)
- [ ] wiki demo scene
- [ ] tests: parity with the crystal's OPO mode for the same settings; no pump
      means no output; pump outside acceptance; idler toggle keeps energy
      accounting; sweep and step wavelengths at chosen times; phase choices
- [ ] `CACHE_NAME` bump
