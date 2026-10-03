// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import '../../sketch/js/detector-instruments.js';
import { createElement } from '../../sketch/js/elements.js';

// Every published setup below contains native optics, sources and readouts.
// References describe the physical patterns; configuration values are teaching inputs.
export const examples = [
  {
    "id": "CONTRAST-01",
    "title": "Fluorescence return through a conjugate detection slit",
    "summary": "A native 488 nm source is focused onto a fluorescent specimen. Returning longer-wavelength light is reflected into a collection lens, a conjugate slit and a photodetector.",
    "steps": [
      "Follow the computed fluorescence return to the slit and detector.",
      "Narrow or displace the detection slit and compare collected signal while keeping source power fixed."
    ],
    "limit": "The 2D slit is the available detection-aperture implementation. Traced collection and clipping are shown; an Airy-unit pinhole, axial point-spread function and 3D optical sectioning are not calculated.",
    "references": [
      {
        "label": "Nikon MicroscopyU: confocal microscopy",
        "url": "https://www.microscopyu.com/techniques/confocal"
      }
    ]
  },
  {
    "id": "CONTRAST-02",
    "title": "Dual-disk parallel confocal camera",
    "summary": "A microlens disk directs 488 nm light into a matched pinhole disk. A 60× objective maps its moving focal array onto a cell; fluorescence returns through the pinholes to a camera.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "The registry has no matched rotating microlens/pinhole disks or independently resolved parallel confocal channels.",
    "references": [
      {
        "label": "Botcherby et al.: spinning-disk remote-focusing microscopy",
        "url": "https://arxiv.org/abs/2002.06576"
      }
    ]
  },
  {
    "id": "CONTRAST-03",
    "title": "Off-axis collection behind a direct-beam stop",
    "summary": "A real diffuser scatters a narrow 532 nm beam; a central beam dump excludes the direct direction while an offset photodetector collects a portion of the angular fan.",
    "steps": [
      "Inspect the traced rays reaching the offset detector and the centrally intercepted rays.",
      "Reduce diffuser divergence toward its minimum and compare off-axis signal; move the detector onto the direct axis to expose the rejected channel."
    ],
    "limit": "The diffuser supplies a qualitative angular fan rather than particle-specific scattering. The setup demonstrates angular exclusion and collection, not a calibrated dark-field particle PSF.",
    "references": [
      {
        "label": "Nikon MicroscopyU: dark-field illumination",
        "url": "https://www.microscopyu.com/techniques/stereomicroscopy/darkfield-illumination"
      }
    ]
  },
  {
    "id": "CONTRAST-04",
    "title": "Phase-object contrast through a native reference arm",
    "summary": "A Mach–Zehnder path places a native phase plate in one arm. Two interference-enabled cameras resolve how recombination converts its spatial retardance into intensity.",
    "steps": [
      "Compare both camera profiles, not only their integrated powers.",
      "Set phase-plate optical-path difference to zero and compare the spatial profiles with the retarded case."
    ],
    "limit": "This is a reference-arm implementation of phase-to-intensity conversion, not a Zernike annulus microscope. The tracer models sampled coherent paths, not full diffraction propagation or halo formation.",
    "references": [
      {
        "label": "Nikon MicroscopyU: phase-contrast microscopy",
        "url": "https://www.microscopyu.com/techniques/phase-contrast"
      }
    ]
  },
  {
    "id": "CONTRAST-05",
    "title": "Biased DIC shear across a transparent cell",
    "summary": "A 550 nm polarized field is split into neighboring orthogonal-polarization paths with an illustrative 0.3 µm specimen shear, then recombined with adjustable bias before an analyzer.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "Nomarski/Wollaston shearing prisms and polarization-dependent lateral shear are absent; ordinary prisms cannot replace them.",
    "references": [
      {
        "label": "Nikon: Differential Interference Contrast Microscopy",
        "url": "https://www.microscopyu.com/pdfs/DICMicroscopy.pdf"
      }
    ]
  },
  {
    "id": "CONTRAST-06",
    "title": "Prism-based TIRF at a glass/water interface",
    "summary": "A 488 nm beam enters a glass prism and meets water at a chosen 70° internal angle (n≈1.52 and 1.33). Fluorescence near the interface is collected from below, separate from the reflected beam.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "A prism can show total internal reflection, but the tracer has no evanescent excitation field or near-interface fluorescence coupling. A TIR-only ray would not implement this excitation pattern.",
    "references": [
      {
        "label": "Nikon MicroscopyU: TIRF microscopy",
        "url": "https://www.microscopyu.com/techniques/fluorescence/total-internal-reflection-fluorescence-tirf-microscopy"
      }
    ]
  },
  {
    "id": "CONTRAST-07",
    "title": "Multiphoton microscope with SHG and two-photon fluorescence",
    "summary": "Open the existing native microscope: pulsed excitation, two scan mirrors, relay lenses, shared objective, nonlinear specimen and separate SHG/fluorescence detection channels.",
    "steps": [
      "Inspect the specimen channels and the forward versus epi collection geometry.",
      "Disable the nonlinear specimen channels and compare the detector signals; change pulse duration separately from average power."
    ],
    "limit": "The specimen uses intensity-dependent channel models and traced collection. Diffraction-limited resolution, specimen-specific cross sections, phototoxicity and 3D tissue scattering are not predicted.",
    "references": [
      {
        "label": "Denk, Strickler and Webb: two-photon laser scanning fluorescence microscopy",
        "url": "https://doi.org/10.1126/science.2321027"
      }
    ]
  },
  {
    "id": "CONTRAST-08",
    "title": "Registered excitation and doughnut depletion",
    "summary": "An illustrative 640 nm excitation spot and 775 nm vortex-shaped depletion beam share an objective. Depletion timing and the central intensity minimum are adjusted before fluorescence reaches a confocal detector.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There is no stimulated-depletion specimen response or vortex depletion field with a central vectorial intensity minimum.",
    "references": [
      {
        "label": "Hell and Wichmann: breaking the diffraction resolution limit by stimulated emission",
        "url": "https://doi.org/10.1364/OL.19.000780"
      }
    ]
  },
  {
    "id": "SPECT-01",
    "title": "Slit, collimator, grating and camera optics",
    "summary": "A native monochromatic source illuminates a 2 mm entrance slit, a 100 mm collimator, a diffraction grating and a camera lens. Change source wavelength to see the traced diffraction angle change.",
    "steps": [
      "Inspect the grating order and groove density, then compare diffraction angles at 532 nm and 633 nm.",
      "Change slit gap and watch clipping; detector position must follow the selected diffracted order."
    ],
    "limit": "Native slit clipping and grating diffraction are traced in 2D. This compact transmission layout does not compute a calibrated spectral resolving power, blaze response or optical aberration budget.",
    "references": [
      {
        "label": "HORIBA: Czerny–Turner spectrometer layout",
        "url": "https://www.horiba.com/fileadmin/uploads/Scientific/Documents/OSD/17021704.pdf"
      }
    ]
  },
  {
    "id": "SPECT-02",
    "title": "Echelle orders separated by a prism",
    "summary": "An illustrative 31.6 lines/mm echelle at high incidence disperses several orders; a prism supplies orthogonal dispersion before a 2D camera.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "The workbench has one transverse dimension; orthogonal cross-dispersion and a two-dimensional echelle order map cannot be represented.",
    "references": [
      {
        "label": "ESO: UVES high-resolution cross-dispersed echelle spectrograph",
        "url": "https://www.eso.org/sci/facilities/paranal/instruments/uves.html"
      }
    ]
  },
  {
    "id": "SPECT-03",
    "title": "Three-slice integral-field spectrograph feed",
    "summary": "Divide a small square sky field into three strips, relay them into a pseudo-slit and disperse them together; retain a lookup from slit position back to each strip.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There is no image-slicer mirror assembly or spatially ordered pseudo-slit reformatting component.",
    "references": [
      {
        "label": "ESO: MUSE optical layout and integral-field spectrograph",
        "url": "https://www.eso.org/sci/facilities/paranal/instruments/muse/inst.html"
      }
    ]
  },
  {
    "id": "SPECT-04",
    "title": "Two-crystal fixed-exit monochromator",
    "summary": "Choose an 8 keV Si(111) teaching beamline: linked crystal angles select energy while translation of the second crystal maintains a fixed-height exit.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There are no Bragg-diffracting crystals, linked second-crystal translation, or X-ray source wavelengths. A nonlinear crystal is not a Bragg monochromator.",
    "references": [
      {
        "label": "Diamond Light Source: I18 monochromator and beamline optics",
        "url": "https://www.diamond.ac.uk/Instruments/Imaging-and-Microscopy/I18.html"
      }
    ]
  },
  {
    "id": "SPECT-05",
    "title": "Two overlapping bandpasses with a diagnostic tap",
    "summary": "A 532 nm beam passes a 500–550 nm and a 520–540 nm filter. Their nominal overlap is 520–540 nm; an upstream tap distinguishes source loss from rejection.",
    "steps": [
      "Compare 532 nm input with 510 nm: only the first should survive both idealized stages.",
      "Set the second band to 560–580 nm and check the no-overlap boundary case."
    ],
    "limit": "The supplied ray scene uses idealized bandpass and split models. It does not predict angular shifts, coating ripple, fluorescence or optical-density leakage.",
    "references": [
      {
        "label": "Thorlabs: bandpass-filter transmission and application data",
        "url": "https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=1001"
      }
    ]
  },
  {
    "id": "SPECT-06",
    "title": "Michelson optical-path scan for interferogram acquisition",
    "summary": "The native 633 nm Michelson combines fixed and variable optical paths at a photodetector. A delay-line element provides an editable optical-path offset in one arm.",
    "steps": [
      "Change delay through fractions of a wavelength and compare the detector signal.",
      "Change source temporal coherence and separate fringe visibility from beam overlap."
    ],
    "limit": "This real bench demonstrates the interferogram acquisition geometry at one wavelength. It has no automated broadband interferogram sampling or Fourier-transform spectral reconstruction.",
    "references": [
      {
        "label": "NIST: Fourier-transform infrared spectroscopy instrument and measurement work",
        "url": "https://www.nist.gov/laboratories/tools-instruments/fourier-transform-infrared-spectrophotometry-ftis-facility"
      }
    ]
  },
  {
    "id": "SPECT-07",
    "title": "Raman excitation cleanup and return rejection",
    "summary": "A native 488 nm bandpass cleans the pump before a Raman specimen. The return collection branch includes a long-pass filter that rejects excitation before the photodetector.",
    "steps": [
      "Inspect the specimen Raman shift and verify that its return wavelength clears the long-pass cutoff.",
      "Raise the long-pass cutoff beyond the Raman line and compare detected signal."
    ],
    "limit": "Raman channel yield and angular emission are simplified specimen inputs. Real filter optical density, molecular Raman tensors, linewidths and calibrated signal strength are not inferred.",
    "references": [
      {
        "label": "HORIBA: Raman spectroscopy instrumentation and filtering",
        "url": "https://www.horiba.com/int/scientific/technologies/raman-imaging-and-spectroscopy/raman-spectroscopy/"
      }
    ]
  },
  {
    "id": "SPECT-08",
    "title": "Asymmetric dual-comb absorption measurement",
    "summary": "Choose two illustrative 100 MHz combs differing by 100 Hz. One crosses a gas cell and meets the local-oscillator comb on a photodiode; radio-frequency beats are digitized with a common timing reference.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "Sources do not provide mutually coherent frequency-comb teeth with independently controlled repetition offsets, and detectors have no RF heterodyne-comb readout.",
    "references": [
      {
        "label": "NIST: frequency-comb-based dual-comb spectroscopy",
        "url": "https://www.nist.gov/programs-projects/frequency-comb-based-spectroscopy-dual-comb-spectroscopy"
      }
    ]
  },
  {
    "id": "CAV-01",
    "title": "Two-curved-mirror passive resonator",
    "summary": "An external native 1064 nm source weakly couples through the first of two partially transmitting curved mirrors separated by 300 mm. A leaked-light detector is outside the right mirror.",
    "steps": [
      "Inspect mirror curvature and repeated reflections; compute the paraxial g-product separately.",
      "Move the end mirror or offset the seed and compare the traced escape geometry."
    ],
    "limit": "This is a passive, externally injected cavity geometry. The renderer shows finite traced passes, not resonant buildup, a Gaussian eigenmode, longitudinal resonance or laser gain.",
    "references": [
      {
        "label": "Kogelnik and Li: laser beams and resonators",
        "url": "https://doi.org/10.1364/AO.5.001550"
      }
    ]
  },
  {
    "id": "CAV-02",
    "title": "Injected four-mirror enhancement-cavity geometry",
    "summary": "A native splitter injects 1064 nm light into a closed four-corner optical path containing an SHG crystal. The return port and conversion are traced through real surfaces.",
    "steps": [
      "Follow the closed optical round trip and distinguish crystal conversion from resonance enhancement.",
      "Change a cavity mirror angle or crystal conversion share and inspect escaping versus converted rays."
    ],
    "limit": "The setup constructs the cavity path and local conversion, but does not calculate resonant enhancement, impedance matching, locking, cavity stability or circulating steady-state power.",
    "references": [
      {
        "label": "On the design of bow-tie enhancement cavities for second-harmonic generation",
        "url": "https://www.sciencedirect.com/science/article/pii/S003040180101584X"
      }
    ]
  },
  {
    "id": "CAV-03",
    "title": "Michelson with physical power and signal recycling mirrors",
    "summary": "The native Michelson receives a partially transmitting mirror at its input port and another at its readout port. Both form additional return paths around the central splitter.",
    "steps": [
      "Inspect the extra optical round trips and the fraction escaping to the readout detector.",
      "Reduce one recycler reflectivity to zero and compare the corresponding returned path."
    ],
    "limit": "The mirrors implement real transmission/reflection paths. Resonant recycling gain, detuning, sideband response and precision-interferometer sensitivity are not computed.",
    "references": [
      {
        "label": "LIGO: the interferometer and its optical cavities",
        "url": "https://www.ligo.caltech.edu/MIT/page/ligos-ifo"
      }
    ]
  },
  {
    "id": "CAV-04",
    "title": "Master pulse source seeding a parametric power amplifier",
    "summary": "A native 800 nm master pulse source seeds the OPA lower port; a separate 532 nm pump supplies amplification energy. The signal, residual pump and idler leave distinct physical output ports.",
    "steps": [
      "Inspect the seed and pump port heights and the separately dumped residual pump and idler.",
      "Set pump average power to zero and compare amplified seed output with the unpumped seed."
    ],
    "limit": "This is a parametric MOPA implementation rather than an inversion amplifier. It models pump-limited seeded gain, not gain-medium storage, ASE, phase matching or amplifier isolation.",
    "references": [
      {
        "label": "High-peak-power pulsed fiber master-oscillator power-amplifier experiment",
        "url": "https://www.sciencedirect.com/science/article/pii/S1631070506000399"
      }
    ]
  },
  {
    "id": "CAV-05",
    "title": "Switched regenerative pulse amplifier",
    "summary": "An illustrative stretched 1030 nm seed enters through a polarizing coupler, circulates for a programmed 20 round trips and is switched out by a Pockels cell for later compression.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There is no laser gain medium with round-trip regenerative amplification or pulse trapping/extraction across successive gated round trips. The seeded single-pass OPA does not provide cavity gain.",
    "references": [
      {
        "label": "Coherent: regenerative amplifiers and ultrafast laser architecture",
        "url": "https://www.coherent.com/lasers/laser/legend-elite"
      }
    ]
  },
  {
    "id": "CAV-06",
    "title": "Loss-controlled Q-switched resonator",
    "summary": "An illustrative 1064 nm resonator stores inversion with an acousto-optic loss gate active, then rapidly lowers loss to produce a pulse through a fixed output coupler.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "The AOM can switch an optical path, but no gain medium stores inversion or releases a Q-switched laser pulse; a passive AOM cavity cannot implement Q-switching.",
    "references": [
      {
        "label": "AA Opto-Electronic: acousto-optic Q-switch theory and loss control",
        "url": "https://acoustooptic.com/wp-content/uploads/2025/04/AAOPTO-Theory2013-4-1.pdf"
      }
    ]
  },
  {
    "id": "CAV-07",
    "title": "Polarization-switched passive cavity dump path",
    "summary": "Native pulse light enters a folded storage loop through a PBS. An electro-optic retarder changes polarization before return to the splitter; the upward output port samples the selected extraction path.",
    "steps": [
      "Inspect the EOM drive parameters and the PBS return-port polarization.",
      "Compare two retardance settings and follow which return branch leaves the storage path."
    ],
    "limit": "The native setup demonstrates a switchable passive extraction geometry. It does not accumulate stored energy over repeated temporal round trips or calculate dump efficiency and timing jitter.",
    "references": [
      {
        "label": "Coherent: cavity-dumped ultrafast oscillator configuration",
        "url": "https://www.coherent.com/lasers/laser/mira"
      }
    ]
  },
  {
    "id": "CAV-08",
    "title": "Dispersion-managed mode-locked ring oscillator",
    "summary": "An illustrative 80 MHz ring includes a pumped gain segment, fast saturable loss, negative-dispersion mirrors and a small output coupler. Total group delay, not diagram length, fixes the repetition rate.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "The registry lacks a fast saturable absorber/Kerr-lens mode-locking response and oscillator pulse-formation dynamics; a pulsed source cannot stand in for the oscillator.",
    "references": [
      {
        "label": "Keller et al.: semiconductor saturable absorber mirrors for passive mode locking",
        "url": "https://doi.org/10.1109/2944.571743"
      }
    ]
  },
  {
    "id": "CAV-09",
    "title": "Two seeded parametric amplifier arms with coherent recombination",
    "summary": "A common 800 nm master is split into two native OPA channels pumped separately at 532 nm. Equal geometrical arms meet at a combiner, with a native phase actuator and two camera readout ports.",
    "steps": [
      "Inspect the physical common-seed split, both pumped amplifier ports and the two recombination cameras.",
      "Disable one pump and compare routed output power; inspect the manual phase actuator separately from any automatic servo."
    ],
    "limit": "The amplifier channels use native parametric gain. Their amplified fields are not tracked as phase-coherent interferometer fields, so camera power is not a computed coherent-combining efficiency. Feedback, amplifier noise and an automatic phase servo are absent.",
    "references": [
      {
        "label": "Goodno et al.: coherent combination of high-power fiber amplifiers",
        "url": "https://doi.org/10.1364/OL.31.001247"
      }
    ]
  },
  {
    "id": "PULSE-01",
    "title": "Native OPCPA: stretch, amplify and recompress",
    "summary": "The existing 800 nm, 31.4 fs seed receives +100000 fs² GDD, amplification from a timed 532 nm pump in the native OPA, then −100000 fs² compensation. Duration and spectrum probes show each stage.",
    "steps": [
      "Compare seed duration before and after the positive-GDD stage, then inspect OPA pump/seed arrival timing.",
      "Set final compressor GDD to zero and compare delivered duration with the compensated output."
    ],
    "limit": "The OPA models pump-limited seeded gain and spectral overlap; phase matching, noise, spatial nonlinearities and amplifier feedback are absent. Compression uses quadratic spectral phase.",
    "references": [
      {
        "label": "Strickland and Mourou: compression of amplified chirped optical pulses",
        "url": "https://doi.org/10.1016/0030-4018(85)90151-8"
      }
    ]
  },
  {
    "id": "PULSE-02",
    "title": "Glass dispersion and quadratic compensation",
    "summary": "Three native paths compare a 150 fs, 532 nm reference, propagation through 100 mm of N-SF11, and the same glass followed by −38680 fs² compensation. Autocorrelators read all three outputs.",
    "steps": [
      "Compare the three autocorrelation durations using the same assumed Gaussian shape.",
      "Set the compensation to zero or reverse its sign and compare the third path with the glass-only path."
    ],
    "limit": "Catalogue glass GDD and quadratic Gaussian pulse propagation are modeled. The compressor is a native phase-compensation element; prism separation, higher-order phase and measured instrument response are not inferred.",
    "references": [
      {
        "label": "Newport: prism compressor for ultrashort laser pulses",
        "url": "https://www.newport.com/f/prism-compressor-for-ultrashort-laser-pulses"
      }
    ]
  },
  {
    "id": "PULSE-03",
    "title": "4f spectral phase shaping",
    "summary": "A pair of illustrative 1200 lines/mm gratings and 200 mm lenses spread an 800 nm spectrum across a programmable mask in a Fourier plane, then recombine it on a common output axis.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "The SLM supports spatial steering and lens-array overlays, but not independent spectral amplitude/phase pixels or temporal Fourier synthesis at a dispersed spectral plane.",
    "references": [
      {
        "label": "Weiner: femtosecond pulse shaping with spatial light modulators",
        "url": "https://doi.org/10.1063/1.1150614"
      }
    ]
  },
  {
    "id": "PULSE-04",
    "title": "Native argon hollow-core broadening and compression",
    "summary": "Open the existing argon hollow-core fiber setup with physical coupling, a diagnostic split, negative-GDD compensation and autocorrelation readouts before and after compression.",
    "steps": [
      "Inspect the native fiber gas, bore, coupling and computed loss before comparing its output spectrum.",
      "Set compressor GDD to zero and compare autocorrelation width; bandwidth alone does not establish compression."
    ],
    "limit": "The hollow-core model is an approximate nonlinear broadening and chirp model. It does not establish ionization, damage margins, spatial beam quality or a physically measured compressed pulse.",
    "references": [
      {
        "label": "Newport: spectral broadening and temporal compression application experiment",
        "url": "https://www.newport.com/medias/sys_master/images/images/h38/h64/8797270507550/Spectral-Broadening-and-Temporal-Compression-of-Ultrashort-Pulses-App-Note-35.pdf"
      }
    ]
  },
  {
    "id": "PULSE-05",
    "title": "Pump–probe time zero through sum-frequency mixing",
    "summary": "Native 1032 nm and 790 nm pulses follow two physical arms, one with a 200 mm optical delay. They meet in the crystal; the spectrometer resolves individual harmonics and the overlap-dependent sum-frequency signal.",
    "steps": [
      "Adjust the mechanical delay around 200 mm and inspect the mixed spectral line.",
      "Move well away from overlap and distinguish the remaining single-beam harmonics from the two-beam sum frequency."
    ],
    "limit": "This is a nonlinear timing implementation of pump–probe overlap. The crystal models harmonic/mixed fractions and pulse overlap, not a specimen transient absorption response or full phase matching.",
    "references": [
      {
        "label": "Zewail: femtochemistry and ultrafast pump–probe experiments",
        "url": "https://www.nobelprize.org/prizes/chemistry/1999/zewail/lecture/"
      }
    ]
  },
  {
    "id": "PULSE-06",
    "title": "Electro-optic gate and polarization pulse selection",
    "summary": "An 800 nm native pulse source passes an input polarizer, electro-optic retarder and PBS. The selected port reaches a detector while the orthogonal port is dumped.",
    "steps": [
      "Inspect the EOM drive mode and compare the polarization at the two PBS branches.",
      "Change the applied retardance to switch the selected output between transmission and rejection."
    ],
    "limit": "Native polarization routing and EOM modulation are represented. This scene does not claim a synchronized one-in-80 picker or programmable burst schedule; those require external timing hardware.",
    "references": [
      {
        "label": "Conoptics: electro-optic pulse-picker systems and synchronization",
        "url": "https://www.conoptics.com/pulse-picker/"
      }
    ]
  },
  {
    "id": "PULSE-07",
    "title": "Native intensity-autocorrelation instrument",
    "summary": "A native 800 nm, 150 fs Gaussian pulse enters the autocorrelator and its linked display. The instrument calculates the correlation width and infers pulse duration using the selected shape factor.",
    "steps": [
      "Read correlation width separately from inferred pulse duration.",
      "Change the assumed shape to sech² and compare the inferred duration without changing the source."
    ],
    "limit": "This is the native packaged autocorrelator, not a fake drawn internal beam split. The inferred duration depends on shape assumptions; full spectral phase is not recovered.",
    "references": [
      {
        "label": "Trebino et al.: measuring ultrashort pulses and correlation limitations",
        "url": "https://doi.org/10.1063/1.1147498"
      }
    ]
  },
  {
    "id": "PULSE-08",
    "title": "Spectrally resolved nonlinear cross-gating",
    "summary": "A native two-color gated measurement combines 1032 nm and 790 nm pulses in a nonlinear crystal and resolves the gated sum-frequency channel on a spectrometer while optical delay is varied.",
    "steps": [
      "Scan delay and observe which spectral channel follows the two-pulse overlap.",
      "Compare the spectrum at time zero with one taken outside overlap before attempting any pulse retrieval."
    ],
    "limit": "The saved setup supplies a real nonlinear gate and spectral readout. It does not acquire a FROG delay–wavelength matrix automatically or perform spectral-phase reconstruction; this is a cross-gating implementation, not a completed FROG measurement.",
    "references": [
      {
        "label": "Trebino and Kane: frequency-resolved optical gating",
        "url": "https://doi.org/10.1364/JOSAA.10.001101"
      }
    ]
  },
  {
    "id": "PULSE-09",
    "title": "Native 1064-to-532 nm harmonic generation",
    "summary": "A 1064 nm pulse is focused into a native SHG crystal, recollimated and spectrally separated. The 532 nm channel reaches a bandpass and spectrometer; residual pump goes to a dump.",
    "steps": [
      "Inspect the generated spectrum and the separate residual pump path.",
      "Set crystal conversion efficiency to zero and confirm that the harmonic channel disappears."
    ],
    "limit": "The crystal uses a user-set conversion share rather than a focused phase-matching calculation. It does not predict walk-off, depletion dynamics, damage thresholds or a measured conversion efficiency.",
    "references": [
      {
        "label": "Boyd and Kleinman: parametric interaction of focused Gaussian light beams",
        "url": "https://doi.org/10.1063/1.1656831"
      }
    ]
  },
  {
    "id": "PULSE-10",
    "title": "Delayed optical gate for electro-optic THz sampling",
    "summary": "A synchronized near-infrared gate traverses a thin electro-optic crystal with a THz field. A quarter-wave bias and polarization splitter feed balanced photodiodes while gate delay samples the field.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "No THz source field or electro-optic crystal coupling from the sampled THz field to optical retardance is available.",
    "references": [
      {
        "label": "Electro-optic THz sampling experiment and detection geometry",
        "url": "https://www.nature.com/articles/srep03116"
      }
    ]
  },
  {
    "id": "ACCESS-01",
    "title": "Two serial native 1:1 image relays",
    "summary": "A native luminous object feeds two 4f relays built from four 50 mm thin lenses. The intermediate image lies at 400 mm and the final camera at 700 mm.",
    "steps": [
      "Inspect the real rays and identify object, intermediate and final image planes.",
      "Move the final camera away from the conjugate plane or change one focal length and compare image spread."
    ],
    "limit": "Paraxial 2D object rays and relay imaging are shown. This is a lens-built serial relay, not a commercial rod-lens prescription or a calibrated rigid-endoscope aberration model.",
    "references": [
      {
        "label": "SCHOTT: rigid and flexible endoscopy optics",
        "url": "https://www.schott.com/en-in/expertise/applications/endoscopy"
      }
    ]
  },
  {
    "id": "ACCESS-02",
    "title": "Coherent bundle camera transport",
    "summary": "A distal objective maps a tissue field onto a coherent fiber bundle. At the proximal end a magnifying relay images the core pattern onto a camera; a separate illumination fiber lights the tissue.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "Native fibers carry scalar ray channels; no coherent ordered multicore image bundle preserves a distal-to-proximal image map.",
    "references": [
      {
        "label": "SCHOTT: flexible coherent imaging bundles",
        "url": "https://www.schott.com/en-ca/products/flexible-imaging-bundles-p1000343"
      }
    ]
  },
  {
    "id": "ACCESS-03",
    "title": "Proximally scanned confocal image bundle",
    "summary": "A 488 nm spot scans across the proximal bundle face. The addressed distal core illuminates one tissue location; the same core carries the fluorescence back to a conjugate pinhole detector.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "The required coherent image bundle and core-addressed confocal return mapping are absent; scanning a single fiber does not implement proximal image-guide scanning.",
    "references": [
      {
        "label": "Hughes and Yang: fiber-bundle confocal endomicroscopy with descanned detection",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4399663/"
      },
      {
        "label": "SCHOTT: flexible coherent imaging bundles",
        "url": "https://www.schott.com/en-ca/products/flexible-imaging-bundles-p1000343"
      }
    ]
  },
  {
    "id": "ACCESS-04",
    "title": "Fiber-delivered excitation with a distal scan mirror",
    "summary": "A propagating native delivery fiber re-emits a 488 nm beam toward a distal galvo. The mirror steers illumination onto a fluorescent specimen, with separate local collection at a photodetector.",
    "steps": [
      "Follow fiber coupling and re-emission before the distal scan mirror.",
      "Change galvo angle to move the excitation spot away from the specimen and compare the collected fluorescence."
    ],
    "limit": "This is a distal mirror-scanning implementation, not a resonant scanning-fiber-tip device. Fiber coupling and mirror steering are modeled; miniature packaging, scan mechanics and image reconstruction are not.",
    "references": [
      {
        "label": "University of Washington: scanning-fiber endoscope development",
        "url": "https://www.washington.edu/news/2008/01/24/camera-in-a-pill-offers-cheaper-easier-window-on-your-insides-2/"
      }
    ]
  },
  {
    "id": "ACCESS-05",
    "title": "Separate native illumination and return fibers",
    "summary": "One propagating fiber delivers 488 nm excitation to a fluorescent specimen. A physically separate fiber entry collects nearby emission and routes it through a long-pass filter to a detector.",
    "steps": [
      "Inspect the two native fiber inputs, acceptance cones and output optics separately.",
      "Reduce collection input NA or move its entry away from the specimen and compare return signal."
    ],
    "limit": "The setup uses scalar fiber coupling and qualitative isotropic specimen emission. It does not model a coherent image bundle, 3D collection solid angle or tissue-depth sensitivity.",
    "references": [
      {
        "label": "SCHOTT: illumination and imaging optics for endoscopy",
        "url": "https://www.schott.com/en-in/expertise/applications/endoscopy"
      }
    ]
  },
  {
    "id": "ACCESS-06",
    "title": "Rotating side-view OCT probe",
    "summary": "A rotary joint feeds a fiber/GRIN assembly and a side-reflecting distal prism. Rotation sweeps a circumferential tissue cross-section; an external reference arm supplies OCT depth discrimination.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There is no rotary fiber joint, cylindrical sheath or three-dimensional circumferential side-view geometry.",
    "references": [
      {
        "label": "Tearney et al.: in vivo endoscopic optical biopsy with OCT",
        "url": "https://doi.org/10.1126/science.276.5321.2037"
      }
    ]
  },
  {
    "id": "ACCESS-07",
    "title": "Transmission-matrix calibrated multimode probe",
    "summary": "A phase-only SLM controls an illustrative 532 nm field entering a multimode fiber. A distal camera first measures calibration fields; the resulting matrix selects input phases for a later distal focus.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "No multimode complex-field propagation, transmission-matrix acquisition or calibrated input-mode mapping exists; ordinary fiber paths cannot reproduce this transport.",
    "references": [
      {
        "label": "Čižmár and Dholakia: exploiting multimode waveguides for pure fibre-based imaging",
        "url": "https://www.nature.com/articles/ncomms2024"
      }
    ]
  },
  {
    "id": "WAVE-01",
    "title": "Native deformable mirror with science and sensing branches",
    "summary": "A native deformable mirror applies reflective tip/tilt and defocus. A physical splitter sends corrected light to a science camera and an independent lens/camera sensing branch.",
    "steps": [
      "Adjust DM tip/tilt and compare the image centroids in both physical branches.",
      "Use the sensing camera manually to restore alignment; then add a science-branch lens offset to expose a non-common-path error."
    ],
    "limit": "The bench constructs common correction and a sensing branch. The sensor is a native focal camera, not a Shack–Hartmann reconstructor; feedback is manual and only tip/tilt and paraxial defocus are modeled.",
    "references": [
      {
        "label": "ESO: adaptive-optics modes and conjugation architectures",
        "url": "https://www.eso.org/sci/facilities/develop/ao/ao_modes.html"
      }
    ]
  },
  {
    "id": "WAVE-02",
    "title": "Two deformable mirrors separated by a conjugate relay",
    "summary": "Two native reflective DMs are separated by a two-lens relay. Each independently applies defocus and steering before the final camera, allowing a real two-corrector optical bench to be edited.",
    "steps": [
      "Inspect the two 100 mm relay lenses and identify the reimaged plane.",
      "Adjust one DM at a time and compare the final beam centroid and convergence; preserve relay spacing when changing the second plane."
    ],
    "limit": "This is a physical two-corrector relay, not a claimed atmospheric tomography solution. No 9 km conjugation, multilayer wavefront reconstruction, automatic controller or corrected wide-field performance is calculated.",
    "references": [
      {
        "label": "ESO: adaptive-optics modes and conjugation architectures",
        "url": "https://www.eso.org/sci/facilities/develop/ao/ao_modes.html"
      }
    ]
  },
  {
    "id": "WAVE-03",
    "title": "Manual sensorless defocus optimization on a native camera",
    "summary": "A native deformable mirror sends a finite-width beam to a camera. Its focal-length control changes paraxial convergence; the camera spot provides the metric without a separate wavefront sensor.",
    "steps": [
      "Sweep DM defocus focal length and compare the measured spot profile at the fixed camera.",
      "Move the camera plane and repeat the adjustment; an optimum for one plane is not automatically an optimum elsewhere."
    ],
    "limit": "The scene supports manual image-metric adjustment of native tip/tilt and defocus. It has no automated coefficient search, higher-order wavefront correction or sample-dependent optimization guarantee.",
    "references": [
      {
        "label": "Booth et al.: adaptive aberration correction in a confocal microscope",
        "url": "https://doi.org/10.1073/pnas.082544799"
      }
    ]
  },
  {
    "id": "WAVE-04",
    "title": "Two-color guide and science paths through a common corrector",
    "summary": "A real 589 nm guide source and 800 nm science source are combined onto a native DM, then separated by wavelength to two cameras. The common correction can be adjusted against the guide image.",
    "steps": [
      "Follow both wavelengths through the same corrector and identify their separate sensing/readout cameras.",
      "Adjust DM steering and compare movement of both camera profiles."
    ],
    "limit": "The native bench constructs shared correction and spectral guide/science separation. It does not simulate a sodium beacon, finite-altitude cone effect, absolute tip/tilt recovery or atmospheric wavefront sensing.",
    "references": [
      {
        "label": "ESO: adaptive-optics modes and conjugation architectures",
        "url": "https://www.eso.org/sci/facilities/develop/ao/ao_modes.html"
      }
    ]
  },
  {
    "id": "WAVE-05",
    "title": "Focal occultation followed by a pupil stop",
    "summary": "Two native source directions pass a focusing lens. A small real beam dump intercepts the on-axis focal beam; relay optics and a slit pupil stop feed the final camera.",
    "steps": [
      "Follow the blocked on-axis path separately from the off-axis source direction.",
      "Move the occulting dump off center and inspect direct stellar leakage; enlarge the pupil stop to compare geometrical throughput."
    ],
    "limit": "This is the geometrical focal-mask and pupil-stop arrangement. Ray optics cannot predict Lyot diffraction rejection, contrast floor, inner working angle or coherent companion throughput.",
    "references": [
      {
        "label": "NASA Webb: coronagraph focal masks and Lyot stops",
        "url": "https://science.nasa.gov/blogs/webb/2023/03/24/how-webbs-coronagraphs-reveal-exoplanets-in-the-infrared/"
      }
    ]
  },
  {
    "id": "WAVE-06",
    "title": "Native opposite-orientation dispersion prisms",
    "summary": "A visible native continuum passes two N-BK7 prisms in opposite orientations. Their refracted wavelength-dependent paths can be inspected at a downstream camera while prism position and angle are edited.",
    "steps": [
      "Inspect the spectral fan after each prism and compare the camera spectrum.",
      "Rotate or displace the second prism and identify which colors miss it rather than assuming compensation from symmetry alone."
    ],
    "limit": "This is a physical 2D dispersive-prism pair. It does not model atmospheric refraction, counter-rotation about a 3D optical axis or automatically compensate a chosen zenith distance.",
    "references": [
      {
        "label": "ESO: MUSE atmospheric dispersion compensator and optical layout",
        "url": "https://www.eso.org/sci/facilities/paranal/instruments/muse/inst.html"
      }
    ]
  },
  {
    "id": "WAVE-07",
    "title": "Infrared pupil-aperture matching with a native relay",
    "summary": "A native 4 µm source illuminates an entrance aperture that is reimaged through two lenses onto a second matched slit. A downstream camera shows admitted and clipped rays.",
    "steps": [
      "Compare the entrance and reimaged aperture sizes and positions.",
      "Displace or narrow the second slit and inspect the loss of accepted rays."
    ],
    "limit": "The setup provides native pupil geometry and clipping. Stop temperature, thermal emission, cryogenic optics and background noise are not modeled; the lens proxy is geometric rather than an infrared material prescription.",
    "references": [
      {
        "label": "NASA: MIRI instrument optics and cryogenic infrared detection",
        "url": "https://science.nasa.gov/mission/webb/mid-infrared-instrument-miri/"
      }
    ]
  },
  {
    "id": "WAVE-08",
    "title": "Native aperture baffling and a rejected-path dump",
    "summary": "A real weak splitter branch terminates in a beam dump while two native slit plates bound the useful camera path. The accepted bundle remains traced through a relay lens.",
    "steps": [
      "Identify the explicitly dumped optical branch and both aperture edges.",
      "Move a slit into the accepted bundle and compare detector throughput before calling the change better baffling."
    ],
    "limit": "Native ray interception and clipping are computed. Coating ghosts, wall scatter, vane-edge diffraction and quantitative stray-light rejection are not predicted.",
    "references": [
      {
        "label": "Xinglong telescope: stray-light paths and additional baffle vanes",
        "url": "https://arxiv.org/abs/1909.12451"
      }
    ]
  },
  {
    "id": "XRAY-01",
    "title": "Sequential orthogonal KB line foci",
    "summary": "An illustrative 8 keV beam reflects from a vertically focusing grazing-incidence mirror and then a horizontally focusing mirror. Their separate line-focus powers combine at one sample point.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "Source wavelengths start at 150 nm, and the registry has no energy-dependent X-ray grazing-incidence mirrors or two orthogonal transverse focusing planes.",
    "references": [
      {
        "label": "Kirkpatrick and Baez: formation of optical images by X-rays",
        "url": "https://pubmed.ncbi.nlm.nih.gov/18883922/"
      },
      {
        "label": "ESRF: KB mirrors and compound refractive lenses",
        "url": "https://www.esrf.fr/UsersAndScience/Publications/Highlights/2002/Methods/MET1"
      }
    ]
  },
  {
    "id": "XRAY-02",
    "title": "Nested Wolter-I telescope shells",
    "summary": "Two illustrative nested shell pairs each use a paraboloid-like first graze and hyperboloid-like second graze to send distant X-rays to a common detector focus.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There are no X-ray wavelengths or nested axisymmetric Wolter shell pairs; a visible 2D conic mirror does not implement this collecting geometry.",
    "references": [
      {
        "label": "Chandra: high-resolution mirror assembly specifications",
        "url": "https://chandra.harvard.edu/about/specs.html"
      }
    ]
  },
  {
    "id": "XRAY-03",
    "title": "Micropore lobster-eye core and cross arms",
    "summary": "A spherical array of square micropores receives an illustrative 1 keV wide field. Two orthogonal reflections form the central focus; singly reflected rays form cross arms and unreﬂected rays supply diffuse background.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "Square micropore arrays, orthogonal wall-graze paths and wide-field lobster-eye geometry are absent, as are X-ray source wavelengths.",
    "references": [
      {
        "label": "LEIA: first wide-field lobster-eye X-ray images in orbit",
        "url": "https://arxiv.org/abs/2211.10007"
      }
    ]
  },
  {
    "id": "XRAY-04",
    "title": "Selectable compound-refractive-lens cartridges",
    "summary": "At an illustrative 8 keV, select cartridges of 2, 4 and 8 beryllium lenses to change total refractive power. The selected stack focuses downstream while a transmission monitor tracks absorption.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There are no X-ray wavelengths, refractive-decrement materials or selectable compound X-ray lens cartridges; visible glass lenses cannot substitute.",
    "references": [
      {
        "label": "Vaughan et al.: X-ray transfocators based on compound refractive lenses",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC3267637/"
      }
    ]
  },
  {
    "id": "XRAY-05",
    "title": "Zone-plate focus with central stop and order aperture",
    "summary": "A monochromatic teaching soft-X-ray beam illuminates a zone plate with a central stop. An order-sorting aperture before the first-order focus rejects direct light and unwanted diffraction orders.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "There is no X-ray zone plate with diffraction orders and a central stop; the scalar metalens proxy does not implement zone-plate order sorting.",
    "references": [
      {
        "label": "Baez: self-supporting metal Fresnel zone plate for EUV and soft X-rays",
        "url": "https://www.nature.com/articles/186958a0"
      }
    ]
  },
  {
    "id": "XRAY-06",
    "title": "Near and propagated X-ray phase-contrast images",
    "summary": "An illustrative coherent 20 keV beam crosses a weakly absorbing specimen. Compare a near-contact detector position with a 0.5 m propagation position, keeping the same sample and illumination.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "X-ray wavelengths and free-space Fresnel field propagation are absent; ray propagation cannot create the required phase-to-intensity fringes.",
    "references": [
      {
        "label": "Snigirev et al.: phase-contrast imaging with high-energy synchrotron radiation",
        "url": "https://doi.org/10.1063/1.1146073"
      }
    ]
  },
  {
    "id": "XRAY-07",
    "title": "Talbot–Lau grating phase stepping",
    "summary": "An illustrative source grating G₀, phase grating G₁ and analyzer grating G₂ measure an X-ray specimen. Translate G₂ through five phase steps to estimate absorption, differential phase and dark-field channels.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "Source, phase and analyzer X-ray grating functions with Talbot interference and phase-stepped visibility readout are absent.",
    "references": [
      {
        "label": "ESRF: X-ray grating interferometry and phase contrast",
        "url": "https://www.esrf.fr/UsersAndScience/Publications/Highlights/2011/imaging/ima10"
      }
    ]
  },
  {
    "id": "XRAY-08",
    "title": "13.5 nm multilayer reflective projection transport",
    "summary": "An illustrative 13.5 nm EUV field uses multilayer-coated reflective optics through illumination, a reflective mask and a reduction relay. Each reflection contributes spectral/angle-dependent loss; no transmissive lens is implied.",
    "steps": [
      "Read the unavailable reason to identify the essential missing capability.",
      "Use the cited primary sources for the physical arrangement; no substitute scene is offered."
    ],
    "limit": "The 13.5 nm wavelength is outside source bounds and no multilayer EUV coating or reflective-mask projection prescription exists.",
    "references": [
      {
        "label": "ASML: EUV multilayer mirrors and lithography optics",
        "url": "https://www.asml.com/en/technology/lithography-principles/lenses-and-mirrors"
      }
    ]
  }
];

function opticalElement(type, id, x, y, params, rot = 0) {
 const el = createElement(type, x, y);
 return { ...el, id, rot, params: { ...el.params, ...params } };
}
// Real ray model only for the ideal-filter example. Its topology matches the
// separate reference branch and sequential passbands above.
const filterExample = examples.find(record => record.id === 'SPECT-05');
filterExample.mode = 'rays';
filterExample.scene = {
 version: 1, beams: [], elements: [
  opticalElement('cwlaser','spect05-source',90,210,{ wavelength:532 }),
  opticalElement('bs','spect05-tap',285,210,{ ratio:0.9 },90),
  opticalElement('filter','spect05-filter1',480,210,{ ftype:'bandpass',center:525,band:50 }),
  opticalElement('filter','spect05-filter2',680,210,{ ftype:'bandpass',center:530,band:20 }),
  opticalElement('detector','spect05-output',875,210,{}),
  opticalElement('detector','spect05-reference',285,335,{},90),
 ],
};

// Native workbench revision: no arrangement map is exposed as a saved setup.
// Every available record below contains actual optical components and traced
// paths. A missing essential device stays explicitly unavailable.
const missing = {
 'CONTRAST-02':'The registry has no matched rotating microlens/pinhole disks or independently resolved parallel confocal channels.',
 'CONTRAST-05':'Nomarski/Wollaston shearing prisms and polarization-dependent lateral shear are absent; ordinary prisms cannot replace them.',
 'CONTRAST-06':'A prism can show total internal reflection, but the tracer has no evanescent excitation field or near-interface fluorescence coupling. A TIR-only ray would not implement this excitation pattern.',
 'CONTRAST-08':'There is no stimulated-depletion specimen response or vortex depletion field with a central vectorial intensity minimum.',
 'SPECT-02':'The workbench has one transverse dimension; orthogonal cross-dispersion and a two-dimensional echelle order map cannot be represented.',
 'SPECT-03':'There is no image-slicer mirror assembly or spatially ordered pseudo-slit reformatting component.',
 'SPECT-04':'There are no Bragg-diffracting crystals, linked second-crystal translation, or X-ray source wavelengths. A nonlinear crystal is not a Bragg monochromator.',
 'SPECT-08':'Sources do not provide mutually coherent frequency-comb teeth with independently controlled repetition offsets, and detectors have no RF heterodyne-comb readout.',
 'CAV-05':'There is no laser gain medium with round-trip regenerative amplification or pulse trapping/extraction across successive gated round trips. The seeded single-pass OPA does not provide cavity gain.',
 'CAV-06':'The AOM can switch an optical path, but no gain medium stores inversion or releases a Q-switched laser pulse; a passive AOM cavity cannot implement Q-switching.',
 'CAV-08':'The registry lacks a fast saturable absorber/Kerr-lens mode-locking response and oscillator pulse-formation dynamics; a pulsed source cannot stand in for the oscillator.',
 'PULSE-03':'The SLM supports spatial steering and lens-array overlays, but not independent spectral amplitude/phase pixels or temporal Fourier synthesis at a dispersed spectral plane.',
 'PULSE-10':'No THz source field or electro-optic crystal coupling from the sampled THz field to optical retardance is available.',
 'ACCESS-02':'Native fibers carry scalar ray channels; no coherent ordered multicore image bundle preserves a distal-to-proximal image map.',
 'ACCESS-03':'The required coherent image bundle and core-addressed confocal return mapping are absent; scanning a single fiber does not implement proximal image-guide scanning.',
 'ACCESS-06':'There is no rotary fiber joint, cylindrical sheath or three-dimensional circumferential side-view geometry.',
 'ACCESS-07':'No multimode complex-field propagation, transmission-matrix acquisition or calibrated input-mode mapping exists; ordinary fiber paths cannot reproduce this transport.',
 'XRAY-01':'Source wavelengths start at 150 nm, and the registry has no energy-dependent X-ray grazing-incidence mirrors or two orthogonal transverse focusing planes.',
 'XRAY-02':'There are no X-ray wavelengths or nested axisymmetric Wolter shell pairs; a visible 2D conic mirror does not implement this collecting geometry.',
 'XRAY-03':'Square micropore arrays, orthogonal wall-graze paths and wide-field lobster-eye geometry are absent, as are X-ray source wavelengths.',
 'XRAY-04':'There are no X-ray wavelengths, refractive-decrement materials or selectable compound X-ray lens cartridges; visible glass lenses cannot substitute.',
 'XRAY-05':'There is no X-ray zone plate with diffraction orders and a central stop; the scalar metalens proxy does not implement zone-plate order sorting.',
 'XRAY-06':'X-ray wavelengths and free-space Fresnel field propagation are absent; ray propagation cannot create the required phase-to-intensity fringes.',
 'XRAY-07':'Source, phase and analyzer X-ray grating functions with Talbot interference and phase-stepped visibility readout are absent.',
 'XRAY-08':'The 13.5 nm wavelength is outside source bounds and no multilayer EUV coating or reflective-mask projection prescription exists.',
};
for (const record of examples) {
 delete record.nodes; delete record.edges;
 if (record.id !== 'SPECT-05') { record.mode='unavailable'; delete record.scene; record.unavailableReason=missing[record.id] || 'Native scene authoring in progress.'; }
}
const physical = (id,type,x,y,rot=0,params={},label='') => {
 const el=opticalElement(type,id,x,y,params,rot);
 return {...el,label,showLabel:!!label,labelPos:'b'};
};
const native = elements => ({version:1,elements,beams:[]});
function available(id,scene,title,summary,steps,limit) {
 const record=examples.find(item=>item.id===id);
 Object.assign(record,{mode:'rays',scene,title,summary,steps,limit});
 delete record.unavailableReason;
}
function savedExample(path,prefix) {
 const raw=JSON.parse(readFileSync(new URL(`../../Examples/${path}`,import.meta.url),'utf8'));
 const omit=new Set(['textlabel','figureframe','highlight','arrowann','box']);
 const elements=raw.elements.filter(el=>!omit.has(el.type));
 const mapping=new Map(elements.map((el,i)=>[el.id,`${prefix}-element-${i}`]));
 for(const el of elements) {el.id=mapping.get(el.id);if(el.params.sensorId)el.params.sensorId=mapping.get(el.params.sensorId)||el.params.sensorId;}
 const beams=(raw.beams||[]).filter(beam=>beam.kind!=='beam').map((beam,i)=>({...beam,id:`${prefix}-path-${i}`}));
 return {version:1,elements,beams};
}
const microscopy=savedExample('Microscopy Implementations/Multiphoton microscope — SHG and two photon fluorescence.json','contrast07');
available('CONTRAST-07',microscopy,'Multiphoton microscope with SHG and two-photon fluorescence',
 'Open the existing native microscope: pulsed excitation, two scan mirrors, relay lenses, shared objective, nonlinear specimen and separate SHG/fluorescence detection channels.',
 ['Inspect the specimen channels and the forward versus epi collection geometry.','Disable the nonlinear specimen channels and compare the detector signals; change pulse duration separately from average power.'],
 'The specimen uses intensity-dependent channel models and traced collection. Diffraction-limited resolution, specimen-specific cross sections, phototoxicity and 3D tissue scattering are not predicted.');
const opcpa=savedExample('Ultrashort Pulses/OPCPA — stretch, amplify, recompress.json','pulse01');
available('PULSE-01',opcpa,'Native OPCPA: stretch, amplify and recompress',
 'The existing 800 nm, 31.4 fs seed receives +100000 fs² GDD, amplification from a timed 532 nm pump in the native OPA, then −100000 fs² compensation. Duration and spectrum probes show each stage.',
 ['Compare seed duration before and after the positive-GDD stage, then inspect OPA pump/seed arrival timing.','Set final compressor GDD to zero and compare delivered duration with the compensated output.'],
 'The OPA models pump-limited seeded gain and spectral overlap; phase matching, noise, spatial nonlinearities and amplifier feedback are absent. Compression uses quadratic spectral phase.');
const mopa=structuredClone(opcpa);mopa.elements=mopa.elements.filter(el=>el.type!=='pulsecompressor');
for(const el of mopa.elements) if(el.id.startsWith('pulse01')) el.id=el.id.replace('pulse01','cav04');
available('CAV-04',mopa,'Master pulse source seeding a parametric power amplifier',
 'A native 800 nm master pulse source seeds the OPA lower port; a separate 532 nm pump supplies amplification energy. The signal, residual pump and idler leave distinct physical output ports.',
 ['Inspect the seed and pump port heights and the separately dumped residual pump and idler.','Set pump average power to zero and compare amplified seed output with the unpumped seed.'],
 'This is a parametric MOPA implementation rather than an inversion amplifier. It models pump-limited seeded gain, not gain-medium storage, ASE, phase matching or amplifier isolation.');
available('PULSE-02',savedExample('Ultrashort Pulses/Ultrashort pulse chirping.json','pulse02'),'Glass dispersion and quadratic compensation',
 'Three native paths compare a 150 fs, 532 nm reference, propagation through 100 mm of N-SF11, and the same glass followed by −38680 fs² compensation. Autocorrelators read all three outputs.',
 ['Compare the three autocorrelation durations using the same assumed Gaussian shape.','Set the compensation to zero or reverse its sign and compare the third path with the glass-only path.'],
 'Catalogue glass GDD and quadratic Gaussian pulse propagation are modeled. The compressor is a native phase-compensation element; prism separation, higher-order phase and measured instrument response are not inferred.');
available('PULSE-04',savedExample('Ultrashort Pulses/Hollow-core pulse compressor.json','pulse04'),'Native argon hollow-core broadening and compression',
 'Open the existing argon hollow-core fiber setup with physical coupling, a diagnostic split, negative-GDD compensation and autocorrelation readouts before and after compression.',
 ['Inspect the native fiber gas, bore, coupling and computed loss before comparing its output spectrum.','Set compressor GDD to zero and compare autocorrelation width; bandwidth alone does not establish compression.'],
 'The hollow-core model is an approximate nonlinear broadening and chirp model. It does not establish ionization, damage margins, spatial beam quality or a physically measured compressed pulse.');
const zero=savedExample('Ultrashort Pulses/Finding time zero — sum frequency of two beams.json','pulse05');
available('PULSE-05',zero,'Pump–probe time zero through sum-frequency mixing',
 'Native 1032 nm and 790 nm pulses follow two physical arms, one with a 200 mm optical delay. They meet in the crystal; the spectrometer resolves individual harmonics and the overlap-dependent sum-frequency signal.',
 ['Adjust the mechanical delay around 200 mm and inspect the mixed spectral line.','Move well away from overlap and distinguish the remaining single-beam harmonics from the two-beam sum frequency.'],
 'This is a nonlinear timing implementation of pump–probe overlap. The crystal models harmonic/mixed fractions and pulse overlap, not a specimen transient absorption response or full phase matching.');
const frog=structuredClone(zero);for(const el of frog.elements)el.id=el.id.replace('pulse05','pulse08');
available('PULSE-08',frog,'Spectrally resolved nonlinear cross-gating',
 'A native two-color gated measurement combines 1032 nm and 790 nm pulses in a nonlinear crystal and resolves the gated sum-frequency channel on a spectrometer while optical delay is varied.',
 ['Scan delay and observe which spectral channel follows the two-pulse overlap.','Compare the spectrum at time zero with one taken outside overlap before attempting any pulse retrieval.'],
 'The saved setup supplies a real nonlinear gate and spectral readout. It does not acquire a FROG delay–wavelength matrix automatically or perform spectral-phase reconstruction; this is a cross-gating implementation, not a completed FROG measurement.');
const el=physical;
const laser=(id,x,y,p={},rot=0)=>el(id,'cwlaser',x,y,rot,{beamMode:'beam',beamWidth:3,wavelength:532,...p});
const pulse=(id,x,y,p={},rot=0)=>el(id,'pulsedlaser',x,y,rot,{beamMode:'beam',beamWidth:3,wavelength:800,pulseWidthFs:150,transformLimited:true,repRateMHz:80,...p});
const pd=(id,x,y,rot=0,p={})=>el(id,'detector',x,y,rot,{aperture:40,...p});
const camera=(id,x,y,rot=0,p={})=>el(id,'camera',x,y,rot,{ch:50,pixels:32,interference:true,...p});
const mirror=(id,x,y,rot=0,p={})=>el(id,'mirror',x,y,rot,{length:40,refl:100,...p});
const lens=(id,x,y,f=100,rot=0,p={})=>el(id,'lens',x,y,rot,{f,dia:30,...p});
function linearSpecimen(id,kind='fluor') { return el(id,'sample',450,200,90,{specimenType:'linear',channels:[{kind,efficiency:0.1,emissionWl:560,wavelength:560,fluorWl:560}],transmitExc:true,transmission:0.8,aperture:25}); }
// A real return path, imaging aperture and detector. The equivalent thin-lens
// objective is used so the conjugate planes are explicit and editable.
const confocal=native([laser('confocal-source',80,200,{wavelength:488,beamMode:'line'}),el('confocal-split','dichroic',250,200,90,{dtype:'shortpass',cutoff:500,length:30}),lens('confocal-focus',350,200,100),linearSpecimen('confocal-sample'),lens('confocal-return',250,350,150,90,{dia:50}),el('confocal-pinhole','slit',250,500,90,{gap:1,length:40}),pd('confocal-detector',250,550,90)]);
// A shortpass dichroic transmits the excitation and reflects the longer return.
available('CONTRAST-01',confocal,'Fluorescence return through a conjugate detection slit',
 'A native 488 nm source is focused onto a fluorescent specimen. Returning longer-wavelength light is reflected into a collection lens, a conjugate slit and a photodetector.',
 ['Follow the computed fluorescence return to the slit and detector.','Narrow or displace the detection slit and compare collected signal while keeping source power fixed.'],
 'The 2D slit is the available detection-aperture implementation. Traced collection and clipping are shown; an Airy-unit pinhole, axial point-spread function and 3D optical sectioning are not calculated.');
const dark=native([laser('dark-source',80,200,{beamMode:'line'}),el('dark-scatter','diffuser',300,200,0,{div:30}),el('dark-stop','beamdump',500,200,0,{aperture:10}),pd('dark-detector',650,270,0,{aperture:24})]);
available('CONTRAST-03',dark,'Off-axis collection behind a direct-beam stop',
 'A real diffuser scatters a narrow 532 nm beam; a central beam dump excludes the direct direction while an offset photodetector collects a portion of the angular fan.',
 ['Inspect the traced rays reaching the offset detector and the centrally intercepted rays.','Reduce diffuser divergence toward its minimum and compare off-axis signal; move the detector onto the direct axis to expose the rejected channel.'],
 'The diffuser supplies a qualitative angular fan rather than particle-specific scattering. The setup demonstrates angular exclusion and collection, not a calibrated dark-field particle PSF.');
const phase=native([laser('phase-source',100,200,{beamWidth:6}),el('phase-split','bs',300,200,90,{ratio:0.5}),el('phase-object','phaseplate',460,200,0,{profile:'bar',opdUm:0.27,aperture:6}),mirror('phase-m1',600,200,135),mirror('phase-m2',300,400,135),el('phase-combine','bs',600,400,90,{ratio:0.5}),camera('phase-port1',780,400),camera('phase-port2',600,560,90)]);
available('CONTRAST-04',phase,'Phase-object contrast through a native reference arm',
 'A Mach–Zehnder path places a native phase plate in one arm. Two interference-enabled cameras resolve how recombination converts its spatial retardance into intensity.',
 ['Compare both camera profiles, not only their integrated powers.','Set phase-plate optical-path difference to zero and compare the spatial profiles with the retarded case.'],
 'This is a reference-arm implementation of phase-to-intensity conversion, not a Zernike annulus microscope. The tracer models sampled coherent paths, not full diffraction propagation or halo formation.');
const spect=native([laser('spect-source',80,200,{beamMode:'beam',beamWidth:5}),el('spect-slit','slit',200,200,0,{gap:2,length:30}),lens('spect-collimator',300,200,100),el('spect-grating','grating',450,200,0,{lines:600,order:1}),lens('spect-camera-lens',600,200,100,0,{dia:100}),camera('spect-camera',700,200,0,{ch:120})]);
available('SPECT-01',spect,'Slit, collimator, grating and camera optics',
 'A native monochromatic source illuminates a 2 mm entrance slit, a 100 mm collimator, a diffraction grating and a camera lens. Change source wavelength to see the traced diffraction angle change.',
 ['Inspect the grating order and groove density, then compare diffraction angles at 532 nm and 633 nm.','Change slit gap and watch clipping; detector position must follow the selected diffracted order.'],
 'Native slit clipping and grating diffraction are traced in 2D. This compact transmission layout does not compute a calibrated spectral resolving power, blaze response or optical aberration budget.');
const michelson=savedExample('Interferometers/Michelson interferometer.json','spect06');michelson.elements.push(el('spect06-delay','delayline',480,300,0,{delayMm:0,aperture:24}));
available('SPECT-06',michelson,'Michelson optical-path scan for interferogram acquisition',
 'The native 633 nm Michelson combines fixed and variable optical paths at a photodetector. A delay-line element provides an editable optical-path offset in one arm.',
 ['Change delay through fractions of a wavelength and compare the detector signal.','Change source temporal coherence and separate fringe visibility from beam overlap.'],
 'This real bench demonstrates the interferogram acquisition geometry at one wavelength. It has no automated broadband interferogram sampling or Fourier-transform spectral reconstruction.');
const raman=structuredClone(confocal);for(const elem of raman.elements)elem.id=elem.id.replace('confocal','raman');
raman.elements.find(elem=>elem.type==='sample').params.channels=[{kind:'raman',shiftCm:1000,efficiency:0.1}];
raman.elements.splice(1,0,el('raman-clean','filter',170,200,0,{ftype:'bandpass',center:488,band:10}));
raman.elements.splice(raman.elements.length-1,0,el('raman-reject','filter',250,525,90,{ftype:'longpass',cutoff:500}));
available('SPECT-07',raman,'Raman excitation cleanup and return rejection',
 'A native 488 nm bandpass cleans the pump before a Raman specimen. The return collection branch includes a long-pass filter that rejects excitation before the photodetector.',
 ['Inspect the specimen Raman shift and verify that its return wavelength clears the long-pass cutoff.','Raise the long-pass cutoff beyond the Raman line and compare detected signal.'],
 'Raman channel yield and angular emission are simplified specimen inputs. Real filter optical density, molecular Raman tensors, linewidths and calibrated signal strength are not inferred.');
const cavity=native([laser('cav01-source',200,200,{beamMode:'line',wavelength:1064}),el('cav01-m1','cmirror',100,200,0,{f:250,length:40,refl:95,showTransmitted:true}),el('cav01-m2','cmirror',400,200,180,{f:250,length:40,refl:95,showTransmitted:true}),pd('cav01-monitor',550,200)]);
available('CAV-01',cavity,'Two-curved-mirror passive resonator',
 'A native 1064 nm intracavity seed follows the repeated path between two curved mirrors separated by 300 mm, with a leaked-light detector behind the right mirror.',
 ['Inspect mirror curvature and repeated reflections; compute the paraxial g-product separately.','Move the end mirror or offset the seed and compare the traced escape geometry.'],
 'This is passive cavity geometry with an injected intracavity seed. The renderer shows finite traced passes, not resonant buildup, a Gaussian eigenmode, longitudinal resonance or laser gain.');
const ring=native([laser('cav02-source',100,200,{wavelength:1064,beamMode:'line'}),el('cav02-input','bs',300,200,90,{ratio:0.9}),mirror('cav02-m1',650,200,135),mirror('cav02-m2',650,400,45),mirror('cav02-m3',300,400,135),el('cav02-crystal','crystal',450,200,0,{convert:'shg',efficiency:0.1,transmitPump:true}),pd('cav02-monitor',300,100,-90)]);
available('CAV-02',ring,'Injected four-mirror enhancement-cavity geometry',
 'A native splitter injects 1064 nm light into a closed four-corner optical path containing an SHG crystal. The return port and conversion are traced through real surfaces.',
 ['Follow the closed optical round trip and distinguish crystal conversion from resonance enhancement.','Change a cavity mirror angle or crystal conversion share and inspect escaping versus converted rays.'],
 'The setup constructs the cavity path and local conversion, but does not calculate resonant enhancement, impedance matching, locking, cavity stability or circulating steady-state power.');
const recycled=structuredClone(michelson);recycled.elements=recycled.elements.filter(elem=>elem.type!=='delayline');
recycled.elements.push(mirror('cav03-power-recycler',240,300,0,{refl:90,showTransmitted:true}),mirror('cav03-signal-recycler',350,410,90,{refl:90,showTransmitted:true}));
available('CAV-03',recycled,'Michelson with physical power and signal recycling mirrors',
 'The native Michelson receives a partially transmitting mirror at its input port and another at its readout port. Both form additional return paths around the central splitter.',
 ['Inspect the extra optical round trips and the fraction escaping to the readout detector.','Reduce one recycler reflectivity to zero and compare the corresponding returned path.'],
 'The mirrors implement real transmission/reflection paths. Resonant recycling gain, detuning, sideband response and precision-interferometer sensitivity are not computed.');
const dumping=native([pulse('cav07-source',100,200),el('cav07-pbs','pbs',300,200,90),el('cav07-switch','eom',440,200,0,{v:0}),mirror('cav07-m1',650,200,135),mirror('cav07-m2',650,400,45),mirror('cav07-m3',300,400,135),pd('cav07-out',300,100,-90)]);
available('CAV-07',dumping,'Polarization-switched passive cavity dump path',
 'Native pulse light enters a folded storage loop through a PBS. An electro-optic retarder changes polarization before return to the splitter; the upward output port samples the selected extraction path.',
 ['Inspect the EOM drive parameters and the PBS return-port polarization.','Compare two retardance settings and follow which return branch leaves the storage path.'],
 'The native setup demonstrates a switchable passive extraction geometry. It does not accumulate stored energy over repeated temporal round trips or calculate dump efficiency and timing jitter.');
const combine=native([pulse('cav09-master',100,200,{wavelength:800,beamMode:'line'}),el('cav09-split','bs',300,200,90,{ratio:0.5}),pulse('cav09-pumpA',370,164,{wavelength:532,pulseWidthFs:1e7,repRateMHz:0.01,avgPowerW:10,beamMode:'line'}),pulse('cav09-pumpB',370,564,{wavelength:532,pulseWidthFs:1e7,repRateMHz:0.01,avgPowerW:10,beamMode:'line'}),el('cav09-ampA','opa',600,182,0,{signalWl:800,gainBandwidthNm:100,smallSignalGainDb:30,aperture:6,outputIdler:false,outputPump:false}),mirror('cav09-fold1',900,200,135),mirror('cav09-fold2',300,600,135),el('cav09-ampB','opa',600,582,0,{signalWl:800,gainBandwidthNm:100,smallSignalGainDb:30,aperture:6,outputIdler:false,outputPump:false}),el('cav09-phase','phasemodulator',760,600,0,{designWavelength:800,depthDeg:90,driveMode:'static'}),el('cav09-combiner','bs',900,600,90,{ratio:0.5}),camera('cav09-output1',1080,600),camera('cav09-output2',900,780,90)]);
available('CAV-09',combine,'Two seeded parametric amplifier arms with coherent recombination',
 'A common 800 nm master is split into two native OPA channels pumped separately at 532 nm. Equal geometrical arms meet at a combiner, with a native phase actuator and two camera readout ports.',
 ['Check OPA pump and seed port heights and the two output camera profiles.','Change phase-actuator retardance and compare complementary output ports; disable one pump to isolate seed-only propagation.'],
 'The amplifier channels use the native parametric gain model. The setup has manual phase adjustment, not an automatic phase servo; it does not model amplifier noise or establish combining efficiency.');
const picker=native([pulse('pulse06-source',100,200,{wavelength:800}),el('pulse06-polarizer','polarizer',260,200,0,{pangle:0}),el('pulse06-eom','eom',400,200,0,{}),el('pulse06-pbs','pbs',550,200,90,{}),pd('pulse06-selected',740,200),el('pulse06-dump','beamdump',550,380,90,{aperture:40})]);
available('PULSE-06',picker,'Electro-optic gate and polarization pulse selection',
 'An 800 nm native pulse source passes an input polarizer, electro-optic retarder and PBS. The selected port reaches a detector while the orthogonal port is dumped.',
 ['Inspect the EOM drive mode and compare the polarization at the two PBS branches.','Change the applied retardance to switch the selected output between transmission and rejection.'],
 'Native polarization routing and EOM modulation are represented. This scene does not claim a synchronized one-in-80 picker or programmable burst schedule; those require external timing hardware.');
const ac=native([pulse('pulse07-source',100,200,{wavelength:800,pulseWidthFs:150,pulseShape:'gauss'}),el('pulse07-ac','autocorrelator',470,200,0,{aperture:30,assumedShape:'gauss'}),el('pulse07-screen','display',470,350,0,{sensorId:'pulse07-ac',displayScale:1.1})]);
available('PULSE-07',ac,'Native intensity-autocorrelation instrument',
 'A native 800 nm, 150 fs Gaussian pulse enters the autocorrelator and its linked display. The instrument calculates the correlation width and infers pulse duration using the selected shape factor.',
 ['Read correlation width separately from inferred pulse duration.','Change the assumed shape to sech² and compare the inferred duration without changing the source.'],
 'This is the native packaged autocorrelator, not a fake drawn internal beam split. The inferred duration depends on shape assumptions; full spectral phase is not recovered.');
const shg=native([pulse('pulse09-source',100,200,{wavelength:1064,beamMode:'line'}),lens('pulse09-focus',300,200,100),el('pulse09-crystal','crystal',400,200,0,{convert:'shg',efficiency:0.3,transmitPump:true}),lens('pulse09-collimator',500,200,100),el('pulse09-separator','dichroic',650,200,90,{dtype:'shortpass',cutoff:700}),el('pulse09-band','filter',760,200,0,{ftype:'bandpass',center:532,band:30}),el('pulse09-spectrum','spectrometer',900,200,0,{aperture:40}),el('pulse09-dump','beamdump',650,380,90,{aperture:40})]);
available('PULSE-09',shg,'Native 1064-to-532 nm harmonic generation',
 'A 1064 nm pulse is focused into a native SHG crystal, recollimated and spectrally separated. The 532 nm channel reaches a bandpass and spectrometer; residual pump goes to a dump.',
 ['Inspect the generated spectrum and the separate residual pump path.','Set crystal conversion efficiency to zero and confirm that the harmonic channel disappears.'],
 'The crystal uses a user-set conversion share rather than a focused phase-matching calculation. It does not predict walk-off, depletion dynamics, damage thresholds or a measured conversion efficiency.');
const relay=native([el('access01-object','objarrow',100,200,0,{height:10}),lens('access01-l1',200,200,50),lens('access01-l2',300,200,50),lens('access01-l3',500,200,50),lens('access01-l4',600,200,50),camera('access01-camera',700,200,0,{ch:80})]);
available('ACCESS-01',relay,'Two serial native 1:1 image relays',
 'A native luminous object feeds two 4f relays built from four 50 mm thin lenses. The intermediate image lies at 400 mm and the final camera at 700 mm.',
 ['Inspect the real rays and identify object, intermediate and final image planes.','Move the final camera away from the conjugate plane or change one focal length and compare image spread.'],
 'Paraxial 2D object rays and relay imaging are shown. This is a lens-built serial relay, not a commercial rod-lens prescription or a calibrated rigid-endoscope aberration model.');
const delivery={id:'access04-delivery',kind:'fiber',propagate:true,bare:false,pts:[{x:200,y:200},{x:280,y:200},{x:400,y:200}],inputNA:0.22,groupIndex:1.468,lossDbPerM:0.2,out0:{mode:'collimate',dia:3,na:0.1},out1:{mode:'collimate',dia:3,na:0.1},width:4,color:'#e8a800'};
const distal={version:1,elements:[laser('access04-source',80,200,{beamMode:'line',wavelength:488}),el('access04-galvo','galvo',500,200,135,{length:40}),linearSpecimen('access04-sample'),pd('access04-return',680,400,0,{aperture:100})],beams:[delivery]};
Object.assign(distal.elements.find(elem=>elem.type==='sample'),{x:500,y:400,rot:0});
available('ACCESS-04',distal,'Fiber-delivered excitation with a distal scan mirror',
 'A propagating native delivery fiber re-emits a 488 nm beam toward a distal galvo. The mirror steers illumination onto a fluorescent specimen, with separate local collection at a photodetector.',
 ['Follow fiber coupling and re-emission before the distal scan mirror.','Change galvo angle to move the excitation spot away from the specimen and compare the collected fluorescence.'],
 'This is a distal mirror-scanning implementation, not a resonant scanning-fiber-tip device. Fiber coupling and mirror steering are modeled; miniature packaging, scan mechanics and image reconstruction are not.');
const collection={...structuredClone(delivery),id:'access05-collection',pts:[{x:500,y:400},{x:620,y:400},{x:740,y:400}],inputNA:0.5,out1:{mode:'collimate',dia:3,na:0.1}};
const separate={version:1,elements:[laser('access05-source',80,200,{beamMode:'line',wavelength:488}),linearSpecimen('access05-sample'),el('access05-filter','filter',820,400,0,{ftype:'longpass',cutoff:500}),pd('access05-return',950,400)],beams:[{...structuredClone(delivery),id:'access05-delivery',pts:[{x:200,y:200},{x:280,y:200},{x:400,y:200}]},collection]};
Object.assign(separate.elements.find(elem=>elem.type==='sample'),{x:450,y:200,rot:90});
// Bring collection entry close to the isotropic specimen emission and then
// route it away from the independent delivery channel.
collection.pts=[{x:450,y:205},{x:450,y:300},{x:620,y:400},{x:740,y:400}];
available('ACCESS-05',separate,'Separate native illumination and return fibers',
 'One propagating fiber delivers 488 nm excitation to a fluorescent specimen. A physically separate fiber entry collects nearby emission and routes it through a long-pass filter to a detector.',
 ['Inspect the two native fiber inputs, acceptance cones and output optics separately.','Reduce collection input NA or move its entry away from the specimen and compare return signal.'],
 'The setup uses scalar fiber coupling and qualitative isotropic specimen emission. It does not model a coherent image bundle, 3D collection solid angle or tissue-depth sensitivity.');
const ao=native([laser('wave01-source',100,200,{beamWidth:12}),el('wave01-dm','dm',400,200,135,{f:1000,length:60,steer:0}),el('wave01-split','bs',400,350,90,{ratio:0.9}),camera('wave01-science',400,520,90,{ch:100}),lens('wave01-sensor-lens',550,350,100,0,{dia:60}),camera('wave01-sensor',650,350,0,{ch:100})]);
available('WAVE-01',ao,'Native deformable mirror with science and sensing branches',
 'A native deformable mirror applies reflective tip/tilt and defocus. A physical splitter sends corrected light to a science camera and an independent lens/camera sensing branch.',
 ['Adjust DM tip/tilt and compare the image centroids in both physical branches.','Use the sensing camera manually to restore alignment; then add a science-branch lens offset to expose a non-common-path error.'],
 'The bench constructs common correction and a sensing branch. The sensor is a native focal camera, not a Shack–Hartmann reconstructor; feedback is manual and only tip/tilt and paraxial defocus are modeled.');
const mca=native([laser('wave02-source',100,200,{beamWidth:12}),el('wave02-dm1','dm',350,200,135,{f:1000,length:60}),lens('wave02-relay1',350,350,100,90,{dia:60}),lens('wave02-relay2',350,550,100,90,{dia:60}),el('wave02-dm2','dm',350,700,45,{f:1000,length:60}),lens('wave02-image',600,700,100,0,{dia:60}),camera('wave02-camera',700,700,0,{ch:100})]);
available('WAVE-02',mca,'Two deformable mirrors separated by a conjugate relay',
 'Two native reflective DMs are separated by a two-lens relay. Each independently applies defocus and steering before the final camera, allowing a real two-corrector optical bench to be edited.',
 ['Inspect the two 100 mm relay lenses and identify the reimaged plane.','Adjust one DM at a time and compare the final beam centroid and convergence; preserve relay spacing when changing the second plane.'],
 'This is a physical two-corrector relay, not a claimed atmospheric tomography solution. No 9 km conjugation, multilayer wavefront reconstruction, automatic controller or corrected wide-field performance is calculated.');
const sensorless=structuredClone(ao);sensorless.elements=sensorless.elements.filter(elem=>!['wave01-split','wave01-sensor-lens','wave01-sensor'].includes(elem.id));
for(const elem of sensorless.elements)elem.id=elem.id.replace('wave01','wave03');
available('WAVE-03',sensorless,'Manual sensorless defocus optimization on a native camera',
 'A native deformable mirror sends a finite-width beam to a camera. Its focal-length control changes paraxial convergence; the camera spot provides the metric without a separate wavefront sensor.',
 ['Sweep DM defocus focal length and compare the measured spot profile at the fixed camera.','Move the camera plane and repeat the adjustment; an optimum for one plane is not automatically an optimum elsewhere.'],
 'The scene supports manual image-metric adjustment of native tip/tilt and defocus. It has no automated coefficient search, higher-order wavefront correction or sample-dependent optimization guarantee.');
const guide=native([laser('wave04-science',100,300,{wavelength:800}),laser('wave04-guide',100,150,{wavelength:589}),mirror('wave04-fold',300,150,135),el('wave04-combine','dichroic',300,300,135,{dtype:'longpass',cutoff:700,length:40}),el('wave04-dm','dm',500,300,135,{length:60,f:1000}),el('wave04-separate','dichroic',500,500,90,{dtype:'shortpass',cutoff:700,length:40}),camera('wave04-guide-camera',500,700,90,{ch:100}),camera('wave04-science-camera',750,500,0,{ch:100})]);
available('WAVE-04',guide,'Two-color guide and science paths through a common corrector',
 'A real 589 nm guide source and 800 nm science source are combined onto a native DM, then separated by wavelength to two cameras. The common correction can be adjusted against the guide image.',
 ['Follow both wavelengths through the same corrector and identify their separate sensing/readout cameras.','Adjust DM steering and compare movement of both camera profiles.'],
 'The native bench constructs shared correction and spectral guide/science separation. It does not simulate a sodium beacon, finite-altitude cone effect, absolute tip/tilt recovery or atmospheric wavefront sensing.');
const coro=native([laser('wave05-star',100,200,{beamMode:'line'}),laser('wave05-companion',100,230,{beamMode:'line',avgPowerW:0.001},5),lens('wave05-focus',300,200,100,0,{dia:100}),el('wave05-occult','beamdump',400,200,0,{aperture:6}),lens('wave05-relay',500,200,100,0,{dia:100}),el('wave05-lyot','slit',600,200,0,{gap:30,length:60}),lens('wave05-image',700,200,100,0,{dia:60}),camera('wave05-camera',800,200,0,{ch:100})]);
available('WAVE-05',coro,'Focal occultation followed by a pupil stop',
 'Two native source directions pass a focusing lens. A small real beam dump intercepts the on-axis focal beam; relay optics and a slit pupil stop feed the final camera.',
 ['Follow the blocked on-axis path separately from the off-axis source direction.','Move the occulting dump off center and inspect direct stellar leakage; enlarge the pupil stop to compare geometrical throughput.'],
 'This is the geometrical focal-mask and pupil-stop arrangement. Ray optics cannot predict Lyot diffraction rejection, contrast floor, inner working angle or coherent companion throughput.');
const adc=native([el('wave06-source','sclaser',100,200,0,{scMin:450,scMax:750,beamMode:'line'}),el('wave06-prism1','prism',300,200,0,{apex:30,psize:50,material:'nbk7'}),el('wave06-prism2','prism',440,225,180,{apex:30,psize:50,material:'nbk7'}),camera('wave06-camera',700,200,0,{ch:120})]);
available('WAVE-06',adc,'Native opposite-orientation dispersion prisms',
 'A visible native continuum passes two N-BK7 prisms in opposite orientations. Their refracted wavelength-dependent paths can be inspected at a downstream camera while prism position and angle are edited.',
 ['Inspect the spectral fan after each prism and compare the camera spectrum.','Rotate or displace the second prism and identify which colors miss it rather than assuming compensation from symmetry alone.'],
 'This is a physical 2D dispersive-prism pair. It does not model atmospheric refraction, counter-rotation about a 3D optical axis or automatically compensate a chosen zenith distance.');
const cold=native([laser('wave07-source',100,200,{wavelength:4000,beamWidth:12}),el('wave07-entrance','slit',230,200,0,{gap:10,length:40}),lens('wave07-relay1',350,200,100,0,{dia:40}),lens('wave07-relay2',550,200,100,0,{dia:40}),el('wave07-stop','slit',670,200,0,{gap:10,length:40}),camera('wave07-camera',850,200,0,{ch:100})]);
available('WAVE-07',cold,'Infrared pupil-aperture matching with a native relay',
 'A native 4 µm source illuminates an entrance aperture that is reimaged through two lenses onto a second matched slit. A downstream camera shows admitted and clipped rays.',
 ['Compare the entrance and reimaged aperture sizes and positions.','Displace or narrow the second slit and inspect the loss of accepted rays.'],
 'The setup provides native pupil geometry and clipping. Stop temperature, thermal emission, cryogenic optics and background noise are not modeled; the lens proxy is geometric rather than an infrared material prescription.');
const baffled=native([laser('wave08-source',100,200,{beamWidth:12}),el('wave08-split','bs',250,200,90,{ratio:0.95}),el('wave08-dump','beamdump',250,350,90,{aperture:40}),el('wave08-stop1','slit',350,200,0,{gap:10,length:60}),lens('wave08-relay',500,200,150,0,{dia:40}),el('wave08-stop2','slit',650,200,0,{gap:10,length:60}),camera('wave08-camera',800,200,0,{ch:80})]);
available('WAVE-08',baffled,'Native aperture baffling and a rejected-path dump',
 'A real weak splitter branch terminates in a beam dump while two native slit plates bound the useful camera path. The accepted bundle remains traced through a relay lens.',
 ['Identify the explicitly dumped optical branch and both aperture edges.','Move a slit into the accepted bundle and compare detector throughput before calling the change better baffling.'],
 'Native ray interception and clipping are computed. Coating ghosts, wall scatter, vane-edge diffraction and quantitative stray-light rejection are not predicted.');

// Normalize unsupported records to explanatory articles with no substitute file.
for(const record of examples) if(record.mode==='unavailable') {
 record.summary=`${record.summary} This pattern currently has no native OpticalSetup setup.`;
 record.steps=['Read the unavailable reason to identify the essential missing capability.','Use the cited primary sources for the physical arrangement; no substitute scene is offered.'];
 record.limit=record.unavailableReason;
}
// Final optical alignment: these are component positions, never drawn paths.
for(const id of ['CONTRAST-01','SPECT-07']) {
 const s=examples.find(record=>record.id===id).scene.elements;
 s.find(elem=>elem.type==='dichroic').rot=45;
 const focus=s.find(elem=>elem.id.includes('focus'));focus.x=420;focus.params.f=30;focus.params.dia=60;
 const returning=s.find(elem=>elem.id.includes('return'));returning.params.f=100;
 const aperture=s.find(elem=>elem.type==='slit');aperture.y=450;aperture.params.gap=1;
 s.find(elem=>elem.type==='detector').params.aperture=120;
}
examples.find(record=>record.id==='CONTRAST-03').scene.elements.find(elem=>elem.type==='detector').params.aperture=120;
examples.find(record=>record.id==='SPECT-01').scene.elements.find(elem=>elem.type==='grating').params.transmissive=true;
for(const id of ['WAVE-01','WAVE-02','WAVE-03','WAVE-04']) for(const elem of examples.find(record=>record.id===id).scene.elements.filter(elem=>elem.type==='dm')) elem.rot=elem.id.includes('dm2')?135:-45;
examples.find(record=>record.id==='WAVE-04').scene.elements.find(elem=>elem.id==='wave04-separate').rot=135;
const occulting=examples.find(record=>record.id==='WAVE-05').scene.elements;
occulting.find(elem=>elem.id==='wave05-relay').params.dia=120;occulting.find(elem=>elem.id==='wave05-image').params.dia=120;occulting.find(elem=>elem.type==='slit').params.gap=60;
const distalElements=examples.find(record=>record.id==='ACCESS-04').scene.elements;
distalElements.push(lens('access04-output-collimator',450,200,50));distalElements.find(elem=>elem.type==='detector').x=550;distalElements.find(elem=>elem.type==='detector').params.aperture=120;
for(const id of ['ACCESS-04','ACCESS-05']) for(const fiber of examples.find(record=>record.id===id).scene.beams){fiber.out0.mode='diverge';fiber.out1.mode='diverge';}
const stable=examples.find(record=>record.id==='CAV-01');stable.scene.elements.find(elem=>elem.id==='cav01-source').x=80;stable.scene.elements.find(elem=>elem.id==='cav01-m1').x=200;stable.scene.elements.find(elem=>elem.id==='cav01-m2').x=500;stable.scene.elements.find(elem=>elem.id==='cav01-monitor').x=650;
stable.summary='An external native 1064 nm source weakly couples through the first of two partially transmitting curved mirrors separated by 300 mm. A leaked-light detector is outside the right mirror.';
stable.limit='This is a passive, externally injected cavity geometry. The renderer shows finite traced passes, not resonant buildup, a Gaussian eigenmode, longitudinal resonance or laser gain.';
examples.find(record=>record.id==='CAV-02').scene.elements.find(elem=>elem.type==='bs').rot=0;
const dumpElements=examples.find(record=>record.id==='CAV-07').scene.elements;dumpElements.find(elem=>elem.type==='pbs').rot=0;Object.assign(dumpElements.find(elem=>elem.type==='eom').params,{modulate:true,a:45,retardance:90});
Object.assign(examples.find(record=>record.id==='PULSE-06').scene.elements.find(elem=>elem.type==='eom').params,{modulate:true,a:45,retardance:90});
for(const id of ['PULSE-01','CAV-04']) examples.find(record=>record.id===id).scene.elements.push(pd(`${id.toLowerCase()}-output`,1510,318,0,{aperture:30}));
for(const elem of examples.find(record=>record.id==='CAV-09').scene.elements.filter(elem=>elem.type==='pulsedlaser')) elem.params.repRateMHz=0.01;
const distalReadout=examples.find(record=>record.id==='ACCESS-04').scene.elements;
distalReadout.push(lens('access04-collection-lens',520,400,20,0,{dia:60}));distalReadout.find(elem=>elem.type==='detector').x=650;
for(const id of ['SPECT-06','CAV-03']) {
 const elements=examples.find(record=>record.id===id).scene.elements;
 const index=elements.findIndex(elem=>elem.type==='detector');
 const old=elements[index];elements[index]=camera(old.id,old.x,old.y,old.rot,{ch:40});
}
const coherent=examples.find(record=>record.id==='CAV-09');
coherent.steps=['Inspect the physical common-seed split, both pumped amplifier ports and the two recombination cameras.','Disable one pump and compare routed output power; inspect the manual phase actuator separately from any automatic servo.'];
coherent.limit='The amplifier channels use native parametric gain. Their amplified fields are not tracked as phase-coherent interferometer fields, so camera power is not a computed coherent-combining efficiency. Feedback, amplifier noise and an automatic phase servo are absent.';
for(const id of ['SPECT-06','CAV-03']) examples.find(record=>record.id===id).scene.elements.find(elem=>elem.type==='cwlaser').params.beamMode='beam';
const conjugates=examples.find(record=>record.id==='WAVE-02').scene.elements;
conjugates.find(elem=>elem.id==='wave02-relay1').y=300;conjugates.find(elem=>elem.id==='wave02-relay2').y=500;
for(const elem of conjugates.filter(elem=>['wave02-dm2','wave02-image','wave02-camera'].includes(elem.id)))elem.y=600;
const coldConjugates=examples.find(record=>record.id==='WAVE-07').scene.elements;
coldConjugates.find(elem=>elem.id==='wave07-entrance').x=250;coldConjugates.find(elem=>elem.id==='wave07-stop').x=650;
examples.find(record=>record.id==='SPECT-07').steps[0]='Inspect the specimen Raman material fingerprint and verify that its return wavelengths clear the long-pass cutoff.';
for(const elem of examples.find(record=>record.id==='PULSE-08').scene.elements) if(elem.params.sensorId) elem.params.sensorId=elem.params.sensorId.replace('pulse05','pulse08');
const coronagraph=examples.find(record=>record.id==='WAVE-05').scene.elements;
coronagraph.find(elem=>elem.id==='wave05-companion').y=150;
const pupilMask=coronagraph.find(elem=>elem.id==='wave05-lyot');pupilMask.x=700;pupilMask.params.gap=80;pupilMask.params.length=120;
coronagraph.find(elem=>elem.id==='wave05-image').x=900;coronagraph.find(elem=>elem.id==='wave05-camera').x=1000;
coronagraph.find(elem=>elem.id==='wave05-companion').y=160;pupilMask.params.gap=60;
// Separate corrective conjugates: the second DM intentionally sits 50 mm
// before the full pupil image, so it corresponds to a different upstream plane.
for(const elem of conjugates.filter(elem=>['wave02-dm2','wave02-image','wave02-camera'].includes(elem.id)))elem.y=550;
const multi=examples.find(record=>record.id==='WAVE-02');
multi.summary='Two native reflective DMs use a two-lens relay with 100 mm focal lengths. The second DM sits 50 mm before the first-DM image plane, giving distinct corrective conjugates before a final camera.';
multi.steps=['Identify the first DM plane and the second DM offset from the full 4f conjugate.','Adjust the two native defocus controls independently and inspect final convergence; this does not supply a tomographic controller.'];
const serial=examples.find(record=>record.id==='ACCESS-01');
for(const [id,x] of [['access01-l1',150],['access01-l2',250],['access01-l3',350],['access01-l4',450],['access01-camera',500]])serial.scene.elements.find(elem=>elem.id===id).x=x;
serial.summary='A native luminous object at 100 mm feeds two 4f relays built from four 50 mm thin lenses. The intermediate image lies at 300 mm and the final camera at 500 mm.';
