<!-- SPDX-FileCopyrightText: 2026 Luca Genchi and contributors -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Optical design patterns: initial survey

**Status:** catalogue source, first surveyed 3 October 2026. Published entries and
their concrete examples are generated at [`/patterns/`](https://opticalsetup.com/patterns/).

This document preserves the first broad survey for a possible **Design patterns**
section of the OpticalSetup wiki. It records 162 candidate entries across 19
functional groups, spanning laboratory optics, industrial systems, biomedical
instruments, astronomical instruments, guided and integrated photonics, displays,
and energy collection. The catalogue is open to additions and corrections.

The names, group boundaries and fields preserve the initial survey. The page
generator reads the records below; example designs and model-scope assessments
live in `tools/patterns/`. Examples distinguish editable schematics from tested
ray demonstrations. The original editorial questions below remain useful review
notes, rather than claims that every physical effect is simulated.

## What belongs in the catalogue

An optical design pattern describes a recurring problem, an arrangement that
solves it, and the conditions or trade-offs that make the arrangement useful.
It can be a small optical layout, a family of layouts, a measurement architecture,
or a control architecture. A technique belongs here when its reusable optical
arrangement can be explained; its name alone is insufficient.

- **Component article:** what an individual element does and how it works.
- **Component breakdown:** an element-by-element explanation of a packaged
  component; normally a section of that component's article.
- **Pattern article:** a reusable arrangement and the problem it addresses.
- **Example:** a particular configuration with chosen values and a specific
  experiment, comparison, or application to explore.

For example, a mechanical delay line can have an exploded view in its component
article. **Fixed-output variable delay** is the wider pattern: change optical path
length while preserving the output geometry. Likewise, a scan lens is an ingredient
of a scanning arrangement, and a complete scanning microscope can combine several
patterns. A minimal interactive diagram can support a pattern article without
requiring a separate example page.

## Proposed fields and filters

Each record below has the same ten fields. The short ID and heading identify the
record; IDs are editorial references, not a proposed scene or API format.

| Field | Meaning | Possible browsing use |
| --- | --- | --- |
| Description | A short explanation of the recurring solution. | Card summary and full-text search. |
| Main function | One primary job, drawn from the vocabulary below. | Primary function filter, such as handling pulses or comparing optical fields. |
| Disciplines | Research or engineering fields in which it is used. | A multi-value discipline filter. |
| Applications | Concrete tasks or instruments within those disciplines. | Searchable application tags; vocabulary still needs consolidation. |
| Type | Optical layout, pattern family, measurement architecture, or control architecture. | Optional type filter. |
| Arrangement and variants | The optical topology and representative realizations. | Search, comparison, and links to component articles. |
| Key constraints | The main condition, limitation, or design trade-off. | Article guidance; candidate comparison fields. |
| Related patterns | Other survey records that help explain or compose the arrangement. | Cross-links; relation types still need review. |
| Usually combined with | Complementary patterns used together in a stated context. | Combination suggestions across disciplines. |
| Usually followed by | A typical next stage along a specified optical or measurement path. | Directional links for exploring a possible system. |

**The three relationship fields answer different questions.** Related patterns
may be analogues, alternatives, parent concepts, or useful comparisons. Usually
combined with describes co-use without imposing an order. Usually followed by
describes an illustrative downstream stage and states the relevant path or use.
Here, "usually" means a representative design convention, not a measured claim
about prevalence. These are editorial suggestions to verify, not mandatory recipes.
Feedback loops, bidirectional paths, branching systems, and terminal detectors
are identified explicitly rather than forced into a linear chain. A downstream
stage may be a detector, sample, or reconstruction step rather than another pattern.

**Disciplines and applications are different fields.** Microscopy is a discipline;
fluorescence collection is an application. Ultrafast optics is a discipline;
pump-probe timing is an application. The same record can belong to several
disciplines and support several applications.

A possible browser would offer **Function**, **Discipline**, **Application**, and
**Type** filters. Selecting several values within one field could use OR, while
combining fields could use AND. This interaction is a proposal to discuss, not a
UI specification. For example: `Function: Handling pulses and nonlinear interactions`
plus `Discipline: Terahertz optics` should find electro-optic sampling and relevant
pulse architectures. Secondary function tags could later connect entries across
functional groups without duplicating their articles.

The functional index provides the current primary-function vocabulary. It mixes
broad reusable jobs with a few environment-specific jobs, such as operating in
X-ray/EUV regimes. A later editorial pass should test whether those specialist
groups work better as discipline filters. The current groups preserve the breadth
of the initial survey rather than fixing the final navigation.

## Reading this survey

Descriptions and constraints are concise design notes, not optical prescriptions.
The linked sources are reading leads for the explicitly named records or
realizations. They do not validate every field in the catalogue. Per-entry
references, equations, scope, and examples need review before publication.
The catalogue's grouping and metadata are an editorial synthesis.

The survey includes wave, coherence, quantum, material, control, and reconstruction
behaviour beyond a 2D ray layout. Inclusion does not establish support in
OpticalSetup. Future articles should distinguish a diagram, a qualitative
demonstration, and a quantitatively supported model after checking the actual
implementation.

## Functional index

- [Transferring images, beams, and pupils](#img) — 9 entries.
- [Preparing and transforming beams](#beam) — 8 entries.
- [Illuminating and projecting](#ill) — 8 entries.
- [Scanning and changing optical paths](#scan) — 8 entries.
- [Separating, combining, and routing channels](#route) — 8 entries.
- [Comparing optical fields](#field) — 10 entries.
- [Selecting spatial signals and creating contrast](#contrast) — 8 entries.
- [Separating and measuring spectra](#spect) — 8 entries.
- [Recirculating and amplifying light](#cav) — 9 entries.
- [Handling pulses and nonlinear interactions](#pulse) — 10 entries.
- [Transporting optics into constrained spaces](#access) — 7 entries.
- [Correcting wavefronts and rejecting background](#wave) — 8 entries.
- [Operating in X-ray and EUV regimes](#xray) — 8 entries.
- [Transporting and processing guided optical information](#link) — 9 entries.
- [Preparing quantum states and manipulating particles](#quant) — 9 entries.
- [Measuring distance, shape, motion, and samples](#sense) — 10 entries.
- [Encoding measurements for reconstruction](#compute) — 8 entries.
- [Presenting images and distributing energy](#display) — 8 entries.
- [Stabilizing, calibrating, and diagnosing](#control) — 9 entries.

## Discipline vocabulary

Astronomy and astrophysics; Atomic physics; Biophotonics and life sciences; Chemical and surface sensing; Computational imaging; Displays and projection; Endoscopy and remote probes; Fiber optics and sensing; Flow and particle diagnostics; Industrial vision and inspection; Integrated photonics; Laser engineering; Lithography; Materials processing and fabrication; Microscopy; Ophthalmic imaging; Optical communications; Optical metrology; Photography and imaging; Quantum optics and information; Radiometry and photometry; Remote sensing and LiDAR; Solar energy and illumination; Spectroscopy and analytical chemistry; Terahertz optics; Ultrafast optics; X-ray and EUV instrumentation.

<a id="img"></a>

## 1. Transferring images, beams, and pupils

Reading leads: [Nikon on conjugate planes](https://www.microscopyu.com/microscopy-basics/conjugate-planes-in-optical-microscopy) supports the distinction behind IMG-01 and IMG-03; [Edmund Optics on telecentric design](https://www.edmundoptics.com/knowledge-center/application-notes/imaging/telecentric-design-topics) introduces IMG-05.

<a id="img-01"></a>

### IMG-01 — Image relay / 4f relay

- **Description:** Reimage an object plane at a chosen location and magnification.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Microscopy; Photography and imaging; Industrial vision and inspection; Displays and projection; Endoscopy and remote probes.
- **Applications:** Image transfer; camera placement; mask imaging.
- **Type:** Pattern family.
- **Arrangement and variants:** Two-lens focal-plane relay; equal or unequal focal lengths; reflective equivalents.
- **Key constraints:** Conjugate distances, apertures, and aberrations set usable field and resolution.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Fourier-plane filtering (BEAM-07)](#beam-07); [Fourier pulse shaping (PULSE-03)](#pulse-03).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) and [Fourier-plane filtering (BEAM-07)](#beam-07) when a relay exposes both image and Fourier planes.
- **Usually followed by:** A camera, another relay, or [Confocal excitation and detection (CONTRAST-01)](#contrast-01), depending on the image destination.

<a id="img-02"></a>

### IMG-02 — Afocal telescope / beam expander

- **Description:** Change a collimated beam's diameter and angular spread.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Laser engineering; Astronomy and astrophysics; Materials processing and fabrication; Microscopy.
- **Applications:** Pupil filling; beam delivery; angular magnification.
- **Type:** Pattern family.
- **Arrangement and variants:** Keplerian, Galilean, or reflective telescope with coordinated focal lengths.
- **Key constraints:** Expansion trades beam diameter against divergence; intermediate foci and clipping matter.
- **Related patterns:** [Mode matching (BEAM-03)](#beam-03); [Pupil relay (IMG-03)](#img-03); [Pupil-conjugate scanning (SCAN-01)](#scan-01).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for fiber or cavity delivery; [Pupil-conjugate scanning (SCAN-01)](#scan-01) for pupil filling.
- **Usually followed by:** [Mode matching (BEAM-03)](#beam-03) optics or [Pupil-conjugate scanning (SCAN-01)](#scan-01) optics in beam-delivery systems.

<a id="img-03"></a>

### IMG-03 — Pupil relay

- **Description:** Image a pupil onto an accessible optical plane.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Microscopy; Astronomy and astrophysics; Displays and projection; Laser engineering.
- **Applications:** Scanner placement; aperture control; wavefront correction.
- **Type:** Optical layout.
- **Arrangement and variants:** Relay optics between an entrance pupil and a scanner, stop, or corrector.
- **Key constraints:** Pupil position and magnification must stay compatible with the field and apertures.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Adaptive optics loop (WAVE-01)](#wave-01).
- **Usually combined with:** [Pupil-conjugate scanning (SCAN-01)](#scan-01) and [Adaptive optics loop (WAVE-01)](#wave-01) to place actuators at pupil conjugates.
- **Usually followed by:** The scanner, stop, or corrector at the relayed pupil, then imaging optics.

<a id="img-04"></a>

### IMG-04 — Infinity-corrected imaging

- **Description:** Use an objective and tube lens with an intermediate collimated space.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Microscopy; Industrial vision and inspection; Ophthalmic imaging.
- **Applications:** Accessory insertion; camera microscopy; modular imaging.
- **Type:** Optical layout.
- **Arrangement and variants:** Infinity objective followed by a matched tube lens and detector.
- **Key constraints:** Tube-lens choice, pupil position, and accessory apertures affect magnification and field.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Epi-illumination (ILL-03)](#ill-03); [Serial image relay (ACCESS-01)](#access-01).
- **Usually combined with:** [Epi-illumination (ILL-03)](#ill-03) for epi microscopy and [Wavelength combining and splitting (ROUTE-01)](#route-01) for multicolor collection.
- **Usually followed by:** A camera or a further [Image relay / 4f relay (IMG-01)](#img-01) stage after the tube lens.

<a id="img-05"></a>

### IMG-05 — Telecentric imaging

- **Description:** Control chief-ray directions in object space, image space, or both.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Industrial vision and inspection; Lithography; Optical metrology; Microscopy.
- **Applications:** Dimensional measurement; sensor illumination; projection.
- **Type:** Pattern family.
- **Arrangement and variants:** Place the aperture stop at the appropriate focal plane; object, image, or double telecentricity.
- **Key constraints:** Telecentricity has a finite tolerance and does not remove defocus or diffraction.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Scheimpflug imaging (IMG-07)](#img-07); [Reduction projection (ILL-07)](#ill-07).
- **Usually combined with:** [Reduction projection (ILL-07)](#ill-07) in projection and [Optical triangulation (SENSE-04)](#sense-04) in dimensional inspection.
- **Usually followed by:** The image sensor or exposure plane; there is no universal further optical stage.

<a id="img-06"></a>

### IMG-06 — Reflective imaging relay

- **Description:** Form images with powered mirrors over a chosen field and spectral range.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Astronomy and astrophysics; X-ray and EUV instrumentation; Terahertz optics; Industrial vision and inspection.
- **Applications:** Telescope imaging; broadband relays; infrared inspection.
- **Type:** Pattern family.
- **Arrangement and variants:** Cassegrain, Gregorian, Ritchey-Chretien, and three-mirror anastigmat families.
- **Key constraints:** Obscuration, field aberrations, alignment, and coating bandwidth remain design choices.
- **Related patterns:** [Stray-light baffling (WAVE-08)](#wave-08); [Nested grazing-incidence imaging (XRAY-02)](#xray-02); [Image relay / 4f relay (IMG-01)](#img-01).
- **Usually combined with:** [Stray-light baffling (WAVE-08)](#wave-08) for stray-light control; [Cold-stop matching (WAVE-07)](#wave-07) in thermal-infrared instruments.
- **Usually followed by:** An instrument focus feeding a camera or [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) instrument.

<a id="img-07"></a>

### IMG-07 — Scheimpflug imaging

- **Description:** Bring a tilted object plane into focus with coordinated optical and sensor tilts.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Photography and imaging; Industrial vision and inspection; Optical metrology; Flow and particle diagnostics.
- **Applications:** Oblique inspection; triangulation; laser-sheet imaging.
- **Type:** Optical layout.
- **Arrangement and variants:** Tilted object, lens principal plane, and image plane with compatible conjugates.
- **Key constraints:** The plane condition does not by itself guarantee acceptable depth of field or aberrations.
- **Related patterns:** [Telecentric imaging (IMG-05)](#img-05); [Optical triangulation (SENSE-04)](#sense-04); [Light-sheet illumination (ILL-06)](#ill-06).
- **Usually combined with:** [Light-sheet illumination (ILL-06)](#ill-06) in oblique plane observations; [Optical triangulation (SENSE-04)](#sense-04) in triangulation.
- **Usually followed by:** The tilted image sensor and geometric calibration.

<a id="img-08"></a>

### IMG-08 — Image rotation and derotation

- **Description:** Set or stabilize image orientation through an optical train.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Astronomy and astrophysics; Photography and imaging; Endoscopy and remote probes; Displays and projection.
- **Applications:** Field derotation; image erection; viewing orientation.
- **Type:** Pattern family.
- **Arrangement and variants:** Dove-prism, K-mirror, and other image-rotator arrangements.
- **Key constraints:** Rotation, parity, polarization effects, and beam displacement depend on topology.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Pupil relay (IMG-03)](#img-03); [Stray-light baffling (WAVE-08)](#wave-08).
- **Usually combined with:** [Image relay / 4f relay (IMG-01)](#img-01) stage optics; [Pupil relay (IMG-03)](#img-03) when pupil orientation matters.
- **Usually followed by:** An image relay or detector whose orientation is to be controlled.

<a id="img-09"></a>

### IMG-09 — Compensated zoom

- **Description:** Change magnification while maintaining a designated image plane.
- **Main function:** Transferring images, beams, and pupils
- **Disciplines:** Photography and imaging; Industrial vision and inspection; Displays and projection; Microscopy.
- **Applications:** Variable-field imaging; inspection; projection.
- **Type:** Pattern family.
- **Arrangement and variants:** Coordinated variator and compensator groups; mechanical or optical compensation.
- **Key constraints:** Focus, pupil location, and aberrations must remain controlled throughout the zoom range.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Telecentric imaging (IMG-05)](#img-05); [Focus-lock channel (CONTROL-05)](#control-05).
- **Usually combined with:** [Focus-lock channel (CONTROL-05)](#control-05) where active focus correction supplements zoom compensation.
- **Usually followed by:** A detector or projection target after the final imaging group.

<a id="beam"></a>

## 2. Preparing and transforming beams

Reading leads: [Edmund Optics on microlens arrays](https://www.edmundoptics.com/f/microlens-arrays/13812/) describes BEAM-06 realizations; [Hamamatsu on wavefront modulation](https://www.hamamatsu.com/us/en/our-company/business-domain/central-research-laboratory/optical-information-processing-and-measurement/wave.html) gives BEAM-08 applications.

<a id="beam-01"></a>

### BEAM-01 — Spatial filtering and recollimation

- **Description:** Select a cleaner spatial distribution at a focus and recollimate it.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Laser engineering; Optical metrology; Microscopy; Lithography.
- **Applications:** Beam cleanup; coherent illumination; interferometry.
- **Type:** Optical layout.
- **Arrangement and variants:** Focusing optic, pinhole or slit, and collimator.
- **Key constraints:** A smaller aperture rejects more structure but loses power and demands better alignment.
- **Related patterns:** [Single-mode filtering (BEAM-02)](#beam-02); [Fourier-plane filtering (BEAM-07)](#beam-07); [Afocal telescope / beam expander (IMG-02)](#img-02).
- **Usually combined with:** [Afocal telescope / beam expander (IMG-02)](#img-02) for expansion; [Two-plane beam-pointing control (CONTROL-02)](#control-02) for stable delivery.
- **Usually followed by:** Collimated-beam routing, [Mode matching (BEAM-03)](#beam-03), or illumination optics.

<a id="beam-02"></a>

### BEAM-02 — Single-mode filtering

- **Description:** Project collected light onto a supported guided spatial mode.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Fiber optics and sensing; Quantum optics and information; Astronomy and astrophysics; Optical metrology.
- **Applications:** Mode cleanup; interferometric collection; photon coupling.
- **Type:** Optical layout.
- **Arrangement and variants:** Mode-matching optics feeding a single-mode fiber or waveguide.
- **Key constraints:** Rejected modes become lost power; single-mode operation depends on wavelength and guide.
- **Related patterns:** [Mode matching (BEAM-03)](#beam-03); [Fiber-to-chip / free-space-to-chip coupling (LINK-07)](#link-07); [Coherent aperture combination (FIELD-10)](#field-10).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for input coupling; [Homodyne / heterodyne reception (FIELD-06)](#field-06) for coherent measurements.
- **Usually followed by:** Recollimation, a guided link, or the measurement detector.

<a id="beam-03"></a>

### BEAM-03 — Mode matching

- **Description:** Match beam size, waist location, and wavefront curvature to a receiving mode.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Laser engineering; Fiber optics and sensing; Quantum optics and information; Optical metrology.
- **Applications:** Cavity injection; fiber coupling; amplifier seeding.
- **Type:** Optical layout.
- **Arrangement and variants:** One or more adjustable powered optics before a fiber, cavity, or gain region.
- **Key constraints:** Alignment and phase-front overlap matter alongside geometric beam diameter.
- **Related patterns:** [Afocal telescope / beam expander (IMG-02)](#img-02); [Resonant enhancement (CAV-02)](#cav-02); [Fiber-to-chip / free-space-to-chip coupling (LINK-07)](#link-07).
- **Usually combined with:** [Afocal telescope / beam expander (IMG-02)](#img-02) for beam sizing; [Two-plane beam-pointing control (CONTROL-02)](#control-02) for injection stability.
- **Usually followed by:** The receiving fiber, [Resonant enhancement (CAV-02)](#cav-02) stage, or amplifier entrance.

<a id="beam-04"></a>

### BEAM-04 — Anamorphic beam shaping

- **Description:** Adjust the two transverse beam axes independently.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Laser engineering; Materials processing and fabrication; Spectroscopy and analytical chemistry; Industrial vision and inspection.
- **Applications:** Diode-beam circularization; slit matching; line illumination.
- **Type:** Pattern family.
- **Arrangement and variants:** Cylindrical telescopes, anamorphic prism pairs, or freeform optics.
- **Key constraints:** Astigmatism, orientation, and unequal axis magnifications require coordinated design.
- **Related patterns:** [Afocal telescope / beam expander (IMG-02)](#img-02); [Light-sheet illumination (ILL-06)](#ill-06); [Slit-collimator-disperser-camera (SPECT-01)](#spect-01).
- **Usually combined with:** [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for slit matching; [Light-sheet illumination (ILL-06)](#ill-06) for sheet formation.
- **Usually followed by:** The slit, line focus, or other target with unequal transverse requirements.

<a id="beam-05"></a>

### BEAM-05 — Irradiance remapping

- **Description:** Redistribute an input intensity profile into a target profile.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Laser engineering; Materials processing and fabrication; Lithography; Solar energy and illumination.
- **Applications:** Uniform exposure; controlled heating; top-hat illumination.
- **Type:** Pattern family.
- **Arrangement and variants:** Refractive, reflective, or diffractive beam shapers with a specified input distribution.
- **Key constraints:** Performance depends on input profile, alignment, propagation distance, and wavelength.
- **Related patterns:** [Beam homogenization (BEAM-06)](#beam-06); [Reduction projection (ILL-07)](#ill-07); [Multispot illumination (ILL-08)](#ill-08).
- **Usually combined with:** [Reduction projection (ILL-07)](#ill-07) for patterned exposure; [Power stabilization loop (CONTROL-01)](#control-01) for stable processing power.
- **Usually followed by:** The processing or illumination target at the designed working plane.

<a id="beam-06"></a>

### BEAM-06 — Beam homogenization

- **Description:** Mix or overlap beam portions to reduce illumination nonuniformity.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Materials processing and fabrication; Displays and projection; Solar energy and illumination; Microscopy.
- **Applications:** Laser processing; projector illumination; solar simulation.
- **Type:** Pattern family.
- **Arrangement and variants:** Fly-eye microlens arrays with a condenser; integrating rods or light pipes.
- **Key constraints:** Uniformity trades against angular spread, losses, and coherence-related speckle.
- **Related patterns:** [Irradiance remapping (BEAM-05)](#beam-05); [Kohler illumination (ILL-01)](#ill-01); [Light-guide distribution and extraction (DISPLAY-08)](#display-08).
- **Usually combined with:** [Kohler illumination (ILL-01)](#ill-01) for uniform illumination; [Light-guide distribution and extraction (DISPLAY-08)](#display-08) for light delivery.
- **Usually followed by:** Condenser or projection optics leading to the illuminated field.

<a id="beam-07"></a>

### BEAM-07 — Fourier-plane filtering

- **Description:** Select spatial frequencies or diffraction orders in an accessible Fourier plane.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Microscopy; Computational imaging; Laser engineering; Lithography.
- **Applications:** Order selection; optical filtering; hologram cleanup.
- **Type:** Optical layout.
- **Arrangement and variants:** Imaging or Fourier-transform optics with an amplitude or phase mask at the proper plane.
- **Key constraints:** Mask scale and location depend on wavelength and focal length; useful signal can be rejected.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Optical Fourier processing (COMPUTE-08)](#compute-08); [Diffractive focusing with order selection (XRAY-05)](#xray-05).
- **Usually combined with:** [Image relay / 4f relay (IMG-01)](#img-01) to expose a Fourier plane; [Programmable wavefront shaping (BEAM-08)](#beam-08) to select a generated order.
- **Usually followed by:** The output imaging or recollimating optics after the Fourier mask.

<a id="beam-08"></a>

### BEAM-08 — Programmable wavefront shaping

- **Description:** Control a field's spatial phase or amplitude through a relayed modulator.
- **Main function:** Preparing and transforming beams
- **Disciplines:** Microscopy; Materials processing and fabrication; Quantum optics and information; Computational imaging; Ophthalmic imaging.
- **Applications:** Multiple foci; aberration correction; holographic projection.
- **Type:** Pattern family.
- **Arrangement and variants:** Spatial light modulator or deformable mirror with relay and order-selection optics.
- **Key constraints:** Modulator sampling, polarization, efficiency, and calibration bound the attainable field.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Multispot illumination (ILL-08)](#ill-08); [Sensorless wavefront optimization (WAVE-03)](#wave-03).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) for pupil placement; [Fourier-plane filtering (BEAM-07)](#beam-07) for unwanted-order rejection.
- **Usually followed by:** In holographic systems, [Fourier-plane filtering (BEAM-07)](#beam-07) order selection and target-focusing optics.

<a id="ill"></a>

## 3. Illuminating and projecting

Reading leads: [Nikon on illumination conjugates](https://www.microscopyu.com/microscopy-basics/conjugate-planes-in-optical-microscopy) supports ILL-01; [ASML on pupil shaping and reduction projection](https://www.asml.com/en/products/duv-lithography-systems/twinscan-nxt-1965ci) illustrates ILL-04 and ILL-07.

<a id="ill-01"></a>

### ILL-01 — Kohler illumination

- **Description:** Control illuminated field and illumination aperture through separate conjugate-plane sets.
- **Main function:** Illuminating and projecting
- **Disciplines:** Microscopy; Lithography; Industrial vision and inspection.
- **Applications:** Uniform specimen illumination; independent field and aperture adjustment.
- **Type:** Optical layout.
- **Arrangement and variants:** Image the source into an aperture plane and the field stop into the specimen plane.
- **Key constraints:** Both conjugate sets must be aligned; uniformity still depends on source and optical quality.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Critical illumination (ILL-02)](#ill-02); [Pupil-shaped illumination (ILL-04)](#ill-04).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) and [Pupil-shaped illumination (ILL-04)](#ill-04) for pupil and illumination control.
- **Usually followed by:** The specimen, then the imaging objective and detector path.

<a id="ill-02"></a>

### ILL-02 — Critical illumination

- **Description:** Image the light source directly onto the plane being illuminated.
- **Main function:** Illuminating and projecting
- **Disciplines:** Microscopy; Industrial vision and inspection; Solar energy and illumination.
- **Applications:** Source-to-target transfer; compact illumination.
- **Type:** Optical layout.
- **Arrangement and variants:** Collector optics form a source image at the target.
- **Key constraints:** Source structure appears at the target; useful throughput competes with uniformity.
- **Related patterns:** [Kohler illumination (ILL-01)](#ill-01); [Beam homogenization (BEAM-06)](#beam-06); [Nonimaging concentration (DISPLAY-06)](#display-06).
- **Usually combined with:** [Beam homogenization (BEAM-06)](#beam-06) when source nonuniformity needs reduction.
- **Usually followed by:** The illuminated sample or target; collection geometry is application-dependent.

<a id="ill-03"></a>

### ILL-03 — Epi-illumination

- **Description:** Share an objective between illumination and signal collection.
- **Main function:** Illuminating and projecting
- **Disciplines:** Microscopy; Ophthalmic imaging; Industrial vision and inspection; Spectroscopy and analytical chemistry.
- **Applications:** Fluorescence; reflected-light inspection; Raman microscopy.
- **Type:** Optical layout.
- **Arrangement and variants:** Illumination separator, shared objective, and filtered detection branch.
- **Key constraints:** Excitation leakage, back-reflections, and spectral separation limit weak-signal collection.
- **Related patterns:** [Wavelength combining and splitting (ROUTE-01)](#route-01); [Polarization-based send/return separation (ROUTE-04)](#route-04); [Excitation cleanup and rejection (SPECT-07)](#spect-07).
- **Usually combined with:** [Wavelength combining and splitting (ROUTE-01)](#route-01) for fluorescence separation; [Excitation cleanup and rejection (SPECT-07)](#spect-07) for excitation rejection.
- **Usually followed by:** On collection, spectral rejection and imaging or [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) readout.

<a id="ill-04"></a>

### ILL-04 — Pupil-shaped illumination

- **Description:** Choose the angular illumination distribution by structuring a pupil plane.
- **Main function:** Illuminating and projecting
- **Disciplines:** Lithography; Microscopy; Industrial vision and inspection.
- **Applications:** Annular illumination; dipole or quadrupole illumination; contrast control.
- **Type:** Pattern family.
- **Arrangement and variants:** Pupil masks, source shaping, or a modulator relayed to an illumination pupil.
- **Key constraints:** Field uniformity, angular coverage, coherence, and throughput must be designed together.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Dark-field collection (CONTRAST-03)](#contrast-03); [Kohler illumination (ILL-01)](#ill-01).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) and [Kohler illumination (ILL-01)](#ill-01) to control illumination angles independently of field.
- **Usually followed by:** The condenser or illumination objective and specimen.

<a id="ill-05"></a>

### ILL-05 — Structured illumination / pattern projection

- **Description:** Project known spatial patterns for excitation, exposure, or measurement.
- **Main function:** Illuminating and projecting
- **Disciplines:** Microscopy; Materials processing and fabrication; Industrial vision and inspection; Biophotonics and life sciences; Computational imaging.
- **Applications:** Structured-illumination microscopy; optogenetics; maskless exposure.
- **Type:** Pattern family.
- **Arrangement and variants:** Image a mask, DMD, or SLM onto the target; optionally step phase or orientation.
- **Key constraints:** Projection contrast and calibration set performance; computational uses need a matching acquisition model.
- **Related patterns:** [Reduction projection (ILL-07)](#ill-07); [Fringe projection profilometry (SENSE-05)](#sense-05); [Single-pixel imaging (COMPUTE-05)](#compute-05).
- **Usually combined with:** [Reduction projection (ILL-07)](#ill-07) for projected scale; [Reference-channel normalization (CONTROL-06)](#control-06) for measurement normalization.
- **Usually followed by:** The sample, followed by imaging or [Single-pixel imaging (COMPUTE-05)](#compute-05) integrated detection.

<a id="ill-06"></a>

### ILL-06 — Light-sheet illumination

- **Description:** Restrict excitation to a thin plane within the observed volume.
- **Main function:** Illuminating and projecting
- **Disciplines:** Microscopy; Biophotonics and life sciences; Flow and particle diagnostics.
- **Applications:** Optical sectioning; particle imaging; volumetric microscopy.
- **Type:** Pattern family.
- **Arrangement and variants:** Cylindrical focusing or a scanned beam; orthogonal or oblique detection arrangements.
- **Key constraints:** Sheet thickness, useful propagation length, and access geometry trade against each other.
- **Related patterns:** [Remote focusing (SCAN-05)](#scan-05); [Confocal excitation and detection (CONTRAST-01)](#contrast-01); [Scheimpflug imaging (IMG-07)](#img-07).
- **Usually combined with:** [Remote focusing (SCAN-05)](#scan-05) for volumetric acquisition; [Scheimpflug imaging (IMG-07)](#img-07) for suitable oblique imaging geometries.
- **Usually followed by:** Fluorescence collection along the detection axis; the illumination path ends beyond the sheet.

<a id="ill-07"></a>

### ILL-07 — Reduction projection

- **Description:** Transfer a mask or modulator image to a target at reduced scale.
- **Main function:** Illuminating and projecting
- **Disciplines:** Lithography; Materials processing and fabrication; Displays and projection; Industrial vision and inspection.
- **Applications:** Wafer exposure; photopatterning; projection printing.
- **Type:** Optical layout.
- **Arrangement and variants:** Illuminated reticle or modulator followed by a corrected reduction imaging system.
- **Key constraints:** Resolution, field, distortion, telecentricity, and illumination coherence must be coordinated.
- **Related patterns:** [Telecentric imaging (IMG-05)](#img-05); [Pupil-shaped illumination (ILL-04)](#ill-04); [Structured illumination / pattern projection (ILL-05)](#ill-05).
- **Usually combined with:** [Telecentric imaging (IMG-05)](#img-05) for telecentric projection; [Pupil-shaped illumination (ILL-04)](#ill-04) for illumination design.
- **Usually followed by:** The resist, modulator target, or projection surface.

<a id="ill-08"></a>

### ILL-08 — Multispot illumination

- **Description:** Distribute excitation or processing light across several target points.
- **Main function:** Illuminating and projecting
- **Disciplines:** Materials processing and fabrication; Microscopy; Biophotonics and life sciences; Quantum optics and information.
- **Applications:** Parallel machining; stimulation; multiple optical traps.
- **Type:** Pattern family.
- **Arrangement and variants:** Diffractive fan-out, microlens arrays, or programmable holographic splitting.
- **Key constraints:** Power per spot, uniformity, crosstalk, and unwanted orders limit scaling.
- **Related patterns:** [Programmable wavefront shaping (BEAM-08)](#beam-08); [Beam homogenization (BEAM-06)](#beam-06); [Holographic trap arrays (QUANT-07)](#quant-07).
- **Usually combined with:** [Programmable wavefront shaping (BEAM-08)](#beam-08) for programmable spots; [Power stabilization loop (CONTROL-01)](#control-01) for exposure control.
- **Usually followed by:** The sample or [Holographic trap arrays (QUANT-07)](#quant-07) trapping region, with application-specific collection.

<a id="scan"></a>

## 4. Scanning and changing optical paths

Reading leads: [NIST's double-pass AOM](https://www.nist.gov/publications/compact-double-pass-acousto-optic-modulator-system) supports SCAN-07; [oblique-plane microscopy with remote focusing](https://www.nature.com/articles/s41467-023-43741-x) illustrates SCAN-05.

<a id="scan-01"></a>

### SCAN-01 — Pupil-conjugate scanning

- **Description:** Move a focused spot while keeping the scan pivot conjugate to the objective pupil.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Microscopy; Materials processing and fabrication; Remote sensing and LiDAR; Ophthalmic imaging.
- **Applications:** Laser scanning; retinal imaging; scanned processing.
- **Type:** Optical layout.
- **Arrangement and variants:** Scanner followed by scan/tube-lens relay and focusing objective.
- **Key constraints:** Pupil walk, clipping, aberrations, and scan range determine useful field.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Relay between scan axes (SCAN-02)](#scan-02); [F-theta scanning (SCAN-04)](#scan-04).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03), [Relay between scan axes (SCAN-02)](#scan-02), and [Mode matching (BEAM-03)](#beam-03) in scanned beam delivery.
- **Usually followed by:** The focusing objective and scanned target; the return may use [Scan-descan (SCAN-03)](#scan-03).

<a id="scan-02"></a>

### SCAN-02 — Relay between scan axes

- **Description:** Make separated scanner axes optically conjugate.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Microscopy; Materials processing and fabrication; Remote sensing and LiDAR.
- **Applications:** Two-axis scanning; pupil-walk reduction.
- **Type:** Optical layout.
- **Arrangement and variants:** Image the first scanning mirror onto the second with an intervening relay.
- **Key constraints:** Relay magnification, mirror apertures, and alignment couple the two scan ranges.
- **Related patterns:** [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Image relay / 4f relay (IMG-01)](#img-01); [Pupil relay (IMG-03)](#img-03).
- **Usually combined with:** [Pupil-conjugate scanning (SCAN-01)](#scan-01) to keep both scan axes at suitable pupil conjugates.
- **Usually followed by:** The second scanner and final scan relay/objective.

<a id="scan-03"></a>

### SCAN-03 — Scan-descan

- **Description:** Undo the scanning motion on the return path before detection.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Microscopy; Ophthalmic imaging; Spectroscopy and analytical chemistry.
- **Applications:** Confocal detection; fixed-pinhole collection.
- **Type:** Optical layout.
- **Arrangement and variants:** Collected light retraces the scanning optics before a detection branch.
- **Key constraints:** Reciprocal path alignment is essential; non-descanned collection may suit scattered light better.
- **Related patterns:** [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Confocal excitation and detection (CONTRAST-01)](#contrast-01); [Epi-illumination (ILL-03)](#ill-03).
- **Usually combined with:** [Confocal excitation and detection (CONTRAST-01)](#contrast-01) for a stationary detection aperture; [Epi-illumination (ILL-03)](#ill-03) for return separation.
- **Usually followed by:** Detection-path separation, a pinhole or fiber, and the detector.

<a id="scan-04"></a>

### SCAN-04 — F-theta scanning

- **Description:** Map scan angle to a designed displacement across a working plane.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Materials processing and fabrication; Lithography; Industrial vision and inspection.
- **Applications:** Laser marking; engraving; flat-field scanning.
- **Type:** Optical layout.
- **Arrangement and variants:** Scanner feeding a purpose-designed f-theta scan lens.
- **Key constraints:** Linearity, field curvature, spot quality, and telecentricity are separate specifications.
- **Related patterns:** [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Telecentric imaging (IMG-05)](#img-05); [Irradiance remapping (BEAM-05)](#beam-05).
- **Usually combined with:** [Afocal telescope / beam expander (IMG-02)](#img-02) for pupil filling; [Power stabilization loop (CONTROL-01)](#control-01) for processing power.
- **Usually followed by:** The working plane; any process-monitoring optics form a separate branch.

<a id="scan-05"></a>

### SCAN-05 — Remote focusing

- **Description:** Shift the observed or excited plane by adjusting remote optics.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Microscopy; Biophotonics and life sciences; Ophthalmic imaging.
- **Applications:** Fast axial imaging; oblique-plane readout; stationary-sample scanning.
- **Type:** Pattern family.
- **Arrangement and variants:** Matched remote objectives, moving remote reflector, or tunable focusing optics.
- **Key constraints:** Pupil matching and refractive-index conditions control scan-induced aberrations.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Light-sheet illumination (ILL-06)](#ill-06); [Focus-lock channel (CONTROL-05)](#control-05).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) for pupil matching; [Light-sheet illumination (ILL-06)](#ill-06) in volumetric microscopy.
- **Usually followed by:** Target illumination or a final camera relay, depending on which path is refocused.

<a id="scan-06"></a>

### SCAN-06 — Fixed-output variable delay

- **Description:** Change optical path length while preserving a defined output geometry.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Ultrafast optics; Optical metrology; Spectroscopy and analytical chemistry; Quantum optics and information.
- **Applications:** Pump-probe delay; interferometer balancing; timing scans.
- **Type:** Pattern family.
- **Arrangement and variants:** Translated retroreflector, folded mirror pair, or other compensated delay arrangement.
- **Key constraints:** Travel, beam walk, dispersion, and stability determine usable delay range.
- **Related patterns:** [Pump-probe (PULSE-05)](#pulse-05); [Two-arm interferometry (FIELD-01)](#field-01); [Multipass propagation (SCAN-08)](#scan-08).
- **Usually combined with:** [Pump-probe (PULSE-05)](#pulse-05) and [Autocorrelation and cross-correlation (PULSE-07)](#pulse-07) for controlled temporal overlap.
- **Usually followed by:** Pulse recombination at a sample, correlator, or interferometer.

<a id="scan-07"></a>

### SCAN-07 — Double-pass AOM

- **Description:** Compensate frequency-dependent beam steering while shifting optical frequency.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Atomic physics; Laser engineering; Optical metrology; Quantum optics and information.
- **Applications:** Laser detuning; frequency scanning; stable fiber delivery.
- **Type:** Optical layout.
- **Arrangement and variants:** AOM, return optics often in a cat-eye geometry, and polarization-based separation.
- **Key constraints:** Diffraction efficiency, aperture, alignment, and RF bandwidth set the tuning range.
- **Related patterns:** [Polarization-based send/return separation (ROUTE-04)](#route-04); [Mode matching (BEAM-03)](#beam-03); [Frequency locking to a reference (CONTROL-03)](#control-03).
- **Usually combined with:** [Polarization-based send/return separation (ROUTE-04)](#route-04) for separating the return; [Mode matching (BEAM-03)](#beam-03) for fiber coupling.
- **Usually followed by:** In atomic experiments, fiber delivery and [Multi-axis cooling and addressing (QUANT-09)](#quant-09) cooling/addressing optics.

<a id="scan-08"></a>

### SCAN-08 — Multipass propagation

- **Description:** Obtain a long interaction path in a compact volume.
- **Main function:** Scanning and changing optical paths
- **Disciplines:** Spectroscopy and analytical chemistry; Ultrafast optics; Chemical and surface sensing.
- **Applications:** Gas absorption; nonlinear broadening; compact long-path sensing.
- **Type:** Pattern family.
- **Arrangement and variants:** Herriott or White cells; other geometrically closed sequences of reflections.
- **Key constraints:** Spot separation, mirror apertures, accumulated loss, and injection/extraction govern pass count.
- **Related patterns:** [Resonant enhancement (CAV-02)](#cav-02); [Nonlinear broadening plus compression (PULSE-04)](#pulse-04); [Fourier-transform spectroscopy (SPECT-06)](#spect-06).
- **Usually combined with:** [Excitation cleanup and rejection (SPECT-07)](#spect-07) for absorption sensing; [Nonlinear broadening plus compression (PULSE-04)](#pulse-04) for nonlinear broadening.
- **Usually followed by:** Spectral detection in gas sensing, or [Dispersion compensation (PULSE-02)](#pulse-02) compensation after pulse broadening.

<a id="route"></a>

## 5. Separating, combining, and routing channels

Reading lead: [Thorlabs on polarization-diversity receivers](https://www.thorlabs.com/images/Catalog/Imaging/2_Oct.pdf) illustrates ROUTE-06 and its combination with balanced detection.

<a id="route-01"></a>

### ROUTE-01 — Wavelength combining and splitting

- **Description:** Route different spectral bands through shared or separate optical paths.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Microscopy; Optical communications; Laser engineering; Spectroscopy and analytical chemistry.
- **Applications:** Multicolor excitation; emission separation; pump rejection.
- **Type:** Pattern family.
- **Arrangement and variants:** Dichroic trees, filter cascades, or dispersive separators.
- **Key constraints:** Band edges shift with incidence and polarization; leakage and loss accumulate.
- **Related patterns:** [Epi-illumination (ILL-03)](#ill-03); [Wavelength multiplexing and add/drop (LINK-01)](#link-01); [Excitation cleanup and rejection (SPECT-07)](#spect-07).
- **Usually combined with:** [Epi-illumination (ILL-03)](#ill-03) for shared-objective collection; [Excitation cleanup and rejection (SPECT-07)](#spect-07) for weak signals.
- **Usually followed by:** Band-specific focusing, detectors, or [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) instruments.

<a id="route-02"></a>

### ROUTE-02 — Polarization combining and splitting

- **Description:** Use orthogonal polarization states as separable optical channels.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Laser engineering; Optical communications; Quantum optics and information; Optical metrology.
- **Applications:** Beam combination; polarization analysis; channel separation.
- **Type:** Optical layout.
- **Arrangement and variants:** Polarizing beamsplitter with polarization preparation or recovery optics.
- **Key constraints:** Finite extinction and downstream birefringence mix the channels.
- **Related patterns:** [Waveplate-polarizer attenuation (ROUTE-03)](#route-03); [Polarization diversity (ROUTE-06)](#route-06); [State preparation and analysis (ROUTE-07)](#route-07).
- **Usually combined with:** [State preparation and analysis (ROUTE-07)](#route-07) for state control; [Polarization diversity (ROUTE-06)](#route-06) for processing both outputs.
- **Usually followed by:** Separate processing/detection branches, or a shared path after combining.

<a id="route-03"></a>

### ROUTE-03 — Waveplate-polarizer attenuation

- **Description:** Adjust delivered power by rotating polarization before selecting a channel.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Laser engineering; Atomic physics; Microscopy; Optical metrology.
- **Applications:** Power setting; pump balancing; detector protection.
- **Type:** Optical layout.
- **Arrangement and variants:** Half-wave plate followed by a polarizer or polarizing beamsplitter.
- **Key constraints:** Input polarization, wavelength, extinction, and rejected-power handling matter.
- **Related patterns:** [Polarization combining and splitting (ROUTE-02)](#route-02); [Power stabilization loop (CONTROL-01)](#control-01); [State preparation and analysis (ROUTE-07)](#route-07).
- **Usually combined with:** [Power stabilization loop (CONTROL-01)](#control-01) for stabilized power; [State preparation and analysis (ROUTE-07)](#route-07) for input-state preparation.
- **Usually followed by:** Beam delivery or focusing toward the sample; the rejected port goes to a dump.

<a id="route-04"></a>

### ROUTE-04 — Polarization-based send/return separation

- **Description:** Distinguish outgoing and returning light by their polarization transformations.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Optical metrology; Microscopy; Atomic physics; Remote sensing and LiDAR.
- **Applications:** Double-pass optics; reflected-signal collection; compact probes.
- **Type:** Optical layout.
- **Arrangement and variants:** Polarizing beamsplitter, quarter-wave plate, and reflective return path.
- **Key constraints:** Sample depolarization and imperfect retardance cause leakage between ports.
- **Related patterns:** [Double-pass AOM (SCAN-07)](#scan-07); [Coaxial transmit/receive (SENSE-01)](#sense-01); [Epi-illumination (ILL-03)](#ill-03).
- **Usually combined with:** [Double-pass AOM (SCAN-07)](#scan-07) in double-pass modulation; [Coaxial transmit/receive (SENSE-01)](#sense-01) in shared-aperture sensing.
- **Usually followed by:** On the separated return, detection or downstream beam delivery.

<a id="route-05"></a>

### ROUTE-05 — Nonreciprocal routing

- **Description:** Direct light differently in forward and reverse propagation.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Laser engineering; Fiber optics and sensing; Optical communications; Optical metrology.
- **Applications:** Laser isolation; circulator-based sensing; back-reflection management.
- **Type:** Pattern family.
- **Arrangement and variants:** Faraday rotation with polarizers or multiport polarization-routing stages.
- **Key constraints:** Isolation, insertion loss, bandwidth, and power handling constrain operation.
- **Related patterns:** [Polarization-based send/return separation (ROUTE-04)](#route-04); [Coaxial transmit/receive (SENSE-01)](#sense-01); [Distributed optical interrogation (LINK-09)](#link-09).
- **Usually combined with:** [Master oscillator-power amplifier (CAV-04)](#cav-04) to suppress amplifier feedback; [Distributed optical interrogation (LINK-09)](#link-09) for return routing.
- **Usually followed by:** An amplifier or guide on the forward path; a detector on a circulator return port.

<a id="route-06"></a>

### ROUTE-06 — Polarization diversity

- **Description:** Process both orthogonal polarization components in parallel.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Optical communications; Ophthalmic imaging; Fiber optics and sensing; Optical metrology.
- **Applications:** Coherent reception; polarization-sensitive OCT; fading reduction.
- **Type:** Optical layout.
- **Arrangement and variants:** Polarization splitter feeding matched processing or detection branches.
- **Key constraints:** Branch gain, delay, phase, and polarization calibration must be controlled.
- **Related patterns:** [Polarization combining and splitting (ROUTE-02)](#route-02); [Optical I/Q detection (FIELD-07)](#field-07); [Homodyne / heterodyne reception (FIELD-06)](#field-06).
- **Usually combined with:** [Optical I/Q detection (FIELD-07)](#field-07) and [Balanced detection (FIELD-05)](#field-05) in coherent receivers.
- **Usually followed by:** Matched processing/detection branches and calibrated signal combination.

<a id="route-07"></a>

### ROUTE-07 — State preparation and analysis

- **Description:** Prepare and measure optical polarization through controlled transformations.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Quantum optics and information; Optical metrology; Microscopy; Chemical and surface sensing.
- **Applications:** Polarimetry; ellipsometry; quantum-state analysis.
- **Type:** Pattern family.
- **Arrangement and variants:** Waveplate sequences and analyzers; sequential or division-of-amplitude readout.
- **Key constraints:** Calibration and the number of independent measurements determine recoverable information.
- **Related patterns:** [Polarization combining and splitting (ROUTE-02)](#route-02); [Polarization diversity (ROUTE-06)](#route-06); [Indistinguishable-path entanglement generation (QUANT-02)](#quant-02).
- **Usually combined with:** [Indistinguishable-path entanglement generation (QUANT-02)](#quant-02) for state analysis; [Evanescent sensing interface (SENSE-08)](#sense-08) for ellipsometric or polarization-sensitive sensing.
- **Usually followed by:** The sample for state preparation, or detectors for state analysis.

<a id="route-08"></a>

### ROUTE-08 — Sample/reference splitting

- **Description:** Provide a simultaneous reference channel alongside the sample channel.
- **Main function:** Separating, combining, and routing channels
- **Disciplines:** Spectroscopy and analytical chemistry; Optical metrology; Chemical and surface sensing; Radiometry and photometry.
- **Applications:** Absorption measurements; source normalization; differential sensing.
- **Type:** Optical layout.
- **Arrangement and variants:** Beam splitter or pickoff with separately characterized sample and reference paths.
- **Key constraints:** Differential losses and detector response can masquerade as sample changes.
- **Related patterns:** [Reference-channel normalization (CONTROL-06)](#control-06); [Balanced detection (FIELD-05)](#field-05); [Excitation cleanup and rejection (SPECT-07)](#spect-07).
- **Usually combined with:** [Reference-channel normalization (CONTROL-06)](#control-06) for normalization; [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for spectral measurements.
- **Usually followed by:** Separate sample and reference interactions followed by their detectors.

<a id="field"></a>

## 6. Comparing optical fields and detecting weak signals

Reading lead: [Thorlabs on coherent detection](https://www.thorlabs.com/images/tabimages/AppHighlight_BalancedPhotodetectors.pdf) describes the combination of FIELD-05, FIELD-06, FIELD-07, and polarization diversity. [Thorlabs OCT tutorial](https://www.thorlabs.com/images/pdf/octmanualrev7.pdf) introduces FIELD-08.

<a id="field-01"></a>

### FIELD-01 — Two-arm interferometry

- **Description:** Compare phase or path changes between distinct optical arms.
- **Main function:** Comparing optical fields
- **Disciplines:** Optical metrology; Spectroscopy and analytical chemistry; Quantum optics and information; Astronomy and astrophysics.
- **Applications:** Displacement sensing; reference comparison; interferometric experiments.
- **Type:** Pattern family.
- **Arrangement and variants:** Michelson or Mach-Zehnder split, propagate, and recombine arrangements.
- **Key constraints:** Coherence, mode overlap, differential drift, and polarization set interference visibility.
- **Related patterns:** [Fixed-output variable delay (SCAN-06)](#scan-06); [Common-path interferometry (FIELD-02)](#field-02); [Phase-shifting interferometry (COMPUTE-02)](#compute-02).
- **Usually combined with:** [Fixed-output variable delay (SCAN-06)](#scan-06) for path control; [Phase-shifting interferometry (COMPUTE-02)](#compute-02) for phase extraction.
- **Usually followed by:** Recombination and intensity, balanced, or spectrally resolved detection.

<a id="field-02"></a>

### FIELD-02 — Common-path interferometry

- **Description:** Share much of the propagation path between signal and reference.
- **Main function:** Comparing optical fields
- **Disciplines:** Optical metrology; Microscopy; Endoscopy and remote probes; Quantum optics and information.
- **Applications:** Stable phase imaging; compact probes; disturbance rejection.
- **Type:** Pattern family.
- **Arrangement and variants:** Spatial, polarization, or temporal encoding along substantially shared optics.
- **Key constraints:** Shared paths reduce selected differential disturbances, not all noise or calibration errors.
- **Related patterns:** [Counterpropagating-loop interferometry (FIELD-03)](#field-03); [Shearing interferometry (FIELD-04)](#field-04); [Calibrated multimode transport (ACCESS-07)](#access-07).
- **Usually combined with:** [State preparation and analysis (ROUTE-07)](#route-07) for polarization-encoded paths; [Off-axis holography (COMPUTE-01)](#compute-01) for phase imaging.
- **Usually followed by:** Interference readout; detailed ordering depends on the shared-path realization.

<a id="field-03"></a>

### FIELD-03 — Counterpropagating-loop interferometry

- **Description:** Compare opposite propagation directions around one optical loop.
- **Main function:** Comparing optical fields
- **Disciplines:** Optical metrology; Quantum optics and information; Fiber optics and sensing; Atomic physics.
- **Applications:** Rotation sensing; reciprocal-path comparison; entangled-photon generation.
- **Type:** Pattern family.
- **Arrangement and variants:** Sagnac loop with a splitter and controlled polarization or phase.
- **Key constraints:** Nonreciprocal effects, polarization drift, and imbalance affect the observable signal.
- **Related patterns:** [Common-path interferometry (FIELD-02)](#field-02); [Indistinguishable-path entanglement generation (QUANT-02)](#quant-02); [State preparation and analysis (ROUTE-07)](#route-07).
- **Usually combined with:** [State preparation and analysis (ROUTE-07)](#route-07) for polarization control; [Indistinguishable-path entanglement generation (QUANT-02)](#quant-02) in pair-source arrangements.
- **Usually followed by:** Output-port detection or photon separation; the loop itself has no linear next stage.

<a id="field-04"></a>

### FIELD-04 — Shearing interferometry

- **Description:** Interfere shifted or tilted copies of the same wavefront.
- **Main function:** Comparing optical fields
- **Disciplines:** Optical metrology; Microscopy; Industrial vision and inspection.
- **Applications:** Wavefront testing; phase-gradient imaging; collimation checks.
- **Type:** Pattern family.
- **Arrangement and variants:** Lateral, radial, or angular shear followed by recombination.
- **Key constraints:** Shear sets sensitivity and spatial range; reconstruction requires boundary assumptions.
- **Related patterns:** [Differential interference contrast (CONTRAST-05)](#contrast-05); [Common-path interferometry (FIELD-02)](#field-02); [Phase-diversity acquisition (COMPUTE-07)](#compute-07).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) for wavefront access; [Phase-diversity acquisition (COMPUTE-07)](#compute-07) for complementary wavefront information.
- **Usually followed by:** A spatial detector and shear-aware interpretation or reconstruction.

<a id="field-05"></a>

### FIELD-05 — Balanced detection

- **Description:** Subtract complementary optical outputs to reject common-mode fluctuations.
- **Main function:** Comparing optical fields
- **Disciplines:** Optical communications; Optical metrology; Quantum optics and information; Ophthalmic imaging.
- **Applications:** Weak modulation readout; coherent receivers; OCT.
- **Type:** Optical layout.
- **Arrangement and variants:** Two matched photodetectors and differential electrical readout.
- **Key constraints:** Optical balance, detector linearity, and bandwidth limit common-mode rejection.
- **Related patterns:** [Homodyne / heterodyne reception (FIELD-06)](#field-06); [Optical I/Q detection (FIELD-07)](#field-07); [Sample/reference splitting (ROUTE-08)](#route-08).
- **Usually combined with:** [Homodyne / heterodyne reception (FIELD-06)](#field-06) or [Optical I/Q detection (FIELD-07)](#field-07) for coherent detection.
- **Usually followed by:** Differential electronics and acquisition; normally a terminal optical stage.

<a id="field-06"></a>

### FIELD-06 — Homodyne / heterodyne reception

- **Description:** Mix a signal with a local oscillator to read field quadratures or beat signals.
- **Main function:** Comparing optical fields
- **Disciplines:** Optical communications; Optical metrology; Remote sensing and LiDAR; Quantum optics and information; Terahertz optics.
- **Applications:** Phase sensing; Doppler sensing; coherent communication.
- **Type:** Pattern family.
- **Arrangement and variants:** Mode-matched signal and local oscillator combined before detection.
- **Key constraints:** Relative coherence, polarization, phase noise, and detector bandwidth are essential.
- **Related patterns:** [Balanced detection (FIELD-05)](#field-05); [Optical I/Q detection (FIELD-07)](#field-07); [FMCW ranging (SENSE-03)](#sense-03).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for overlap; [Balanced detection (FIELD-05)](#field-05) for differential readout.
- **Usually followed by:** Beat/quadrature detection and electronic demodulation or phase recovery.

<a id="field-07"></a>

### FIELD-07 — Optical I/Q detection

- **Description:** Measure two quadratures to recover a complex optical signal.
- **Main function:** Comparing optical fields
- **Disciplines:** Optical communications; Optical metrology; Remote sensing and LiDAR.
- **Applications:** Coherent receivers; phase-resolved sensing.
- **Type:** Optical layout.
- **Arrangement and variants:** Optical hybrid producing quadrature outputs with matched detector channels.
- **Key constraints:** Quadrature error, branch imbalance, and phase recovery require calibration.
- **Related patterns:** [Balanced detection (FIELD-05)](#field-05); [Homodyne / heterodyne reception (FIELD-06)](#field-06); [Polarization diversity (ROUTE-06)](#route-06).
- **Usually combined with:** [Polarization diversity (ROUTE-06)](#route-06) for polarization diversity; [Balanced detection (FIELD-05)](#field-05) for complementary output subtraction.
- **Usually followed by:** Balanced detector channels and calibrated I/Q reconstruction.

<a id="field-08"></a>

### FIELD-08 — Low-coherence interferometry

- **Description:** Resolve optical path differences using broadband interference.
- **Main function:** Comparing optical fields
- **Disciplines:** Ophthalmic imaging; Microscopy; Endoscopy and remote probes; Optical metrology.
- **Applications:** OCT; layer thickness; depth profiling.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Reference and sample arms with delay-scanned or spectrally resolved readout.
- **Key constraints:** Bandwidth, dispersion matching, sampling, and refractive index determine depth interpretation.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [Slit-collimator-disperser-camera (SPECT-01)](#spect-01); [Fixed-output variable delay (SCAN-06)](#scan-06).
- **Usually combined with:** [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for spectral-domain OCT; [Side-viewing rotational probe (ACCESS-06)](#access-06) for circumferential probes.
- **Usually followed by:** Delay-resolved or spectral acquisition and depth reconstruction.

<a id="field-09"></a>

### FIELD-09 — Nulling interferometry

- **Description:** Suppress a dominant coherent component through controlled destructive interference.
- **Main function:** Comparing optical fields
- **Disciplines:** Astronomy and astrophysics; Optical metrology; Quantum optics and information.
- **Applications:** High-contrast detection; dark-port measurements.
- **Type:** Pattern family.
- **Arrangement and variants:** Phase-controlled recombination with matched amplitudes and modes.
- **Key constraints:** Small phase, polarization, or amplitude errors leave residual leakage.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [Coronagraphic rejection (WAVE-05)](#wave-05); [Coherent aperture combination (FIELD-10)](#field-10).
- **Usually combined with:** [Round-trip phase stabilization (CONTROL-04)](#control-04) for path stability; [Adaptive optics loop (WAVE-01)](#wave-01) for wavefront correction.
- **Usually followed by:** A detector or science instrument at the selected dark output.

<a id="field-10"></a>

### FIELD-10 — Coherent aperture combination

- **Description:** Combine light from separated collection apertures while retaining phase information.
- **Main function:** Comparing optical fields
- **Disciplines:** Astronomy and astrophysics; Optical communications; Optical metrology.
- **Applications:** Aperture synthesis; stellar interferometry; coherent reception.
- **Type:** Pattern family.
- **Arrangement and variants:** Aperture feeds, delay compensation, beam combination, and fringe sensing.
- **Key constraints:** Optical path control, coherence, and baseline coverage limit recovered information.
- **Related patterns:** [Fixed-output variable delay (SCAN-06)](#scan-06); [Nulling interferometry (FIELD-09)](#field-09); [Round-trip phase stabilization (CONTROL-04)](#control-04).
- **Usually combined with:** [Fixed-output variable delay (SCAN-06)](#scan-06) for delay matching; [Round-trip phase stabilization (CONTROL-04)](#control-04) for phase stabilization.
- **Usually followed by:** Fringe detection and aperture-combination analysis or imaging.

<a id="contrast"></a>

## 7. Selecting spatial signals and creating contrast

Reading leads: [Nikon on DIC](https://www.microscopyu.com/pdfs/DICMicroscopy.pdf) supports CONTRAST-05; [Nikon on TIRF](https://www.microscopyu.com/techniques/fluorescence/total-internal-reflection-fluorescence-tirf-microscopy?report=reader) introduces CONTRAST-06. Other records still need dedicated references before publication.

<a id="contrast-01"></a>

### CONTRAST-01 — Confocal excitation and detection

- **Description:** Overlap an illuminated region with a conjugate detection aperture.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; Endoscopy and remote probes; Ophthalmic imaging; Industrial vision and inspection.
- **Applications:** Optical sectioning; surface profiling; background rejection.
- **Type:** Optical layout.
- **Arrangement and variants:** Focused illumination, collection optics, and pinhole or fiber detection.
- **Key constraints:** Pinhole size trades throughput against sectioning; scattering degrades selectivity.
- **Related patterns:** [Scan-descan (SCAN-03)](#scan-03); [Image relay / 4f relay (IMG-01)](#img-01); [Proximal scanning through an image guide (ACCESS-03)](#access-03).
- **Usually combined with:** [Scan-descan (SCAN-03)](#scan-03) for descanned collection; [Epi-illumination (ILL-03)](#ill-03) for shared-objective use.
- **Usually followed by:** The pinhole/fiber detector and image acquisition.

<a id="contrast-02"></a>

### CONTRAST-02 — Parallel confocal detection

- **Description:** Acquire several confocal points while limiting mixing between channels.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; Biophotonics and life sciences; Industrial vision and inspection.
- **Applications:** Fast sectioning; live-cell imaging; parallel inspection.
- **Type:** Pattern family.
- **Arrangement and variants:** Pinhole arrays, spinning disks, or matched multifocal excitation and detection.
- **Key constraints:** Interchannel crosstalk and illumination uniformity constrain dense parallelization.
- **Related patterns:** [Confocal excitation and detection (CONTRAST-01)](#contrast-01); [Multispot illumination (ILL-08)](#ill-08); [Structured illumination / pattern projection (ILL-05)](#ill-05).
- **Usually combined with:** [Multispot illumination (ILL-08)](#ill-08) for parallel excitation; [Image relay / 4f relay (IMG-01)](#img-01) for array imaging.
- **Usually followed by:** A camera or matched detector array and channel reconstruction.

<a id="contrast-03"></a>

### CONTRAST-03 — Dark-field collection

- **Description:** Exclude direct or specular light while collecting redistributed light.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; Industrial vision and inspection; Flow and particle diagnostics; X-ray and EUV instrumentation.
- **Applications:** Particle inspection; scattering imaging; surface defects.
- **Type:** Pattern family.
- **Arrangement and variants:** Separate illumination and collection angles or place a stop over the direct beam.
- **Key constraints:** Stray light and unwanted scattering can overwhelm the desired weak signal.
- **Related patterns:** [Pupil-shaped illumination (ILL-04)](#ill-04); [Stray-light baffling (WAVE-08)](#wave-08); [Angular and spectral collection channels (SENSE-07)](#sense-07).
- **Usually combined with:** [Stray-light baffling (WAVE-08)](#wave-08) to suppress stray light; [Angular and spectral collection channels (SENSE-07)](#sense-07) for angular discrimination.
- **Usually followed by:** Imaging or scattering detection after direct-light exclusion.

<a id="contrast-04"></a>

### CONTRAST-04 — Phase-to-intensity conversion

- **Description:** Modify the relative phase of reference and scattered fields to create intensity contrast.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; X-ray and EUV instrumentation; Computational imaging.
- **Applications:** Transparent-specimen imaging; Zernike phase contrast.
- **Type:** Pattern family.
- **Arrangement and variants:** Matched illumination annulus and phase structure in a conjugate pupil plane.
- **Key constraints:** Mask alignment, spectral dependence, and halos affect interpretation.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Fourier-plane filtering (BEAM-07)](#beam-07); [Propagation-based phase contrast (XRAY-06)](#xray-06).
- **Usually combined with:** [Pupil-shaped illumination (ILL-04)](#ill-04) for the illumination annulus; [Pupil relay (IMG-03)](#img-03) for phase-mask placement.
- **Usually followed by:** Image formation and camera/eyepiece observation.

<a id="contrast-05"></a>

### CONTRAST-05 — Differential interference contrast

- **Description:** Compare nearby optical paths through polarization splitting and recombination.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; Optical metrology; Industrial vision and inspection.
- **Applications:** Phase-gradient contrast; surface inspection.
- **Type:** Optical layout.
- **Arrangement and variants:** Polarizers and matched shearing prisms around the specimen imaging system.
- **Key constraints:** Contrast depends on shear direction and bias; birefringence can complicate interpretation.
- **Related patterns:** [Shearing interferometry (FIELD-04)](#field-04); [State preparation and analysis (ROUTE-07)](#route-07); [Pupil relay (IMG-03)](#img-03).
- **Usually combined with:** [State preparation and analysis (ROUTE-07)](#route-07) for polarization bias; [Pupil relay (IMG-03)](#img-03) for prism conjugation.
- **Usually followed by:** Analyzer, image formation, and observation or camera detection.

<a id="contrast-06"></a>

### CONTRAST-06 — Evanescent-field excitation

- **Description:** Restrict illumination to a thin region near a refractive-index interface.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; Biophotonics and life sciences; Chemical and surface sensing.
- **Applications:** TIRF; surface fluorescence; interface studies.
- **Type:** Pattern family.
- **Arrangement and variants:** Prism-based or high-NA objective-based total-internal-reflection illumination.
- **Key constraints:** Incidence angle, indices, and sample scattering determine the excitation field.
- **Related patterns:** [Evanescent sensing interface (SENSE-08)](#sense-08); [Epi-illumination (ILL-03)](#ill-03); [Pupil relay (IMG-03)](#img-03).
- **Usually combined with:** [Epi-illumination (ILL-03)](#ill-03) in objective-based TIRF; [Excitation cleanup and rejection (SPECT-07)](#spect-07) for fluorescence filtering.
- **Usually followed by:** Fluorescence collection, excitation rejection, and imaging.

<a id="contrast-07"></a>

### CONTRAST-07 — Nonlinear focal excitation

- **Description:** Localize signal generation through an intensity-dependent interaction.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; Biophotonics and life sciences; Ultrafast optics; Materials processing and fabrication.
- **Applications:** Multiphoton microscopy; localized photochemistry; two-photon fabrication.
- **Type:** Pattern family.
- **Arrangement and variants:** Pulsed excitation focused by an objective with suitable collection or processing geometry.
- **Key constraints:** Pulse delivery, focal intensity, and sample response govern localization and damage.
- **Related patterns:** [Dispersion compensation (PULSE-02)](#pulse-02); [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Multispot illumination (ILL-08)](#ill-08).
- **Usually combined with:** [Dispersion compensation (PULSE-02)](#pulse-02) for pulse delivery; [Pupil-conjugate scanning (SCAN-01)](#scan-01) for raster acquisition.
- **Usually followed by:** Signal collection in microscopy; material response is the endpoint in fabrication.

<a id="contrast-08"></a>

### CONTRAST-08 — Excitation plus depletion

- **Description:** Confine effective fluorescence by overlapping excitation with a shaped depletion field.
- **Main function:** Selecting spatial signals and creating contrast
- **Disciplines:** Microscopy; Biophotonics and life sciences.
- **Applications:** STED imaging; controlled fluorescence suppression.
- **Type:** Optical layout.
- **Arrangement and variants:** Aligned excitation and depletion beams with a designed depletion minimum.
- **Key constraints:** Registration, timing, polarization, and dye response govern attainable contrast and resolution.
- **Related patterns:** [Programmable wavefront shaping (BEAM-08)](#beam-08); [Wavelength combining and splitting (ROUTE-01)](#route-01); [Confocal excitation and detection (CONTRAST-01)](#contrast-01).
- **Usually combined with:** [Programmable wavefront shaping (BEAM-08)](#beam-08) for depletion shaping; [Wavelength combining and splitting (ROUTE-01)](#route-01) for wavelength coordination.
- **Usually followed by:** Fluorescence filtering, often confocal detection, and image acquisition.

<a id="spect"></a>

## 8. Separating and measuring spectra

Reading leads: [HORIBA's Czerny-Turner layout](https://www.horiba.com/fileadmin/uploads/Scientific/Documents/OSD/17021704.pdf) illustrates SPECT-01; [ESO's MUSE optical layout](https://www.eso.org/sci/facilities/paranal/instruments/muse/inst.html) supports SPECT-03; [NIST on dual-comb spectroscopy](https://www.nist.gov/programs-projects/frequency-comb-based-spectroscopy-dual-comb-spectroscopy) supports SPECT-08.

<a id="spect-01"></a>

### SPECT-01 — Slit-collimator-disperser-camera

- **Description:** Map wavelength to detector position while imaging an entrance slit.
- **Main function:** Separating and measuring spectra
- **Disciplines:** Spectroscopy and analytical chemistry; Astronomy and astrophysics; Remote sensing and LiDAR; Industrial vision and inspection.
- **Applications:** Emission spectra; Raman spectroscopy; hyperspectral instruments.
- **Type:** Pattern family.
- **Arrangement and variants:** Czerny-Turner, Littrow, or related dispersive spectrograph layouts.
- **Key constraints:** Slit width, dispersion, aberrations, and detector sampling trade resolution against throughput.
- **Related patterns:** [Anamorphic beam shaping (BEAM-04)](#beam-04); [Cross-dispersed spectroscopy (SPECT-02)](#spect-02); [Image slicing / integral-field feed (SPECT-03)](#spect-03).
- **Usually combined with:** [Image slicing / integral-field feed (SPECT-03)](#spect-03) for field input; [Excitation cleanup and rejection (SPECT-07)](#spect-07) for Raman signal preparation.
- **Usually followed by:** A spectral detector and wavelength/intensity calibration.

<a id="spect-02"></a>

### SPECT-02 — Cross-dispersed spectroscopy

- **Description:** Separate overlapping spectral orders using an additional dispersion direction.
- **Main function:** Separating and measuring spectra
- **Disciplines:** Astronomy and astrophysics; Spectroscopy and analytical chemistry; Optical metrology.
- **Applications:** Echelle spectroscopy; VIPA readout; broad high-resolution spectra.
- **Type:** Optical layout.
- **Arrangement and variants:** High-dispersion element followed by an orthogonal cross-disperser and camera.
- **Key constraints:** Order separation, detector area, and calibration limit spectral coverage.
- **Related patterns:** [Slit-collimator-disperser-camera (SPECT-01)](#spect-01); [Dual-comb spectroscopy (SPECT-08)](#spect-08); [Fourier-plane filtering (BEAM-07)](#beam-07).
- **Usually combined with:** [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for slit imaging; [Calibration-source injection (CONTROL-09)](#control-09) for calibration.
- **Usually followed by:** A two-dimensional detector and order extraction.

<a id="spect-03"></a>

### SPECT-03 — Image slicing / integral-field feed

- **Description:** Rearrange a two-dimensional field into inputs suitable for spectroscopy.
- **Main function:** Separating and measuring spectra
- **Disciplines:** Astronomy and astrophysics; Remote sensing and LiDAR; Spectroscopy and analytical chemistry.
- **Applications:** Integral-field spectroscopy; spatially resolved spectral measurement.
- **Type:** Pattern family.
- **Arrangement and variants:** Image slicers, lenslet arrays, or fiber feeds forming spectrograph inputs.
- **Key constraints:** Spatial sampling, slit packing, losses, and crosstalk compete for detector area.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Slit-collimator-disperser-camera (SPECT-01)](#spect-01); [Mode multiplexing and demultiplexing (LINK-05)](#link-05).
- **Usually combined with:** [Image relay / 4f relay (IMG-01)](#img-01) for field transfer; [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for spectral dispersion.
- **Usually followed by:** One or more spectrographs and their detector arrays.

<a id="spect-04"></a>

### SPECT-04 — Fixed-exit monochromation

- **Description:** Tune the selected band while maintaining a defined output trajectory.
- **Main function:** Separating and measuring spectra
- **Disciplines:** X-ray and EUV instrumentation; Spectroscopy and analytical chemistry; Optical metrology.
- **Applications:** Tunable beamlines; spectroscopy illumination.
- **Type:** Pattern family.
- **Arrangement and variants:** Coordinated double-crystal or dispersive-element motions with output compensation.
- **Key constraints:** Exit stability, spectral purity, throughput, and mechanical tolerances constrain tuning.
- **Related patterns:** [Wavelength combining and splitting (ROUTE-01)](#route-01); [Cascaded spectral filtering (SPECT-05)](#spect-05); [Orthogonal grazing-incidence focusing (XRAY-01)](#xray-01).
- **Usually combined with:** [Two-plane beam-pointing control (CONTROL-02)](#control-02) for beam stability; [Orthogonal grazing-incidence focusing (XRAY-01)](#xray-01) for focused beamlines.
- **Usually followed by:** Sample illumination and experiment-specific detection.

<a id="spect-05"></a>

### SPECT-05 — Cascaded spectral filtering

- **Description:** Use successive selection stages to improve out-of-band rejection.
- **Main function:** Separating and measuring spectra
- **Disciplines:** Spectroscopy and analytical chemistry; Quantum optics and information; Microscopy.
- **Applications:** Weak Raman signals; pump suppression; high-purity excitation.
- **Type:** Pattern family.
- **Arrangement and variants:** Serial filters or double/triple monochromators with intermediate apertures.
- **Key constraints:** Improved rejection costs throughput and can introduce ghosts or band-shape distortions.
- **Related patterns:** [Fixed-exit monochromation (SPECT-04)](#spect-04); [Excitation cleanup and rejection (SPECT-07)](#spect-07); [Wavelength combining and splitting (ROUTE-01)](#route-01).
- **Usually combined with:** [Excitation cleanup and rejection (SPECT-07)](#spect-07) for source suppression; [Heralded photon generation (QUANT-01)](#quant-01) for pump rejection.
- **Usually followed by:** A sample or sensitive detector needing the selected spectral band.

<a id="spect-06"></a>

### SPECT-06 — Fourier-transform spectroscopy

- **Description:** Recover spectral content from an interferogram measured versus optical delay.
- **Main function:** Separating and measuring spectra
- **Disciplines:** Spectroscopy and analytical chemistry; Terahertz optics; Remote sensing and LiDAR; Optical metrology.
- **Applications:** Infrared spectroscopy; broadband spectral characterization.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Variable-delay interferometer, detector, and Fourier reconstruction.
- **Key constraints:** Delay range, sampling, phase correction, and source fluctuations affect spectral results.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [Fixed-output variable delay (SCAN-06)](#scan-06); [Dual-comb spectroscopy (SPECT-08)](#spect-08).
- **Usually combined with:** [Two-arm interferometry (FIELD-01)](#field-01) and [Fixed-output variable delay (SCAN-06)](#scan-06) for delay encoding.
- **Usually followed by:** Detector acquisition, phase correction, and Fourier reconstruction.

<a id="spect-07"></a>

### SPECT-07 — Excitation cleanup and rejection

- **Description:** Suppress source impurities and source leakage around a weak collected signal.
- **Main function:** Separating and measuring spectra
- **Disciplines:** Spectroscopy and analytical chemistry; Microscopy; Chemical and surface sensing.
- **Applications:** Raman spectroscopy; fluorescence; weak-emission detection.
- **Type:** Optical layout.
- **Arrangement and variants:** Excitation cleanup filter followed by collection-side notch, edge, or band filters.
- **Key constraints:** Filter edge placement, incidence angle, and residual fluorescence set usable sensitivity.
- **Related patterns:** [Epi-illumination (ILL-03)](#ill-03); [Wavelength combining and splitting (ROUTE-01)](#route-01); [Cascaded spectral filtering (SPECT-05)](#spect-05).
- **Usually combined with:** [Epi-illumination (ILL-03)](#ill-03) for Raman/fluorescence collection; [Wavelength combining and splitting (ROUTE-01)](#route-01) for channel separation.
- **Usually followed by:** [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) spectroscopy or an emission-sensitive camera/detector.

<a id="spect-08"></a>

### SPECT-08 — Dual-comb spectroscopy

- **Description:** Map optical spectral information into distinguishable radio-frequency beats.
- **Main function:** Separating and measuring spectra
- **Disciplines:** Spectroscopy and analytical chemistry; Optical metrology; Remote sensing and LiDAR; Chemical and surface sensing.
- **Applications:** Broadband gas analysis; precision spectroscopy.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Two coherent combs with different repetition rates, sample interaction, and beat detection.
- **Key constraints:** Mutual coherence, aliasing, bandwidth, and calibration determine the recovered spectrum.
- **Related patterns:** [Homodyne / heterodyne reception (FIELD-06)](#field-06); [Cross-dispersed spectroscopy (SPECT-02)](#spect-02); [Frequency locking to a reference (CONTROL-03)](#control-03).
- **Usually combined with:** [Homodyne / heterodyne reception (FIELD-06)](#field-06) for comb beats; [Frequency locking to a reference (CONTROL-03)](#control-03) for source/reference stability.
- **Usually followed by:** Photodetection and calibrated radio-frequency spectral reconstruction.

<a id="cav"></a>

## 9. Recirculating, amplifying, and distributing power

Reading lead: [LIGO's interferometer](https://www.ligo.caltech.edu/MIT/page/ligos-ifo) shows how resonators, resonant enhancement, and power/signal recycling combine (CAV-01 to CAV-03). The remaining laser families require dedicated article references.

<a id="cav-01"></a>

### CAV-01 — Stable optical resonator

- **Description:** Recirculate a supported optical mode through a chosen sequence of surfaces.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Laser engineering; Optical metrology; Spectroscopy and analytical chemistry; Quantum optics and information.
- **Applications:** Laser oscillators; reference cavities; resonant interactions.
- **Type:** Pattern family.
- **Arrangement and variants:** Linear, ring, and bow-tie geometries with suitable focusing and coupling.
- **Key constraints:** Geometric stability, losses, dispersion, and mode selection must be checked together.
- **Related patterns:** [Resonant enhancement (CAV-02)](#cav-02); [Mode matching (BEAM-03)](#beam-03); [Frequency locking to a reference (CONTROL-03)](#control-03).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for injection; [Frequency locking to a reference (CONTROL-03)](#control-03) for resonance control.
- **Usually followed by:** An output coupler supplies application optics; the intracavity path is a loop.

<a id="cav-02"></a>

### CAV-02 — Resonant enhancement

- **Description:** Build circulating power from an externally driven coherent input.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Spectroscopy and analytical chemistry; Laser engineering; Optical metrology; Quantum optics and information.
- **Applications:** Sensitive absorption; frequency conversion; enhanced interactions.
- **Type:** Optical layout.
- **Arrangement and variants:** Mode-matched source, input coupler, resonator, and resonance control.
- **Key constraints:** Coupling must account for internal losses; detuning and mode mismatch reduce buildup.
- **Related patterns:** [Stable optical resonator (CAV-01)](#cav-01); [Mode matching (BEAM-03)](#beam-03); [Multipass propagation (SCAN-08)](#scan-08).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) and [Frequency locking to a reference (CONTROL-03)](#control-03) for efficient resonant injection.
- **Usually followed by:** Transmitted, reflected, or generated-signal detection; the enhancement path recirculates.

<a id="cav-03"></a>

### CAV-03 — Power and signal recycling

- **Description:** Return selected interferometer outputs to alter stored power or signal response.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Optical metrology; Astronomy and astrophysics; Quantum optics and information.
- **Applications:** Precision interferometry; gravitational-wave detectors.
- **Type:** Pattern family.
- **Arrangement and variants:** Recycling mirrors form coupled cavities around selected interferometer ports.
- **Key constraints:** Coupled resonances and control interactions complicate bandwidth and noise optimization.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [Nulling interferometry (FIELD-09)](#field-09); [Resonant enhancement (CAV-02)](#cav-02).
- **Usually combined with:** [Two-arm interferometry (FIELD-01)](#field-01) and [Resonant enhancement (CAV-02)](#cav-02) in precision interferometers.
- **Usually followed by:** Science-port readout and control pickoffs; coupled cavities form a network.

<a id="cav-04"></a>

### CAV-04 — Master oscillator-power amplifier

- **Description:** Separate beam generation and spectral control from power amplification.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Laser engineering; Materials processing and fabrication; Remote sensing and LiDAR; Atomic physics.
- **Applications:** High-power beam delivery; seeded amplifiers; sensing transmitters.
- **Type:** Optical layout.
- **Arrangement and variants:** Controlled seed source followed by one or more amplifier stages.
- **Key constraints:** Amplified noise, feedback, nonlinear effects, and thermal distortion constrain scaling.
- **Related patterns:** [Mode matching (BEAM-03)](#beam-03); [Nonreciprocal routing (ROUTE-05)](#route-05); [Coherent beam combining (CAV-09)](#cav-09).
- **Usually combined with:** [Nonreciprocal routing (ROUTE-05)](#route-05) for isolation; [Mode matching (BEAM-03)](#beam-03) for gain-region matching.
- **Usually followed by:** Beam conditioning and delivery, or [Coherent beam combining (CAV-09)](#cav-09).

<a id="cav-05"></a>

### CAV-05 — Regenerative amplification

- **Description:** Trap a seed pulse for repeated amplification and then release it.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Ultrafast optics; Laser engineering; Materials processing and fabrication.
- **Applications:** Ultrashort-pulse amplification; high-energy pulse preparation.
- **Type:** Optical layout.
- **Arrangement and variants:** Gain cavity with timed injection and extraction, commonly using polarization switching.
- **Key constraints:** Switch timing, gain saturation, dispersion, and accumulated nonlinear phase matter.
- **Related patterns:** [Cavity dumping (CAV-07)](#cav-07); [Chirped-pulse amplification (PULSE-01)](#pulse-01); [Polarization-based send/return separation (ROUTE-04)](#route-04).
- **Usually combined with:** [Chirped-pulse amplification (PULSE-01)](#pulse-01) for managing peak intensity; [Polarization-based send/return separation (ROUTE-04)](#route-04) for switched extraction.
- **Usually followed by:** [Dispersion compensation (PULSE-02)](#pulse-02) in a CPA chain, then beam delivery.

<a id="cav-06"></a>

### CAV-06 — Q-switching

- **Description:** Store energy in a gain medium before enabling rapid laser emission.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Laser engineering; Materials processing and fabrication; Remote sensing and LiDAR.
- **Applications:** Energetic short pulses; laser processing; rangefinding.
- **Type:** Pattern family.
- **Arrangement and variants:** Gain resonator with actively or passively controlled intracavity loss.
- **Key constraints:** Gain dynamics and switching determine pulse formation; energy is initially stored in the medium.
- **Related patterns:** [Stable optical resonator (CAV-01)](#cav-01); [Cavity dumping (CAV-07)](#cav-07); [Pulse picking and burst formation (PULSE-06)](#pulse-06).
- **Usually combined with:** [Stable optical resonator (CAV-01)](#cav-01) for resonator geometry; [Power stabilization loop (CONTROL-01)](#control-01) for output management.
- **Usually followed by:** Pulse conditioning and an application such as [Time-of-flight ranging (SENSE-02)](#sense-02) ranging or processing.

<a id="cav-07"></a>

### CAV-07 — Cavity dumping

- **Description:** Rapidly extract optical energy already circulating in a resonator.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Laser engineering; Ultrafast optics; Quantum optics and information.
- **Applications:** Pulse extraction; oscillator output control.
- **Type:** Optical layout.
- **Arrangement and variants:** Resonator with a fast switch routing circulating light to an output port.
- **Key constraints:** Extraction timing, switching efficiency, and cavity recovery determine output behaviour.
- **Related patterns:** [Regenerative amplification (CAV-05)](#cav-05); [Q-switching (CAV-06)](#cav-06); [Pulse picking and burst formation (PULSE-06)](#pulse-06).
- **Usually combined with:** [Stable optical resonator (CAV-01)](#cav-01) for storage; [Regenerative amplification (CAV-05)](#cav-05) when timed extraction follows amplification.
- **Usually followed by:** Output conditioning and delivery of the extracted pulse.

<a id="cav-08"></a>

### CAV-08 — Mode-locked oscillator

- **Description:** Synchronize longitudinal modes to generate a repeating pulse train.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Ultrafast optics; Laser engineering; Optical metrology.
- **Applications:** Ultrashort sources; frequency combs; pulse spectroscopy.
- **Type:** Pattern family.
- **Arrangement and variants:** Resonator with active modulation or passive mode-locking and dispersion management.
- **Key constraints:** Mode locking depends on gain, loss, nonlinearity, and dispersion balance.
- **Related patterns:** [Stable optical resonator (CAV-01)](#cav-01); [Dispersion compensation (PULSE-02)](#pulse-02); [Dual-comb spectroscopy (SPECT-08)](#spect-08).
- **Usually combined with:** [Dispersion compensation (PULSE-02)](#pulse-02) for intracavity dispersion; [Frequency locking to a reference (CONTROL-03)](#control-03) for comb stabilization.
- **Usually followed by:** [Pulse picking and burst formation (PULSE-06)](#pulse-06) picking, [Chirped-pulse amplification (PULSE-01)](#pulse-01) amplification, or direct experimental delivery.

<a id="cav-09"></a>

### CAV-09 — Coherent beam combining

- **Description:** Combine amplified channels while controlling their relative phases and modes.
- **Main function:** Recirculating and amplifying light
- **Disciplines:** Laser engineering; Materials processing and fabrication; Optical communications.
- **Applications:** Power scaling; coherent transmitters; receiver combination.
- **Type:** Pattern family.
- **Arrangement and variants:** Phase-controlled amplifier channels feeding a coherent combiner.
- **Key constraints:** Phase errors, amplitude imbalance, and wavefront mismatch reduce useful combination.
- **Related patterns:** [Master oscillator-power amplifier (CAV-04)](#cav-04); [Coherent aperture combination (FIELD-10)](#field-10); [Round-trip phase stabilization (CONTROL-04)](#control-04).
- **Usually combined with:** [Master oscillator-power amplifier (CAV-04)](#cav-04) amplifier channels; phase sensing and [Two-plane beam-pointing control (CONTROL-02)](#control-02) pointing correction.
- **Usually followed by:** A common focusing or delivery train after coherent combination.

<a id="pulse"></a>

## 10. Handling pulses and nonlinear interactions

Reading leads: [Newport's prism-compression arrangement](https://www.newport.com/f/prism-compressor-for-ultrashort-laser-pulses) illustrates PULSE-02; [Newport on broadening and compression](https://www.newport.com/medias/sys_master/images/images/h38/h64/8797270507550/Spectral-Broadening-and-Temporal-Compression-of-Ultrashort-Pulses-App-Note-35.pdf) illustrates PULSE-04; [an electro-optic THz sampling study](https://www.nature.com/articles/srep03116) supports PULSE-10.

<a id="pulse-01"></a>

### PULSE-01 — Chirped-pulse amplification

- **Description:** Stretch an input pulse, amplify it, and recompress it afterward.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Laser engineering; Materials processing and fabrication.
- **Applications:** High-energy ultrashort pulses; precision processing.
- **Type:** Optical layout.
- **Arrangement and variants:** Stretcher, amplifier chain, and matched compressor.
- **Key constraints:** Residual spectral phase, gain narrowing, nonlinear phase, and damage limits constrain performance.
- **Related patterns:** [Regenerative amplification (CAV-05)](#cav-05); [Dispersion compensation (PULSE-02)](#pulse-02); [Master oscillator-power amplifier (CAV-04)](#cav-04).
- **Usually combined with:** [Regenerative amplification (CAV-05)](#cav-05) or [Master oscillator-power amplifier (CAV-04)](#cav-04) for amplification; [Spectrally resolved pulse characterization (PULSE-08)](#pulse-08) for verification.
- **Usually followed by:** Beam delivery to an experiment or [Nonlinear broadening plus compression (PULSE-04)](#pulse-04) post-compression.

<a id="pulse-02"></a>

### PULSE-02 — Dispersion compensation

- **Description:** Combine dispersive contributions to obtain a target pulse duration and spectral phase.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Microscopy; Fiber optics and sensing; Terahertz optics.
- **Applications:** Pulse delivery; microscope precompensation; recompression.
- **Type:** Pattern family.
- **Arrangement and variants:** Prism pairs, grating arrangements, chirped mirrors, or guided dispersive stages.
- **Key constraints:** Higher-order dispersion, bandwidth, losses, and spatial chirp can remain after GDD compensation.
- **Related patterns:** [Fourier pulse shaping (PULSE-03)](#pulse-03); [Nonlinear broadening plus compression (PULSE-04)](#pulse-04); [Nonlinear focal excitation (CONTRAST-07)](#contrast-07).
- **Usually combined with:** [Spectrally resolved pulse characterization (PULSE-08)](#pulse-08) to verify phase/duration; [Nonlinear focal excitation (CONTRAST-07)](#contrast-07) for microscope delivery.
- **Usually followed by:** The target needing compensated pulses, or further amplification in a stretcher role.

<a id="pulse-03"></a>

### PULSE-03 — Fourier pulse shaping

- **Description:** Resolve a pulse spectrum spatially, modify it, and recombine it.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Spectroscopy and analytical chemistry; Quantum optics and information.
- **Applications:** Temporal waveform design; coherent control; dispersion correction.
- **Type:** Optical layout.
- **Arrangement and variants:** Disperser, Fourier optics, spectral mask or modulator, and recombination optics.
- **Key constraints:** Spectral resolution, phase calibration, efficiency, and spatiotemporal coupling limit control.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Fourier-plane filtering (BEAM-07)](#beam-07); [Dispersion compensation (PULSE-02)](#pulse-02).
- **Usually combined with:** [Fourier-plane filtering (BEAM-07)](#beam-07) for spatial-order handling; [Spectrally resolved pulse characterization (PULSE-08)](#pulse-08) for waveform verification.
- **Usually followed by:** A sample interaction, coherent-control experiment, or pulse diagnostic.

<a id="pulse-04"></a>

### PULSE-04 — Nonlinear broadening plus compression

- **Description:** Generate additional bandwidth in a nonlinear medium and compensate the output phase.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Laser engineering; Terahertz optics.
- **Applications:** Shorter pulses; broadband sources; post-compression.
- **Type:** Pattern family.
- **Arrangement and variants:** Nonlinear fiber, hollow-core guide, or multipass cell followed by dispersive compensation.
- **Key constraints:** Ionization, self-focusing, mode quality, and phase structure bound useful broadening.
- **Related patterns:** [Multipass propagation (SCAN-08)](#scan-08); [Dispersion compensation (PULSE-02)](#pulse-02); [Mode matching (BEAM-03)](#beam-03).
- **Usually combined with:** [Multipass propagation (SCAN-08)](#scan-08) in multipass implementations; [Mode matching (BEAM-03)](#beam-03) for guide coupling.
- **Usually followed by:** [Dispersion compensation (PULSE-02)](#pulse-02) dispersion compensation and [Spectrally resolved pulse characterization (PULSE-08)](#pulse-08) characterization.

<a id="pulse-05"></a>

### PULSE-05 — Pump-probe

- **Description:** Prepare a sample and interrogate its response at a controlled delay.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Spectroscopy and analytical chemistry; Biophotonics and life sciences; Terahertz optics.
- **Applications:** Transient absorption; time-resolved microscopy; material dynamics.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Split or synchronized pulses, variable delay, sample overlap, and selective detection.
- **Key constraints:** Timing jitter, overlap, pulse widths, and sample recovery set temporal interpretation.
- **Related patterns:** [Fixed-output variable delay (SCAN-06)](#scan-06); [Sample/reference splitting (ROUTE-08)](#route-08); [Electro-optic sampling (PULSE-10)](#pulse-10).
- **Usually combined with:** [Fixed-output variable delay (SCAN-06)](#scan-06) for timing; [Sample/reference splitting (ROUTE-08)](#route-08) for probe normalization.
- **Usually followed by:** Transmission, reflection, emission, or [Electro-optic sampling (PULSE-10)](#pulse-10) sampling readout.

<a id="pulse-06"></a>

### PULSE-06 — Pulse picking and burst formation

- **Description:** Select pulses or pulse groups from a faster repetition train.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Laser engineering; Materials processing and fabrication; Quantum optics and information.
- **Applications:** Repetition-rate reduction; burst processing; synchronized excitation.
- **Type:** Pattern family.
- **Arrangement and variants:** Synchronized electro-optic or acousto-optic gate with output selection.
- **Key constraints:** Switch speed, extinction, jitter, and pulse-energy redistribution matter.
- **Related patterns:** [Cavity dumping (CAV-07)](#cav-07); [Polarization combining and splitting (ROUTE-02)](#route-02); [Pump-probe (PULSE-05)](#pulse-05).
- **Usually combined with:** [Mode-locked oscillator (CAV-08)](#cav-08) as the input source; [Power stabilization loop (CONTROL-01)](#control-01) for delivered energy monitoring.
- **Usually followed by:** Amplification or synchronized sample excitation.

<a id="pulse-07"></a>

### PULSE-07 — Autocorrelation and cross-correlation

- **Description:** Measure overlap between delayed pulse replicas or different pulses.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Optical metrology; Spectroscopy and analytical chemistry.
- **Applications:** Duration estimates; time-zero alignment; synchronization.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Split-delay-recombine geometry with nonlinear or gated detection.
- **Key constraints:** An autocorrelation alone generally does not uniquely determine pulse shape or phase.
- **Related patterns:** [Fixed-output variable delay (SCAN-06)](#scan-06); [Spectrally resolved pulse characterization (PULSE-08)](#pulse-08); [Nonlinear frequency conversion stage (PULSE-09)](#pulse-09).
- **Usually combined with:** [Fixed-output variable delay (SCAN-06)](#scan-06) for overlap scans; [Nonlinear frequency conversion stage (PULSE-09)](#pulse-09) for nonlinear correlation.
- **Usually followed by:** Integrated correlation detection or [Spectrally resolved pulse characterization (PULSE-08)](#pulse-08) spectral characterization.

<a id="pulse-08"></a>

### PULSE-08 — Spectrally resolved pulse characterization

- **Description:** Encode temporal information into spectral measurements for pulse reconstruction.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Ultrafast optics; Optical metrology.
- **Applications:** Field retrieval; compressor diagnosis; pulse verification.
- **Type:** Pattern family.
- **Arrangement and variants:** FROG uses a spectrally resolved gate; SPIDER uses spectral-shear interferometry.
- **Key constraints:** Each realization has its own sampling, calibration, and retrieval assumptions.
- **Related patterns:** [Autocorrelation and cross-correlation (PULSE-07)](#pulse-07); [Slit-collimator-disperser-camera (SPECT-01)](#spect-01); [Two-arm interferometry (FIELD-01)](#field-01).
- **Usually combined with:** [Autocorrelation and cross-correlation (PULSE-07)](#pulse-07) in gated realizations; [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for spectral readout.
- **Usually followed by:** Field reconstruction and interpretation; normally a diagnostic endpoint.

<a id="pulse-09"></a>

### PULSE-09 — Nonlinear frequency conversion stage

- **Description:** Coordinate interacting beams and a nonlinear medium to generate or amplify selected frequencies.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Laser engineering; Ultrafast optics; Spectroscopy and analytical chemistry; Quantum optics and information.
- **Applications:** SHG; sum/difference-frequency generation; optical parametric amplification.
- **Type:** Pattern family.
- **Arrangement and variants:** Polarization preparation, focusing, phase-matched medium, and output separation.
- **Key constraints:** Phase matching, spatial/temporal overlap, depletion, and material limits govern conversion.
- **Related patterns:** [Mode matching (BEAM-03)](#beam-03); [Wavelength combining and splitting (ROUTE-01)](#route-01); [Pump-probe (PULSE-05)](#pulse-05).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for overlap; [Wavelength combining and splitting (ROUTE-01)](#route-01) for separating generated outputs.
- **Usually followed by:** [Cascaded spectral filtering (SPECT-05)](#spect-05) pump rejection, output conditioning, or the next experimental stage.

<a id="pulse-10"></a>

### PULSE-10 — Electro-optic sampling

- **Description:** Map a fast electric field onto a synchronized optical probe's polarization.
- **Main function:** Handling pulses and nonlinear interactions
- **Disciplines:** Terahertz optics; Ultrafast optics; Optical metrology.
- **Applications:** THz waveform measurement; ultrafast field diagnostics.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Field/probe overlap in an electro-optic medium followed by polarization analysis.
- **Key constraints:** Probe duration, crystal response, phase matching, and timing determine bandwidth.
- **Related patterns:** [Pump-probe (PULSE-05)](#pulse-05); [State preparation and analysis (ROUTE-07)](#route-07); [Balanced detection (FIELD-05)](#field-05).
- **Usually combined with:** [Fixed-output variable delay (SCAN-06)](#scan-06) for sampling delay; [State preparation and analysis (ROUTE-07)](#route-07) and [Balanced detection (FIELD-05)](#field-05) for readout.
- **Usually followed by:** Balanced polarimetric detection and waveform reconstruction.

<a id="access"></a>

## 11. Reaching narrow or remote spaces

Reading leads: [SCHOTT on endoscopy optics](https://www.schott.com/en-in/expertise/applications/endoscopy) and [image bundles](https://www.schott.com/en-ca/products/flexible-imaging-bundles-p1000343) cover ACCESS-01/02; [proximal scanning for endoscopic OCT](https://arxiv.org/abs/1802.07001) illustrates ACCESS-03; [UW's scanning fiber endoscope](https://www.washington.edu/news/2008/01/24/camera-in-a-pill-offers-cheaper-easier-window-on-your-insides-2/) illustrates ACCESS-04/05; [multimode-fiber imaging](https://www.nature.com/articles/ncomms2024) illustrates ACCESS-07.

<a id="access-01"></a>

### ACCESS-01 — Serial image relay

- **Description:** Transfer an image through a long narrow optical channel.
- **Main function:** Transporting optics into constrained spaces
- **Disciplines:** Endoscopy and remote probes; Microscopy; Industrial vision and inspection.
- **Applications:** Rigid endoscopes; borescopes; deep-tissue probes.
- **Type:** Pattern family.
- **Arrangement and variants:** Repeated relay stages using rod lenses, conventional lenses, or GRIN elements.
- **Key constraints:** Diameter, field, numerical aperture, accumulated aberrations, and assembly tolerances compete.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Infinity-corrected imaging (IMG-04)](#img-04); [Coherent image-bundle transport (ACCESS-02)](#access-02).
- **Usually combined with:** [Image relay / 4f relay (IMG-01)](#img-01) for input/output imaging; [Separate illumination and collection channels (ACCESS-05)](#access-05) for illumination delivery.
- **Usually followed by:** A proximal camera or eyepiece after the final relay stage.

<a id="access-02"></a>

### ACCESS-02 — Coherent image-bundle transport

- **Description:** Transfer spatial image samples through an ordered collection of fiber cores.
- **Main function:** Transporting optics into constrained spaces
- **Disciplines:** Endoscopy and remote probes; Industrial vision and inspection; Biophotonics and life sciences.
- **Applications:** Flexible endoscopy; remote inspection.
- **Type:** Optical layout.
- **Arrangement and variants:** Distal imaging optics and an ordered fiber bundle with proximal readout.
- **Key constraints:** Coherent here means spatial order, not phase locking; core sampling and crosstalk limit images.
- **Related patterns:** [Proximal scanning through an image guide (ACCESS-03)](#access-03); [Separate illumination and collection channels (ACCESS-05)](#access-05); [Image relay / 4f relay (IMG-01)](#img-01).
- **Usually combined with:** [Separate illumination and collection channels (ACCESS-05)](#access-05) for illumination; [Image relay / 4f relay (IMG-01)](#img-01) for proximal camera coupling.
- **Usually followed by:** A proximal image relay and camera; excitation may propagate in the opposite direction.

<a id="access-03"></a>

### ACCESS-03 — Proximal scanning through an image guide

- **Description:** Place the scanner outside the probe and address its ordered fiber channels.
- **Main function:** Transporting optics into constrained spaces
- **Disciplines:** Endoscopy and remote probes; Microscopy; Ophthalmic imaging.
- **Applications:** Confocal endomicroscopy; forward-looking OCT.
- **Type:** Optical layout.
- **Arrangement and variants:** Proximal focused scan across an image bundle with distal delivery optics.
- **Key constraints:** Core sampling, coupling, and return-path behaviour constrain field and resolution.
- **Related patterns:** [Coherent image-bundle transport (ACCESS-02)](#access-02); [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Confocal excitation and detection (CONTRAST-01)](#contrast-01).
- **Usually combined with:** [Pupil-conjugate scanning (SCAN-01)](#scan-01) for proximal addressing; [Confocal excitation and detection (CONTRAST-01)](#contrast-01) for confocal collection.
- **Usually followed by:** Distal illumination followed by a return through the guide to detection.

<a id="access-04"></a>

### ACCESS-04 — Distal scanning

- **Description:** Scan the beam at the probe tip instead of relaying a full image.
- **Main function:** Transporting optics into constrained spaces
- **Disciplines:** Endoscopy and remote probes; Industrial vision and inspection; Biophotonics and life sciences.
- **Applications:** Miniature scanning endoscopes; confined-space inspection.
- **Type:** Pattern family.
- **Arrangement and variants:** Vibrating fiber, MEMS mirror, or other distal deflector with collection channels.
- **Key constraints:** Probe diameter, scanner trajectory, calibration, and collection efficiency limit performance.
- **Related patterns:** [Separate illumination and collection channels (ACCESS-05)](#access-05); [Side-viewing rotational probe (ACCESS-06)](#access-06); [Pupil-conjugate scanning (SCAN-01)](#scan-01).
- **Usually combined with:** [Separate illumination and collection channels (ACCESS-05)](#access-05) for collection; [Pupil-conjugate scanning (SCAN-01)](#scan-01) for pupil placement.
- **Usually followed by:** The distal target, then separate or shared return collection and detection.

<a id="access-05"></a>

### ACCESS-05 — Separate illumination and collection channels

- **Description:** Allocate different probe channels to delivery and signal collection.
- **Main function:** Transporting optics into constrained spaces
- **Disciplines:** Endoscopy and remote probes; Biophotonics and life sciences; Spectroscopy and analytical chemistry.
- **Applications:** Fluorescence probes; scanning endoscopes; multimodal sensing.
- **Type:** Pattern family.
- **Arrangement and variants:** Central delivery fiber with surrounding collection fibers; double-clad architectures.
- **Key constraints:** Collection area, background, channel isolation, and probe diameter trade against one another.
- **Related patterns:** [Coherent image-bundle transport (ACCESS-02)](#access-02); [Distal scanning (ACCESS-04)](#access-04); [Wavelength combining and splitting (ROUTE-01)](#route-01).
- **Usually combined with:** [Distal scanning (ACCESS-04)](#access-04) for scanning; [Wavelength combining and splitting (ROUTE-01)](#route-01) for spectral separation.
- **Usually followed by:** Proximal filtering and detection on collection channels.

<a id="access-06"></a>

### ACCESS-06 — Side-viewing rotational probe

- **Description:** Acquire circumferential views through a lateral beam direction and probe rotation.
- **Main function:** Transporting optics into constrained spaces
- **Disciplines:** Endoscopy and remote probes; Industrial vision and inspection; Ophthalmic imaging.
- **Applications:** Tubular inspection; intraluminal OCT; cylindrical surface imaging.
- **Type:** Optical layout.
- **Arrangement and variants:** Fiber delivery, distal focusing, angled reflector or prism, and rotational scan.
- **Key constraints:** Rotation nonuniformity, sheath refraction, working distance, and motion affect reconstruction.
- **Related patterns:** [Rotational or multi-view tomography (SENSE-10)](#sense-10); [Low-coherence interferometry (FIELD-08)](#field-08); [Separate illumination and collection channels (ACCESS-05)](#access-05).
- **Usually combined with:** [Low-coherence interferometry (FIELD-08)](#field-08) for OCT; [Rotational or multi-view tomography (SENSE-10)](#sense-10) for volume reconstruction.
- **Usually followed by:** Return collection and reconstruction of the circumferential scan.

<a id="access-07"></a>

### ACCESS-07 — Calibrated multimode transport

- **Description:** Use a calibrated mode transformation to focus or recover images through a multimode guide.
- **Main function:** Transporting optics into constrained spaces
- **Disciplines:** Endoscopy and remote probes; Computational imaging; Fiber optics and sensing.
- **Applications:** Thin imaging probes; lensless fiber imaging.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Wavefront shaping or encoded illumination with measured transmission and reconstruction.
- **Key constraints:** Bending, temperature, and wavelength changes can invalidate the calibration.
- **Related patterns:** [Programmable wavefront shaping (BEAM-08)](#beam-08); [Mode multiplexing and demultiplexing (LINK-05)](#link-05); [Phase-diversity acquisition (COMPUTE-07)](#compute-07).
- **Usually combined with:** [Programmable wavefront shaping (BEAM-08)](#beam-08) for field control; [Sensorless wavefront optimization (WAVE-03)](#wave-03) for metric-based correction.
- **Usually followed by:** A distal focus or computational reconstruction, depending on the encoding direction.

<a id="wave"></a>

## 12. Correcting wavefronts and suppressing unwanted light

Reading leads: [ESO's adaptive-optics modes](https://www.eso.org/sci/facilities/develop/ao/ao_modes.html) supports WAVE-01/02/04; [NASA on Webb coronagraphs](https://science.nasa.gov/blogs/webb/2023/03/24/how-webbs-coronagraphs-reveal-exoplanets-in-the-infrared/) illustrates WAVE-05.

<a id="wave-01"></a>

### WAVE-01 — Adaptive optics loop

- **Description:** Measure wavefront error and drive a corrector to compensate it.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Astronomy and astrophysics; Ophthalmic imaging; Microscopy; Optical communications.
- **Applications:** Atmospheric correction; retinal imaging; aberration compensation.
- **Type:** Control architecture.
- **Arrangement and variants:** Wavefront-sensing branch, controller, and pupil-conjugate deformable optic.
- **Key constraints:** Latency, actuator range, sensing noise, and non-common-path errors limit correction.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Multi-conjugate correction (WAVE-02)](#wave-02); [Guide-star wavefront correction (WAVE-04)](#wave-04).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) for corrector placement; [Guide-star wavefront correction (WAVE-04)](#wave-04) for reference sensing.
- **Usually followed by:** Corrected science imaging; the sensing branch closes a feedback loop.

<a id="wave-02"></a>

### WAVE-02 — Multi-conjugate correction

- **Description:** Distribute correction across planes conjugate to different aberrating regions.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Astronomy and astrophysics; Microscopy.
- **Applications:** Wide-field correction; layered aberration compensation.
- **Type:** Control architecture.
- **Arrangement and variants:** Several guide measurements and correctors conjugated to different depths or altitudes.
- **Key constraints:** Tomographic inference, conjugation accuracy, and guide coverage determine corrected field.
- **Related patterns:** [Adaptive optics loop (WAVE-01)](#wave-01); [Pupil relay (IMG-03)](#img-03); [Guide-star wavefront correction (WAVE-04)](#wave-04).
- **Usually combined with:** [Guide-star wavefront correction (WAVE-04)](#wave-04) for multiple references; [Pupil relay (IMG-03)](#img-03) for several conjugate planes.
- **Usually followed by:** Corrected field imaging and tomography-based feedback to the correctors.

<a id="wave-03"></a>

### WAVE-03 — Sensorless wavefront optimization

- **Description:** Optimize an optical quality metric instead of using a dedicated wavefront sensor.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Microscopy; Biophotonics and life sciences; Materials processing and fabrication; Computational imaging.
- **Applications:** Deep imaging; through-scatter focusing; processing optimization.
- **Type:** Control architecture.
- **Arrangement and variants:** Programmable corrector, measured image or signal metric, and optimization loop.
- **Key constraints:** Metric choice, sample changes, and measurement count affect convergence and interpretability.
- **Related patterns:** [Programmable wavefront shaping (BEAM-08)](#beam-08); [Calibrated multimode transport (ACCESS-07)](#access-07); [Phase-diversity acquisition (COMPUTE-07)](#compute-07).
- **Usually combined with:** [Programmable wavefront shaping (BEAM-08)](#beam-08) for correction; a sample-dependent image or signal metric.
- **Usually followed by:** The optimized experiment; acquisition feeds back into the correction loop.

<a id="wave-04"></a>

### WAVE-04 — Guide-star wavefront correction

- **Description:** Use a localized reference to estimate propagation distortions.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Astronomy and astrophysics; Microscopy; Optical communications.
- **Applications:** Atmospheric sensing; tissue aberration measurement.
- **Type:** Pattern family.
- **Arrangement and variants:** Natural or artificial reference, wavefront readout, and corrective optical path.
- **Key constraints:** Reference geometry and target separation determine which aberrations are shared.
- **Related patterns:** [Adaptive optics loop (WAVE-01)](#wave-01); [Multi-conjugate correction (WAVE-02)](#wave-02); [Sensorless wavefront optimization (WAVE-03)](#wave-03).
- **Usually combined with:** [Adaptive optics loop (WAVE-01)](#wave-01) or [Multi-conjugate correction (WAVE-02)](#wave-02) for applying the inferred correction.
- **Usually followed by:** Wavefront sensing and control; the science beam follows its own corrected branch.

<a id="wave-05"></a>

### WAVE-05 — Coronagraphic rejection

- **Description:** Suppress a bright source through coordinated field and pupil-plane operations.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Astronomy and astrophysics; Optical metrology.
- **Applications:** Exoplanet imaging; solar-corona observation; high-contrast experiments.
- **Type:** Pattern family.
- **Arrangement and variants:** Focal-plane masks and Lyot stops; apodized, phase-mask, or related variants.
- **Key constraints:** Wavefront errors, finite source size, alignment, and chromaticity limit rejection.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Nulling interferometry (FIELD-09)](#field-09); [Adaptive optics loop (WAVE-01)](#wave-01).
- **Usually combined with:** [Adaptive optics loop (WAVE-01)](#wave-01) for high-quality input wavefronts; [Stray-light baffling (WAVE-08)](#wave-08) for stray-light rejection.
- **Usually followed by:** Science imaging, spectroscopy, or a low-order sensing pickoff.

<a id="wave-06"></a>

### WAVE-06 — Atmospheric dispersion compensation

- **Description:** Introduce angular dispersion opposing that accumulated in the atmosphere.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Astronomy and astrophysics; Remote sensing and LiDAR.
- **Applications:** Broadband telescope imaging; slit and fiber injection.
- **Type:** Optical layout.
- **Arrangement and variants:** Counter-rotating dispersive prism assemblies or equivalent compensators.
- **Key constraints:** Correction depends on observing geometry, wavelength range, and residual aberrations.
- **Related patterns:** [Mode matching (BEAM-03)](#beam-03); [Pupil relay (IMG-03)](#img-03); [Slit-collimator-disperser-camera (SPECT-01)](#spect-01).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for fiber injection; [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for broadband spectroscopy.
- **Usually followed by:** Science imaging or fiber/slit coupling after angular-dispersion correction.

<a id="wave-07"></a>

### WAVE-07 — Cold-stop matching

- **Description:** Restrict an infrared detector's optical view with a cooled pupil stop.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Astronomy and astrophysics; Remote sensing and LiDAR; Industrial vision and inspection; Radiometry and photometry.
- **Applications:** Thermal-background suppression; infrared camera design.
- **Type:** Optical layout.
- **Arrangement and variants:** Relay the system pupil onto a cold aperture in the detector optical train.
- **Key constraints:** Pupil mismatch clips desired light or admits unwanted thermal emission.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Stray-light baffling (WAVE-08)](#wave-08); [Integrating-sphere measurement (CONTROL-07)](#control-07).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) for pupil placement; [Stray-light baffling (WAVE-08)](#wave-08) for remaining stray-light paths.
- **Usually followed by:** Cooled filtering and the infrared detector.

<a id="wave-08"></a>

### WAVE-08 — Stray-light baffling

- **Description:** Intercept unwanted propagation paths before they reach sensitive optics or detectors.
- **Main function:** Correcting wavefronts and rejecting background
- **Disciplines:** Astronomy and astrophysics; Industrial vision and inspection; Optical metrology; Radiometry and photometry.
- **Applications:** Ghost suppression; scattered-light control; instrument contrast.
- **Type:** Pattern family.
- **Arrangement and variants:** Field stops, vanes, beam dumps, blackened surfaces, and controlled apertures.
- **Key constraints:** Baffles must reject unwanted paths without clipping the required field or adding scatter.
- **Related patterns:** [Dark-field collection (CONTRAST-03)](#contrast-03); [Coronagraphic rejection (WAVE-05)](#wave-05); [Cold-stop matching (WAVE-07)](#wave-07).
- **Usually combined with:** Field/pupil stops and [Cold-stop matching (WAVE-07)](#wave-07) where thermal emission matters.
- **Usually followed by:** Baffles are distributed around the optical path; no single downstream stage applies.

<a id="xray"></a>

## 13. Operating in X-ray and EUV regimes

Reading leads: [ESRF on KB mirrors and compound refractive lenses](https://www.esrf.fr/UsersAndScience/Publications/Highlights/2002/Methods/MET1) supports XRAY-01/04; [Chandra's mirror system](https://chandra.harvard.edu/about/specs.html) illustrates XRAY-02; [orbital lobster-eye observations](https://arxiv.org/abs/2211.10007) illustrate XRAY-03; [ESRF on grating interferometry](https://www.esrf.fr/UsersAndScience/Publications/Highlights/2011/imaging/ima10) supports XRAY-07; [ASML on EUV mirrors](https://www.asml.com/en/technology/lithography-principles/lenses-and-mirrors) supports XRAY-08.

<a id="xray-01"></a>

### XRAY-01 — Orthogonal grazing-incidence focusing

- **Description:** Focus the two transverse axes using separate crossed grazing-incidence mirrors.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Spectroscopy and analytical chemistry.
- **Applications:** X-ray micro/nanofocusing; scanning beamlines.
- **Type:** Optical layout.
- **Arrangement and variants:** Kirkpatrick-Baez mirror pair with axis-specific figures and alignment.
- **Key constraints:** Grazing geometry, surface error, aperture, and vibration constrain spot size and acceptance.
- **Related patterns:** [Anamorphic beam shaping (BEAM-04)](#beam-04); [Fixed-exit monochromation (SPECT-04)](#spect-04); [Distributed refractive power (XRAY-04)](#xray-04).
- **Usually combined with:** [Fixed-exit monochromation (SPECT-04)](#spect-04) for energy selection; [Ptychographic acquisition (COMPUTE-03)](#compute-03) for scanning diffraction measurements.
- **Usually followed by:** The sample, followed by fluorescence, diffraction, or transmission detection.

<a id="xray-02"></a>

### XRAY-02 — Nested grazing-incidence imaging

- **Description:** Collect and image short-wavelength radiation using nested reflecting surface pairs.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Astronomy and astrophysics.
- **Applications:** X-ray telescope imaging; compact X-ray imaging optics.
- **Type:** Pattern family.
- **Arrangement and variants:** Wolter-type paired reflections with nested shells.
- **Key constraints:** Collecting area, figure accuracy, off-axis image quality, and coating response trade off.
- **Related patterns:** [Reflective imaging relay (IMG-06)](#img-06); [Wide-field micropore imaging (XRAY-03)](#xray-03); [Stray-light baffling (WAVE-08)](#wave-08).
- **Usually combined with:** [Stray-light baffling (WAVE-08)](#wave-08) for stray-light management; instrument-specific spectral selection.
- **Usually followed by:** An X-ray focal detector or focal-plane instrument.

<a id="xray-03"></a>

### XRAY-03 — Wide-field micropore imaging

- **Description:** Use many small reflecting channels to form images across a broad field.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Astronomy and astrophysics.
- **Applications:** Transient monitoring; wide-field X-ray surveys.
- **Type:** Pattern family.
- **Arrangement and variants:** Lobster-eye micropore arrangements and their focal detector geometry.
- **Key constraints:** Broad field comes with a structured point-spread function and demanding alignment.
- **Related patterns:** [Nested grazing-incidence imaging (XRAY-02)](#xray-02); [Stray-light baffling (WAVE-08)](#wave-08); [Coded-aperture imaging (COMPUTE-04)](#compute-04).
- **Usually combined with:** A wide-field detector and calibrated image reconstruction.
- **Usually followed by:** Focal-plane detection and point-spread-function-aware source reconstruction.

<a id="xray-04"></a>

### XRAY-04 — Distributed refractive power

- **Description:** Accumulate useful focusing power from a sequence of weak refractive elements.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Optical metrology.
- **Applications:** Hard-X-ray focusing; adjustable beamline focus.
- **Type:** Pattern family.
- **Arrangement and variants:** Compound refractive lenses; transfocators insert or remove lens groups.
- **Key constraints:** Absorption, chromaticity, apertures, and lens count limit usable focusing.
- **Related patterns:** [Orthogonal grazing-incidence focusing (XRAY-01)](#xray-01); [Mode matching (BEAM-03)](#beam-03); [Compensated zoom (IMG-09)](#img-09).
- **Usually combined with:** [Fixed-exit monochromation (SPECT-04)](#spect-04) for energy selection; [Mode matching (BEAM-03)](#beam-03) for focus design.
- **Usually followed by:** The sample or a subsequent imaging/focusing stage.

<a id="xray-05"></a>

### XRAY-05 — Diffractive focusing with order selection

- **Description:** Isolate useful focused diffraction orders from unwanted transmitted and diffracted light.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Microscopy.
- **Applications:** Zone-plate microscopy; X-ray nanoprobes.
- **Type:** Optical layout.
- **Arrangement and variants:** Zone plate with central stop and appropriately positioned order-sorting aperture.
- **Key constraints:** Spectral bandwidth, efficiency, aperture placement, and alignment constrain image quality.
- **Related patterns:** [Fourier-plane filtering (BEAM-07)](#beam-07); [Distributed refractive power (XRAY-04)](#xray-04); [Dark-field collection (CONTRAST-03)](#contrast-03).
- **Usually combined with:** [Fourier-plane filtering (BEAM-07)](#beam-07); [Fixed-exit monochromation (SPECT-04)](#spect-04) for spectral preparation.
- **Usually followed by:** The selected-order focus at the sample or image plane.

<a id="xray-06"></a>

### XRAY-06 — Propagation-based phase contrast

- **Description:** Convert sample-induced phase structure into intensity through propagation.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Microscopy; Computational imaging.
- **Applications:** Weak-absorption imaging; phase tomography.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Source, sample, controlled propagation distance, and spatial detector.
- **Key constraints:** Coherence, sampling, distance, and phase-retrieval assumptions govern interpretation.
- **Related patterns:** [Phase-to-intensity conversion (CONTRAST-04)](#contrast-04); [Rotational or multi-view tomography (SENSE-10)](#sense-10); [Ptychographic acquisition (COMPUTE-03)](#compute-03).
- **Usually combined with:** [Rotational or multi-view tomography (SENSE-10)](#sense-10) for tomography; [Ptychographic acquisition (COMPUTE-03)](#compute-03) for related phase-retrieval methods.
- **Usually followed by:** A propagation-plane detector and phase reconstruction.

<a id="xray-07"></a>

### XRAY-07 — Grating-based phase analysis

- **Description:** Encode phase gradients and small-angle scattering into measurable fringe changes.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Optical metrology.
- **Applications:** Phase-contrast imaging; dark-field imaging.
- **Type:** Pattern family.
- **Arrangement and variants:** Talbot or Talbot-Lau arrangements with phase/analyzer gratings and optional source grating.
- **Key constraints:** Grating geometry, energy bandwidth, alignment, and stepping calibration limit sensitivity.
- **Related patterns:** [Shearing interferometry (FIELD-04)](#field-04); [Phase-shifting interferometry (COMPUTE-02)](#compute-02); [Propagation-based phase contrast (XRAY-06)](#xray-06).
- **Usually combined with:** [Phase-shifting interferometry (COMPUTE-02)](#compute-02); [Rotational or multi-view tomography (SENSE-10)](#sense-10) for tomography.
- **Usually followed by:** Grating-fringe detection and absorption/phase/scattering reconstruction.

<a id="xray-08"></a>

### XRAY-08 — Multilayer reflective transport

- **Description:** Guide and image strongly absorbed wavelengths using band-selective reflective surfaces.
- **Main function:** Operating in X-ray and EUV regimes
- **Disciplines:** X-ray and EUV instrumentation; Lithography; Astronomy and astrophysics.
- **Applications:** EUV projection; spectral selection; short-wavelength imaging.
- **Type:** Pattern family.
- **Arrangement and variants:** Coordinated multilayer-coated mirrors, commonly within a vacuum optical path.
- **Key constraints:** Bandwidth, incidence angle, contamination, and cumulative reflection loss constrain throughput.
- **Related patterns:** [Reflective imaging relay (IMG-06)](#img-06); [Reduction projection (ILL-07)](#ill-07); [Fixed-exit monochromation (SPECT-04)](#spect-04).
- **Usually combined with:** [Reduction projection (ILL-07)](#ill-07) in EUV projection; [Stray-light baffling (WAVE-08)](#wave-08) for stray-light control.
- **Usually followed by:** The next reflective stage or the final exposure/detection plane.

<a id="link"></a>

## 14. Transporting and processing information in guides

Reading leads: [programmable integrated interferometer meshes](https://arxiv.org/abs/2208.13911) supports LINK-04; [a photonic-lantern coherent receiver](https://arxiv.org/abs/2105.09516) illustrates LINK-05; [NIST's integrated-photonics review](https://www.nist.gov/publications/hybrid-integrated-quantum-photonic-circuits) provides broader context, not validation of every entry.

<a id="link-01"></a>

### LINK-01 — Wavelength multiplexing and add/drop

- **Description:** Insert, route, or remove wavelength channels from a shared optical connection.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Optical communications; Integrated photonics; Fiber optics and sensing.
- **Applications:** WDM links; channel filters; wavelength routing.
- **Type:** Pattern family.
- **Arrangement and variants:** Filter banks, arrayed-waveguide gratings, or coupled-ring add/drop networks.
- **Key constraints:** Channel spacing, crosstalk, loss, and thermal drift constrain operation.
- **Related patterns:** [Wavelength combining and splitting (ROUTE-01)](#route-01); [Fixed-exit monochromation (SPECT-04)](#spect-04); [Programmable interferometer mesh (LINK-04)](#link-04).
- **Usually combined with:** [Fiber-to-chip / free-space-to-chip coupling (LINK-07)](#link-07) for external coupling; [Interferometric modulation (LINK-02)](#link-02) and [I/Q optical modulation (LINK-03)](#link-03) for channel transmitters.
- **Usually followed by:** Channel-specific receivers, modulators, or onward guided transport.

<a id="link-02"></a>

### LINK-02 — Interferometric modulation

- **Description:** Convert a controlled phase change into amplitude modulation through recombination.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Optical communications; Integrated photonics; Optical metrology.
- **Applications:** Optical transmitters; intensity control; switching.
- **Type:** Optical layout.
- **Arrangement and variants:** Mach-Zehnder modulator with one or both arms phase-driven.
- **Key constraints:** Bias drift, chirp, extinction, optical loss, and electrical bandwidth matter.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [I/Q optical modulation (LINK-03)](#link-03); [Power stabilization loop (CONTROL-01)](#control-01).
- **Usually combined with:** [Power stabilization loop (CONTROL-01)](#control-01) for intensity regulation; [I/Q optical modulation (LINK-03)](#link-03) for complex modulation.
- **Usually followed by:** Guided transport, amplification, or a measurement target.

<a id="link-03"></a>

### LINK-03 — I/Q optical modulation

- **Description:** Control two field quadratures through coordinated modulation branches.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Optical communications; Integrated photonics.
- **Applications:** Coherent transmitters; complex waveform generation.
- **Type:** Optical layout.
- **Arrangement and variants:** Nested or parallel interferometric modulators with quadrature phase relation.
- **Key constraints:** Branch balance, bias stability, and modulation bandwidth determine signal fidelity.
- **Related patterns:** [Interferometric modulation (LINK-02)](#link-02); [Optical I/Q detection (FIELD-07)](#field-07); [Polarization diversity (ROUTE-06)](#route-06).
- **Usually combined with:** [Polarization diversity (ROUTE-06)](#route-06) for polarization-multiplexed channels; [Wavelength multiplexing and add/drop (LINK-01)](#link-01) for WDM.
- **Usually followed by:** The optical link and a [Optical I/Q detection (FIELD-07)](#field-07) coherent receiver.

<a id="link-04"></a>

### LINK-04 — Programmable interferometer mesh

- **Description:** Compose tunable couplers and phase shifts into a multimode optical transformation.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Integrated photonics; Quantum optics and information; Optical communications.
- **Applications:** Reconfigurable routing; linear optical processing; quantum networks.
- **Type:** Pattern family.
- **Arrangement and variants:** Networks of Mach-Zehnder cells or equivalent tunable interferometers.
- **Key constraints:** Loss accumulation, phase drift, calibration, and topology determine useful scale.
- **Related patterns:** [Interferometric modulation (LINK-02)](#link-02); [Mode multiplexing and demultiplexing (LINK-05)](#link-05); [Two-photon interference (QUANT-03)](#quant-03).
- **Usually combined with:** [Fiber-to-chip / free-space-to-chip coupling (LINK-07)](#link-07) for access; [Two-photon interference (QUANT-03)](#quant-03) for two-photon operations.
- **Usually followed by:** Output guides and detectors, or another processing stage.

<a id="link-05"></a>

### LINK-05 — Mode multiplexing and demultiplexing

- **Description:** Map spatial modes to distinguishable channels and back.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Optical communications; Fiber optics and sensing; Astronomy and astrophysics; Endoscopy and remote probes.
- **Applications:** Mode-division links; photonic-lantern feeds; modal reception.
- **Type:** Pattern family.
- **Arrangement and variants:** Photonic lanterns, mode converters, or spatial mode-sorter arrangements.
- **Key constraints:** Supported mode count, crosstalk, and mode-dependent loss constrain the mapping.
- **Related patterns:** [Single-mode filtering (BEAM-02)](#beam-02); [Adiabatic mode conversion (LINK-06)](#link-06); [Calibrated multimode transport (ACCESS-07)](#access-07).
- **Usually combined with:** [Adiabatic mode conversion (LINK-06)](#link-06) for lantern transitions; [Homodyne / heterodyne reception (FIELD-06)](#field-06) for coherent modal reception.
- **Usually followed by:** Parallel single-mode processing or the receiving multimode guide, depending on direction.

<a id="link-06"></a>

### LINK-06 — Adiabatic mode conversion

- **Description:** Transfer light between modal geometries using gradual structural changes.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Integrated photonics; Fiber optics and sensing.
- **Applications:** Spot-size conversion; guide transitions; polarization conversion.
- **Type:** Pattern family.
- **Arrangement and variants:** Tapers or slowly varying coupled-waveguide sections.
- **Key constraints:** Required length and fabrication tolerances depend on modal separation and coupling.
- **Related patterns:** [Mode multiplexing and demultiplexing (LINK-05)](#link-05); [Fiber-to-chip / free-space-to-chip coupling (LINK-07)](#link-07); [Mode matching (BEAM-03)](#beam-03).
- **Usually combined with:** [Fiber-to-chip / free-space-to-chip coupling (LINK-07)](#link-07) for chip interfaces; [Mode multiplexing and demultiplexing (LINK-05)](#link-05) for mode multiplexing.
- **Usually followed by:** The guide or coupling region matched by the transition.

<a id="link-07"></a>

### LINK-07 — Fiber-to-chip / free-space-to-chip coupling

- **Description:** Match the optical field between external delivery and an integrated guide.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Integrated photonics; Optical communications; Quantum optics and information.
- **Applications:** Photonic packaging; chip characterization; quantum interfaces.
- **Type:** Pattern family.
- **Arrangement and variants:** Edge coupling with mode converters; grating coupling with focusing and alignment optics.
- **Key constraints:** Mode mismatch, alignment tolerance, polarization, and bandwidth limit coupling.
- **Related patterns:** [Mode matching (BEAM-03)](#beam-03); [Adiabatic mode conversion (LINK-06)](#link-06); [Nonreciprocal routing (ROUTE-05)](#route-05).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for mode matching; [Adiabatic mode conversion (LINK-06)](#link-06) for spot-size conversion.
- **Usually followed by:** The photonic circuit on input, or external delivery/detection on output.

<a id="link-08"></a>

### LINK-08 — Optical phased-array steering

- **Description:** Control emitter phases to steer a combined far-field distribution.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Integrated photonics; Remote sensing and LiDAR; Optical communications.
- **Applications:** Solid-state scanning; free-space links; beam synthesis.
- **Type:** Optical layout.
- **Arrangement and variants:** Coherent distribution network feeding a phase-controlled emitter array.
- **Key constraints:** Pitch, aperture, phase calibration, and grating lobes constrain field of view.
- **Related patterns:** [Coherent beam combining (CAV-09)](#cav-09); [Programmable wavefront shaping (BEAM-08)](#beam-08); [Coaxial transmit/receive (SENSE-01)](#sense-01).
- **Usually combined with:** [Coherent beam combining (CAV-09)](#cav-09); [Coaxial transmit/receive (SENSE-01)](#sense-01) in transceivers.
- **Usually followed by:** Free-space propagation to the target or remote receiver.

<a id="link-09"></a>

### LINK-09 — Distributed optical interrogation

- **Description:** Resolve responses from positions along a sensing guide.
- **Main function:** Transporting and processing guided optical information
- **Disciplines:** Fiber optics and sensing; Optical metrology; Industrial vision and inspection.
- **Applications:** Distributed strain or temperature sensing; reflectometry.
- **Type:** Pattern family.
- **Arrangement and variants:** Pulsed or swept interrogation, return routing, and position-resolved detection.
- **Key constraints:** Range, spatial resolution, ambiguity, and signal strength depend on the interrogation method.
- **Related patterns:** [Time-of-flight ranging (SENSE-02)](#sense-02); [FMCW ranging (SENSE-03)](#sense-03); [Nonreciprocal routing (ROUTE-05)](#route-05).
- **Usually combined with:** [Nonreciprocal routing (ROUTE-05)](#route-05) for return separation; [Time-of-flight ranging (SENSE-02)](#sense-02) or [FMCW ranging (SENSE-03)](#sense-03) for position encoding.
- **Usually followed by:** Detection and a position-resolved estimate of the sensing response.

<a id="quant"></a>

## 15. Preparing quantum states and manipulating particles

Reading leads: [a polarization-Sagnac photon-pair source](https://www.nature.com/articles/s41598-019-41633-z) illustrates QUANT-02 and two-photon characterization; [Hamamatsu's optical-trap applications](https://lcos-slm.hamamatsu.com/eu/en/application/quantum_technology.html) provides QUANT-07 context. Quantum-state and atom-light claims require dedicated sources in future articles.

<a id="quant-01"></a>

### QUANT-01 — Heralded photon generation

- **Description:** Use detection in one output of a pair source to announce a correlated photon.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Quantum optics and information; Integrated photonics.
- **Applications:** Single-photon experiments; quantum communication.
- **Type:** Optical layout.
- **Arrangement and variants:** Pair-generation medium, pump rejection, separated outputs, and herald detector.
- **Key constraints:** Multipair emission, losses, spectral correlations, and detector response affect heralded quality.
- **Related patterns:** [Nonlinear frequency conversion stage (PULSE-09)](#pulse-09); [Cascaded spectral filtering (SPECT-05)](#spect-05); [Two-photon interference (QUANT-03)](#quant-03).
- **Usually combined with:** [Nonlinear frequency conversion stage (PULSE-09)](#pulse-09) for pair generation; [Cascaded spectral filtering (SPECT-05)](#spect-05) for pump rejection.
- **Usually followed by:** State preparation, delay, or quantum operations on the heralded arm; herald detection is a branch.

<a id="quant-02"></a>

### QUANT-02 — Indistinguishable-path entanglement generation

- **Description:** Superpose indistinguishable generation alternatives to prepare entangled outputs.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Quantum optics and information; Integrated photonics; Optical communications.
- **Applications:** Entangled photon sources; quantum links.
- **Type:** Pattern family.
- **Arrangement and variants:** Polarization-Sagnac, crossed-crystal, or coherently pumped multiple-source arrangements.
- **Key constraints:** Unwanted distinguishability, phase drift, and collection mismatch reduce state quality.
- **Related patterns:** [Counterpropagating-loop interferometry (FIELD-03)](#field-03); [State preparation and analysis (ROUTE-07)](#route-07); [Heralded photon generation (QUANT-01)](#quant-01).
- **Usually combined with:** [Counterpropagating-loop interferometry (FIELD-03)](#field-03) in Sagnac sources; [State preparation and analysis (ROUTE-07)](#route-07) for state preparation and analysis.
- **Usually followed by:** Separated photon delivery and basis analysis/coincidence detection.

<a id="quant-03"></a>

### QUANT-03 — Two-photon interference

- **Description:** Overlap photons at a beam splitter and compare output coincidence statistics.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Quantum optics and information; Integrated photonics.
- **Applications:** Hong-Ou-Mandel measurements; indistinguishability tests; optical quantum operations.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Two prepared input modes, adjustable overlap/delay, splitter, and coincidence detection.
- **Key constraints:** Temporal, spectral, spatial, and polarization distinguishability change the result.
- **Related patterns:** [Fixed-output variable delay (SCAN-06)](#scan-06); [Heralded photon generation (QUANT-01)](#quant-01); [Programmable interferometer mesh (LINK-04)](#link-04).
- **Usually combined with:** [Heralded photon generation (QUANT-01)](#quant-01) photon sources; [Fixed-output variable delay (SCAN-06)](#scan-06) for temporal overlap.
- **Usually followed by:** Coincidence detection or a downstream quantum circuit.

<a id="quant-04"></a>

### QUANT-04 — Time-bin preparation and analysis

- **Description:** Encode and analyze alternatives associated with distinct photon arrival times.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Quantum optics and information; Optical communications; Fiber optics and sensing.
- **Applications:** Time-bin communication; Franson-type measurements.
- **Type:** Pattern family.
- **Arrangement and variants:** Matched unbalanced interferometers with phase control and time-resolved detection.
- **Key constraints:** Path imbalance, coherence requirements, and timing resolution depend on protocol.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [Fixed-output variable delay (SCAN-06)](#scan-06); [Round-trip phase stabilization (CONTROL-04)](#control-04).
- **Usually combined with:** [Two-arm interferometry (FIELD-01)](#field-01) unbalanced arms; [Round-trip phase stabilization (CONTROL-04)](#control-04) for phase-stable links.
- **Usually followed by:** Timing-resolved detection or further time-bin operations.

<a id="quant-05"></a>

### QUANT-05 — Squeezed-field injection and readout

- **Description:** Deliver a squeezed field with the quadrature alignment needed for a measurement.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Quantum optics and information; Optical metrology; Astronomy and astrophysics.
- **Applications:** Quantum-noise reduction; precision interferometry.
- **Type:** Optical layout.
- **Arrangement and variants:** Squeezed source, mode matching, phase control, and quadrature-sensitive readout.
- **Key constraints:** Loss and phase errors degrade squeezing; useful quadrature can depend on frequency.
- **Related patterns:** [Homodyne / heterodyne reception (FIELD-06)](#field-06); [Nulling interferometry (FIELD-09)](#field-09); [Power and signal recycling (CAV-03)](#cav-03).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for mode matching; [Homodyne / heterodyne reception (FIELD-06)](#field-06) for quadrature readout.
- **Usually followed by:** The sensing interferometer or homodyne detector selected for the squeezed quadrature.

<a id="quant-06"></a>

### QUANT-06 — Optical tweezer with position readout

- **Description:** Combine optical confinement with a calibrated displacement measurement.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Biophotonics and life sciences; Atomic physics; Optical metrology.
- **Applications:** Single-particle manipulation; force spectroscopy; atom trapping.
- **Type:** Optical layout.
- **Arrangement and variants:** Tightly focused trapping beam with imaging or back-focal-plane detection.
- **Key constraints:** Trap stability and force calibration depend on particle, medium, beam, and detector.
- **Related patterns:** [Mode matching (BEAM-03)](#beam-03); [Pupil relay (IMG-03)](#img-03); [Pupil and image diagnostic branches (CONTROL-08)](#control-08).
- **Usually combined with:** [Pupil relay (IMG-03)](#img-03) for pupil readout; [Mode matching (BEAM-03)](#beam-03) for trap focusing.
- **Usually followed by:** Particle imaging or displacement detection; the trapping beam may terminate at a dump.

<a id="quant-07"></a>

### QUANT-07 — Holographic trap arrays

- **Description:** Create and reposition multiple trapping sites through spatial beam control.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Atomic physics; Biophotonics and life sciences; Quantum optics and information.
- **Applications:** Neutral-atom arrays; multi-particle manipulation.
- **Type:** Pattern family.
- **Arrangement and variants:** SLM holograms, diffractive splitting, or time-shared deflection with focusing optics.
- **Key constraints:** Power uniformity, aberrations, crosstalk, and trap dynamics constrain scaling.
- **Related patterns:** [Programmable wavefront shaping (BEAM-08)](#beam-08); [Multispot illumination (ILL-08)](#ill-08); [Optical tweezer with position readout (QUANT-06)](#quant-06).
- **Usually combined with:** [Programmable wavefront shaping (BEAM-08)](#beam-08) for holograms; [Multispot illumination (ILL-08)](#ill-08) for spot arrays.
- **Usually followed by:** The trapping plane, then particle imaging and control feedback.

<a id="quant-08"></a>

### QUANT-08 — Counterpropagating optical lattice

- **Description:** Superpose coherent beams to create a periodic light-induced potential.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Atomic physics; Quantum optics and information.
- **Applications:** Atomic lattices; quantum simulation.
- **Type:** Pattern family.
- **Arrangement and variants:** Counterpropagating or intersecting coherent beams with controlled frequency and polarization.
- **Key constraints:** Relative phase, intensity, and detuning determine potential stability and geometry.
- **Related patterns:** [Counterpropagating-loop interferometry (FIELD-03)](#field-03); [State preparation and analysis (ROUTE-07)](#route-07); [Round-trip phase stabilization (CONTROL-04)](#control-04).
- **Usually combined with:** [Round-trip phase stabilization (CONTROL-04)](#control-04) for relative phase; [State preparation and analysis (ROUTE-07)](#route-07) for polarization preparation.
- **Usually followed by:** Atomic interaction followed by a separate state or position readout sequence.

<a id="quant-09"></a>

### QUANT-09 — Multi-axis cooling and addressing

- **Description:** Arrange frequency- and polarization-controlled beams around an atomic sample.
- **Main function:** Preparing quantum states and manipulating particles
- **Disciplines:** Atomic physics; Quantum optics and information.
- **Applications:** Laser cooling; optical molasses; state preparation and addressing.
- **Type:** Pattern family.
- **Arrangement and variants:** Multiple beam axes with detuning/repump paths; magneto-optical trapping also requires magnetic fields.
- **Key constraints:** Optical geometry alone does not define trapping; internal states and field gradients matter.
- **Related patterns:** [Double-pass AOM (SCAN-07)](#scan-07); [State preparation and analysis (ROUTE-07)](#route-07); [Frequency locking to a reference (CONTROL-03)](#control-03).
- **Usually combined with:** [Double-pass AOM (SCAN-07)](#scan-07) for frequency control; [State preparation and analysis (ROUTE-07)](#route-07) for polarization preparation.
- **Usually followed by:** The atomic sample and experiment-specific fluorescence or absorption readout.

<a id="sense"></a>

## 16. Measuring distance, shape, motion, and samples

Reading leads: [NASA's coherent-LiDAR local oscillator](https://technology.nasa.gov/patent/LAR-TOPS-400) illustrates SENSE-03; [BD's cytometry optics introduction](https://www.bdbiosciences.com/en-us/learn/training/basic/flow-cytometry-introduction) supports SENSE-07. Other measurement families require dedicated references before publication.

<a id="sense-01"></a>

### SENSE-01 — Coaxial transmit/receive

- **Description:** Share an external aperture while separating internal outgoing and return channels.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Remote sensing and LiDAR; Endoscopy and remote probes; Optical metrology.
- **Applications:** LiDAR; reflected-signal probes; monostatic sensing.
- **Type:** Optical layout.
- **Arrangement and variants:** Shared telescope or objective with spectral, polarization, or nonreciprocal separation.
- **Key constraints:** Transmit leakage, back-reflections, and near-field overlap limit weak-return detection.
- **Related patterns:** [Polarization-based send/return separation (ROUTE-04)](#route-04); [Nonreciprocal routing (ROUTE-05)](#route-05); [Epi-illumination (ILL-03)](#ill-03).
- **Usually combined with:** [Polarization-based send/return separation (ROUTE-04)](#route-04) or [Nonreciprocal routing (ROUTE-05)](#route-05) for path separation; [Time-of-flight ranging (SENSE-02)](#sense-02) and [FMCW ranging (SENSE-03)](#sense-03) for ranging.
- **Usually followed by:** On return, filtering and the selected ranging/detection receiver.

<a id="sense-02"></a>

### SENSE-02 — Time-of-flight ranging

- **Description:** Infer path length from the measured delay of returned light.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Remote sensing and LiDAR; Industrial vision and inspection; Fiber optics and sensing.
- **Applications:** Pulsed LiDAR; depth cameras; optical reflectometry.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Timed source, return collection, and synchronized detection.
- **Key constraints:** Timing uncertainty, multipath, background, and repetition ambiguity affect range.
- **Related patterns:** [Coaxial transmit/receive (SENSE-01)](#sense-01); [Distributed optical interrogation (LINK-09)](#link-09); [Pulse picking and burst formation (PULSE-06)](#pulse-06).
- **Usually combined with:** [Coaxial transmit/receive (SENSE-01)](#sense-01) for common-aperture collection; [Pulse picking and burst formation (PULSE-06)](#pulse-06) for synchronized illumination.
- **Usually followed by:** Time-tagging electronics and range reconstruction.

<a id="sense-03"></a>

### SENSE-03 — FMCW ranging

- **Description:** Compare a swept optical signal with its delayed return to infer distance and motion.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Remote sensing and LiDAR; Optical metrology; Fiber optics and sensing.
- **Applications:** Coherent LiDAR; swept-frequency reflectometry.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Frequency-swept source, local reference, return mixer, and beat analysis.
- **Key constraints:** Sweep linearity, coherence, Doppler coupling, and ambiguity require calibration.
- **Related patterns:** [Homodyne / heterodyne reception (FIELD-06)](#field-06); [Coaxial transmit/receive (SENSE-01)](#sense-01); [Frequency locking to a reference (CONTROL-03)](#control-03).
- **Usually combined with:** [Homodyne / heterodyne reception (FIELD-06)](#field-06) for coherent mixing; [Coaxial transmit/receive (SENSE-01)](#sense-01) for shared-aperture delivery.
- **Usually followed by:** Beat detection and joint range/velocity estimation.

<a id="sense-04"></a>

### SENSE-04 — Optical triangulation

- **Description:** Recover position using separated observation or projection directions.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Industrial vision and inspection; Remote sensing and LiDAR; Optical metrology.
- **Applications:** Surface profiling; robot vision; stereo measurement.
- **Type:** Pattern family.
- **Arrangement and variants:** Projector-camera or multi-camera geometry with calibrated baseline and imaging.
- **Key constraints:** Occlusion, calibration, reflectance, and baseline trade range against precision.
- **Related patterns:** [Telecentric imaging (IMG-05)](#img-05); [Scheimpflug imaging (IMG-07)](#img-07); [Fringe projection profilometry (SENSE-05)](#sense-05).
- **Usually combined with:** [Telecentric imaging (IMG-05)](#img-05) for metrology imaging; [Scheimpflug imaging (IMG-07)](#img-07) for tilted target planes.
- **Usually followed by:** Camera acquisition and calibrated geometric reconstruction.

<a id="sense-05"></a>

### SENSE-05 — Fringe projection profilometry

- **Description:** Recover surface geometry from deformation of projected patterns.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Industrial vision and inspection; Optical metrology; Computational imaging.
- **Applications:** Shape measurement; manufacturing inspection.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Pattern projector, camera, calibrated geometry, and phase/shape reconstruction.
- **Key constraints:** Phase ambiguity, motion, shadows, and nonuniform reflectance constrain recovery.
- **Related patterns:** [Structured illumination / pattern projection (ILL-05)](#ill-05); [Optical triangulation (SENSE-04)](#sense-04); [Phase-shifting interferometry (COMPUTE-02)](#compute-02).
- **Usually combined with:** [Structured illumination / pattern projection (ILL-05)](#ill-05) for patterns; [Optical triangulation (SENSE-04)](#sense-04) for geometry.
- **Usually followed by:** Camera acquisition, phase unwrapping, and surface reconstruction.

<a id="sense-06"></a>

### SENSE-06 — Crossed-beam Doppler measurement

- **Description:** Convert particle motion through an interference region into a measurable modulation.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Flow and particle diagnostics; Optical metrology; Industrial vision and inspection.
- **Applications:** Laser Doppler velocimetry; flow diagnostics.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Two coherent beams crossing at a known angle with scattered-light detection.
- **Key constraints:** Fringe geometry, particle scattering, and detection bandwidth set measurement range.
- **Related patterns:** [Homodyne / heterodyne reception (FIELD-06)](#field-06); [Mode matching (BEAM-03)](#beam-03); [Angular and spectral collection channels (SENSE-07)](#sense-07).
- **Usually combined with:** [Homodyne / heterodyne reception (FIELD-06)](#field-06) for coherent readout; frequency shifting for directional discrimination.
- **Usually followed by:** Scattered-light detection and velocity-signal processing.

<a id="sense-07"></a>

### SENSE-07 — Angular and spectral collection channels

- **Description:** Separate scattered and emitted signals by angle and wavelength.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Flow and particle diagnostics; Biophotonics and life sciences; Industrial vision and inspection.
- **Applications:** Flow cytometry; particle classification; scattering analysis.
- **Type:** Optical layout.
- **Arrangement and variants:** Focused excitation with forward/side collection and filtered detector branches.
- **Key constraints:** Collection geometry and spectral overlap require calibration; observables are sample-dependent.
- **Related patterns:** [Wavelength combining and splitting (ROUTE-01)](#route-01); [Dark-field collection (CONTRAST-03)](#contrast-03); [Anamorphic beam shaping (BEAM-04)](#beam-04).
- **Usually combined with:** [Wavelength combining and splitting (ROUTE-01)](#route-01) for emission channels; [Dark-field collection (CONTRAST-03)](#contrast-03) for direct-light rejection.
- **Usually followed by:** Detector channels and calibrated particle-feature extraction.

<a id="sense-08"></a>

### SENSE-08 — Evanescent sensing interface

- **Description:** Probe sample properties through an optical field extending outside a guiding surface.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Chemical and surface sensing; Spectroscopy and analytical chemistry; Fiber optics and sensing; Biophotonics and life sciences.
- **Applications:** ATR spectroscopy; surface-plasmon sensing; waveguide biosensors.
- **Type:** Pattern family.
- **Arrangement and variants:** Prism, coated interface, or exposed guide with controlled coupling and readout.
- **Key constraints:** Surface chemistry, index, penetration depth, and temperature can confound interpretation.
- **Related patterns:** [Evanescent-field excitation (CONTRAST-06)](#contrast-06); [State preparation and analysis (ROUTE-07)](#route-07); [Slit-collimator-disperser-camera (SPECT-01)](#spect-01).
- **Usually combined with:** [State preparation and analysis (ROUTE-07)](#route-07) for polarization control; [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for spectral response.
- **Usually followed by:** Optical detection and calibration against the relevant sample property.

<a id="sense-09"></a>

### SENSE-09 — Optical pump plus acoustic readout

- **Description:** Generate an acoustic response by optical absorption and detect it separately.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** Biophotonics and life sciences; Industrial vision and inspection; Optical metrology.
- **Applications:** Photoacoustic imaging; absorption mapping; material inspection.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Pulsed optical delivery, acoustic receiver, and coordinated acquisition geometry.
- **Key constraints:** Optical fluence, acoustic propagation, and detector response all influence the signal.
- **Related patterns:** [Pulse picking and burst formation (PULSE-06)](#pulse-06); [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Rotational or multi-view tomography (SENSE-10)](#sense-10).
- **Usually combined with:** [Pulse picking and burst formation (PULSE-06)](#pulse-06) for excitation timing; [Rotational or multi-view tomography (SENSE-10)](#sense-10) for tomographic sampling.
- **Usually followed by:** Acoustic detection and reconstruction; the measurement changes physical modality.

<a id="sense-10"></a>

### SENSE-10 — Rotational or multi-view tomography

- **Description:** Combine projections or views to reconstruct internal spatial structure.
- **Main function:** Measuring distance, shape, motion, and samples
- **Disciplines:** X-ray and EUV instrumentation; Biophotonics and life sciences; Industrial vision and inspection; Computational imaging.
- **Applications:** Computed tomography; optical projection tomography; volumetric inspection.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Rotating sample/source-detector geometry or several calibrated viewing directions.
- **Key constraints:** Angular coverage, motion, scattering, and reconstruction assumptions determine fidelity.
- **Related patterns:** [Propagation-based phase contrast (XRAY-06)](#xray-06); [Side-viewing rotational probe (ACCESS-06)](#access-06); [Ptychographic acquisition (COMPUTE-03)](#compute-03).
- **Usually combined with:** [Propagation-based phase contrast (XRAY-06)](#xray-06) for phase contrast; [Optical pump plus acoustic readout (SENSE-09)](#sense-09) in photoacoustic tomography.
- **Usually followed by:** Projection acquisition and reconstruction; geometry repeats across views.

<a id="compute"></a>

## 17. Encoding measurements for reconstruction

Reading leads: [ESRF's ID16A methods](https://www.esrf.fr/UsersAndScience/Experiments/ID16A) includes COMPUTE-03; [holographic microendoscopy](https://www.nature.com/articles/s41467-022-33462-y) illustrates field encoding and reconstruction through a probe. Other entries need sources specific to their reconstruction assumptions.

<a id="compute-01"></a>

### COMPUTE-01 — Off-axis holography

- **Description:** Encode a field with an angled reference so its information can be separated computationally.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** Computational imaging; Optical metrology; Microscopy; Endoscopy and remote probes.
- **Applications:** Complex-field imaging; digital holography.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Coherent object/reference combination at a controlled angle on a spatial detector.
- **Key constraints:** Reference coherence, spatial sampling, and order separation limit recoverable bandwidth.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [Fourier-plane filtering (BEAM-07)](#beam-07); [Phase-shifting interferometry (COMPUTE-02)](#compute-02).
- **Usually combined with:** [Two-arm interferometry (FIELD-01)](#field-01) to provide a reference; [Fourier-plane filtering (BEAM-07)](#beam-07) for spatial-frequency separation.
- **Usually followed by:** Camera acquisition and complex-field reconstruction.

<a id="compute-02"></a>

### COMPUTE-02 — Phase-shifting interferometry

- **Description:** Acquire known reference-phase steps to recover optical phase.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** Optical metrology; Computational imaging; Microscopy.
- **Applications:** Surface metrology; quantitative phase measurements.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Interferometer with controlled phase shifts and multiple intensity measurements.
- **Key constraints:** Motion between frames and inaccurate phase steps bias the reconstruction.
- **Related patterns:** [Two-arm interferometry (FIELD-01)](#field-01); [Off-axis holography (COMPUTE-01)](#compute-01); [Fringe projection profilometry (SENSE-05)](#sense-05).
- **Usually combined with:** [Two-arm interferometry (FIELD-01)](#field-01) for controlled interference; phase-stable acquisition.
- **Usually followed by:** Image sequence processing and phase reconstruction.

<a id="compute-03"></a>

### COMPUTE-03 — Ptychographic acquisition

- **Description:** Use overlapping illuminated regions to constrain diffraction-based reconstruction.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** X-ray and EUV instrumentation; Computational imaging; Microscopy.
- **Applications:** Lensless imaging; quantitative phase reconstruction.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Controlled overlapping scan, diffraction detector, and iterative reconstruction.
- **Key constraints:** Overlap, position accuracy, coherence, and model validity determine reconstruction reliability.
- **Related patterns:** [Orthogonal grazing-incidence focusing (XRAY-01)](#xray-01); [Propagation-based phase contrast (XRAY-06)](#xray-06); [Rotational or multi-view tomography (SENSE-10)](#sense-10).
- **Usually combined with:** [Orthogonal grazing-incidence focusing (XRAY-01)](#xray-01) or [Diffractive focusing with order selection (XRAY-05)](#xray-05) for probe formation; [Rotational or multi-view tomography (SENSE-10)](#sense-10) for 3D studies.
- **Usually followed by:** Diffraction acquisition and iterative object/probe reconstruction.

<a id="compute-04"></a>

### COMPUTE-04 — Coded-aperture imaging

- **Description:** Encode a scene with a known mask and recover it using a measurement model.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** Computational imaging; Astronomy and astrophysics; Remote sensing and LiDAR.
- **Applications:** Compact imaging; high-energy imaging; multiplexed acquisition.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Mask or coded optical element with detector and calibrated reconstruction.
- **Key constraints:** Conditioning, noise, model error, and scene assumptions limit recovery.
- **Related patterns:** [Structured illumination / pattern projection (ILL-05)](#ill-05); [Single-pixel imaging (COMPUTE-05)](#compute-05); [Wide-field micropore imaging (XRAY-03)](#xray-03).
- **Usually combined with:** A calibrated mask/detector geometry; [Calibration-source injection (CONTROL-09)](#control-09) for reference characterization.
- **Usually followed by:** Detector acquisition and inverse reconstruction.

<a id="compute-05"></a>

### COMPUTE-05 — Single-pixel imaging

- **Description:** Recover spatial information from known patterns and integrated measurements.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** Computational imaging; Terahertz optics; Remote sensing and LiDAR; Microscopy.
- **Applications:** Imaging with limited detector arrays; compressive acquisition.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Patterned illumination or detection mask, bucket detector, and reconstruction.
- **Key constraints:** Acquisition time, motion, pattern contrast, and assumed sparsity can limit performance.
- **Related patterns:** [Structured illumination / pattern projection (ILL-05)](#ill-05); [Coded-aperture imaging (COMPUTE-04)](#compute-04); [Reference-channel normalization (CONTROL-06)](#control-06).
- **Usually combined with:** [Structured illumination / pattern projection (ILL-05)](#ill-05) for spatial encoding; [Reference-channel normalization (CONTROL-06)](#control-06) for intensity normalization.
- **Usually followed by:** Integrated detector readout and computational image recovery.

<a id="compute-06"></a>

### COMPUTE-06 — Light-field capture

- **Description:** Sample ray position and direction to support view or focus reconstruction.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** Computational imaging; Photography and imaging; Microscopy.
- **Applications:** Computational refocusing; depth estimation; multi-view imaging.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Microlens array near an image plane or equivalent angular sampling optics.
- **Key constraints:** Finite sensor sampling trades spatial resolution against angular information.
- **Related patterns:** [Image relay / 4f relay (IMG-01)](#img-01); [Multifocal / varifocal presentation (DISPLAY-04)](#display-04); [Optical triangulation (SENSE-04)](#sense-04).
- **Usually combined with:** [Image relay / 4f relay (IMG-01)](#img-01) for image placement; calibrated lenslet/detector registration.
- **Usually followed by:** Sensor acquisition and view, depth, or refocus reconstruction.

<a id="compute-07"></a>

### COMPUTE-07 — Phase-diversity acquisition

- **Description:** Use images with known optical differences to estimate image and wavefront jointly.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** Computational imaging; Astronomy and astrophysics; Microscopy; Optical metrology.
- **Applications:** Aberration estimation; computational correction.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Simultaneous or sequential images with known defocus or other diversity.
- **Key constraints:** Model accuracy, diversity choice, and scene content affect identifiability.
- **Related patterns:** [Sensorless wavefront optimization (WAVE-03)](#wave-03); [Focus-lock channel (CONTROL-05)](#control-05); [Shearing interferometry (FIELD-04)](#field-04).
- **Usually combined with:** [Sensorless wavefront optimization (WAVE-03)](#wave-03) for optimization; [Focus-lock channel (CONTROL-05)](#control-05) for known focus states.
- **Usually followed by:** Joint wavefront/image estimation and optionally corrective feedback.

<a id="compute-08"></a>

### COMPUTE-08 — Optical Fourier processing

- **Description:** Apply spatial transformations through Fourier planes and designed masks.
- **Main function:** Encoding measurements for reconstruction
- **Disciplines:** Computational imaging; Optical metrology; Displays and projection.
- **Applications:** Optical filtering; correlation; analog field processing.
- **Type:** Pattern family.
- **Arrangement and variants:** Fourier-transform optics with spatial masks and output imaging.
- **Key constraints:** Coherence, aperture, mask accuracy, and scaling determine the realized operation.
- **Related patterns:** [Fourier-plane filtering (BEAM-07)](#beam-07); [Image relay / 4f relay (IMG-01)](#img-01); [Programmable wavefront shaping (BEAM-08)](#beam-08).
- **Usually combined with:** [Image relay / 4f relay (IMG-01)](#img-01) and [Fourier-plane filtering (BEAM-07)](#beam-07) for Fourier-plane access.
- **Usually followed by:** Output-plane detection or further optical processing.

<a id="display"></a>

## 18. Presenting images and distributing energy

Reading leads: [waveguide holography with pupil replication](https://www.nature.com/articles/s41467-023-44032-1) supports DISPLAY-01/02; [NIST's Winston-cone concentrators](https://www.nist.gov/publications/advanced-designs-non-imaging-submillimeter-wave-winston-cone-concentrators) supports DISPLAY-06; [DOE's linear solar concentrators](https://www.energy.gov/cmei/systems/linear-concentrator-system-concentrating-solar-thermal-power-basics) gives solar-collection context for DISPLAY-07.

<a id="display-01"></a>

### DISPLAY-01 — Virtual-image combiner

- **Description:** Present an optical image while preserving a view of the surrounding scene.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Displays and projection; Photography and imaging.
- **Applications:** Head-up displays; augmented reality; see-through viewing.
- **Type:** Pattern family.
- **Arrangement and variants:** Partially reflective, freeform, birdbath, or waveguide-based combining arrangements.
- **Key constraints:** Eyebox, field of view, brightness, distortion, and world-view quality trade off.
- **Related patterns:** [Exit-pupil expansion (DISPLAY-02)](#display-02); [Multifocal / varifocal presentation (DISPLAY-04)](#display-04); [Pupil relay (IMG-03)](#img-03).
- **Usually combined with:** [Exit-pupil expansion (DISPLAY-02)](#display-02) for eyebox expansion; [Pupil relay (IMG-03)](#img-03) for pupil management.
- **Usually followed by:** The observer's pupil and eye; no further instrument stage is required.

<a id="display-02"></a>

### DISPLAY-02 — Exit-pupil expansion

- **Description:** Replicate or distribute an exit pupil over a larger viewing region.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Displays and projection.
- **Applications:** AR waveguides; enlarged display eyebox.
- **Type:** Optical layout.
- **Arrangement and variants:** Repeated partial extraction or diffractive pupil replication in one or two dimensions.
- **Key constraints:** Expansion redistributes available light; uniformity, ghosting, and field coverage require design.
- **Related patterns:** [Virtual-image combiner (DISPLAY-01)](#display-01); [Pupil relay (IMG-03)](#img-03); [Light-guide distribution and extraction (DISPLAY-08)](#display-08).
- **Usually combined with:** [Virtual-image combiner (DISPLAY-01)](#display-01) for combining imagery; [Light-guide distribution and extraction (DISPLAY-08)](#display-08) for distributed extraction.
- **Usually followed by:** The expanded eyebox and observer's eye.

<a id="display-03"></a>

### DISPLAY-03 — Polarization-folded imaging

- **Description:** Fold an imaging path through selective polarization transformations and reflections.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Displays and projection; Photography and imaging.
- **Applications:** Compact near-eye optics; pancake eyepieces.
- **Type:** Optical layout.
- **Arrangement and variants:** Retarders, polarization-selective reflectors, and powered surfaces in a folded path.
- **Key constraints:** Throughput, polarization leakage, ghosts, and broadband retardance constrain quality.
- **Related patterns:** [Polarization-based send/return separation (ROUTE-04)](#route-04); [Image relay / 4f relay (IMG-01)](#img-01); [Stray-light baffling (WAVE-08)](#wave-08).
- **Usually combined with:** [Polarization-based send/return separation (ROUTE-04)](#route-04) polarization transformations; [Stray-light baffling (WAVE-08)](#wave-08) for ghost suppression.
- **Usually followed by:** The viewing pupil and eye after the folded imaging path.

<a id="display-04"></a>

### DISPLAY-04 — Multifocal / varifocal presentation

- **Description:** Present images at several focal distances or adjust focal distance dynamically.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Displays and projection; Computational imaging.
- **Applications:** Accommodation cues; depth presentation; near-eye displays.
- **Type:** Pattern family.
- **Arrangement and variants:** Switchable focus, multiple image planes, or synchronized depth-dependent presentation.
- **Key constraints:** Focus range, switching time, registration, and brightness must match displayed content.
- **Related patterns:** [Light-field capture (COMPUTE-06)](#compute-06); [Remote focusing (SCAN-05)](#scan-05); [Virtual-image combiner (DISPLAY-01)](#display-01).
- **Usually combined with:** [Virtual-image combiner (DISPLAY-01)](#display-01) for viewing; synchronized focus and image control.
- **Usually followed by:** The viewer's eye at the selected accommodation distance.

<a id="display-05"></a>

### DISPLAY-05 — Retinal scanning projection

- **Description:** Build a displayed image by scanning modulated light through the eye pupil.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Displays and projection; Ophthalmic imaging.
- **Applications:** Scanned displays; vision research.
- **Type:** Optical layout.
- **Arrangement and variants:** Modulated source, scanning optics, pupil relay, and eye-facing delivery.
- **Key constraints:** Pupil alignment, scan calibration, exposure limits, and eye motion constrain use.
- **Related patterns:** [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Pupil relay (IMG-03)](#img-03); [Virtual-image combiner (DISPLAY-01)](#display-01).
- **Usually combined with:** [Pupil-conjugate scanning (SCAN-01)](#scan-01) for scanning; [Pupil relay (IMG-03)](#img-03) for pupil placement.
- **Usually followed by:** The eye and retina; display timing is synchronized with scanning.

<a id="display-06"></a>

### DISPLAY-06 — Nonimaging concentration

- **Description:** Collect light over an angular range and guide it to a receiver.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Solar energy and illumination; Radiometry and photometry; Terahertz optics; Astronomy and astrophysics.
- **Applications:** Solar collection; detector coupling; light collection.
- **Type:** Pattern family.
- **Arrangement and variants:** Compound parabolic concentrators, Winston cones, and related edge-ray designs.
- **Key constraints:** Acceptance angle, concentration, losses, and conservation of etendue set limits.
- **Related patterns:** [Primary-secondary solar concentration (DISPLAY-07)](#display-07); [Beam homogenization (BEAM-06)](#beam-06); [Integrating-sphere measurement (CONTROL-07)](#control-07).
- **Usually combined with:** [Primary-secondary solar concentration (DISPLAY-07)](#display-07) in solar systems; [Integrating-sphere measurement (CONTROL-07)](#control-07) in some detector-coupling measurements.
- **Usually followed by:** An absorber, detector, light guide, or secondary collection stage.

<a id="display-07"></a>

### DISPLAY-07 — Primary-secondary solar concentration

- **Description:** Use a main collector and a local second stage to deliver sunlight to a receiver.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Solar energy and illumination.
- **Applications:** Concentrating photovoltaics; solar-thermal receivers.
- **Type:** Pattern family.
- **Arrangement and variants:** Primary dish, trough, Fresnel, or mirror field with suitable secondary optics.
- **Key constraints:** Tracking, acceptance, receiver flux uniformity, and thermal loads determine usefulness.
- **Related patterns:** [Nonimaging concentration (DISPLAY-06)](#display-06); [Irradiance remapping (BEAM-05)](#beam-05); [Two-plane beam-pointing control (CONTROL-02)](#control-02).
- **Usually combined with:** [Nonimaging concentration (DISPLAY-06)](#display-06) for the secondary; [Two-plane beam-pointing control (CONTROL-02)](#control-02) for pointing feedback.
- **Usually followed by:** The solar receiver and its thermal or electrical conversion stage.

<a id="display-08"></a>

### DISPLAY-08 — Light-guide distribution and extraction

- **Description:** Transport light through a guide and release it along a designed distribution.
- **Main function:** Presenting images and distributing energy
- **Disciplines:** Displays and projection; Solar energy and illumination; Industrial vision and inspection.
- **Applications:** Backlighting; illumination panels; distributed lighting.
- **Type:** Optical layout.
- **Arrangement and variants:** Guiding structure with patterned scattering, reflection, or extraction features.
- **Key constraints:** Extraction uniformity, angular output, coupling efficiency, and accumulated losses interact.
- **Related patterns:** [Beam homogenization (BEAM-06)](#beam-06); [Exit-pupil expansion (DISPLAY-02)](#display-02); [Critical illumination (ILL-02)](#ill-02).
- **Usually combined with:** [Beam homogenization (BEAM-06)](#beam-06) for input uniformity; [Exit-pupil expansion (DISPLAY-02)](#display-02) for pupil-replicating waveguides.
- **Usually followed by:** An illuminated surface, display stack, or viewing region.

<a id="control"></a>

## 19. Stabilizing, calibrating, and diagnosing

Reading leads: [NIST on cavity-stabilized lasers](https://www.nist.gov/programs-projects/laser-stabilization-and-coherence-optical-resonators) supports CONTROL-03; [Hamamatsu on integrating-sphere measurements](https://www.hamamatsu.com/eu/en/applications/evaluation-of-luminescent-materials/photoluminescence-quantum-yield.html) illustrates CONTROL-07; [Nikon on pupil/image diagnosis](https://www.microscopyu.com/microscopy-basics/conjugate-planes-in-optical-microscopy) supports CONTROL-08.

<a id="control-01"></a>

### CONTROL-01 — Power stabilization loop

- **Description:** Measure a beam fraction and correct delivered optical power through feedback.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Laser engineering; Optical metrology; Atomic physics; Biophotonics and life sciences.
- **Applications:** Stable excitation; controlled exposure; precision measurements.
- **Type:** Control architecture.
- **Arrangement and variants:** Pickoff detector, controller, and source or attenuator actuator.
- **Key constraints:** Sensor placement, loop bandwidth, actuator range, and out-of-loop drift limit stability.
- **Related patterns:** [Waveplate-polarizer attenuation (ROUTE-03)](#route-03); [Sample/reference splitting (ROUTE-08)](#route-08); [Reference-channel normalization (CONTROL-06)](#control-06).
- **Usually combined with:** [Waveplate-polarizer attenuation (ROUTE-03)](#route-03) as an actuator; [Sample/reference splitting (ROUTE-08)](#route-08) for monitoring.
- **Usually followed by:** The regulated experiment; the sensing branch returns to the controller.

<a id="control-02"></a>

### CONTROL-02 — Two-plane beam-pointing control

- **Description:** Distinguish and correct beam displacement and angle using separate observations.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Laser engineering; Optical metrology; Remote sensing and LiDAR.
- **Applications:** Stable beam delivery; alignment maintenance; optical links.
- **Type:** Control architecture.
- **Arrangement and variants:** Two suitably separated or conjugate position measurements with steering actuators.
- **Key constraints:** Observability, cross-coupling, sensor noise, and actuator bandwidth govern correction.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Pupil-conjugate scanning (SCAN-01)](#scan-01); [Mode matching (BEAM-03)](#beam-03).
- **Usually combined with:** [Mode matching (BEAM-03)](#beam-03) for stable coupling; [Pupil relay (IMG-03)](#img-03) for interpretable measurement planes.
- **Usually followed by:** Stable target delivery, while sensor signals feed back to steering actuators.

<a id="control-03"></a>

### CONTROL-03 — Frequency locking to a reference

- **Description:** Derive an error signal from a reference and control source frequency.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Laser engineering; Optical metrology; Atomic physics; Spectroscopy and analytical chemistry.
- **Applications:** Cavity locks; atomic references; precision spectroscopy.
- **Type:** Pattern family.
- **Arrangement and variants:** Reference cavity or transition, discriminating readout, and frequency actuator; PDH is one variant.
- **Key constraints:** Reference drift, discriminator slope, residual modulation, and control bandwidth limit stability.
- **Related patterns:** [Stable optical resonator (CAV-01)](#cav-01); [Resonant enhancement (CAV-02)](#cav-02); [Double-pass AOM (SCAN-07)](#scan-07).
- **Usually combined with:** [Stable optical resonator (CAV-01)](#cav-01) as a reference; [Double-pass AOM (SCAN-07)](#scan-07) where an AOM is the frequency actuator.
- **Usually followed by:** The stabilized beam goes to the experiment; the reference branch closes the lock.

<a id="control-04"></a>

### CONTROL-04 — Round-trip phase stabilization

- **Description:** Use a returned reference to compensate optical-link phase fluctuations.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Fiber optics and sensing; Optical metrology; Optical communications; Quantum optics and information.
- **Applications:** Frequency transfer; phase-stable delivery; interferometric links.
- **Type:** Control architecture.
- **Arrangement and variants:** Round-trip reference path, phase comparison, and compensating actuator.
- **Key constraints:** Propagation delay limits control bandwidth; nonreciprocal disturbances may remain.
- **Related patterns:** [Homodyne / heterodyne reception (FIELD-06)](#field-06); [Coherent aperture combination (FIELD-10)](#field-10); [Nonreciprocal routing (ROUTE-05)](#route-05).
- **Usually combined with:** [Homodyne / heterodyne reception (FIELD-06)](#field-06) for phase readout; [Nonreciprocal routing (ROUTE-05)](#route-05) for return routing.
- **Usually followed by:** Stable remote delivery; the return measurement closes the compensation loop.

<a id="control-05"></a>

### CONTROL-05 — Focus-lock channel

- **Description:** Use a dedicated optical signal to maintain a chosen focus condition.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Microscopy; Industrial vision and inspection; Ophthalmic imaging.
- **Applications:** Long acquisitions; surface tracking; drift compensation.
- **Type:** Control architecture.
- **Arrangement and variants:** Auxiliary probe or image metric with axial focus actuator.
- **Key constraints:** The reference surface or metric must track the desired imaging plane.
- **Related patterns:** [Remote focusing (SCAN-05)](#scan-05); [Phase-diversity acquisition (COMPUTE-07)](#compute-07); [Compensated zoom (IMG-09)](#img-09).
- **Usually combined with:** [Remote focusing (SCAN-05)](#scan-05) or a translation actuator; [Phase-diversity acquisition (COMPUTE-07)](#compute-07) for image-based variants.
- **Usually followed by:** The maintained imaging plane; the diagnostic channel closes the focus loop.

<a id="control-06"></a>

### CONTROL-06 — Reference-channel normalization

- **Description:** Compare measurement and reference signals to separate source changes from sample response.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Spectroscopy and analytical chemistry; Radiometry and photometry; Chemical and surface sensing; Optical metrology.
- **Applications:** Absorbance; transmission; ratiometric sensing.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Simultaneous or interleaved reference readout and calibrated normalization.
- **Key constraints:** Different detector responses and path drifts are not removed automatically.
- **Related patterns:** [Sample/reference splitting (ROUTE-08)](#route-08); [Power stabilization loop (CONTROL-01)](#control-01); [Balanced detection (FIELD-05)](#field-05).
- **Usually combined with:** [Sample/reference splitting (ROUTE-08)](#route-08) for matched channels; [Calibration-source injection (CONTROL-09)](#control-09) for reference characterization.
- **Usually followed by:** Normalized measurements and uncertainty analysis; normally an analysis endpoint.

<a id="control-07"></a>

### CONTROL-07 — Integrating-sphere measurement

- **Description:** Collect light across directions for radiometric characterization.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Radiometry and photometry; Solar energy and illumination; Chemical and surface sensing.
- **Applications:** Flux measurement; reflectance; photoluminescence quantum yield.
- **Type:** Measurement architecture.
- **Arrangement and variants:** Diffuse integrating enclosure, sample/source ports, detector, and calibration arrangement.
- **Key constraints:** Port geometry, self-absorption, spectral response, and calibration affect accuracy.
- **Related patterns:** [Nonimaging concentration (DISPLAY-06)](#display-06); [Reference-channel normalization (CONTROL-06)](#control-06); [Calibration-source injection (CONTROL-09)](#control-09).
- **Usually combined with:** [Calibration-source injection (CONTROL-09)](#control-09) for calibration; wavelength-resolved detection when needed.
- **Usually followed by:** Calibrated radiometric results; sphere ports define branches rather than one serial path.

<a id="control-08"></a>

### CONTROL-08 — Pupil and image diagnostic branches

- **Description:** Observe field and aperture planes independently to diagnose an optical train.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Microscopy; Astronomy and astrophysics; Laser engineering; Optical metrology.
- **Applications:** Pupil-fill checks; clipping diagnosis; alignment.
- **Type:** Optical layout.
- **Arrangement and variants:** Switchable or simultaneous cameras/eyepieces conjugated to image and pupil planes.
- **Key constraints:** Probe branches must represent the working path without creating misleading conjugates.
- **Related patterns:** [Pupil relay (IMG-03)](#img-03); [Image relay / 4f relay (IMG-01)](#img-01); [Two-plane beam-pointing control (CONTROL-02)](#control-02).
- **Usually combined with:** [Image relay / 4f relay (IMG-01)](#img-01) and [Pupil relay (IMG-03)](#img-03) for plane access; [Two-plane beam-pointing control (CONTROL-02)](#control-02) for active alignment.
- **Usually followed by:** Diagnostic cameras/eyepieces; the main science path continues independently.

<a id="control-09"></a>

### CONTROL-09 — Calibration-source injection

- **Description:** Introduce a known optical reference through a repeatable instrument path.
- **Main function:** Stabilizing, calibrating, and diagnosing
- **Disciplines:** Astronomy and astrophysics; Spectroscopy and analytical chemistry; Radiometry and photometry; Industrial vision and inspection.
- **Applications:** Wavelength calibration; flat-fielding; alignment references.
- **Type:** Optical layout.
- **Arrangement and variants:** Source selector or injection port with optics reproducing relevant instrument illumination.
- **Key constraints:** Calibration and science paths may differ in pupil fill, spectrum, polarization, or stability.
- **Related patterns:** [Reference-channel normalization (CONTROL-06)](#control-06); [Integrating-sphere measurement (CONTROL-07)](#control-07); [Slit-collimator-disperser-camera (SPECT-01)](#spect-01).
- **Usually combined with:** [Reference-channel normalization (CONTROL-06)](#control-06) for response comparison; [Slit-collimator-disperser-camera (SPECT-01)](#spect-01) for wavelength calibration.
- **Usually followed by:** The instrument path being calibrated, followed by reference/science comparison.

## Editorial questions before implementation

1. **Consolidate overlapping records.** Sample/reference splitting (ROUTE-08)
   and reference-channel normalization (CONTROL-06) may become one article with
   layout and measurement sections. Keep both candidate records here so neither
   aspect is lost.
2. **Separate parent families from realizations.** Stable optical resonator
   (CAV-01) can introduce linear, ring, and bow-tie layouts. Specific commercial
   assemblies or detailed prescriptions belong in component breakdowns or examples.
3. **Keep useful distinctions within shared geometry.** An image relay, pupil
   relay, spatial Fourier filter, and spectral pulse shaper can share a two-lens
   drawing while acting on different planes or information. Cross-link them and
   explain their conditions rather than merging them solely by appearance.
4. **Refine filter vocabularies.** Discipline values are normalized in this file;
   application phrases remain provisional. Test real browsing questions before
   choosing tag labels, synonyms, or secondary functions.
5. **Review relationships.** The combination and downstream fields now describe
   representative contexts. Review each before publication, and consider typed
   links such as `variant of`, `uses`, `alternative to`, and `demonstrated in`
   for the remaining generic relationships. A related link alone makes no
   stronger claim. Downstream links describe paths, not universal ordering.
6. **Check each article's evidence.** Add sources that support its geometry,
   design rules, and limitations. Some measurement families need optical,
   electronic, and computational explanations together.
7. **Assess demonstrations separately.** Check current OpticalSetup behaviour
   before assigning any supported simulation claim. A useful wiki article may
   initially have a clearly labelled schematic only.
8. **Choose a first publication set later.** The initial discussion highlighted
   4f relays, scanning relays, and cavities. The broader survey records the wider
   scope without committing to an implementation order.

## Possible placement and links

The implemented **Design patterns** section lives at `/patterns/`, alongside the
component wiki and worked Examples. Functional groups and discipline/application
filters provide multiple ways to find the same article. The pattern examples
reuse the existing saved-scene format and do not introduce new physics.
