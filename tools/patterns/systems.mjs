// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Native workbench revision: published examples either contain physical registry
// elements or explain the essential feature the workbench cannot represent.
import { createElement } from '../../sketch/js/elements.js';
import '../../sketch/js/detector-instruments.js';
const optic = (id,type,x,y,params={},rot=0,label=id) => {
  const el=createElement(type,x,y);
  return {...el,id,rot,label,showLabel:true,params:{...el.params,...params}};
};
const laser=(id,x,y,wavelength=532,params={},rot=0)=>optic(id,'cwlaser',x,y,{wavelength,beamMode:'beam',beamWidth:3,avgPowerW:0.01,...params},rot);
const pd=(id,x,y,rot=0,params={})=>optic(id,'detector',x,y,params,rot);
const camera=(id,x,y,rot=0,params={})=>optic(id,'camera',x,y,{ch:30,pixels:64,interference:true,...params},rot);
const split=(id,x,y,ratio=.5,rot=90)=>optic(id,'bs',x,y,{ratio,size:25.4},rot);
const mirror=(id,x,y,rot=0,params={})=>optic(id,'mirror',x,y,{refl:100,length:25.4,...params},rot);
const scene=elements=>({version:1,elements,beams:[]});
const mzi=(phase=0)=>scene([
 laser('source',80,100,532,{coherenceLengthMm:0,pol:0}),split('input-split',220,100),
 optic('phase','phasemodulator',295,100,{designWavelength:532,depthDeg:phase,driveMode:'static'}),
 mirror('upper-fold',420,100,135),mirror('lower-fold',220,240,315),split('recombine',420,240),
 camera('port-a',520,240),camera('port-b',420,340,90),
]);
const fluorescence={kind:'fluor',wl:530,eff:.3,autoWl:false,autoColor:true,fluorophore:'custom'};
const native={};
function available(id,title,summary,steps,limit,setup) {native[id]={title,summary,steps,limit,mode:'rays',scene:setup};}

available('LINK-01','Native three-channel add/drop bus','Three spatially separated lasers at 1530, 1550 and 1570 nm enter a common free-space bus through two wavelength-selective combining dichroics. A 1550 nm band-reflecting dichroic drops the middle wavelength; a second band reflector adds a separate 1550 nm source.',[
 'Inspect the drop detector: its only incident wavelength is 1550 nm. The output spectrometer receives the two outer carriers plus the replacement.',
 'Move the first reflector center to 1500 nm to demonstrate the missed-channel boundary; the original 1550 nm channel then reaches the add reflector and is diverted into its rejection detector.'
],'This is a native free-space wavelength-routing equivalent, not a microring or fiber network. Ideal dichroic bands omit guided coupling, insertion-loss spectra, linewidth, channel crosstalk and encoded data.',scene([
 laser('carrier-1530',70,200,1530,{beamMode:'line'}),laser('carrier-1550',270,-50,1550,{beamMode:'line'},90),laser('carrier-1570',470,-50,1570,{beamMode:'line'},90),
 optic('combine-1550','dichroic',270,200,{dtype:'notch',center:1550,band:10,length:40},-45),optic('combine-1570','dichroic',470,200,{dtype:'notch',center:1570,band:10,length:40},-45),
 optic('drop-filter','dichroic',680,200,{dtype:'notch',center:1550,band:10,length:40},-45),
 pd('drop-detector',680,400,90),optic('add-filter','dichroic',900,200,{dtype:'notch',center:1550,band:10,length:40},-45),
 laser('replacement',900,-50,1550,{beamMode:'line'},90),optic('bus-output','spectrometer',1100,200,{aperture:30}),pd('add-reject',900,400,90),
]));
available('LINK-02','Native free-space Mach–Zehnder modulator','A sized 532 nm beam divides into equal-length arms. A native phase modulator writes a held phase into one arm; complementary camera ports measure the resulting interference.',[
 'Compare port A and port B at 0° phase drive, then set the phase modulator depth to 180° and compare the ports again.',
 'Set 90° for the intermediate state; distinguish phase-driven interference from absorption in either arm.'
],'The workbench computes supported monochromatic camera interference and static phase drive. This free-space equivalent has no waveguides, electrodes, symbol stream, RF bandwidth, modulator chirp or bias-control servo.',mzi(0));
available('LINK-03','Free-space I/Q field preparation','Two equal-length arms have independently adjustable amplitude-pickoff beamsplitters. The Q arm has a native 90° phase drive, and their common polarization fields recombine onto two cameras.',[
 'Inspect the I-arm and Q-arm amplitude-pickoff transmissions: these control field magnitudes through the square roots of their power transmissions.',
 'Change the Q phase from +90° to −90°, then attenuate either arm to zero; the scene remains a physical two-arm field combiner, with no electronic symbol decoding.'
],'This native free-space arrangement prepares real and imaginary field contributions with manual beamsplitter taps and phase control. It does not implement nested integrated Mach–Zehnder devices, signed electronic I/Q symbol drives or a coherent constellation receiver.',scene([
 laser('source',80,100),split('input-split',220,100),split('q-amplitude',275,100,.5),
 optic('q-phase','phasemodulator',340,100,{designWavelength:532,depthDeg:90,driveMode:'static'}),mirror('q-fold',420,100,135),
 split('i-amplitude',220,170,.5),mirror('i-fold',220,240,315),split('recombine',420,240),camera('port-a',520,240),camera('port-b',420,340,90),optic('q-dump','beamdump',275,140,{},90),optic('i-dump','beamdump',320,170),
]));
available('SENSE-02','Native pulsed send/return timing bench','A 905 nm pulse is split into a direct reference and a mirror round trip. The reflecting target sits 300 mm from the send/return splitter; a second detector receives the returned pulse.',[
 'Inspect the general detectors’ pulse records and compare the direct-reference and return path delays; account for their different detector distances.',
 'Move the target mirror 100 mm farther away. The returned pulse path grows by 200 mm, about 0.667 ns; rotating the target away removes the return.'
],'The native tracer carries optical-path pulse delay through a specular mirror return. It does not simulate diffuse lidar targets, a trigger discriminator, time-to-digital conversion, jitter or range estimation.',scene([
 optic('pulse','pulsedlaser',70,160,{wavelength:905,pulseWidthFs:2000000,beamMode:'line',avgPowerW:.01}),split('send-return',250,160),
 optic('reference','generaldetector',460,160,{aperture:30}),mirror('target',250,460,90,{length:50}),optic('return','generaldetector',250,40,{aperture:30},270),
]));
available('SENSE-04','Native fluorescent-spot triangulation geometry','A 488 nm laser excites a small fluorescent sample. A perpendicular 50 mm lens images the emission spot onto a camera; moving the sample along the laser axis shifts its camera position.',[
 'Select the fluorescent specimen and move it 5 mm along the excitation axis; inspect the camera centroid shift.',
 'Set the fluorescence channel efficiency to zero to distinguish loss of observed emission from a geometrical height change.'
],'This native example uses fluorescence as the observable isotropic spot rather than unmodeled elastic surface scattering. The 2D imaging geometry is useful for triangulation, but there is no calibrated pixel-to-height conversion, 3D baseline model or surface-dependent speckle.',scene([
 laser('excitation',70,100,488,{beamMode:'line'}),optic('spot','sample',300,100,{specimenType:'linear',aperture:20,transmitExc:false,channels:[fluorescence]},90),
 optic('view-lens','lens',300,130,{f:15,dia:30},90),camera('spot-camera',300,182,90,{ch:40,interference:false}),
]));
available('SENSE-07','Native two-band fluorescence collection','A 488 nm beam excites custom 530 and 610 nm fluorescence channels. A side-view collection lens, pump-rejection filter and dichroic feed separate green and red detectors; the transmitted pump has its own forward detector.',[
 'Compare the forward pump reading with the green and red channel wavelengths: these are separate collection directions and spectral bands.',
 'Disable only the 610 nm sample channel and verify that the red detector goes dark while green fluorescence remains.'
],'Native sample fluorescence and wavelength-selective routing are traced. Forward detection here measures transmitted excitation, not unmodeled forward scatter. Flow events, cell statistics, elastic side scatter, photon yield and spectral compensation are not simulated.',scene([
 laser('excitation',70,100,488,{beamMode:'line'}),optic('sample','sample',300,100,{specimenType:'linear',aperture:20,transmitExc:true,transmission:.8,channels:[fluorescence,{...fluorescence,wl:610,eff:.2}]},90),
 pd('forward-pump',490,100),optic('collection','lens',300,115,{f:15,dia:80},90),optic('pump-rejection','filter',300,175,{ftype:'longpass',cutoff:510,length:50},90),
 optic('color-split','dichroic',300,240,{cutoff:560,length:50},-45),pd('green',460,240),pd('red',300,350,90),
]));
available('COMPUTE-01','Native tilted-reference interferogram','A 532 nm Mach–Zehnder combines equal-length object and reference arms on two cameras. A small reference-fold tilt creates a spatial carrier in the native camera profile.',[
 'Inspect the camera’s interference profile and the phase-object modulation in the object arm.',
 'Return the reference-fold mirror to 315° to remove the relative tilt, or disable camera interference to compare deposited ray power.'
],'The camera resolves a one-dimensional supported coherent profile. This is a native off-axis interference acquisition bench; 2D hologram sampling, Fourier sideband reconstruction and numerical propagation are not implemented.',(()=>{const s=mzi(0);s.elements=s.elements.filter(e=>e.id!=='phase');s.elements.push(optic('object-phase','phaseplate',310,100,{profile:'ramp',opdUm:.15,aperture:12}));s.elements.find(e=>e.id==='lower-fold').rot=315.05;return s;})());
available('COMPUTE-02','Native four-step phase acquisition bench','A native 532 nm Mach–Zehnder records complementary camera intensity profiles while one arm’s phase modulator is manually set to 0°, 90°, 180° and 270°.',[
 'Set the phase modulator depth to each of 0°, 90°, 180° and 270° and inspect both camera profiles.',
 'Disable camera interference to see why simple ray-power addition cannot supply phase-shifting data.'
],'The native camera computes supported monochromatic interference; this bench has manual phase acquisition. Frame sequencing, numerical phase extraction, unwrapping and specimen-motion rejection are not implemented.',mzi(90));
available('COMPUTE-07','Native simultaneous focus-diversity cameras','A 6 mm collimated beam is split into two equal branches. Matched 50 mm lenses focus onto one camera at the nominal focal plane and another 10 mm beyond it.',[
 'Compare camera spot spans in the focus and defocus branches, then move the defocus camera back to the nominal focus.',
 'Move the defocus camera farther away to increase geometric blur; this is an acquisition geometry rather than a wavefront reconstruction.'
],'The native tracer calculates paraxial focusing and detector spot size. The source is a test beam rather than an extended unknown object; no diffraction PSF, aberration estimator, phase-diversity inverse solver or calibrated pupil phase is computed.',scene([
 laser('test-beam',70,100,532,{beamWidth:6}),split('diversity-split',250,100),optic('focus-lens','lens',340,100,{f:50,dia:25}),camera('focus-camera',412,100),
 optic('defocus-lens','lens',250,190,{f:50,dia:25},90),camera('defocus-camera',250,272,90),
]));
available('DISPLAY-06','Native planar nonimaging funnel','Two 200 mm planar reflecting walls narrow a 40 mm entrance to a 10 mm exit. A 14 mm detector receives direct and wall-reflected rays from a collimated input.',[
 'Compare the detector signal with the walls present and with both walls moved out of the beam.',
 'Change input direction or beam width to inspect finite angular and aperture acceptance rather than assuming perfect concentration.'
],'This native 2D planar funnel is a nonimaging collection variant, not a compound-parabolic surface. Rays and reflection losses are computed; there is no 3D CPC concentration bound, diffraction, radiance calibration or etendue calculation.',scene([
 laser('input',70,100,532,{beamWidth:40,nrays:41}),mirror('upper-wall',300,87.5,-85.710846,{length:201,refl:98}),mirror('lower-wall',300,112.5,85.710846,{length:201,refl:98}),pd('receiver',440,100,0,{aperture:14}),
]));
available('CONTROL-01','Native open-loop power actuator and monitor','A 532 nm beam passes a neutral-density actuator and a 95:5 beamsplitter. Native power meters measure delivered and sampled power with the source set to 10 mW.',[
 'Adjust the neutral-density transmission and compare delivery and monitor powers; both should change in the same proportion.',
 'Set actuator transmission to zero to check the blocked boundary; change source power to demonstrate the drift a real controller would need to correct.'
],'This is the physical measurement/attenuation branch of a stabilization loop, operated manually. A feedback controller, electronic setpoint and automatic stabilization are unavailable; the scene makes no closed-loop stability or bandwidth claim.',scene([
 laser('source',70,100),optic('actuator','filter',230,100,{ftype:'nd',trans:.8}),split('monitor-tap',350,100,.95),optic('delivery','powermeter',530,100),optic('monitor','powermeter',350,260,{},90),
]));
available('CONTROL-02','Native two-mirror pointing diagnostics','Two separated steering mirrors fold a beam through a monitoring split. One camera samples position in the outgoing beam; a lens and focal-plane camera provide the angle-sensitive branch.',[
 'Rotate either steering mirror slightly and compare the two camera centroids; both actuators influence the outgoing position and angle.',
 'Move the far-field lens out of the sensing branch to demonstrate why that camera no longer isolates angular information.'
],'The actual mirrors, diagnostic split, lens and camera rays are represented. This bench is manually aligned; there is no calibrated actuator/sensor Jacobian, quadrant electronics or automatic two-axis pointing controller.',scene([
 laser('source',70,100),mirror('steerer-1',240,100,135,{length:50}),mirror('steerer-2',240,260,315,{length:50}),split('diagnostic-tap',420,260,.5),
 camera('near-camera',650,260),optic('far-lens','lens',420,350,{f:50,dia:40},90),camera('far-camera',420,422,90,{ch:60}),
]));
available('CONTROL-06','Native sample/reference transmission bench','A 50:50 splitter sends one branch through a 60%-transmitting sample and the other to a reference detector. Native power meters report both channels for manual normalization.',[
 'Compare sample and reference powers; their ratio is 0.6 with matched source fractions and this sample setting.',
 'Double source power to verify both powers scale together; set sample transmission to zero to check the opaque boundary.'
],'The native optical branches and absolute powers from the configured source are traced. Ratio computation is manual; detector noise, dark subtraction, electronics gain, drift and uncertainty propagation are not simulated.',scene([
 laser('source',70,100),split('sample-reference',260,100),optic('sample','sample',400,100,{specimenType:'absorbing',transmission:.6,aperture:30},90),
 optic('sample-meter','powermeter',570,100),optic('reference-meter','powermeter',260,280,{},90),
]));
available('CONTROL-08','Native collimated and focus diagnostic branches','Two actual beamsplitters preserve a main beam while providing a collimated-plane camera and a lens/focal-plane camera. The scene makes the two measurement planes physically distinct.',[
 'Compare the unfocused diagnostic beam width with the focal-plane spot span.',
 'Move the focusing lens away from its designed distance and inspect the changed focal-plane reading while the direct diagnostic remains unchanged.'
],'Native ray profiles and focal geometry are traced. The source pupil is a collimated test beam; this is not a full microscope pupil/image prescription, and no automated diagnosis or wavefront reconstruction is performed.',scene([
 laser('source',70,100,532,{beamWidth:6}),split('first-tap',250,100,.8),split('second-tap',440,100,.75),camera('main-camera',650,100),
 camera('direct-camera',250,280,90),optic('pupil-lens','lens',440,190,{f:50,dia:30},90),camera('pupil-camera',440,262,90),
]));
available('CONTROL-09','Native shared-path spectral calibration injection','A 532 nm test beam and a separately shuttered 546 nm calibration beam enter the same output path through a beamsplitter. A common slit and native spectrometer measure the selected input.',[
 'With the test shutter open and calibration shutter closed, inspect the 532 nm spectrum. Reverse the shutter transmissions to inspect 546 nm on the same path.',
 'Close both shutters to verify the no-light boundary; opening both demonstrates contamination by simultaneous inputs.'
],'The native source selector, slit and spectrometer path are represented with monochromatic calibration inputs. No mercury-lamp line synthesis, dispersive detector pixel calibration, polynomial fitting or calibrated wavelength residual is computed.',scene([
 laser('test-source',70,100,532,{beamMode:'line'}),optic('test-shutter','filter',190,100,{ftype:'nd',trans:1}),split('input-combiner',350,100,.5,90),
 laser('calibration-source',350,-80,546,{beamMode:'line'},90),optic('calibration-shutter','filter',350,30,{ftype:'nd',trans:0},90),
 optic('entrance-slit','slit',490,100,{gap:4,length:40}),optic('spectrometer','spectrometer',610,100,{aperture:30}),
]));


available('SENSE-01','Native polarization-separated common-aperture return','A 905 nm beam crosses a PBS, a quarter-wave plate and one shared lens before reflecting from a specular target. Its double-pass polarization directs the return into a separate detector.',[
 'Inspect the return detector with the quarter-wave axis at 45°; it receives the orthogonal linear return polarization.',
 'Set the quarter-wave axis to 0° to suppress the receive port, or rotate the target mirror away to remove the returned path.'
],'This native common-aperture geometry computes ideal polarization routing and a specular mirror return. Diffuse-target depolarization, telescope throughput, lidar range estimation and receiver electronics are not modeled.',scene([
 laser('transmit',70,160,905,{beamMode:'line',pol:0}),optic('separator','pbs',250,160,{},90),optic('quarter-wave','qwp',325,160,{a:45}),optic('common-lens','lens',380,160,{f:100,dia:30}),mirror('target',470,160),pd('receive',250,40,270),
]));
available('DISPLAY-01','Native single-pixel see-through combiner','A 532 nm point emitter at a 50 mm collimator focus supplies one virtual display pixel. A native beamsplitter combines it with a 640 nm external-scene test beam before a model eye.',[
 'Inspect the eye spectrum: both the display pixel and external-scene beam reach its retina through the same combiner.',
 'Set combiner transmission to 1 to remove the reflected display contribution, or move the point emitter away from the collimator focus to change retinal spread.'
],'This native setup demonstrates a single collimated virtual pixel and see-through ray combination. It is not a microdisplay image renderer and does not calculate eyebox, accommodation, display contrast or human perception.',scene([
 optic('display-pixel','pointsource',500,50,{wavelength:532,spread:6,nrays:9},90),optic('collimator','lens',500,100,{f:50,dia:25},90),laser('world-beam',70,200,640),split('combiner',500,200,.5),optic('observer-eye','eye',650,200,{pupil:6}),
]));
available('DISPLAY-07','Native parabolic primary with folded solar receiver','One collimated 550 nm test beam probes this 2D solar-collector geometry. Source angles can be changed manually to sample the solar disk’s approximately ±0.25° range. A 70 mm-focal-length parabolic primary and small plane secondary direct collected light onto an offset receiver.',[
 'Follow actual reflected rays from the primary through the secondary to the receiver; inspect the receiver spot and central obstruction.',
 'Move the secondary mirror out of the beam to remove the focused receive path (small unfocused stray input can remain), or widen the incident angular spread to inspect off-axis collection loss.'
],'This native ray setup is a small reflective solar-collection geometry with a folding secondary, not a CPC secondary or thermal plant. The laboratory test laser is not a calibrated extended solar-radiance source; no 3D flux, thermal efficiency, tracking control or spectral throughput is calculated.',scene([
 laser('solar-test',70,100,550,{beamWidth:40}),optic('return-stop','isolator',200,100,{aperture:60}),optic('stray-dump','beamdump',300,20,{},270),optic('primary','oap',350,100,{length:50,f:70,refl:98}),mirror('secondary',300,100,45,{length:16,refl:98}),pd('receiver',300,140,90,{aperture:10}),
]));


available('CONTROL-05','Native off-axis reflection focus diagnostic','An off-axis 850 nm beam passes a PBS, quarter-wave plate and focusing lens to a reflective reference plane. A camera in the separated return port measures a centroid that changes when the reference plane moves axially.',[
 'Move the reference mirror 10 mm along the lens axis and inspect the return camera centroid; the beam starts 10 mm off the lens axis.',
 'Set the quarter-wave axis to 0° to suppress the receive channel, separating lost return routing from a focus-related centroid change.'
],'This native open-loop diagnostic uses an ideal mirror reference and a camera as the position sensor. It does not model a coverslip Fresnel reflection, microscope specimen focus, split-detector electronics, calibrated focus error or an automatic z-lock servo.',scene([
 laser('focus-probe',70,150,850,{pol:0}),optic('separator','pbs',250,160,{size:50},90),optic('quarter-wave','qwp',325,160,{a:45,length:50}),optic('focus-lens','lens',380,160,{f:100,dia:50}),mirror('reference-plane',470,160,0,{length:50}),camera('focus-camera',250,40,270,{ch:80,interference:false}),
]));

const unavailable={
 'LINK-04':'The registry has no guided 2×2 tunable interferometer cell, multiport waveguide junction or programmable mesh transfer model. A chain of free-space beamsplitters would not reproduce the specified four-mode mesh.',
 'LINK-05':'The registry has no photonic lantern, spatial-mode-resolved guided fiber or coherent modal receiver. Its drawn fibers do not preserve or separate three spatial eigenmodes.',
 'LINK-06':'No longitudinally tapered waveguide or guided eigenmode conversion element exists. A lens or ordinary fiber endpoint cannot represent the proposed adiabatic guide transition.',
 'LINK-07':'There is no chip edge facet, inverse-taper waveguide or fiber/chip mode-overlap interface. A fiber ending at a box would be a stand-in rather than a native coupling setup.',
 'LINK-08':'The registry has no addressable coherent emitter array or far-field phased-array synthesis. Its SLM and separate lasers cannot establish the required inter-emitter phase-gradient response.',
 'LINK-09':'Native drawn fibers lack distributed weak reflectors and position-resolved backscatter interrogation. A free-space delay bench cannot reproduce two reflection sites inside this fiber.',
 'QUANT-01':'Native nonlinear conversion is classical. There is no photon-pair probability model, herald counter or coincidence gate, so an idler detector cannot herald a single photon in the workbench.',
 'QUANT-02':'There is no entangled pair source, quantum polarization state or coincidence analyzer. A native Sagnac layout alone cannot represent the essential entangled-pair preparation and analysis.',
 'QUANT-03':'Native beamsplitters and cameras compute supported classical interference, but no single-photon counters or two-photon coincidence/Hong–Ou–Mandel interaction exist.',
 'QUANT-04':'There is no single-photon time-bin state preparation, matched quantum analyzer or gated central-slot coincidence counter. Classical delayed pulses cannot implement the specified quantum state.',
 'QUANT-05':'The OPO element does not produce squeezed vacuum or quantum quadrature noise. No shot-noise-referenced homodyne variance receiver exists, so ordinary detector powers cannot represent squeezing.',
 'QUANT-06':'The registry lacks a trapped dielectric particle with optical-force dynamics and quadrant back-focal-plane position sensing. An objective and stationary sample would not be an optical tweezer with position readout.',
 'QUANT-07':'There is no holographic multi-trap potential or atom occupancy model. The native SLM does not synthesize an arbitrary four-focus trap array, and the camera does not count trapped atoms.',
 'QUANT-08':'The registry has no coherent standing-wave optical potential or atom/lattice interaction. Counterpropagating classical rays alone do not establish lattice sites or confinement.',
 'QUANT-09':'No atomic transition, Doppler/Zeeman cooling force, six-beam 3D atom interaction or addressing-state model exists. The 2D native optics cannot represent the essential multi-axis cooling experiment.',
 'SENSE-03':'The registry lacks a swept optical-frequency source and a balanced heterodyne beat-frequency receiver. A static CW interference pattern cannot implement FMCW delay/velocity acquisition.',
 'SENSE-05':'The DMD does not project calibrated phase-stepped sinusoidal fringes onto a scattering height surface, and there is no phase-to-height acquisition/calibration model.',
 'SENSE-06':'There is no moving scattering particle or Doppler-frequency detector. A pair of crossing rays cannot produce the specified particle-scattered velocity waveform.',
 'SENSE-08':'The registry has no complex-index thin metal film, surface-plasmon interface or evanescent refractive-index sensing response. An ordinary prism/window cannot stand in for a gold-coated sensing interface.',
 'SENSE-09':'The registry contains no thermoelastic pressure source, acoustic propagation or ultrasound transducer. Optical sample emission cannot substitute for an acoustic readout.',
 'SENSE-10':'There is no rotating volumetric transmission object with line-integral projections or tomographic acquisition. A stage and one absorbing sample do not supply a multi-angle volume dataset.',
 'COMPUTE-03':'The native camera does not record coherent far-field diffraction from overlapping sample patches, and there is no ptychographic object/probe acquisition model.',
 'COMPUTE-04':'The workbench has no 2D binary coded mask and 2D shadowgram detector. Its one-dimensional detector profiles cannot represent the proposed coded-aperture measurements.',
 'COMPUTE-05':'The DMD cannot sequence a calibrated 64×64 complementary Hadamard illumination basis, and there is no spatially integrated mask/sample bucket-acquisition model.',
 'COMPUTE-06':'No microlens array or angle-resolved 2D subimage detector exists. One thin lens and a one-dimensional camera profile cannot capture a light field.',
 'COMPUTE-08':'The tracer does not propagate spatial-frequency diffraction through a Fourier-plane mask. A 4f ray relay with an aperture would show geometric clipping, not the essential optical Fourier processing.',
 'DISPLAY-02':'The registry has no pupil-replicating guided output couplers. Ordinary gratings and splitters do not preserve the angular image field through three waveguide replica regions.',
 'DISPLAY-03':'The registry lacks a reflective-polarizer imaging cavity with a verified multiple-pass polarization-folded prescription. A lone PBS or folded mirror path would not be the specified pancake eyepiece.',
 'DISPLAY-04':'There is no synchronized image-plane engine and calibrated tunable-focus presentation sequence. A lens with an edited focal length cannot implement three time-multiplexed depth layers.',
 'DISPLAY-05':'The native eye and scan mirrors do not implement a synchronized RGB pixel raster projected onto the retina with pupil-tracking and image acquisition. No retinal display is claimed.',
 'DISPLAY-08':'There is no light-guide transport element with spatially graded extraction microstructures and recycling. A drawn fiber or diffuser cannot reproduce an edge-lit panel.',
 'CONTROL-03':'The workbench has no RF sideband-resolved cavity-reflection detector, mixer or PDH error signal. Native phase modulation does not by itself supply a frequency-lock sensing channel.',
 'CONTROL-04':'No bidirectional phase-noisy fiber, coherent round-trip phase receiver or AOM phase-precompensation controller exists. Native fiber power transport cannot implement a compensated frequency link.',
 'CONTROL-07':'There is no closed diffuse integrating-sphere surface with repeated scattering, ports and baffles. A single diffuser does not implement a sphere flux measurement.',
};


for (const id of ['SENSE-01','CONTROL-05']) for (const el of native[id].scene.elements) {
 if(el.id==='quarter-wave') el.label='QWP';
 if(el.id==='common-lens'||el.id==='focus-lens') el.label='Lens';
}
for (const [id, sampleId, lensId] of [['SENSE-04','spot','view-lens'],['SENSE-07','sample','collection']]) {
 const sample=native[id].scene.elements.find(el=>el.id===sampleId);
 const lens=native[id].scene.elements.find(el=>el.id===lensId);
 sample.labelPos='l'; sample.label='Sample';
 lens.labelPos='r'; lens.label='Collector';
}
native['DISPLAY-06'].scene.elements.find(el=>el.id==='upper-wall').labelPos='t';

const catalogue = [
  {
    "id": "LINK-01",
    "title": "Native three-channel add/drop bus",
    "references": [
      {
        "label": "Microring add-drop filters — Little et al.",
        "url": "https://doi.org/10.1109/50.588673"
      }
    ]
  },
  {
    "id": "LINK-02",
    "title": "Native free-space Mach–Zehnder modulator",
    "references": [
      {
        "label": "Lithium niobate modulators — Wang et al.",
        "url": "https://doi.org/10.1038/s41586-018-0551-y"
      }
    ]
  },
  {
    "id": "LINK-03",
    "title": "Free-space I/Q field preparation",
    "references": [
      {
        "label": "Lithium niobate modulators — Wang et al.",
        "url": "https://doi.org/10.1038/s41586-018-0551-y"
      }
    ]
  },
  {
    "id": "LINK-04",
    "title": "Four-port triangular interferometer mesh",
    "references": [
      {
        "label": "Universal multiport interferometers — Clements et al.",
        "url": "https://doi.org/10.1364/OPTICA.3.001460"
      }
    ]
  },
  {
    "id": "LINK-05",
    "title": "Three-input photonic-lantern receiver",
    "references": [
      {
        "label": "Photonic lantern — Leon-Saval et al.",
        "url": "https://doi.org/10.1364/OE.18.002470"
      }
    ]
  },
  {
    "id": "LINK-06",
    "title": "Wide-to-narrow guided mode transition",
    "references": [
      {
        "label": "Nanotaper waveguide mode converter — Almeida et al.",
        "url": "https://doi.org/10.1364/OL.28.001302"
      }
    ]
  },
  {
    "id": "LINK-07",
    "title": "Lensed-fiber edge coupling with a witness port",
    "references": [
      {
        "label": "Nanotaper waveguide mode converter — Almeida et al.",
        "url": "https://doi.org/10.1364/OL.28.001302"
      }
    ]
  },
  {
    "id": "LINK-08",
    "title": "Four-emitter phase-gradient steering",
    "references": [
      {
        "label": "Large-scale nanophotonic phased array — Sun et al.",
        "url": "https://doi.org/10.1038/nature11727"
      }
    ]
  },
  {
    "id": "LINK-09",
    "title": "Pulsed fiber interrogation with two reflection sites",
    "references": [
      {
        "label": "Optical time domain reflectometry — Barnoski and Jensen",
        "url": "https://doi.org/10.1364/AO.15.002112"
      }
    ]
  },
  {
    "id": "QUANT-01",
    "title": "405 nm heralded pair source",
    "references": [
      {
        "label": "Heralded single photons — Grangier et al.",
        "url": "https://doi.org/10.1209/0295-5075/1/4/004"
      }
    ]
  },
  {
    "id": "QUANT-02",
    "title": "Polarization Sagnac pair source",
    "references": [
      {
        "label": "Polarization-Sagnac photon-pair source",
        "url": "https://www.nature.com/articles/s41598-019-41633-z"
      }
    ]
  },
  {
    "id": "QUANT-03",
    "title": "Delay-scanned Hong–Ou–Mandel arrangement",
    "references": [
      {
        "label": "Two-photon interference — Hong, Ou and Mandel",
        "url": "https://doi.org/10.1103/PhysRevLett.59.2044"
      }
    ]
  },
  {
    "id": "QUANT-04",
    "title": "Matched 2 ns time-bin interferometers",
    "references": [
      {
        "label": "Time-bin quantum communication — Brendel et al.",
        "url": "https://doi.org/10.1103/PhysRevLett.82.2594"
      }
    ]
  },
  {
    "id": "QUANT-05",
    "title": "Squeezed vacuum and balanced homodyne readout",
    "references": [
      {
        "label": "Squeezed states from an optical parametric oscillator — Wu et al.",
        "url": "https://doi.org/10.1103/PhysRevLett.57.2520"
      }
    ]
  },
  {
    "id": "QUANT-06",
    "title": "1064 nm trap with back-focal-plane readout",
    "references": [
      {
        "label": "Single-beam gradient-force trap — Ashkin et al.",
        "url": "https://doi.org/10.1364/OL.11.000288"
      }
    ]
  },
  {
    "id": "QUANT-07",
    "title": "Four-site holographic tweezer array",
    "references": [
      {
        "label": "Dynamic holographic optical tweezers",
        "url": "https://www.nature.com/articles/ncomms13317"
      }
    ]
  },
  {
    "id": "QUANT-08",
    "title": "Retroreflected 780 nm standing-wave lattice",
    "references": [
      {
        "label": "Atoms in optical lattices — Bloch",
        "url": "https://doi.org/10.1038/nphys138"
      }
    ]
  },
  {
    "id": "QUANT-09",
    "title": "Three-axis cooling with a separate address beam",
    "references": [
      {
        "label": "Three-dimensional optical molasses — Chu et al.",
        "url": "https://doi.org/10.1103/PhysRevLett.55.48"
      }
    ]
  },
  {
    "id": "SENSE-01",
    "title": "Native polarization-separated common-aperture return",
    "references": [
      {
        "label": "NASA lidar instrument architecture — GLAS",
        "url": "https://icesat.gsfc.nasa.gov/icesat/glas.php"
      }
    ]
  },
  {
    "id": "SENSE-02",
    "title": "Native pulsed send/return timing bench",
    "references": [
      {
        "label": "NASA photon-counting altimetry — ATLAS",
        "url": "https://icesat-2.gsfc.nasa.gov/science/technology"
      }
    ]
  },
  {
    "id": "SENSE-03",
    "title": "Triangular-chirp coherent ranging",
    "references": [
      {
        "label": "NASA coherent lidar local oscillator",
        "url": "https://technology.nasa.gov/patent/LAR-TOPS-400"
      }
    ]
  },
  {
    "id": "SENSE-04",
    "title": "Native fluorescent-spot triangulation geometry",
    "references": [
      {
        "label": "Laser triangulation sensor principles — Micro-Epsilon",
        "url": "https://www.micro-epsilon.com/distance-sensors/laser-sensors/"
      }
    ]
  },
  {
    "id": "SENSE-05",
    "title": "Three-phase fringe-projection height acquisition",
    "references": [
      {
        "label": "Real-time 3D shape measurement — Zhang and Huang",
        "url": "https://doi.org/10.1364/OE.14.002644"
      }
    ]
  },
  {
    "id": "SENSE-06",
    "title": "Two-beam Doppler velocimeter",
    "references": [
      {
        "label": "Optical Doppler flow measurement — Yeh and Cummins",
        "url": "https://doi.org/10.1063/1.1753925"
      }
    ]
  },
  {
    "id": "SENSE-07",
    "title": "Native two-band fluorescence collection",
    "references": [
      {
        "label": "BD flow cytometry optics introduction",
        "url": "https://www.bdbiosciences.com/en-us/learn/training/basic/flow-cytometry-introduction"
      }
    ]
  },
  {
    "id": "SENSE-08",
    "title": "Prism-coupled surface-plasmon sensing",
    "references": [
      {
        "label": "Surface plasmon resonance biosensing — Liedberg et al.",
        "url": "https://doi.org/10.1016/0250-6874(83)85036-7"
      }
    ]
  },
  {
    "id": "SENSE-09",
    "title": "Nanosecond optical pump with acoustic reception",
    "references": [
      {
        "label": "Functional photoacoustic microscopy — Zhang et al.",
        "url": "https://doi.org/10.1038/nbt1220"
      }
    ]
  },
  {
    "id": "SENSE-10",
    "title": "180-view transmission tomography",
    "references": [
      {
        "label": "Optical projection tomography — Sharpe et al.",
        "url": "https://doi.org/10.1126/science.1068206"
      }
    ]
  },
  {
    "id": "COMPUTE-01",
    "title": "Native tilted-reference interferogram",
    "references": [
      {
        "label": "Digital hologram reconstruction — Schnars and Jüptner",
        "url": "https://doi.org/10.1364/AO.33.000179"
      }
    ]
  },
  {
    "id": "COMPUTE-02",
    "title": "Native four-step phase acquisition bench",
    "references": [
      {
        "label": "Phase measurement — Bruning et al.",
        "url": "https://doi.org/10.1364/AO.13.002693"
      }
    ]
  },
  {
    "id": "COMPUTE-03",
    "title": "Overlapping raster ptychography",
    "references": [
      {
        "label": "Ptychographic phase retrieval — Rodenburg and Faulkner",
        "url": "https://doi.org/10.1063/1.1823034"
      }
    ]
  },
  {
    "id": "COMPUTE-04",
    "title": "Binary coded-mask shadow camera",
    "references": [
      {
        "label": "Uniformly redundant arrays — Fenimore and Cannon",
        "url": "https://doi.org/10.1364/AO.17.000337"
      }
    ]
  },
  {
    "id": "COMPUTE-05",
    "title": "Complementary Hadamard bucket acquisition",
    "references": [
      {
        "label": "Single-pixel imaging via compressive sampling — Duarte et al.",
        "url": "https://doi.org/10.1109/MSP.2007.914730"
      }
    ]
  },
  {
    "id": "COMPUTE-06",
    "title": "Microlens light-field capture",
    "references": [
      {
        "label": "Light-field camera — Ng et al.",
        "url": "https://graphics.stanford.edu/papers/lfcamera/"
      }
    ]
  },
  {
    "id": "COMPUTE-07",
    "title": "Native simultaneous focus-diversity cameras",
    "references": [
      {
        "label": "Phase-diversity wavefront sensing — Gonsalves",
        "url": "https://doi.org/10.1117/12.7972989"
      }
    ]
  },
  {
    "id": "COMPUTE-08",
    "title": "4f low-pass optical processor",
    "references": [
      {
        "label": "Coherent optical information processing — Vander Lugt",
        "url": "https://doi.org/10.1109/TIT.1964.1053650"
      }
    ]
  },
  {
    "id": "DISPLAY-01",
    "title": "Native single-pixel see-through combiner",
    "references": [
      {
        "label": "Waveguide holography with pupil replication",
        "url": "https://www.nature.com/articles/s41467-023-44032-1"
      }
    ]
  },
  {
    "id": "DISPLAY-02",
    "title": "Three-tap waveguide pupil replication",
    "references": [
      {
        "label": "Waveguide holography with pupil replication",
        "url": "https://www.nature.com/articles/s41467-023-44032-1"
      }
    ]
  },
  {
    "id": "DISPLAY-03",
    "title": "Polarization-folded pancake eyepiece",
    "references": [
      {
        "label": "3M folded optics with reflective polarizers",
        "url": "https://multimedia.3m.com/mws/media/1948054O/folded-optics-with-birefringent-reflective-polarizers-technical-paper.pdf"
      }
    ]
  },
  {
    "id": "DISPLAY-04",
    "title": "Three-depth synchronized multifocal display",
    "references": [
      {
        "label": "Multiple focal-distance stereo display — Akeley et al.",
        "url": "https://doi.org/10.1145/1015706.1015804"
      }
    ]
  },
  {
    "id": "DISPLAY-05",
    "title": "Pupil-relayed raster retinal projector",
    "references": [
      {
        "label": "University of Washington virtual retinal display research",
        "url": "https://www.hitl.washington.edu/projects/vrd/publications.html"
      }
    ]
  },
  {
    "id": "DISPLAY-06",
    "title": "Native planar nonimaging funnel",
    "references": [
      {
        "label": "NIST nonimaging Winston-cone concentrators",
        "url": "https://www.nist.gov/publications/advanced-designs-non-imaging-submillimeter-wave-winston-cone-concentrators"
      }
    ]
  },
  {
    "id": "DISPLAY-07",
    "title": "Native parabolic primary with folded solar receiver",
    "references": [
      {
        "label": "DOE concentrating solar power dish systems",
        "url": "https://www.energy.gov/cmei/systems/dishengine-system-concentrating-solar-thermal-power-basics"
      }
    ]
  },
  {
    "id": "DISPLAY-08",
    "title": "Edge-lit guide with graded extraction",
    "references": [
      {
        "label": "Diffraction gratings for uniform light extraction from light guides",
        "url": "https://arxiv.org/abs/1909.12955"
      }
    ]
  },
  {
    "id": "CONTROL-01",
    "title": "Native open-loop power actuator and monitor",
    "references": [
      {
        "label": "Power-noise characteristics and stabilization actuators — Tröbs et al.",
        "url": "https://doi.org/10.1364/OE.13.002224"
      }
    ]
  },
  {
    "id": "CONTROL-02",
    "title": "Native two-mirror pointing diagnostics",
    "references": [
      {
        "label": "Active beam pointing stabilization — Thorlabs",
        "url": "https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=6804"
      }
    ]
  },
  {
    "id": "CONTROL-03",
    "title": "Pound–Drever–Hall cavity frequency lock",
    "references": [
      {
        "label": "Laser phase/frequency stabilization — Drever et al.",
        "url": "https://doi.org/10.1007/BF00702605"
      }
    ]
  },
  {
    "id": "CONTROL-04",
    "title": "Round-trip compensated fiber frequency link",
    "references": [
      {
        "label": "Fiber frequency transfer — Williams et al.",
        "url": "https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=33068"
      }
    ]
  },
  {
    "id": "CONTROL-05",
    "title": "Native off-axis reflection focus diagnostic",
    "references": [
      {
        "label": "Nikon Perfect Focus mechanism",
        "url": "https://www.microscopyu.com/microscopy-basics/nikon-perfect-focus-system"
      }
    ]
  },
  {
    "id": "CONTROL-06",
    "title": "Native sample/reference transmission bench",
    "references": [
      {
        "label": "Double-beam UV/Vis measurement — Agilent instrument guide",
        "url": "https://www.agilent.com/cs/library/primers/public/primer-uv-vis-spectroscopy-basics-5994-0848en-agilent.pdf"
      }
    ]
  },
  {
    "id": "CONTROL-07",
    "title": "Integrating-sphere flux substitution measurement",
    "references": [
      {
        "label": "NIST integrating-sphere photometry",
        "url": "https://www.nist.gov/pml/sensor-science/optical-radiation/photometry"
      }
    ]
  },
  {
    "id": "CONTROL-08",
    "title": "Native collimated and focus diagnostic branches",
    "references": [
      {
        "label": "Nikon conjugate planes in microscopy",
        "url": "https://www.microscopyu.com/microscopy-basics/conjugate-planes-in-optical-microscopy"
      }
    ]
  },
  {
    "id": "CONTROL-09",
    "title": "Native shared-path spectral calibration injection",
    "references": [
      {
        "label": "NIST atomic spectra database",
        "url": "https://physics.nist.gov/asd"
      }
    ]
  }
];
export const examples = catalogue.map(content => {
 if(native[content.id]) return {...content,...native[content.id]};
 if(!unavailable[content.id]) throw new Error(`Missing native capability audit: ${content.id}`);
 return {...content,mode:'unavailable',unavailableReason:unavailable[content.id],
  summary:'This arrangement cannot currently be supplied as a native OpticalSetup setup. '+unavailable[content.id],
  steps:['Read the missing native capability below before planning this arrangement.','Use the primary references for the physical architecture; no mockup setup is offered.'],
  limit:unavailable[content.id]};
});
