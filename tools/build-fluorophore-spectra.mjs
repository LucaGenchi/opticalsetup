// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Fluorophore excitation and emission spectra, shared by the fluorescence
// calculator and (later) the canvas's specimens:
//
//   node tools/build-fluorophore-spectra.mjs --fetch <download-dir>
//   node tools/build-fluorophore-spectra.mjs <download-dir>
//
// --fetch downloads, for every entry below, FPbase's record of the protein
// (<slug>.json, the unmodified GraphQL response) and each spectrum it uses
// (spectrum-<id>.csv, FPbase's own 1 nm CSV export) into <download-dir>.
// The second form reads those files and writes sketch/data/fluorophores/
// <id>.json (one fluorophore each, fetched on demand) and
// sketch/js/fluorophore-library.js (the list the page and the tests read).
// The outputs are committed; CI does not re-download. The SHA-256 of every
// input file is recorded in the index so a rebuild can be checked against
// the same inputs.
//
// Only fluorescent proteins for now. FPbase states that its data are free
// of copyright restrictions, for commercial and non-commercial use, with
// credit to the original authors: each file names the protein's paper and
// the paper its curves cite, where FPbase records them, and an entry with
// neither is refused. Dye spectra mostly record no source, or only a
// manufacturer, so they wait for FPbase to confirm they may be
// redistributed.
//
// Processing, identical for every spectrum and stated on the page: FPbase's
// 1 nm samples are kept as they are, negative values (baseline noise) are
// set to zero, and the curve is scaled to its peak and stored as integers
// (1000 at the peak). The emission peak is the curve's maximum; the
// excitation peak is the maximum within 5 nm of the absorption maximum
// FPbase lists, the wavelength its extinction coefficient refers to, so a
// protein's 280 nm aromatic band may exceed 1000. An entry is refused when
// a listed peak lies more than 5 nm from its own curve's, which catches
// records whose numbers and curves disagree.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'sketch', 'data', 'fluorophores');
const INDEX = join(ROOT, 'sketch', 'js', 'fluorophore-library.js');
const FPBASE = 'https://www.fpbase.org';
const PEAK_TOLERANCE_NM = 5;

const C = {
  blue: 'Blue and UV-excited', cyan: 'Cyan', green: 'Green', yellow: 'Yellow', orange: 'Orange',
  red: 'Red', farRed: 'Far-red', nir: 'Near-infrared', lss: 'Large Stokes shift',
  switchable: 'Photoactivatable, photoconvertible and photoswitchable', calcium: 'Calcium indicators',
};

// [FPbase slug, category, state] — `state` names one of several states
// (its FPbase state slug is <slug>_<state>), with the label shown for it.
const ENTRIES = [
  ['sirius', C.blue], ['ebfp2', C.blue], ['mtagbfp2', C.blue], ['tagbfp', C.blue], ['t-sapphire', C.blue],
  ['ecfp', C.cyan], ['cerulean', C.cyan], ['mcerulean3', C.cyan], ['mturquoise2', C.cyan], ['mtfp1', C.cyan],
  ['avgfp', C.green], ['egfp', C.green], ['megfp', C.green], ['superfolder-gfp', C.green], ['memerald', C.green],
  ['mneongreen', C.green], ['mwasabi', C.green], ['clover', C.green], ['mclover3', C.green], ['mgreenlantern', C.green],
  ['staygold', C.green], ['mstaygold', C.green], ['mbaojin', C.green], ['gamillus', C.green, ['on', 'on state']], ['aausfp1', C.green],
  ['eyfp', C.yellow], ['venus', C.yellow], ['mvenus', C.yellow], ['citrine', C.yellow], ['mcitrine', C.yellow], ['ypet', C.yellow],
  ['mko2', C.orange], ['mkokappa', C.orange], ['morange2', C.orange],
  ['dsred', C.red], ['dsred-express2', C.red], ['tdtomato', C.red], ['mscarlet', C.red], ['mscarlet-i', C.red], ['mscarlet3', C.red],
  ['mruby2', C.red], ['mruby3', C.red], ['mapple', C.red], ['tagrfp', C.red], ['tagrfp-t', C.red], ['mcherry', C.red],
  ['mcherry2', C.red], ['mstrawberry', C.red], ['fusionred', C.red],
  ['mkate2', C.farRed], ['mplum', C.farRed], ['mneptune25', C.farRed], ['mcardinal', C.farRed], ['mmaroon1', C.farRed],
  ['irfp670', C.nir], ['mirfp670', C.nir], ['emirfp670', C.nir], ['mirfp680', C.nir], ['irfp713', C.nir],
  ['mirfp713', C.nir], ['mirfp720', C.nir], ['smurfp', C.nir],
  ['mametrine', C.lss], ['lssmorange', C.lss], ['mberfp', C.lss],
  ['pa-gfp', C.switchable, ['on', 'activated']], ['pamcherry1', C.switchable, ['on', 'activated']],
  ['dendra2', C.switchable, ['green', 'green form']], ['dendra2', C.switchable, ['red', 'red form']],
  ['meos32', C.switchable, ['green', 'green form']], ['meos32', C.switchable, ['red', 'red form']],
  ['mmaple3', C.switchable, ['green', 'green form']], ['mmaple3', C.switchable, ['red', 'red form']],
  ['dronpa', C.switchable, ['on', 'on state']], ['rsegfp2', C.switchable, ['on', 'on state']],
  ['jrgeco1a', C.calcium, ['calcium-saturated', 'Ca²⁺-bound']], ['jrgeco1a', C.calcium, ['calcium-free', 'Ca²⁺-free']],
  ['jrcamp1a', C.calcium, ['calcium-saturated', 'Ca²⁺-bound']], ['jrcamp1a', C.calcium, ['calcium-free', 'Ca²⁺-free']],
  ['r-geco1', C.calcium, ['calcium-saturated', 'Ca²⁺-bound']], ['r-geco1', C.calcium, ['calcium-free', 'Ca²⁺-free']],
].map(([slug, category, [state, stateLabel] = []]) => ({
  slug, category, state: state ?? null, stateLabel: stateLabel ?? null,
  id: state ? `${slug}-${state.replace(/_/g, '-')}` : slug,
}));

const SOURCE = {
  short: 'FPbase',
  citation: 'T. J. Lambert, “FPbase: a community-editable fluorescent protein database,” Nat. Methods 16, 277–278 (2019)',
  paper: 'https://doi.org/10.1038/s41592-019-0352-8',
  data: FPBASE,
  license: 'FPbase-data',
  licenseName: 'FPbase data policy: free of copyright restrictions, credit to the original authors',
  licenseUrl: `${FPBASE}/terms/`,
};

const AGG = { m: 'monomer', d: 'dimer', wd: 'weak dimer', td: 'tandem dimer', t: 'tetramer' };

const PROTEIN_QUERY = uuid => `{ protein(id: "${uuid}") { name slug agg
  primaryReference { doi citation title journal year volume pages }
  states { name slug exMax emMax extCoeff qy lifetime
    spectra { id subtype source reference { doi citation } } } } }`;

const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const HEADERS = { 'User-Agent': 'OpticalSetup data build (https://opticalsetup.com)' };

// FPbase rate-limits; back off and retry rather than hammer it.
async function get(url, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers } });
    if (res.ok) return res.text();
    if (res.status !== 429 || attempt >= 6) throw new Error(`${url}: HTTP ${res.status}`);
    await pause(1000 * (Number(res.headers.get('retry-after')) || 15 * 2 ** attempt));
  }
}
const exists = file => readFile(file).then(() => true, () => false);

// The state an entry uses, and its excitation (or, without one, absorption)
// and emission spectra.
function pick(entry, protein) {
  const states = protein.states.filter(s => s.exMax && s.emMax);
  const state = entry.state ? states.find(s => s.slug === `${protein.slug}_${entry.state}`) : states.length === 1 ? states[0] : null;
  if (!state) throw new Error(`${entry.id}: state ${entry.state ?? '(only state)'} not found among ${protein.states.map(s => s.slug).join(', ')}`);
  const of = subtype => state.spectra.find(s => s.subtype === subtype);
  const excitation = of('EX') ?? of('AB');
  const emission = of('EM');
  if (!excitation || !emission) throw new Error(`${entry.id}: needs an excitation or absorption spectrum and an emission spectrum`);
  return { state, excitation, emission };
}

async function fetchAll(dir) {
  await mkdir(dir, { recursive: true });
  for (const slug of new Set(ENTRIES.map(e => e.slug))) {
    // Resumable: a record already downloaded is reused, and only the
    // spectra still missing are fetched.
    const recordFile = join(dir, `${slug}.json`);
    let text = await readFile(recordFile, 'utf8').catch(() => null);
    if (text === null) {
      const { uuid } = JSON.parse(await get(`${FPBASE}/api/proteins/${slug}/?format=json&fields=uuid`));
      text = await get(`${FPBASE}/graphql/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: PROTEIN_QUERY(uuid) }),
      });
      await pause(1000);
    }
    const record = JSON.parse(text);
    if (record.errors || !record.data?.protein) throw new Error(`${slug}: ${JSON.stringify(record.errors ?? 'no protein')}`);
    for (const entry of ENTRIES.filter(e => e.slug === slug)) {
      const { excitation, emission } = pick(entry, record.data.protein);
      for (const spectrum of [excitation, emission]) {
        const file = join(dir, `spectrum-${spectrum.id}.csv`);
        if (await exists(file)) continue;
        await writeFile(file, await get(`${FPBASE}/spectra_csv/?q=${spectrum.id}`));
        await pause(1000);
      }
    }
    // Written last, so an interrupted run leaves no record without its spectra.
    await writeFile(recordFile, text);
    console.log(`fetched ${slug}`);
  }
}

// FPbase's CSV: a header, then "wavelength,value" rows at 1 nm steps.
// `nearNm` scales the curve to its maximum within the tolerance of that
// wavelength instead of its global maximum.
function readCsv(text, id, nearNm = null) {
  const rows = text.trim().split(/\r?\n/).slice(1).map(line => line.split(',').map(Number))
    .filter(([nm, v]) => Number.isFinite(nm) && Number.isFinite(v));
  if (rows.length < 10) throw new Error(`spectrum ${id}: too few samples`);
  rows.forEach(([nm], i) => {
    if (i && nm !== rows[i - 1][0] + 1) throw new Error(`spectrum ${id}: samples are not at 1 nm steps (${rows[i - 1][0]} → ${nm})`);
  });
  const values = rows.map(([, v]) => Math.max(0, v));
  const near = rows.map(([nm], i) => (nearNm === null || Math.abs(nm - nearNm) <= PEAK_TOLERANCE_NM ? values[i] : -1));
  const max = Math.max(...near);
  if (!(max > 0)) throw new Error(`spectrum ${id}: no signal${nearNm === null ? '' : ` within ${PEAK_TOLERANCE_NM} nm of ${nearNm} nm`}`);
  const k = near.indexOf(max), peakNm = rows[k][0];
  // A maximum at the edge of the window is a slope rising out of it: the
  // curve's band is not where the record says.
  const isPeak = (values[k - 1] ?? 0) <= max && (values[k + 1] ?? 0) <= max;
  const scaled = values.map(v => Math.round(v / max * 1000));
  // Trim the zero runs at either end, keeping one zero as the edge.
  let a = 0, b = scaled.length - 1;
  while (a < b - 1 && scaled[a + 1] === 0) a++;
  while (b > a + 1 && scaled[b - 1] === 0) b--;
  return { peakNm, isPeak, startNm: rows[a][0], stepNm: 1, values: scaled.slice(a, b + 1) };
}

async function build(dir) {
  const inputs = [], fluorophores = [];
  for (const entry of ENTRIES) {
    const recordFile = join(dir, `${entry.slug}.json`);
    const protein = JSON.parse(await readFile(recordFile, 'utf8')).data.protein;
    const { state, excitation, emission } = pick(entry, protein);
    const curves = {};
    for (const [role, spectrum] of [['excitation', excitation], ['emission', emission]]) {
      const file = join(dir, `spectrum-${spectrum.id}.csv`);
      inputs.push({ id: entry.id, file: `spectrum-${spectrum.id}.csv`, sha256: await sha256(file) });
      curves[role] = {
        type: spectrum.subtype === 'EX' ? 'excitation' : 'absorption', fpbaseSpectrumId: Number(spectrum.id),
        ...(spectrum.source ? { source: spectrum.source } : {}),
        ...(spectrum.reference?.doi ? { reference: { citation: spectrum.reference.citation, doi: spectrum.reference.doi } } : {}),
        ...readCsv(await readFile(file, 'utf8'), spectrum.id, role === 'excitation' ? state.exMax : null),
      };
      if (role === 'emission') curves[role].type = 'emission';
    }
    inputs.push({ id: entry.id, file: `${entry.slug}.json`, sha256: await sha256(recordFile) });
    const exPeak = curves.excitation.peakNm, emPeak = curves.emission.peakNm;
    const { isPeak } = curves.excitation;
    delete curves.excitation.isPeak; delete curves.emission.isPeak;
    if (Math.abs(emPeak - state.emMax) > PEAK_TOLERANCE_NM || !isPeak) {
      console.warn(`skipped ${entry.id}: FPbase lists ${state.exMax}/${state.emMax} nm, its spectra peak at ${exPeak}/${emPeak} nm`);
      inputs.splice(-3);
      continue;
    }
    const ref = protein.primaryReference;
    // The papers the curves themselves cite, where FPbase records one and it
    // is not the protein's own paper.
    const spectraRefs = [...new Map([curves.excitation, curves.emission].filter(c => c.reference && c.reference.doi !== ref?.doi)
      .map(c => [c.reference.doi, c.reference])).values()];
    if (!ref && !spectraRefs.length) {
      console.warn(`skipped ${entry.id}: FPbase names no paper to credit`);
      inputs.splice(-3);
      continue;
    }
    fluorophores.push({
      id: entry.id, name: entry.stateLabel ? `${protein.name} (${entry.stateLabel})` : protein.name,
      kind: 'protein', category: entry.category, source: 'fpbase', license: SOURCE.license,
      ...(AGG[protein.agg?.toLowerCase()] ? { oligomer: AGG[protein.agg.toLowerCase()] } : {}),
      exMaxNm: state.exMax, emMaxNm: state.emMax,
      extinctionM: state.extCoeff ?? null, quantumYield: state.qy ?? null, lifetimeNs: state.lifetime ?? null,
      fpbaseUrl: `${FPBASE}/protein/${protein.slug}/`,
      reference: ref ? { citation: ref.citation, title: ref.title, journal: ref.journal, year: ref.year, volume: ref.volume, pages: ref.pages, doi: ref.doi } : null,
      spectraReferences: spectraRefs,
      ...curves,
    });
  }
  const order = Object.values(C);
  fluorophores.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.emMaxNm - b.emMaxNm || a.name.localeCompare(b.name));
  await rm(DATA, { recursive: true, force: true });
  await mkdir(DATA, { recursive: true });
  const changes = 'FPbase 1 nm samples kept; negative values set to zero; scaled to the maximum and stored as integers 0–1000; zero runs at the ends trimmed.';
  for (const f of fluorophores) {
    const credits = [
      ...(f.reference ? [`protein: ${f.reference.citation}, ${f.reference.journal} (${f.reference.year}), doi:${f.reference.doi}`] : []),
      ...f.spectraReferences.map(r => `spectra: ${r.citation}, doi:${r.doi}`),
    ];
    const file = { ...f, attribution: `${SOURCE.citation}; ${credits.join('; ')}`, sourceUrl: f.fpbaseUrl, licenseUrl: SOURCE.licenseUrl, changes };
    await writeFile(join(DATA, `${f.id}.json`), `${JSON.stringify(file)}\n`);
  }
  const range = c => [c.startNm, c.startNm + (c.values.length - 1) * c.stepNm];
  // The index holds what a list and a quick estimate need; the references
  // and the curves are in each fluorophore's file.
  const index = fluorophores.map(({ excitation, emission, reference, spectraReferences, fpbaseUrl, license, ...meta }) => ({
    ...meta, excitationType: excitation.type, excitationRangeNm: range(excitation), emissionRangeNm: range(emission),
  }));
  const lines = list => `[\n${list.map(item => ` ${JSON.stringify(item)}`).join(',\n')}\n]`;
  const module = `// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Generated by tools/build-fluorophore-spectra.mjs; do not edit by hand. The
// spectra themselves are third-party data under their own terms (see
// FLUOROPHORE_SOURCES and THIRD-PARTY-NOTICES.md), one file each in
// sketch/data/fluorophores/.
export const FLUOROPHORE_SOURCES = ${JSON.stringify({ fpbase: SOURCE }, null, 2)};
export const FLUOROPHORE_CATEGORIES = ${JSON.stringify(order.filter(c => fluorophores.some(f => f.category === c)))};
export const FLUOROPHORE_LIBRARY = ${lines(index)};
export const FLUOROPHORE_INPUTS_SHA256 = ${lines(inputs)};
`;
  await writeFile(INDEX, module);
  console.log(`Wrote ${fluorophores.length} fluorophores to sketch/data/fluorophores/ and sketch/js/fluorophore-library.js.`);
}

async function main() {
  const fetchMode = process.argv[2] === '--fetch';
  const dir = process.argv[fetchMode ? 3 : 2];
  if (!dir) throw new Error('usage: node tools/build-fluorophore-spectra.mjs [--fetch] <download-dir>');
  await (fetchMode ? fetchAll(dir) : build(dir));
}

main().catch(err => { console.error(err); process.exitCode = 1; });
