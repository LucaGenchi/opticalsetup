// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Raman reference spectra for the coherent Raman calculator:
//
//   node tools/build-raman-spectra.mjs <download-dir>
//
// Reads the unmodified source files from <download-dir>, laid out as
//
//   flanagan2025/raman_spectra_api_compounds.csv     figshare 10.6084/m9.figshare.27931131
//   berzins2020/FT-Raman_spc/<group>/<file>.spc      Zenodo 10.5281/zenodo.3614035, FT-Raman_spc_file_format.zip
//   rod/<id>.rod                                     https://solsa.crystallography.net/rod/<id>.rod
//
// and writes calculators/coherent-raman/spectra/<id>.json (one spectrum
// each, fetched by the page on demand) and spectra-index.js (the list the
// page and the tests read). The outputs are committed; CI does not
// re-download. Every source here is CC BY 4.0 or CC0, which the GPL allows
// us to ship with attribution; each output file names its source, licence
// and the changes made, as CC BY requires. The SHA-256 of every input file
// is recorded in the index so a rebuild can be checked against the same
// inputs.
//
// Processing, identical for every source and stated on the page: replicate
// spectra are averaged; the spectrum is cropped to the source's usable range
// and averaged into 2 cm⁻¹ bins (linear interpolation where a source is
// sparser); a straight baseline through the medians of the first and last
// 10 cm⁻¹ is subtracted, the two-point baseline the solvent dataset's
// authors recommend; the result is min–max scaled to 0–1 and stored as
// integers 0–1000.

import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'calculators', 'coherent-raman');
const STEP_CM = 2;

const SOURCES = {
  flanagan2025: {
    short: 'Flanagan & Glavin, Sci. Data 12, 498 (2025)',
    citation: 'A. R. Flanagan and F. G. Glavin, “Open-source Raman spectra of chemical compounds for active pharmaceutical ingredient development,” Sci. Data 12, 498 (2025)',
    paper: 'https://doi.org/10.1038/s41597-025-04848-6',
    data: 'https://doi.org/10.6084/m9.figshare.27931131',
    license: 'CC-BY-4.0',
    technique: 'spontaneous',
    measurement: 'Spontaneous Raman, 785 nm excitation (Kaiser Raman Rxn2), about 1 cm⁻¹ resolution; neat liquids at room temperature',
    // The authors recommend cropping at 3150 cm⁻¹.
    rangeCm: [150, 3150],
  },
  berzins2020: {
    short: 'Bērziņš et al., Vib. Spectrosc. 107, 103021 (2020)',
    citation: 'K. Bērziņš, R. E. Sales, J. E. Barnsley, G. Walker, S. J. Fraser-Miller and K. C. Gordon, “Low-wavenumber Raman spectral database of pharmaceutical excipients,” Vib. Spectrosc. 107, 103021 (2020); reference data on Zenodo',
    paper: 'https://doi.org/10.1016/j.vibspec.2020.103021',
    data: 'https://doi.org/10.5281/zenodo.3614035',
    license: 'CC-BY-4.0',
    technique: 'ft-raman',
    // Neutral on purpose: the excipients include liquids (propylene glycol,
    // triacetin, dibutyl sebacate), and the article's methods, which give the
    // instrument, excitation and sample handling, are not open access.
    measurement: 'FT-Raman spectrum of the excipient as supplied; instrument, excitation and sample handling are described in the source article',
    rangeCm: [210, 3500],
  },
  rod: {
    short: 'Raman Open Database',
    citation: 'Raman Open Database: Y. El Mendili et al., “Raman Open Database: first interconnected Raman–X-ray diffraction open-access resource for material identification,” J. Appl. Cryst. 52, 618–625 (2019)',
    paper: 'https://doi.org/10.1107/S1600576719004229',
    data: 'https://solsa.crystallography.net/rod/',
    license: 'CC0-1.0',
    technique: 'spontaneous',
    // Per entry: excitation, instrument and resolution come from the file.
    measurement: null,
    rangeCm: [100, Infinity],
  },
};

const LICENSES = {
  'CC-BY-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'CC0-1.0': { name: 'CC0 1.0 (public domain)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
};

// How each spectrum was measured, shown on the page so that a future
// stimulated Raman (SRS) spectrum, proportional to the spontaneous one but
// a different measurement, is never mistaken for one.
const TECHNIQUES = { spontaneous: 'Spontaneous Raman', 'ft-raman': 'FT-Raman (spontaneous, Fourier-transform)', srs: 'Stimulated Raman scattering (SRS)' };

// Categories, in the order the page lists them.
const C = {
  alcohols: 'Alcohols and glycols', carbonyl: 'Ketones, esters and ethers', hydrocarbons: 'Hydrocarbons',
  aromatics: 'Aromatic compounds', halogenated: 'Halogenated solvents', aprotic: 'Polar aprotic solvents',
  acidsAmines: 'Acids, amines and salts', amino: 'Amino acids and proteins', sugars: 'Sugars and polyols',
  polysaccharides: 'Polysaccharides', polymers: 'Synthetic polymers', minerals: 'Minerals and inorganic solids',
};

const E = (id, name, category, source, select) => ({ id, name, category, source, select });
const F = 'FT-Raman_spc';
const ENTRIES = [
  // Flanagan and Glavin 2025, by the dataset's own labels. "Methyl Isobutyl
  // Ketone" is the same compound as 4-methyl-2-pentanone and is left out.
  E('methanol', 'Methanol', C.alcohols, 'flanagan2025', 'Methanol'),
  E('ethanol', 'Ethanol', C.alcohols, 'flanagan2025', 'Ethanol'),
  E('2-propanol', '2-Propanol (isopropanol)', C.alcohols, 'flanagan2025', '2 - Propanol'),
  E('tert-butanol', 'tert-Butanol', C.alcohols, 'flanagan2025', 'Tert-butanol'),
  E('ethylene-glycol', 'Ethylene glycol', C.alcohols, 'flanagan2025', 'Ethylene Glycol'),
  E('diethylene-glycol', 'Diethylene glycol', C.alcohols, 'flanagan2025', 'Diethylene Glycol'),
  E('acetone', 'Acetone', C.carbonyl, 'flanagan2025', 'Acetone'),
  E('mibk', '4-Methyl-2-pentanone (MIBK)', C.carbonyl, 'flanagan2025', '4-Methyl-2-pentanone'),
  E('ethyl-acetate', 'Ethyl acetate', C.carbonyl, 'flanagan2025', 'Ethyl Acetate'),
  E('propyl-acetate', 'Propyl acetate', C.carbonyl, 'flanagan2025', 'Propyl acetate'),
  E('butyl-acetate', 'Butyl acetate', C.carbonyl, 'flanagan2025', 'Butyl Acetate'),
  E('diethyl-malonate', 'Diethyl malonate', C.carbonyl, 'flanagan2025', 'Diethyl Malonate'),
  E('thf', 'Tetrahydrofuran (THF)', C.carbonyl, 'flanagan2025', 'Tetrahydrofuran'),
  E('mtbe', 'tert-Butyl methyl ether (MTBE)', C.carbonyl, 'flanagan2025', 'Tert-butyl methyl ether'),
  E('dimethoxypropane', '2,2-Dimethoxypropane', C.carbonyl, 'flanagan2025', '2, 2 - Dimethoxy Propane'),
  E('n-hexane', 'n-Hexane', C.hydrocarbons, 'flanagan2025', 'n-Hexane'),
  E('n-heptane', 'n-Heptane', C.hydrocarbons, 'flanagan2025', 'n-Heptane'),
  E('cyclohexane', 'Cyclohexane', C.hydrocarbons, 'flanagan2025', 'Cyclohexane'),
  E('toluene', 'Toluene', C.aromatics, 'flanagan2025', 'Toluene'),
  E('benzaldehyde', 'Benzaldehyde', C.aromatics, 'flanagan2025', 'Benzaldehyde'),
  E('benzyl-bromide', 'Benzyl bromide', C.aromatics, 'flanagan2025', 'Benzyl bromide'),
  E('chloroform', 'Chloroform', C.halogenated, 'flanagan2025', 'Chloroform'),
  E('dichloromethane', 'Dichloromethane', C.halogenated, 'flanagan2025', 'Dichloromethane'),
  E('dmso', 'Dimethyl sulfoxide (DMSO)', C.aprotic, 'flanagan2025', 'Dimethyl Sulfoxide'),
  E('dmf', 'N,N-Dimethylformamide (DMF)', C.aprotic, 'flanagan2025', 'N,N - Dimethylformahide'),
  E('acetonitrile', 'Acetonitrile', C.aprotic, 'flanagan2025', 'Acetonitrile'),
  E('dmi', '1,3-Dimethyl-2-imidazolidinone', C.aprotic, 'flanagan2025', '1,3-Dimethyl-2-imidazolidinone'),
  E('acetic-acid', 'Acetic acid (glacial)', C.acidsAmines, 'flanagan2025', 'Acetic acid'),
  E('formic-acid', 'Formic acid', C.acidsAmines, 'flanagan2025', 'Formic acid'),
  E('diethylamine', 'Diethylamine', C.acidsAmines, 'flanagan2025', 'Diethylamine'),
  E('isobutylamine', 'Isobutylamine', C.acidsAmines, 'flanagan2025', 'Isobutylamine'),
  // Bērziņš et al. 2020: one spectrum per substance; repeated grades and
  // suppliers of the same substance, and inorganic solids that the Raman
  // Open Database also covers, are left out.
  E('propylene-glycol', 'Propylene glycol', C.alcohols, 'berzins2020', `${F}/4_Monomeric polyols/25_alpha_propylene_glycol_PSM_FT-Raman.spc`),
  E('dibutyl-sebacate', 'Dibutyl sebacate', C.carbonyl, 'berzins2020', `${F}/5_Esters/30_dibutyl_sebacate_Aldrich_FT-Raman.spc`),
  E('triacetin', 'Triacetin', C.carbonyl, 'berzins2020', `${F}/5_Esters/31_triacetin_Merck_FT-Raman.spc`),
  E('citric-acid', 'Citric acid', C.acidsAmines, 'berzins2020', `${F}/7_Organosulfates carboxylic acids_salts/44_citric_acid_Sigma-Aldrich_FT-Raman.spc`),
  E('sodium-benzoate', 'Sodium benzoate', C.acidsAmines, 'berzins2020', `${F}/7_Organosulfates carboxylic acids_salts/45_sodium_benzoate_MB_FT-Raman.spc`),
  E('sodium-acetate', 'Sodium acetate', C.acidsAmines, 'berzins2020', `${F}/7_Organosulfates carboxylic acids_salts/47_sodium_acetate_Univar_FT-Raman.spc`),
  E('sds', 'Sodium dodecyl sulfate (SDS)', C.acidsAmines, 'berzins2020', `${F}/7_Organosulfates carboxylic acids_salts/42_sodium_dodecyl_sulfate_Sigma_FT-Raman.spc`),
  E('magnesium-stearate', 'Magnesium stearate', C.acidsAmines, 'berzins2020', `${F}/7_Organosulfates carboxylic acids_salts/46_magnesium_stearate_BDH_FT-Raman.spc`),
  E('l-tryptophan', 'L-Tryptophan', C.amino, 'berzins2020', `${F}/1_Amino acids/1_L-tryptophan_BDH_FT-Raman.spc`),
  E('l-cysteine', 'L-Cysteine', C.amino, 'berzins2020', `${F}/1_Amino acids/3_L-cysteine_Fluka_FT-Raman.spc`),
  E('l-glutamic-acid', 'L-Glutamic acid', C.amino, 'berzins2020', `${F}/1_Amino acids/4_L-glutamic_acid_Sigma_FT-Raman.spc`),
  E('l-glutamine', 'L-Glutamine', C.amino, 'berzins2020', `${F}/1_Amino acids/6_L-glutamine_BDH_FT-Raman.spc`),
  E('glycine', 'Glycine (α form)', C.amino, 'berzins2020', `${F}/1_Amino acids/7_glycine_alpha_form_BDH_FT-Raman.spc`),
  E('gelatin', 'Gelatin (type A, porcine skin)', C.amino, 'berzins2020', `${F}/8_Protein/49_gelatin_typeA_porcine_skin_Sigma_FT-Raman.spc`),
  E('casein', 'Casein (sodium salt, bovine milk)', C.amino, 'berzins2020', `${F}/8_Protein/51_casein_sodium_salt_from_bovine_milk_Sigma_FT-Raman.spc`),
  E('zein', 'Zein', C.amino, 'berzins2020', `${F}/8_Protein/48_zein_Sigma_FT-Raman.spc`),
  E('glucose', 'Glucose monohydrate', C.sugars, 'berzins2020', `${F}/2_Mono and disaccharides/10_glucose_monohydrate_Analar_FT-Raman.spc`),
  E('sucrose', 'Sucrose', C.sugars, 'berzins2020', `${F}/2_Mono and disaccharides/8_sucrose_BDH_FT-Raman.spc`),
  E('lactose', 'Lactose monohydrate', C.sugars, 'berzins2020', `${F}/2_Mono and disaccharides/9_lactose_monohydrate_Unilab_FT-Raman.spc`),
  E('trehalose', 'Trehalose dihydrate', C.sugars, 'berzins2020', `${F}/2_Mono and disaccharides/12_trehalose_dihydrate_Sigma_FT-Raman.spc`),
  E('mannitol', 'Mannitol', C.sugars, 'berzins2020', `${F}/4_Monomeric polyols/27_mannitol_MB_FT-Raman.spc`),
  E('sorbitol', 'D-Sorbitol', C.sugars, 'berzins2020', `${F}/4_Monomeric polyols/29_D-sorbitol_Sigma_FT-Raman.spc`),
  E('xylitol', 'Xylitol', C.sugars, 'berzins2020', `${F}/4_Monomeric polyols/28_xylitol_BDH_FT-Raman.spc`),
  E('starch', 'Starch', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/21_starch_Prolabo_FT-Raman.spc`),
  E('dextran', 'Dextran', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/20_dextran_Sigma_FT-Raman.spc`),
  E('methylcellulose', 'Methylcellulose', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/17_methylcellulose_ABM_FT-Raman.spc`),
  E('hpmc', 'Hydroxypropyl methylcellulose', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/16_hydroxypropyl_methylcellulose_DOW_FT-Raman.spc`),
  E('cmc', 'Carboxymethyl cellulose, sodium salt', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/19_carboxymethyl_cellulose_sodium_salt_low_viscosity_BDH_FT-Raman.spc`),
  E('cellulose-acetate-phthalate', 'Cellulose acetate phthalate', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/15_celullose_acetate_phthalate_Fluka_FT-Raman.spc`),
  E('alginic-acid', 'Alginic acid', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/22_alginic_acid_Aldrich_FT-Raman.spc`),
  E('carrageenan', 'Carrageenan', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/13_carrageenan_Sigma_FT-Raman.spc`),
  E('chitosan', 'Chitosan', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/23_chitosan_Aldrich_FT-Raman.spc`),
  E('tragacanth', 'Tragacanth', C.polysaccharides, 'berzins2020', `${F}/3_Polysaccharides/24_tragacanth_Merck_FT-Raman.spc`),
  E('pvp', 'Polyvinylpyrrolidone (PVP)', C.polymers, 'berzins2020', `${F}/9_Polymers/56_polyvinylpyrrolidone_BDH_FT-Raman.spc`),
  E('pvp-va', 'Vinylpyrrolidone–vinyl acetate copolymer (Kollidon VA 64)', C.polymers, 'berzins2020', `${F}/10_Others/74_Kollidon VA 64_BASF_FT-Raman.spc`),
  E('pva', 'Poly(vinyl alcohol), 99 % hydrolyzed', C.polymers, 'berzins2020', `${F}/9_Polymers/61_poly_vinyl_alcohol_99pr_hydrolyzed_Aldrich_FT-Raman.spc`),
  E('peg', 'Polyethylene glycol 6000', C.polymers, 'berzins2020', `${F}/9_Polymers/65_polyethylene_glycol_6000_BDH_FT-Raman.spc`),
  E('pcl', 'Polycaprolactone', C.polymers, 'berzins2020', `${F}/9_Polymers/63_polycaprolactone_Aldrich_FT-Raman.spc`),
  E('eudragit-l100', 'Methacrylic acid copolymer (EUDRAGIT L 100)', C.polymers, 'berzins2020', `${F}/9_Polymers/69_EUDRAGIT_L_100_Evonik_FT-Raman.spc`),
  E('soluplus', 'Polyvinyl caprolactam–polyvinyl acetate–PEG graft copolymer (Soluplus)', C.polymers, 'berzins2020', `${F}/10_Others/72_soluplus_BASF_FT-Raman.spc`),
  E('eva', 'Poly(ethylene-co-vinyl acetate)', C.polymers, 'berzins2020', `${F}/10_Others/73_poly_ethylene-co-vinyl acetate_Aldrich_FT-Raman.spc`),
  E('nylon-6', 'Nylon 6', C.polymers, 'berzins2020', `${F}/10_Others/75_nylon_6_Aldrich_FT-Raman.spc`),
  E('talc', 'Talc', C.minerals, 'berzins2020', `${F}/6_Inorganic substances/34_talc_BDH_FT-Raman.spc`),
  E('tricalcium-phosphate', 'Tricalcium phosphate', C.minerals, 'berzins2020', `${F}/6_Inorganic substances/33_tricalcium_phosphate_MB_FT-Raman.spc`),
  E('sodium-bicarbonate', 'Sodium bicarbonate', C.minerals, 'berzins2020', `${F}/6_Inorganic substances/36_sodium_bicarbonate_MB_FT-Raman.spc`),
  E('magnesium-carbonate', 'Magnesium carbonate (heavy)', C.minerals, 'berzins2020', `${F}/6_Inorganic substances/40_magnesium_carbonate_heavy_MB_FT-Raman.spc`),
  // Raman Open Database: only spectra contributed to ROD directly. Many
  // ROD entries republish RRUFF spectra (data file R######.rod, measured at
  // the University of Arizona), whose own terms are not CC0; readRod refuses
  // them. One entry per mineral, not flagged by the ROD maintainers, whose
  // main band lies within about 3 cm⁻¹ of its accepted position, preferring
  // the widest range. Left out on those grounds: corundum (direct entries
  // 3500102 and 3500216 lack the 418 cm⁻¹ band), cassiterite (3500015 at
  // 630.6 cm⁻¹), and graphite, hydroxylapatite and dolomite, whose direct
  // entries come from one instrument with inconsistent shifts (gypsum
  // 3500028 from it reads 1002 cm⁻¹ instead of 1008).
  E('quartz', 'Quartz (α-SiO₂)', C.minerals, 'rod', '3500272'),
  E('calcite', 'Calcite (CaCO₃)', C.minerals, 'rod', '3500023'),
  E('aragonite', 'Aragonite (CaCO₃)', C.minerals, 'rod', '3500279'),
  E('gypsum', 'Gypsum (CaSO₄·2H₂O)', C.minerals, 'rod', '3500273'),
  E('barite', 'Barite (BaSO₄)', C.minerals, 'rod', '3500038'),
  E('anatase', 'Anatase (TiO₂)', C.minerals, 'rod', '3500153'),
  E('rutile', 'Rutile (TiO₂)', C.minerals, 'rod', '3500024'),
];

const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const median = values => { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Average into STEP_CM bins centred on the grid, interpolating linearly
// where a bin holds no sample; xs ascending.
function resample(xs, ys, [lo, hi]) {
  const first = Math.ceil(Math.max(lo, xs[0]) / STEP_CM) * STEP_CM;
  const last = Math.floor(Math.min(hi, xs.at(-1)) / STEP_CM) * STEP_CM;
  const out = [];
  let j = 0;
  for (let g = first; g <= last; g += STEP_CM) {
    while (j < xs.length && xs[j] < g - STEP_CM / 2) j++;
    let sum = 0, n = 0, k = j;
    for (; k < xs.length && xs[k] < g + STEP_CM / 2; k++) { sum += ys[k]; n++; }
    if (n) { out.push(sum / n); continue; }
    const r = xs.findIndex(x => x >= g);
    out.push(ys[r - 1] + (ys[r] - ys[r - 1]) * (g - xs[r - 1]) / (xs[r] - xs[r - 1]));
  }
  return { startCm: first, values: out };
}

function finish(entry, source, xs, ys, measurement, extra = {}) {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const sx = order.map(i => xs[i]), sy = order.map(i => ys[i]);
  const { startCm, values } = resample(sx, sy, source.rangeCm);
  const edge = Math.round(10 / STEP_CM);
  const y0 = median(values.slice(0, edge)), y1 = median(values.slice(-edge));
  const flat = values.map((v, i) => v - (y0 + (y1 - y0) * i / (values.length - 1)));
  const min = Math.min(...flat), max = Math.max(...flat);
  if (!(max > min)) throw new Error(`${entry.id}: flat spectrum`);
  return {
    id: entry.id, name: entry.name, category: entry.category, source: entry.source,
    technique: source.technique, measurement, license: source.license, ...extra,
    changes: 'Replicates averaged; cropped; averaged into 2 cm⁻¹ bins; straight two-point baseline subtracted; min–max scaled to 0–1000.',
    startCm: startCm, stepCm: STEP_CM,
    intensity: flat.map(v => Math.round((v - min) / (max - min) * 1000)),
  };
}

async function flanaganSpectra(dir, entries, inputs) {
  const file = join(dir, 'flanagan2025', 'raman_spectra_api_compounds.csv');
  inputs.push({ source: 'flanagan2025', file: 'raman_spectra_api_compounds.csv', sha256: await sha256(file) });
  const wanted = new Map(entries.map(e => [e.select, { entry: e, sum: null, n: 0 }]));
  let xs = null;
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    const cells = line.split(',');
    // Labels may contain commas ("N,N - Dimethylformahide"); the data part
    // is always the header's count of numeric columns.
    if (!xs) { xs = cells.slice(0, -1).map(Number); continue; }
    const label = cells.slice(xs.length).join(',').replace(/^"|"$/g, '');
    const slot = wanted.get(label);
    if (!slot) continue;
    const ys = cells.slice(0, xs.length).map(Number);
    slot.sum = slot.sum ? slot.sum.map((s, i) => s + ys[i]) : ys;
    slot.n++;
  }
  return [...wanted.values()].map(({ entry, sum, n }) => {
    if (!n) throw new Error(`${entry.id}: label ${entry.select} not in the dataset`);
    return finish(entry, SOURCES.flanagan2025, xs, sum.map(s => s / n), SOURCES.flanagan2025.measurement, { replicates: n });
  });
}

// Galactic SPC, the evenly spaced single-subfile float form these files use.
async function readSpc(file) {
  const b = await readFile(file);
  const flags = b.readUInt8(0), version = b.readUInt8(1), exponent = b.readInt8(3);
  const points = b.readInt32LE(4), first = b.readDoubleLE(8), last = b.readDoubleLE(16), subfiles = b.readInt32LE(24);
  if (flags !== 0 || version !== 0x4b || exponent !== -128 || subfiles !== 1) throw new Error(`${file}: unsupported SPC layout`);
  const xs = [], ys = [];
  for (let i = 0; i < points; i++) {
    xs.push(first + (last - first) * i / (points - 1));
    ys.push(b.readFloatLE(512 + 32 + 4 * i));
  }
  return { xs, ys };
}

async function berzinsSpectra(dir, entries, inputs) {
  const out = [];
  for (const entry of entries) {
    const file = join(dir, 'berzins2020', entry.select);
    inputs.push({ source: 'berzins2020', file: entry.select, sha256: await sha256(file) });
    const { xs, ys } = await readSpc(file);
    out.push(finish(entry, SOURCES.berzins2020, xs, ys, SOURCES.berzins2020.measurement));
  }
  return out;
}

function readRod(text, id) {
  // Same-line values only: an empty field must not read the next line.
  const field = key => (text.match(new RegExp(`^${key.replace(/[.[\]]/g, '\\$&')}[ \\t]+(.+)$`, 'm'))?.[1] ?? '').trim().replace(/^'|'$/g, '');
  const flags = [...text.matchAll(/^\d+\s+\S+\s+\S+\s+'([^']*)'/gm)].map(m => m[1]);
  if (flags.some(f => /wrong|not the right/i.test(f))) throw new Error(`ROD ${id}: flagged by the maintainers: ${flags.join('; ')}`);
  if (/^R\d{6}\.rod$/.test(field('_rod_data_source.file')) || field('_journal_name_full') !== 'Personal communication to ROD') {
    throw new Error(`ROD ${id}: not contributed to ROD directly (RRUFF or literature-derived); its licence chain is not CC0 throughout`);
  }
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.trim() === '_raman_spectrum.raman_shift');
  const columns = [];
  let i = start;
  for (; lines[i].trim().startsWith('_raman_spectrum.'); i++) columns.push(lines[i].trim());
  const xi = columns.indexOf('_raman_spectrum.raman_shift'), yi = columns.indexOf('_raman_spectrum.intensity');
  const xs = [], ys = [];
  for (; i < lines.length; i++) {
    const cells = lines[i].trim().split(/\s+/);
    if (cells.length !== columns.length || !cells.every(c => Number.isFinite(Number(c)))) break;
    xs.push(Number(cells[xi])); ys.push(Number(cells[yi]));
  }
  const authors = (text.match(/_publ_author_name\s*\n((?:\s*'[^']*'\s*\n)+)/)?.[1] ?? '').match(/'[^']*'/g)?.map(a => a.slice(1, -1)) ?? [];
  const laser = field('_raman_measurement_device.excitation_laser_wavelength');
  const resolution = field('_raman_measurement_device.resolution');
  const device = [field('_raman_measurement_device.company'), field('_raman_measurement_device.model')].filter(Boolean).join(' ');
  return {
    xs, ys, authors,
    measurement: `Spontaneous Raman, ${laser} nm excitation${device ? ` (${device})` : ''}${resolution ? `, ${resolution} cm⁻¹ resolution` : ''}`,
  };
}

async function rodSpectra(dir, entries, inputs) {
  const out = [];
  for (const entry of entries) {
    const file = join(dir, 'rod', `${entry.select}.rod`);
    inputs.push({ source: 'rod', file: `${entry.select}.rod`, sha256: await sha256(file) });
    const { xs, ys, authors, measurement } = readRod(await readFile(file, 'utf8'), entry.select);
    out.push(finish(entry, SOURCES.rod, xs, ys, measurement, {
      rodId: entry.select, rodUrl: `https://solsa.crystallography.net/rod/${entry.select}.html`, contributors: authors,
    }));
  }
  return out;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node tools/build-raman-spectra.mjs <download-dir>');
  const inputs = [];
  const bySource = s => ENTRIES.filter(e => e.source === s);
  const spectra = [
    ...await flanaganSpectra(dir, bySource('flanagan2025'), inputs),
    ...await berzinsSpectra(dir, bySource('berzins2020'), inputs),
    ...await rodSpectra(dir, bySource('rod'), inputs),
  ];
  const order = Object.values(C);
  spectra.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name));
  const outDir = join(OUT, 'spectra');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const s of spectra) {
    const src = SOURCES[s.source];
    const file = {
      ...s, attribution: src.citation, sourceUrl: s.rodUrl ?? src.data, licenseUrl: LICENSES[s.license].url,
    };
    await writeFile(join(outDir, `${s.id}.json`), `${JSON.stringify(file)}\n`);
  }
  const index = spectra.map(({ intensity, changes, ...meta }) => ({ ...meta, endCm: meta.startCm + (intensity.length - 1) * STEP_CM }));
  const module = `// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Generated by tools/build-raman-spectra.mjs; do not edit by hand. The
// spectra themselves are third-party data under their own licences (see
// SPECTRUM_SOURCES and THIRD-PARTY-NOTICES.md), one file each in spectra/.
export const SPECTRUM_SOURCES = ${JSON.stringify(Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { short: v.short, citation: v.citation, paper: v.paper, data: v.data, license: v.license, licenseName: LICENSES[v.license].name, licenseUrl: LICENSES[v.license].url }])), null, 2)};
export const SPECTRUM_CATEGORIES = ${JSON.stringify(order)};
export const SPECTRUM_TECHNIQUES = ${JSON.stringify(TECHNIQUES)};
export const SPECTRA = ${JSON.stringify(index, null, 1)};
export const SPECTRUM_INPUTS_SHA256 = ${JSON.stringify(inputs, null, 1)};
`;
  await writeFile(join(OUT, 'spectra-index.js'), module);
  console.log(`Wrote ${spectra.length} spectra to calculators/coherent-raman/spectra/ and spectra-index.js.`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
