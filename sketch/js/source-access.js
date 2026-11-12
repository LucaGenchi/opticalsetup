// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Whether the primary source behind each shipped dataset is open access, as
// the data rule in docs/adding-physics.md asks ("Access stated"). A record
// states its access by citing a source listed here: a DOI (lower case), a
// URL for a source without a DOI, or the description of a printed source.
// test/source-access.test.js and test/material-catalogue.test.js fail when a
// shipped record cites a source missing from this table. DOM-free.
//
// The statuses are those of OpenAlex (api.openalex.org, the work's
// open_access.oa_status), looked up by DOI on the date below:
//   gold     published open access in an open-access journal
//   hybrid   published open access in a subscription journal
//   bronze   free to read on the publisher's site, without an open licence
//   green    free to read in a repository (a preprint or accepted manuscript)
//   closed   no free copy known to OpenAlex
// and one status for sources that are not papers:
//   datasheet  a manufacturer's datasheet, free to download from the maker
//
// A status records where a free copy was found on that date, not a licence
// for the data: the data's own licence is in each record.

export const SOURCE_ACCESS_CHECKED = { date: '2026-11-12', via: 'OpenAlex, open_access.oa_status, looked up by DOI' };

export const OPEN_ACCESS_STATUSES = new Set(['gold', 'hybrid', 'bronze', 'green', 'diamond', 'datasheet']);
export const ACCESS_STATUSES = new Set([...OPEN_ACCESS_STATUSES, 'closed']);

export const SCHOTT_DATASHEET_URL = 'https://www.schott.com/en-us/products/optical-glass-p1000267/downloads';

// A printed handbook with no DOI: the published form of the sapphire fit.
export const DODGE_HANDBOOK = 'M. J. Dodge, “Refractive index,” in Handbook of Laser Science and Technology, Vol. IV, CRC Press (1986), p. 30';

export const SOURCE_ACCESS = Object.freeze({
  [SCHOTT_DATASHEET_URL]: 'datasheet',
  // Dispersion fits (sketch/js/materials/catalogue.js) and the database they were transcribed from
  '10.1016/s0030-4018(99)00091-7': 'closed',
  '10.1038/s41597-023-02898-2': 'gold',
  '10.1117/12.957359': 'closed',
  '10.1364/ao.2.001103': 'closed',
  '10.1364/ao.35.001566': 'closed',
  '10.1364/ao.37.004933': 'closed',
  '10.1364/ao.46.003811': 'closed',
  '10.1364/josa.47.000244': 'closed',
  '10.1364/josa.55.001205': 'closed',
  '10.1364/josa.62.001336': 'closed',
  '10.1364/ome.8.001410': 'gold',
  // Sources without a DOI or URL, keyed by a short description.
  [DODGE_HANDBOOK]: 'closed',
  '10.1364/ao.23.004477': 'closed',
  // Crystal records and Verdet data added in step A3b
  '10.1063/1.324471': 'closed',
  '10.1002/pssb.2221820238': 'closed',
  '10.3390/app9153160': 'gold',
  '10.1364/ome.6.003683': 'gold',
  // Raman reference spectra (calculators/coherent-raman/spectra/)
  '10.1016/j.vibspec.2020.103021': 'closed',
  '10.1038/s41597-025-04848-6': 'gold',
  '10.1107/s1600576719004229': 'hybrid',
  // FPbase, the database the fluorophore records come from
  '10.1038/s41592-019-0352-8': 'closed',
  // Fluorophore records (sketch/data/fluorophores/): the protein papers and the papers their curves cite
  '10.1016/0378-1119(92)90691-h': 'closed',
  '10.1016/0378-1119(95)00685-0': 'hybrid',
  '10.1016/j.bpj.2019.04.007': 'hybrid',
  '10.1016/j.cell.2007.12.033': 'bronze',
  '10.1016/j.chembiol.2008.08.006': 'bronze',
  '10.1016/j.chembiol.2017.12.005': 'bronze',
  '10.1016/s0960-9822(02)00450-5': 'bronze',
  '10.1021/bi0516273': 'closed',
  '10.1021/bi700199g': 'closed',
  '10.1021/ja3018972': 'green',
  '10.1038/nbt.1918': 'green',
  '10.1038/nbt1037': 'closed',
  '10.1038/nbt1172': 'closed',
  '10.1038/nbt1191': 'closed',
  '10.1038/ncomms12405': 'gold',
  '10.1038/ncomms1738': 'hybrid',
  '10.1038/ncomms2208': 'bronze',
  '10.1038/nmeth.1207': 'closed',
  '10.1038/nmeth.1209': 'green',
  '10.1038/nmeth.1235': 'closed',
  '10.1038/nmeth.1264': 'green',
  '10.1038/nmeth.1298': 'green',
  '10.1038/nmeth.1317': 'green',
  '10.1038/nmeth.2021': 'closed',
  '10.1038/nmeth.2171': 'green',
  '10.1038/nmeth.2413': 'green',
  '10.1038/nmeth.2521': 'green',
  '10.1038/nmeth.2888': 'green',
  '10.1038/nmeth.3935': 'green',
  '10.1038/nmeth.4045': 'green',
  '10.1038/nmeth.4074': 'closed',
  '10.1038/nmeth1062': 'closed',
  '10.1038/s41467-019-13897-6': 'gold',
  '10.1038/s41587-022-01278-2': 'hybrid',
  '10.1038/s41589-018-0044-1': 'green',
  '10.1038/s41592-023-01809-y': 'green',
  '10.1038/s41592-023-02085-6': 'hybrid',
  '10.1038/s41592-024-02203-y': 'green',
  '10.1038/srep20889': 'gold',
  '10.1042/bj20060874': 'bronze',
  '10.1042/bj20081949': 'green',
  '10.1073/pnas.0407752101': 'green',
  '10.1073/pnas.1406593111': 'green',
  '10.1073/pnas.2000942117': 'hybrid',
  '10.1074/jbc.m102815200': 'hybrid',
  '10.1101/677344': 'gold',
  '10.1126/science.1074952': 'closed',
  '10.1126/science.1102506': 'closed',
  '10.1186/1472-6750-3-5': 'gold',
  '10.1186/1741-7007-6-13': 'gold',
  '10.1371/journal.pone.0017896': 'gold',
  '10.1371/journal.pone.0028674': 'gold',
  '10.1371/journal.pone.0064849': 'gold',
  '10.1371/journal.pone.0171257': 'gold',
  '10.7554/elife.00248': 'gold',
  '10.7554/elife.12727': 'gold',
});

// The DOI of a doi.org link or a bare DOI, lower case; other URLs unchanged.
export function sourceKey(reference) {
  if (typeof reference !== 'string' || !reference) return null;
  const match = /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i.exec(reference.trim());
  return match ? match[1].toLowerCase() : reference.trim();
}

// The access status of a source, or null when the table does not list it.
export const sourceAccess = reference => SOURCE_ACCESS[sourceKey(reference)] ?? null;

export const isOpenAccess = reference => OPEN_ACCESS_STATUSES.has(sourceAccess(reference));

// What the data rule asks of one record: an open licence, at least one
// primary source, and an access status for each source it cites. Returns the
// problems found, an empty list when the record complies.
export function dataRuleProblems({ licence, sources }) {
  const problems = [];
  if (typeof licence !== 'string' || !licence.trim()) problems.push('no licence');
  const cited = (sources || []).filter(Boolean);
  if (!cited.length) problems.push('no primary source');
  for (const source of cited) {
    if (!ACCESS_STATUSES.has(sourceAccess(source))) problems.push(`no access status for ${source}`);
  }
  return problems;
}
