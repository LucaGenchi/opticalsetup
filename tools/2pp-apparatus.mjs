// Independently authored component sequences from collections/2pp/papers.json.
// These are unfolded apparatus drawings, not fitted optical prescriptions.
// Short display labels accompany exact evidence in the adjacent paper record.
const c = (type, label, params = {}) => ({ type, label, params });
const box = label => c('box', label, { text: label.split('\n')[0], behavior: 'pass', w: 76, h: 32 });
const lens = (label, f) => c('lens', label, f ? { f } : {});
const obj = (label, na, mag, medium = 'oil') => c('objective', label, { na, efl: 200 / mag, immersion: medium });
const stage = label => c('stage', label, { specimenType: 'resin', voxelPreview: false, pzMode: 'static' });
const aom = (label, zero = false) => c('aom', label, { zero });
const slm = label => c('slm', label);
const dmd = label => c('dmd', label);
const doe = label => c('diffractivesplitter', label);
const galvo = label => c('galvo', label);
const hwp = () => c('hwp', 'Half-wave plate');
const pbs = () => c('pbs', 'Polarizing beam splitter');
const dm = () => c('dichroic', 'Dichroic');
const qwp = label => c('qwp', label || 'Quarter-wave plate');
const prism = label => c('prism', label);
const expander = label => c('telescope', label);

export const apparatus = {
  'fischer-2011': [
    aom('Excitation gate\n4 kHz · 3% duty'),
    box('Beam combination\nplacement inferred'), qwp('Circular excitation'),
    obj('Leica HCX PL APO\nNA 1.4', 1.4, 100), stage('DETC / PETA\n100 µm/s scan'),
  ],
  'gittard-2011': [
    box('LC intensity control'), pbs(), expander('Beam expansion'), slm('LC-R2500\nTiled CGH'),
    lens('Fourier lens'), c('slit', 'Plane P\nSelect first order'), lens('Relay to scanner'),
    galvo('XY galvo scanner'), obj('100× / NA 1.40\nOil objective', 1.4, 100), stage('XYZ positioning\n4×4 Venus example'),
  ],
  'buckmann-2014': [
    box('GT internal optics\nUndisclosed'), galvo('Galvo scanning'),
    obj('Zeiss 25× / NA 0.8\nDip-in to IP-S', 0.8, 25, 'custom'), stage('IP-S on glass\nPositioning stages'),
  ],
  'nanoscribe-gt': [
    box('GT internal optics\nUndisclosed'), galvo('XY galvos'), box('Objective varies\nby configuration'),
    stage('XYZ piezo\n300 µm travel'), box('Motorized XY\n100×100 mm²'),
  ],
  'pearre-2018': [
    box('Pockels intensity\ncontrol assembly'), c('bs', 'Power pickoff'),
    expander('2× Galilean expander'), galvo('Resonant X\n7.91 kHz'), galvo('Slow Y galvo'),
    box('Scan / tube relay'), dm(), obj('25× / NA 0.8\nImmersion ring', 0.8, 25, 'custom'),
    stage('Resin positioning\nObjective piezo Z'),
  ],
  'geng-2019': [
    c('grating', '1200 lines/mm\nTransmission', { lines: 1200, transmissive: true }), c('mirror', 'M1'),
    lens('L1 · 100 mm', 100), lens('L2 · 250 mm', 250), dmd('DLP4100\nBinary holograms'),
    lens('L3 · 200 mm', 200), c('slit', 'Fourier plane\nFirst-order filter'), lens('L4 · 200 mm', 200), dm(),
    obj('Nikon 40× / NA 1.3\nWD 0.22 mm', 1.3, 40), stage('IP-Dip\nXYZ stage'),
  ],
  'saha-2019': [
    dmd('DMD mask\nAngular dispersion'), lens('L1 collimation'), c('mirror', 'Fold mirror'),
    obj('L2 · 60× / NA 1.25\nProjection objective', 1.25, 60), stage('Temporal focus plane\nXYZ stage'),
  ],
  'hahn-2020': [
    aom('AOM writing +1\n0th order dumped', true), prism('N-SF10 prism P1'), prism('N-SF10 prism P2\n2 m tip separation'),
    doe('3×3 DOE'), box('Chromatic DCT\nNear 1×'), pbs(),
    box('LG1 / LG2\n2:1 demagnification'), galvo('GX'), box('LG3 / LG4\nScanner relay'), galvo('GY'),
    box('LG5 / LG6\nPupil relay'), dm(), qwp(), obj('Zeiss 40× / NA 1.4\nOil objective', 1.4, 40), stage('Resin\nXY + piezo Z'),
  ],
  'somers-2021': [
    hwp(), pbs(), lens('Expansion · −75 mm', -75), lens('Expansion · +100 mm', 100),
    box('πShaper\nFlat-top shaping'), lens('L1 · 100 mm', 100), lens('L2 · 150 mm', 150),
    dmd('DLP3000 masks\n24° incidence'), lens('L3 · 300 mm', 300), c('bs', '50:50 camera pickoff'), dm(),
    obj('Nikon 100× / NA 1.49\nDip-in objective', 1.49, 100), stage('BBK / PETA\nAir-bearing XYZ'),
  ],
  'ouyang-2023': [
    hwp(), pbs(), c('grating', '600 lines/mm\nReflective grating', { lines: 600 }),
    lens('L1 · 225 mm', 225), lens('L2 · 250 mm', 250), dmd('DLP6500\nBinary holograms'),
    lens('L3 · 150 mm', 150), c('slit', 'Fourier-plane filter'), lens('L4 · 200 mm', 200), dm(),
    obj('L5 · 40× / NA 1.3\nWD 0.24 mm', 1.3, 40), stage('Resin\n6-axis hexapod'),
  ],
  'jiao-2023': [
    prism('N-F2 · P1'), prism('N-F2 · P2\nGDD precompensation'), aom('Temporal AOM gate\n2 MHz switching'),
    prism('N-F2 · P3\nAngular compensation'), c('aod', 'AOD X\nStep addressing'), c('aod', 'AOD Y\nNonlinear sweep'),
    doe('Eight-beam DOE\nNear AOD exit pupil'), box('Custom KDCM\nChromatic correction'),
    c('lens', 'CL1 cylindrical\n250 mm', { f: 250 }), lens('TL1\nFront plane at CL1'), dmd('DLP6500 spatial mask\nTL1 back focal plane'),
    lens('TL2'), obj('Olympus 100×\nNA 1.4', 1.4, 100), stage('IP-L / IP-Dip\nContinuous Z'),
  ],
  'zhang-2024': [
    aom('AOM writing 0th\nFirst order dumped', true), hwp(), pbs(), expander('Beam expander'), c('slit', 'Iris (2D section)'),
    slm('Hamamatsu LCoS\nInterference-aware CGH'), lens('Relay · 300 mm', 300), lens('Relay · 200 mm', 200),
    galvo('Galvo X'), galvo('Galvo Y'), lens('Relay · 150 mm', 150), lens('Relay · 150 mm', 150), dm(),
    obj('Olympus 60× / NA 1.35\nOil objective', 1.35, 60), stage('SZ2080\nPiezo Z, manual XY'),
  ],
  'kiefer-2024': [
    box('L1 / L2\n1.25× demagnification'), aom('AOM writing +1\n0th order dumped', true),
    box('L3 / L4\n1.60× relay'), doe('7×7 DOE\nSmall angular fan'),
    box('L5 / L6\n3.33× telescope'), lens('L7'), c('microlensarray', 'Aspheric MLA\nRepresentative section', { count: 7 }),
    lens('LG1'), galvo('GX'), box('LG2 / LG3\nUnity relay'), galvo('GY'), box('LG4 / LG5\n2× pupil relay'), c('bs', 'Observation BS'),
    obj('Zeiss 40× / NA 1.4\nOil objective', 1.4, 40), stage('49 foci · 60 µm pitch\nXYZ stage'),
  ],
  'gu-2025': [
    hwp(), pbs(), expander('Beam expander'), pbs(), qwp('QWP1 · double pass'),
    slm('LC-SLM\nPhase to amplitude'), qwp('QWP2'), lens('L1'), c('gascell', 'Vacuum cell\nIntermediate focus'),
    lens('L2'), c('mirror', 'Fold mirror'), c('metalensarray', 'Metalens array\nRepresentative section', { count: 5 }),
    stage('Resist / substrate\nTranslation stage'),
  ],
};

// Auxiliary lines are authored separately from the printing path. Branch
// attachment names are checked by the generator instead of inferred by type.
export const auxiliary = {
  'fischer-2011': { after: 'Beam combination\nplacement inferred', label: 'Depletion path', nodes: [
    c('cwlaser', 'Depletion · 532 nm', { wavelength: 532, enabled: false }),
    c('aom', 'Synchronized AOM\n4 kHz · 3% duty', { modulate: true, modFreqMHz: 0.004, chopDuty: 0.03 }),
    box('Central π phase mask\n50% pupil area'), box('Mask-to-pupil relay'),
  ], incoming: true },
  'gittard-2011': { after: 'XY galvo scanner', label: 'Observation near scanner; illumination below specimen', nodes: [c('camera', 'CMOS'), box('Illumination\nBelow specimen')] },
  'pearre-2018': { after: 'Dichroic', label: 'Imaging return', nodes: [c('pmt', 'PMT')] },
  'geng-2019': { after: 'Dichroic', label: 'Epi illumination and observation', nodes: [c('bs', '50:50 beam splitter'), box('LED illumination'), c('camera', 'CCD')] },
  'hahn-2020': { after: 'Polarizing beam splitter', label: 'Sample return via double-pass QWP', nodes: [box('Return APD'), c('camera', 'Camera'), box('LED above sample') ] },
  'somers-2021': { after: '50:50 camera pickoff', label: 'Observation and alignment', nodes: [c('camera', 'CCD'), c('cwlaser', '633 nm alignment\nVia dichroic', { wavelength: 633, enabled: false })] },
  'ouyang-2023': { after: 'Dichroic', label: 'Observation from substrate illumination', nodes: [lens('L6 · 100 mm', 100), c('camera', 'CCD'), box('589 nm fibre LED\nBelow substrate via M1')] },
  'zhang-2024': { after: 'Dichroic', label: 'In situ observation', nodes: [lens('L5'), c('camera', 'CCD')] },
  'kiefer-2024': { after: 'Observation BS', label: 'Transmission observation', nodes: [lens('L8'), c('camera', 'Camera'), box('LED above specimen')] },
  'gu-2025': { after: 'Resist / substrate\nTranslation stage', label: 'Separate observation objective above substrate', nodes: [obj('Observation objective\nNot writing optic', 0.5, 20, 'air'), c('bs', 'Observation splitter'), lens('L3'), c('camera', 'CMOS'), box('LED illumination')] },
};

// Explicit branch relationships; these are never guessed from the node order.
export const auxiliaryEdges = {
  'fischer-2011': [[0,1],[1,2],[2,3],[3,'root']],
  'gittard-2011': [['root',0],[1,'XYZ positioning\n4×4 Venus example']],
  'pearre-2018': [['root',0]],
  'geng-2019': [['root',0],[1,0],[0,2]],
  'hahn-2020': [['root',0],['Dichroic',1],[2,'Resin\nXY + piezo Z']],
  'somers-2021': [['root',0],[1,'Dichroic']],
  'ouyang-2023': [['root',0],[0,1],[2,'Resin\n6-axis hexapod']],
  'zhang-2024': [['root',0],[0,1]],
  'kiefer-2024': [['root',0],[0,1],[2,'49 foci · 60 µm pitch\nXYZ stage']],
  'gu-2025': [['root',0],[0,1],[1,2],[2,3],[4,1]],
};
