# Gittard 2011 — integrated scene evidence

Paper: Shaun D. Gittard et al., “Fabrication of microscale medical devices by two-photon polymerization with multiple foci via a spatial light modulator,” *Biomedical Optics Express* 2, 3167–3178 (2011), [DOI 10.1364/BOE.2.003167](https://doi.org/10.1364/BOE.2.003167).

Primary source: attached 12-page `03-gittard-2011.pdf`, SHA-256 `57aeb233979fa416a88854a4e398c1e7859dddfa6285c4b6aa9134baf1dea062`. The Experimental section, Results and Discussion were read, and Fig. 1 was visually inspected. The [original-branch review](reviews/gittard-2011.md) records the independent audit of `039b7726ca6363a4d721e722963077f03ce1a3f4`; this note describes its integrated replacement.

## Reported apparatus and experiments

| Fact | Primary location | Integrated representation |
| --- | --- | --- |
| Chameleon Ti:sapphire; 780 nm, 80 MHz, 4 W, pulse width <150 fs | PDF p. 6, Experimental | Source uses the three exact specifications. 150 fs is only an upper-bound playback proxy, not an exact paper duration. Fig. 1 instead says <140 fs. |
| LC modulator and PBS for pulse-energy control, then beam expander | PDF p. 6 | EOM retarder and PBS are a qualitative LC attenuation proxy. Fig. 1 depicts a half-wave plate and polarizer; that disagreement remains explicit. |
| Reflective LC-R2500 phase SLM, 256 levels; 128×128 CGH tiled 6×6 on XGA panel | PDF p. 6 | Shared illustrative phase frame. Pixel values are not a calculated hologram, its physical resolution, or the optical-order prescription. |
| Selected first-order pattern at Fourier plane P and specimen; zero order removed at P | PDF pp. 6–7 and Fig. 1, p. 7 | Native Fourier lens, spatial selection and zero-order absorber, followed by a collimator. |
| Galvanoscanner controls X/Y before the objective; CMOS camera and specimen transmission illumination | PDF pp. 6–7, Fig. 1 | Two separately relayed galvos; independent 550 nm illumination and a dichroic camera pickoff. Observation optics are design choices. |
| Venus: 16 foci in 4×4, 8–12 mW/spot, 100× oil objective, NA 1.40, 100 nm layer/raster spacing, 1 mm/s | PDF p. 7, Results | Four representative in-plane rows; other columns lie outside this 2D section. Objective rated NA 1.40 is reported. The EFL/WD prescription and row spacing are inferred. Per-spot power is not substituted for source power. |
| Scaffold: four foci, 35 µm square spacing, 20× / NA 0.4 | PDF p. 8 | Separate experiment, not the Venus default. PDF p. 9 gives ~52.5 mW/focus at 2.5 mm/s, with distinct single-beam comparisons. |
| Microneedles: four foci, 5× / NA 0.13, 200 µm/s | PDF pp. 9–10 | Separate experiment. |
| SLM input limit 1 W; bulk power in blocked zero order; refresh ~20 Hz; shared objective field limits array extent | PDF p. 11, Discussion | Preserved as reported limitations. Neither the 70% residual fraction nor the slow mechanical playback rates are measured paper values. |

**Design choice = free interpretation; not specified in the paper.** This applies to every focal length, distance, fold, aperture, beam diameter, angular carrier/span, scanner operating point, attenuation setting, observation wavelength and pickoff/filter prescription in this scene. The 2 mm objective EFL is a 100×-equivalent choice against the workbench's 200 mm reference tube lens; it is not a recovered manufacturer prescription or a claim of the complete train's imaging magnification. The 0.13 mm WD is likewise inferred.

## Working train and conjugacy

The source starts at the upper left. LC/PBS attenuation feeds a −15/30 mm Galilean expander and the reflective SLM. Its effective active-face centre is `(500,140)`; the element centre includes the native −9 mm face offset. The 1 mm input beam becomes 2 mm before the tilted SLM. The LC setting transmits approximately 0.14645 of the 4 W source, an illustrative 0.586 W at the ideal SLM input, below the reported limit.

The old `focusgrid(f=500)` layer added unwanted common curvature and produced millimetre-wide overlapping supports at the resin. It is **removed**, not silently ignored or cancelled with a fictitious phase element. The shared SLM now emits 1–8 explicitly configured angular orders from **every illuminated aperture sample**. Default four rows span 2° about a −12° carrier. These geometric controls are independent of the displayed phase pixels and remain distinct from partitioned lenslets.

| Stage | Optical geometry in mm | Centred first-order matrix `[A,B;C,D]` |
| --- | --- | --- |
| SLM reference plane → X pivot | F1 at `(500,180)`, f=40; collimator at `(500,260)`, f=40; X at `(500,300)` | `[-1,0;0,-1]` |
| X → Y pivot | X `(500,300)`; f=35 planes x=465,395; Y `(360,300)` | `[-1,0;0,-1]` |
| Y → objective BFP | Scan lens `(360,340)`, f=40; fold `(360,390)`; tube lens `(450,390)`, f=100; BFP `(550,390)` | `[-2.5,0;0,-0.4]` |
| BFP → specimen | Equivalent lens `(552,390)`, f=2; sample `(554,390)` | `[0,2;-0.5,0]` |

Distances are unfolded along the nominal paths. The last relay has p=40, lens separation 50+90=140, and q=100. Both scanner pivots therefore satisfy B=C=0. The objective's actual stop now coincides with its BFP, radius 2.8 mm. There is no original 481.75 mm relay centre in the new folded layout; its previous conjugacy error has been replaced by exact 35/35 mm geometry.

For centred paraxial perturbations, the full SLM-reference-plane-to-sample matrix is `[0,-0.8;1.25,0]`: A=0 removes dependence of the sample position on illuminated input height. Carrier steering sets the reference axes; it is not a lens. Filters and dichroic surfaces have zero geometric power in this tracer. Native tracing additionally checks the tilted SLM face, finite apertures and real folded surfaces rather than relying on the matrix alone.

F1's Fourier plane is y=220. The zero-order focus is x=500, at the entrance of the 6 mm absorber centred at `(500,230)`. Selected target intersections lie at approximately x=507.775–509.235 and pass a 3 mm slit centred at x=508.502. The second f=40 lens, 80 mm from F1, collimates **each complete selected bundle** before the scanners. Setting the carrier to zero moves the programmed orders into the rejected region and extinguishes writing.

A longpass dichroic at `(510,390)` transmits 780 nm and sends the independent 550 nm return to the CMOS. This removes the original beamsplitter bypass and its partial-aperture ambiguity. A condenser images the visible point source onto the specimen; a separate f=25 lens focuses the collected light onto the real CMOS sensor plane. The shortpass at x=558 is close enough to the specimen to catch the full outgoing 780 nm fan, while admitting the visible illumination. No default rays escape the figure.

## Useful controls and numerical validation

1. **Parallel rows:** select SLM → Geometric holographic orders → Orders in this section; compare 1, 4 and 8. Every row uses the whole illuminated aperture. Count changes do not infer efficiency or fabricate a 3D field.
2. **Scan the pattern:** use Mechanics playback for the slow sine scans, or choose Static and set each galvo separately between −0.2° and +0.2° mechanical. X/Y are projected into the same meridional section; they are not independent simulated 3D axes.
3. **Source boundary:** disable Emit traced rays or set laser average power to zero. Writing stops while visible observation remains active.
4. **Spatial selection:** change the SLM carrier −12°→0°. The spatial filter rejects the programmed rows. Turning off residual zero order instead removes its dump path and redistributes its configured fraction into the selected paths; it does not measure diffraction efficiency.
5. **Alignment/defocus:** move the collimator y=260→265 mm. The actual arrival supports broaden and some rays clip. Restore y=260 to recover focus.

`node --test test/2pp-gittard-integrated.test.js` passes **6/6**. Coverage includes:

- 1/4/8 rows × all nine combinations of X/Y commands −0.2°, 0°, +0.2°: every writing route retains all **25** source samples; maximum sample-plane support is below 1e−8 mm. All arrivals remain within ±25.15 µm of the nominal centre.
- Nine independent line probes across the entire 1 mm source diameter: each probe reaches every requested order at the same sample coordinate, independently verifying full-aperture branching.
- Separate native X- and Y-pivot probes: centred finite BFP illumination and all nine rays accepted, with the actual stop at the BFP.
- At static zero scan, four row positions are approximately −13.964, −4.654, +4.654, +13.964 µm. The configured pupil is underfilled: the default beam diameter is about 3.96 mm against a 5.6 mm pupil. NA 1.40 is the objective rating, not a claim of full-aperture illumination.
- A +5 mm collimator error produces roughly 1.8–2.3 µm supports and loses samples. Grouping exposes this spread rather than replacing it with a sharp centroid.
- Source off/zero leaves zero write arrivals and independent 550 nm CMOS signal 0.8 in relative units; camera spot span is below 1e−8 mm. Default and residual-off writing positions agree; their summed relative weights have ratio 0.3.
- Exact JSON save/reload, finite geometry, contained default paths, annotation bounds and the separate mask/effect settings.

The fixed ±40 µm inset shows actual specimen-surface arrivals, including one separate CW illumination channel. The default displays five paths: four writing rows and that illumination. Larger order counts may exceed the inset's visible-row capacity; its count reports omitted paths rather than merging them. Supports are sampled geometric intersections, not PSFs, voxel dimensions, dose, curing or calibrated throughput. The phase-frame inset shows the configured frame and sampled column, not a CGH solution. No invented replica Venus objects or decorative frame translation are drawn.

The native [SVG preview](../previews/gittard-2011.svg) was rendered and visually inspected. Integrated real-browser desktop/approximately 1024 px, console, inspector and interaction acceptance remain pending while the browser connection is unavailable. Native SVG inspection is not browser evidence.

## Handoff and metadata

Supported exact handoff values remain 780 nm, 80 MHz and rated NA 1.40. Omit pulse duration because it is a bound, and omit 4000 mW because it exceeds the companion lab's accepted source-power range. Do not substitute the Venus per-spot measurement. Collection controls should now say “Orders in this section,” not “Foci per side”; the old displayed 4×4 target-grid claim is replaced by an illustrative phase frame plus four geometric rows. The underlying paper still reports a 4×4 Venus experiment.
