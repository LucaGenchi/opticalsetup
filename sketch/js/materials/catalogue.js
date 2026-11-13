// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The material catalogue: every dispersion fit the app ships, read by the
// canvas (sketch/js/glass.js), the dispersion calculator
// (calculators/dispersion/materials.js) and, through glass.js, the lens
// designer (docs/physics/material-catalogue.md). DOM-free.
//
// Record kinds:
//   isotropic  one dispersion fit
//   uniaxial   an ordinary and an extraordinary fit (principal indices) and
//              the optical sign. The orientation of the optic axis belongs to
//              the element that uses the crystal, not to the record.
// Two kinds are reserved for the steps that need them: `biaxial` (P7) and a
// tabulated complex index (P8). A record may carry a `verdet` block: the
// Verdet constant's model, parameters, sign, wavelength range, temperature
// and reference (see verdetConstant below).
//
// Formula forms, each the source's own, with λ in µm:
//   'sellmeier'  n² − 1 = A + Σ B λ² / (λ² − C)      C in µm²
//   'gas'        n − 1  = Σ B / (C − λ⁻²)             C in µm⁻²
//   'tabulated'  measured (λ in nm, n) pairs, interpolated linearly in λ
//                between them; no extrapolation
// fitIndex() evaluates any of them. The canvas, the dispersion calculator
// and the lens designer evaluate the forms they list with their own code;
// the records added in A3b (calcite, YVO₄, TGG) are not listed by
// any of them yet: they become selectable in P2, P3, P4 and P6.
// `range` is the fit's domain in nm; `indexReference` is what the indices
// are relative to ('air', 'vacuum', or 'unstated' where the source as
// consulted does not say).
//
// Provenance, as the data rule in docs/adding-physics.md asks: every record
// names its dataset and that dataset's licence, its primary reference, and
// the reference's access status (sketch/js/source-access.js). The
// coefficients were compared with the dataset at the commit in
// CATALOGUE_DATASET.comparedAt and agree to round-off; the two fit domains
// that differ from the dataset's are noted on their records.

import { DODGE_HANDBOOK, SCHOTT_DATASHEET_URL, sourceAccess } from '../source-access.js';

export const CATALOGUE_DATASET = Object.freeze({
  id: 'refractiveindex-info',
  name: 'refractiveindex.info database',
  licence: 'CC0-1.0',
  url: 'https://github.com/polyanskiy/refractiveindex.info-database',
  citation: 'M. N. Polyanskiy, “Refractiveindex.info database of optical constants,” Sci. Data 11, 94 (2024)',
  source: 'https://doi.org/10.1038/s41597-023-02898-2',
  comparedAt: Object.freeze({ commit: 'e6d15e364f70de1cad8a96a20f75689f2fba8b21', date: '2026-11-12' }),
});

// Primary references. `source` is the key of sketch/js/source-access.js
// (a doi.org link, a URL, or the description of a printed source); `fit`
// names a separate paper that published the dispersion formula, where the
// measurement and the fit differ.
export const MATERIAL_REFERENCES = Object.freeze({
  schott: {
    citation: 'SCHOTT AG, Optical glass data sheets and Zemax catalogue (2017-01-20)',
    source: SCHOTT_DATASHEET_URL,
  },
  malitson1965: {
    citation: 'I. H. Malitson, “Interspecimen comparison of the refractive index of fused silica,” J. Opt. Soc. Am. 55, 1205–1208 (1965)',
    source: 'https://doi.org/10.1364/JOSA.55.001205',
  },
  malitson1963: {
    citation: 'I. H. Malitson, “A redetermination of some optical properties of calcium fluoride,” Appl. Opt. 2, 1103–1107 (1963)',
    source: 'https://doi.org/10.1364/AO.2.001103',
  },
  malitson1972: {
    citation: 'I. H. Malitson and M. J. Dodge, “Refractive index and birefringence of synthetic sapphire,” J. Opt. Soc. Am. 62, 1405 (1972), an abstract in the program of the 1972 OSA Annual Meeting',
    source: 'https://doi.org/10.1364/JOSA.62.001336',
    fit: { citation: DODGE_HANDBOOK, source: DODGE_HANDBOOK },
  },
  ghosh1999: {
    citation: 'G. Ghosh, “Dispersion-equation coefficients for the refractive index and birefringence of calcite and quartz crystals,” Opt. Commun. 163, 95–102 (1999)',
    source: 'https://doi.org/10.1016/S0030-4018(99)00091-7',
  },
  tamosauskas2018: {
    citation: 'G. Tamošauskas, G. Beresnevičius, D. Gadonas and A. Dubietis, “Transmittance and phase matching of BBO crystal in the 3−5 μm range and its application for the characterization of mid-infrared laser pulses,” Opt. Mater. Express 8, 1410–1418 (2018)',
    source: 'https://doi.org/10.1364/OME.8.001410',
  },
  zelmon1998: {
    citation: 'D. E. Zelmon, D. L. Small and R. Page, “Refractive-index measurements of undoped yttrium aluminum garnet from 0.4 to 5.0 μm,” Appl. Opt. 37, 4933–4935 (1998)',
    source: 'https://doi.org/10.1364/AO.37.004933',
  },
  connolly1979: {
    citation: 'J. Connolly, B. diBenedetto and R. Donadio, “Specifications of Raytran material,” Proc. SPIE 181, 141–144 (1979)',
    source: 'https://doi.org/10.1117/12.957359',
    fit: { citation: 'B. Tatian, “Fitting refractive-index data with the Sellmeier dispersion formula,” Appl. Opt. 23, 4477–4485 (1984)', source: 'https://doi.org/10.1364/AO.23.004477' },
  },
  salzberg1957: {
    citation: 'C. D. Salzberg and J. J. Villa, “Infrared refractive indexes of silicon, germanium and modified selenium glass,” J. Opt. Soc. Am. 47, 244–246 (1957)',
    source: 'https://doi.org/10.1364/JOSA.47.000244',
    fit: { citation: 'B. Tatian, “Fitting refractive-index data with the Sellmeier dispersion formula,” Appl. Opt. 23, 4477–4485 (1984)', source: 'https://doi.org/10.1364/AO.23.004477' },
  },
  daimon2007: {
    citation: 'M. Daimon and A. Masumura, “Measurement of the refractive index of distilled water from the near-infrared region to the ultraviolet region,” Appl. Opt. 46, 3811–3820 (2007)',
    source: 'https://doi.org/10.1364/AO.46.003811',
  },
  lomheim1978: {
    citation: 'T. S. Lomheim and L. G. DeShazer, “Optical-absorption intensities of trivalent neodymium in the uniaxial crystal yttrium orthovanadate,” J. Appl. Phys. 49, 5517–5522 (1978), Eqs. (20) and (21)',
    source: 'https://doi.org/10.1063/1.324471',
    note: 'The fit is to indices measured from 0.488 to 3.39 µm and reported in M. Birnbaum and L. G. DeShazer, NASA contract NAS 5-22387, final technical report (1976), unpublished. The paper tabulates no indices.',
  },
  schlarb1994: {
    citation: 'U. Schlarb and B. Sugg, “Refractive index of terbium gallium garnet,” Phys. Status Solidi B 182, K91–K93 (1994)',
    source: 'https://doi.org/10.1002/pssb.2221820238',
  },
  ciddor1996: {
    citation: 'P. E. Ciddor, “Refractive index of air: new equations for the visible and near infrared,” Appl. Opt. 35, 1566–1573 (1996)',
    source: 'https://doi.org/10.1364/AO.35.001566',
  },
});

// The Verdet data and the open compilation they reach the app through.
export const VERDET_DATASETS = Object.freeze({
  vojna2019: {
    name: 'D. Vojna, O. Slezák, A. Lucianetti and T. Mocek, “Verdet constant of magneto-active materials developed for high-power Faraday devices,” Appl. Sci. 9, 3160 (2019), Table 2',
    licence: 'CC-BY-4.0',
    source: 'https://doi.org/10.3390/app9153160',
  },
});

export const VERDET_REFERENCES = Object.freeze({
  slezak2016: {
    citation: 'O. Slezák, R. Yasuhara, A. Lucianetti and T. Mocek, “Temperature-wavelength dependence of terbium gallium garnet ceramics Verdet constant,” Opt. Mater. Express 6, 3683–3691 (2016), Table 2, sample NG6',
    source: 'https://doi.org/10.1364/OME.6.003683',
  },
});

const SCHOTT_CONDITIONS = '20 °C; index relative to air';

const schottGlass = (id, label, B, C, range, datasetRecord, extra = {}) => ({
  id, kind: 'isotropic', group: 'glass', canvas: true, label, form: 'sellmeier', A: 0,
  terms: B.map((b, i) => [b, C[i]]), range, conditions: SCHOTT_CONDITIONS, indexReference: 'air',
  reference: 'schott', datasetRecord, ...extra,
});

// In the canvas's order: the glass menus list them as here.
const RECORDS = [
  schottGlass('nbk7', 'N-BK7 crown (nd 1.517 / V 64.2)',
    [1.03961212, 0.231792344, 1.01046945], [0.00600069867, 0.0200179144, 103.560653],
    [300, 2500], 'specs/schott/optical/N-BK7.yml'),
  {
    id: 'silica', kind: 'isotropic', group: 'glass', canvas: true, label: 'Fused silica (nd 1.459 / V 67.8)',
    form: 'sellmeier', A: 0,
    terms: [[0.6961663, 0.0684043 ** 2], [0.4079426, 0.1162414 ** 2], [0.8974794, 9.896161 ** 2]],
    range: [210, 3710], conditions: '20 °C', indexReference: 'unstated',
    reference: 'malitson1965', datasetRecord: 'main/SiO2/nk/Malitson.yml',
    rangeNote: 'The dataset gives 210–6700 nm, citing a later check of the formula up to 6.7 µm; the record keeps 210–3710 nm, the range Malitson measured.',
  },
  {
    // Malitson, Appl. Opt. 2, 1103 (1963), 24 °C.
    id: 'caf2', kind: 'isotropic', group: 'crystal', canvas: true, label: 'Calcium fluoride, CaF₂ (nd 1.434 / V 95.0)',
    dispersionLabel: 'Calcium fluoride, CaF₂', form: 'sellmeier', A: 0,
    terms: [[0.5675888, 0.050263605 ** 2], [0.4710914, 0.1003909 ** 2], [3.8484723, 34.649040 ** 2]],
    range: [230, 9700], conditions: '24 °C', indexReference: 'unstated',
    reference: 'malitson1963', datasetRecord: 'main/CaF2/nk/Malitson.yml',
  },
  schottGlass('nfk51a', 'N-FK51A fluorite crown (nd 1.487 / V 84.5)',
    [0.971247817, 0.216901417, 0.904651666], [0.00472301995, 0.0153575612, 168.68133],
    [290, 2500], 'specs/schott/optical/N-FK51A.yml'),
  schottGlass('nsk16', 'N-SK16 dense crown (nd 1.620 / V 60.3)',
    [1.34317774, 0.241144399, 0.994317969], [0.00704687339, 0.0229005, 92.7508526],
    [310, 2500], 'specs/schott/optical/N-SK16.yml'),
  schottGlass('f2', 'F2 flint (nd 1.620 / V 36.4)',
    [1.34533359, 0.209073176, 0.937357162], [0.00997743871, 0.0470450767, 111.886764],
    [320, 2500], 'specs/schott/optical/F2.yml'),
  schottGlass('nsf5', 'N-SF5 flint (nd 1.673 / V 32.3)',
    [1.52481889, 0.187085527, 1.42729015], [0.011254756, 0.0588995392, 129.141675],
    [380, 2500], 'specs/schott/optical/N-SF5.yml',
    { rangeNote: 'The dataset gives 370–2500 nm; the record keeps the narrower 380–2500 nm it has always used.' }),
  schottGlass('nsf10', 'N-SF10 dense flint (nd 1.728 / V 28.5)',
    [1.62153902, 0.256287842, 1.64447552], [0.0122241457, 0.0595736775, 147.468793],
    [380, 2500], 'specs/schott/optical/N-SF10.yml'),
  schottGlass('nsf11', 'N-SF11 dense flint (nd 1.785 / V 25.7)',
    [1.73759695, 0.313747346, 1.89878101], [0.013188707, 0.0623068142, 155.23629],
    [370, 2500], 'specs/schott/optical/N-SF11.yml'),
  schottGlass('nsf14', 'N-SF14 dense flint (nd 1.762 / V 26.5)',
    [1.69022361, 0.288870052, 1.7045187], [0.0130512113, 0.061369188, 149.517689],
    [365, 2500], 'specs/schott/optical/N-SF14.yml'),
  schottGlass('nsf57', 'N-SF57 dense flint (nd 1.847 / V 23.8)',
    [1.87543831, 0.37375749, 2.30001797], [0.0141749518, 0.0640509927, 177.389795],
    [370, 2500], 'specs/schott/optical/N-SF57.yml'),
  schottGlass('nlasf9', 'N-LASF9 lanthanum dense flint (nd 1.850 / V 32.2)',
    [2.00029547, 0.298926886, 1.80691843], [0.0121426017, 0.0538736236, 156.530829],
    [365, 2500], 'specs/schott/optical/N-LASF9.yml'),

  {
    id: 'sapphire', kind: 'uniaxial', group: 'crystal', label: 'Sapphire, Al₂O₃', opticalSign: 'negative',
    reference: 'malitson1972',
    ordinary: {
      form: 'sellmeier', A: 0,
      terms: [[1.4313493, 0.0726631 ** 2], [0.65054713, 0.1193242 ** 2], [5.3414021, 18.028251 ** 2]],
      range: [200, 5000], conditions: '20 °C; ordinary ray (E ⟂ c axis)', indexReference: 'unstated',
      datasetRecord: 'main/Al2O3/nk/Malitson-o.yml',
    },
    extraordinary: {
      form: 'sellmeier', A: 0,
      terms: [[1.5039759, 0.0740288 ** 2], [0.55069141, 0.1216529 ** 2], [6.5927379, 20.072248 ** 2]],
      range: [200, 5000], conditions: '20 °C; extraordinary ray (E ∥ c axis)', indexReference: 'unstated',
      datasetRecord: 'main/Al2O3/nk/Malitson-e.yml',
    },
  },
  {
    id: 'quartz', kind: 'uniaxial', group: 'crystal', label: 'Crystalline quartz, SiO₂', opticalSign: 'positive',
    reference: 'ghosh1999',
    ordinary: {
      form: 'sellmeier', A: 0.28604141, terms: [[1.07044083, 1.00585997e-2], [1.10202242, 100]],
      range: [198, 2053.1], conditions: 'room temperature; ordinary ray', indexReference: 'unstated',
      datasetRecord: 'main/SiO2/nk/Ghosh-o.yml',
    },
    extraordinary: {
      form: 'sellmeier', A: 0.28851804, terms: [[1.09509924, 1.02101864e-2], [1.15662475, 100]],
      range: [198, 2053.1], conditions: 'room temperature; extraordinary ray (E ∥ optic axis)', indexReference: 'unstated',
      datasetRecord: 'main/SiO2/nk/Ghosh-e.yml',
    },
  },
  {
    id: 'bbo', kind: 'uniaxial', group: 'crystal', label: 'β-barium borate, BBO', opticalSign: 'negative',
    reference: 'tamosauskas2018',
    ordinary: {
      form: 'sellmeier', A: 0, terms: [[0.90291, 0.003926], [0.83155, 0.018786], [0.76536, 60.01]],
      range: [188, 5200], conditions: 'room temperature; ordinary ray', indexReference: 'unstated',
      datasetRecord: 'main/BaB2O4/nk/Tamosauskas-o.yml',
    },
    extraordinary: {
      form: 'sellmeier', A: 0, terms: [[1.151075, 0.007142], [0.21803, 0.02259], [0.656, 263]],
      range: [188, 5200], conditions: 'room temperature; extraordinary ray (E ∥ optic axis)', indexReference: 'unstated',
      datasetRecord: 'main/BaB2O4/nk/Tamosauskas-e.yml',
    },
  },
  {
    id: 'calcite', kind: 'uniaxial', group: 'crystal', label: 'Calcite, CaCO₃', opticalSign: 'negative',
    reference: 'ghosh1999',
    ordinary: {
      form: 'sellmeier', A: 0.73358749, terms: [[0.96464345, 1.94325203e-2], [1.82831454, 120]],
      range: [204, 2172], conditions: 'room temperature; ordinary ray', indexReference: 'unstated',
      datasetRecord: 'main/CaCO3/nk/Ghosh-o.yml',
    },
    extraordinary: {
      form: 'sellmeier', A: 0.35859695, terms: [[0.82427830, 1.06689543e-2], [0.14429128, 120]],
      range: [204, 2172], conditions: 'room temperature; extraordinary ray (E ∥ optic axis)', indexReference: 'unstated',
      datasetRecord: 'main/CaCO3/nk/Ghosh-e.yml',
    },
    accuracyNote: 'Ghosh fits handbook data with an RMS deviation of 0.0003 (ordinary) and 0.0004 (extraordinary); from about 1.16 µm the extraordinary fit exceeds the measured index, by up to 0.0013 at 2.1 µm.',
  },
  {
    id: 'yvo4', kind: 'uniaxial', group: 'crystal', label: 'Yttrium orthovanadate, YVO₄', opticalSign: 'positive',
    reference: 'lomheim1978',
    ordinary: {
      form: 'sellmeier', A: 0, terms: [[2.7665, 0.026884]],
      range: [488, 3390], conditions: 'room temperature; ordinary ray (σ)', indexReference: 'unstated',
      datasetRecord: 'main/YVO4/nk/Birnbaum-o.yml',
    },
    extraordinary: {
      form: 'sellmeier', A: 0, terms: [[3.5930, 0.032103]],
      range: [488, 3390], conditions: 'room temperature; extraordinary ray (π, E ∥ optic axis)', indexReference: 'unstated',
      datasetRecord: 'main/YVO4/nk/Birnbaum-e.yml',
    },
    accuracyNote: 'A one-term fit per ray; the source states no residual and tabulates no indices.',
  },
  {
    id: 'tgg', kind: 'isotropic', group: 'crystal', label: 'Terbium gallium garnet, TGG',
    form: 'tabulated',
    points: [[404.66, 2.0178], [435.83, 2.0057], [546.07, 1.9765], [633.00, 1.9656], [1079.81, 1.9434],
      [1084.45, 1.9432], [1140.91, 1.9420], [1152.28, 1.9421], [1176.68, 1.9415]],
    range: [404.66, 1176.68], conditions: '20 °C; single crystal; interferometric measurement', indexReference: 'unstated',
    reference: 'schlarb1994', datasetRecord: 'main/Tb3Ga5O12/nk/Schlarb.yml',
    accuracyNote: 'Nine measured indices quoted to four decimals; between them the index is interpolated linearly, which is not a dispersion model.',
    verdet: {
      model: 'single-transition',
      // |V(λ)| = F λ0² / (λ² − λ0²) + G (Vojna et al., Eq. 13); the sign below applies to the whole.
      F: 820.3, G: -6.2, lambda0Nm: 239.3, unit: 'rad/(T·m)', sign: -1,
      range: [500, 1100], temperatureK: 295,
      dataset: 'vojna2019', reference: 'slezak2016',
      sample: 'single crystal, sample NG6 (Northrop-Grumman, 6 mm)',
      conditions: 'Room temperature. Vojna et al. tabulate F and G for TGG from Slezák et al., Table 2, sample NG6; those values follow from that table at 295 K with T_w = +5.9 K as printed there, although the text of Slezák et al. describes T_w as negative, an inconsistency that matters for any later temperature dependence.',
      signConvention: 'Negative, as Slezák et al. state for TGG. Vojna et al.: the Verdet constant is negative if the medium rotates the polarization clockwise when the beam propagates parallel to the magnetic field; the viewing direction is not stated, and step A2 fixes the app\'s.',
      spreadNote: 'Slezák et al. measured six TGG samples: at room temperature |V| ranged from 122.4 to 155.5 rad/(T·m) at 632 nm and from 36.6 to 44.2 rad/(T·m) at 1064 nm. This record is sample NG6, near the low end (131.1 and 37.5 rad/(T·m)): the other samples read from 6.6 % below to 18.6 % above it at 632 nm, and from 2.4 % below to 17.9 % above it at 1064 nm.',
    },
  },
  {
    id: 'yag', kind: 'isotropic', group: 'crystal', label: 'Yttrium aluminium garnet, YAG (undoped)',
    form: 'sellmeier', A: 0, terms: [[2.282, 0.01185], [3.27644, 282.734]],
    range: [400, 5000], conditions: 'room temperature', indexReference: 'unstated',
    reference: 'zelmon1998', datasetRecord: 'main/Y3Al5O12/nk/Zelmon.yml',
  },
  {
    id: 'znse', kind: 'isotropic', group: 'crystal', label: 'Zinc selenide, ZnSe (CVD)',
    form: 'sellmeier', A: 0,
    terms: [[4.45813734, 0.200859853 ** 2], [0.467216334, 0.391371166 ** 2], [2.89566290, 47.1362108 ** 2]],
    range: [540, 18200], conditions: '23 °C', indexReference: 'unstated',
    reference: 'connolly1979', datasetRecord: 'main/ZnSe/nk/Connolly.yml',
  },
  {
    id: 'si', kind: 'isotropic', group: 'crystal', label: 'Silicon, Si',
    form: 'sellmeier', A: 0,
    terms: [[10.6684293, 0.301516485 ** 2], [0.0030434748, 1.13475115 ** 2], [1.54133408, 1104 ** 2]],
    range: [1357, 11040], conditions: '26 °C; purity not stated by the source', indexReference: 'unstated',
    reference: 'salzberg1957', datasetRecord: 'main/Si/nk/Salzberg.yml',
  },
  {
    id: 'water', kind: 'isotropic', group: 'fluid', label: 'Water, H₂O (distilled)',
    form: 'sellmeier', A: 0,
    terms: [[5.684027565e-1, 5.101829712e-3], [1.726177391e-1, 1.821153936e-2], [2.086189578e-2, 2.620722293e-2], [1.130748688e-1, 1.069792721e1]],
    range: [182, 1129], conditions: '20.0 °C; absolute index', indexReference: 'vacuum',
    reference: 'daimon2007', datasetRecord: 'main/H2O/nk/Daimon-20.0C.yml',
  },
  {
    id: 'air', kind: 'isotropic', group: 'fluid', label: 'Air (standard, dry)',
    form: 'gas', terms: [[0.05792105, 238.0185], [0.00167917, 57.362]],
    range: [230, 1690], conditions: '15 °C, 101.325 kPa, dry, 450 ppm CO₂; absolute index', indexReference: 'vacuum',
    reference: 'ciddor1996', datasetRecord: 'other/mixed gases/air/nk/Ciddor.yml',
  },
];

const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const MATERIAL_RECORDS = freeze(new Map(RECORDS.map(record => [record.id, record])));

// The isotropic glasses the canvas's glass elements offer, in menu order. A
// glass element traces one index, so it never lists a uniaxial record.
export const canvasGlassRecords = () => RECORDS.filter(record => record.canvas && record.kind === 'isotropic');

// The principal fits of a record: one for an isotropic record, the ordinary
// and the extraordinary for a uniaxial one.
export function principalFits(record) {
  if (record.kind === 'isotropic') return [{ ray: null, fit: record }];
  if (record.kind === 'uniaxial') return [{ ray: 'ordinary', fit: record.ordinary }, { ray: 'extraordinary', fit: record.extraordinary }];
  return [];
}

// What the data rule asks each record to state, gathered in one place.
export function materialProvenance(record) {
  const reference = MATERIAL_REFERENCES[record.reference] ?? null;
  return {
    dataset: CATALOGUE_DATASET.name,
    licence: CATALOGUE_DATASET.licence,
    datasetRecords: principalFits(record).map(({ fit }) => fit.datasetRecord),
    reference: reference?.citation ?? null,
    access: reference ? sourceAccess(reference.source) : null,
    fit: reference?.fit ? { reference: reference.fit.citation, access: sourceAccess(reference.fit.source) } : null,
    ranges: principalFits(record).map(({ fit }) => fit.range),
    conditions: principalFits(record).map(({ fit }) => fit.conditions),
  };
}

// The index of one fit at a vacuum wavelength in nm, or null outside the
// fit's domain or for an unknown form.
export function fitIndex(fit, wavelengthNm) {
  const nm = Number(wavelengthNm);
  if (!fit || !Number.isFinite(nm) || nm < fit.range[0] || nm > fit.range[1]) return null;
  if (fit.form === 'tabulated') {
    const points = fit.points;
    for (let i = 1; i < points.length; i++) {
      const [x1, n1] = points[i - 1], [x2, n2] = points[i];
      if (nm <= x2) return n1 + (n2 - n1) * (nm - x1) / (x2 - x1);
    }
    return null;
  }
  const um = nm / 1000, l2 = um * um;
  if (fit.form === 'gas') {
    let n = 1;
    for (const [B, C] of fit.terms) n += B / (C - 1 / l2);
    return Number.isFinite(n) ? n : null;
  }
  if (fit.form === 'sellmeier') {
    let n2 = 1 + (fit.A || 0);
    for (const [B, C] of fit.terms) n2 += B * l2 / (l2 - C);
    return n2 > 0 && Number.isFinite(n2) ? Math.sqrt(n2) : null;
  }
  return null;
}

// The signed Verdet constant of a record at a vacuum wavelength in nm, in
// rad/(T·m), or null when the record has none or the wavelength is outside
// the range its source measured.
export function verdetConstant(record, wavelengthNm) {
  const v = record?.verdet;
  const nm = Number(wavelengthNm);
  if (!v || !Number.isFinite(nm) || nm < v.range[0] || nm > v.range[1]) return null;
  if (v.model !== 'single-transition') return null;
  const l0 = v.lambda0Nm * v.lambda0Nm;
  const magnitude = v.F * l0 / (nm * nm - l0) + v.G;
  return Number.isFinite(magnitude) ? v.sign * magnitude : null;
}
