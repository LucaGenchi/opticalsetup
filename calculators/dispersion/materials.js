// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Material dispersion for the dispersion calculator: refractive index, group
// index, GVD and TOD from published dispersion formulas, with analytic
// wavelength derivatives up to third order. DOM-free.
//
// The workbench's catalogue glasses (the SCHOTT glasses, fused silica and CaF₂)
// take their coefficients from sketch/js/glass.js, so the calculator and the
// tracer share one source; the crystals, liquids and gases are
// calculator-only. Each entry keeps its source's own
// formula form, so a transcription can be compared with the source directly:
//
//   'sellmeier'  n² − 1 = A + Σ B λ² / (λ² − C)      λ in µm, C in µm²
//   'gas'        n − 1  = Σ B / (C − λ⁻²)             λ in µm, C in µm⁻²
//
// Coefficients were transcribed from the refractiveindex.info database
// (CC0), which cites each primary source listed in `ref`; the page's
// reference list gives those sources. `range` is the source's fit domain in
// nm: outside it the functions return null rather than extrapolating.
// `indexReference` is what the source's indices are relative to: 'air' (the
// SCHOTT catalogue), 'vacuum' (absolute: Daimon and Masumura's water,
// Ciddor's air) or 'unstated' where the source as consulted does not say.

import { GLASSES } from '../../sketch/js/glass.js';

const C_METRES_PER_SECOND = 299792458;
// Fraunhofer d, F and C lines for the Abbe number (true wavelengths, nm).
const LINE_D = 587.5618, LINE_F = 486.1327, LINE_C = 656.2725;

const GLASS = 'Optical glass (SCHOTT)';
const CRYSTAL = 'Fused silica and crystals';
const FLUID = 'Liquids and gases';

const catalogueGlass = (id, group, extra = {}) => {
  const g = GLASSES.get(id);
  return { id, label: g.label, group, form: 'sellmeier', A: 0, terms: g.B.map((B, i) => [B, g.C[i]]), range: g.range, ...extra };
};

const MATERIAL_LIST = [
  catalogueGlass('nbk7', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),
  catalogueGlass('nfk51a', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),
  catalogueGlass('nsf5', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),
  catalogueGlass('nsf10', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),
  catalogueGlass('nsf11', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),
  catalogueGlass('nsf14', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),
  catalogueGlass('nsf57', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),
  catalogueGlass('nlasf9', GLASS, { ref: 'schott', conditions: '20 °C; index relative to air', indexReference: 'air' }),

  catalogueGlass('silica', CRYSTAL, { ref: 'malitson1965', conditions: '20 °C', indexReference: 'unstated' }),
  catalogueGlass('caf2', CRYSTAL, { label: 'Calcium fluoride, CaF₂', ref: 'malitson1963', conditions: '24 °C', indexReference: 'unstated' }),
  { id: 'sapphire-o', label: 'Sapphire, Al₂O₃, ordinary ray', group: CRYSTAL, form: 'sellmeier', A: 0,
    terms: [[1.4313493, 0.0726631 ** 2], [0.65054713, 0.1193242 ** 2], [5.3414021, 18.028251 ** 2]],
    range: [200, 5000], ref: 'malitson1972', conditions: '20 °C; ordinary ray (E ⟂ c axis)', birefringent: true, indexReference: 'unstated' },
  { id: 'sapphire-e', label: 'Sapphire, Al₂O₃, extraordinary ray', group: CRYSTAL, form: 'sellmeier', A: 0,
    terms: [[1.5039759, 0.0740288 ** 2], [0.55069141, 0.1216529 ** 2], [6.5927379, 20.072248 ** 2]],
    range: [200, 5000], ref: 'malitson1972', conditions: '20 °C; extraordinary ray (E ∥ c axis)', birefringent: true, indexReference: 'unstated' },
  { id: 'quartz-o', label: 'Crystalline quartz, SiO₂, ordinary ray', group: CRYSTAL, form: 'sellmeier', A: 0.28604141,
    terms: [[1.07044083, 1.00585997e-2], [1.10202242, 100]],
    range: [198, 2053.1], ref: 'ghosh1999', conditions: 'room temperature; ordinary ray', birefringent: true, indexReference: 'unstated' },
  { id: 'quartz-e', label: 'Crystalline quartz, SiO₂, extraordinary ray', group: CRYSTAL, form: 'sellmeier', A: 0.28851804,
    terms: [[1.09509924, 1.02101864e-2], [1.15662475, 100]],
    range: [198, 2053.1], ref: 'ghosh1999', conditions: 'room temperature; extraordinary ray (E ∥ optic axis)', birefringent: true, indexReference: 'unstated' },
  { id: 'bbo-o', label: 'β-barium borate, BBO, ordinary ray', group: CRYSTAL, form: 'sellmeier', A: 0,
    terms: [[0.90291, 0.003926], [0.83155, 0.018786], [0.76536, 60.01]],
    range: [188, 5200], ref: 'tamosauskas2018', conditions: 'room temperature; ordinary ray', birefringent: true, indexReference: 'unstated' },
  { id: 'bbo-e', label: 'β-barium borate, BBO, extraordinary ray', group: CRYSTAL, form: 'sellmeier', A: 0,
    terms: [[1.151075, 0.007142], [0.21803, 0.02259], [0.656, 263]],
    range: [188, 5200], ref: 'tamosauskas2018', conditions: 'room temperature; extraordinary ray (E ∥ optic axis)', birefringent: true, indexReference: 'unstated' },
  { id: 'yag', label: 'Yttrium aluminium garnet, YAG (undoped)', group: CRYSTAL, form: 'sellmeier', A: 0,
    terms: [[2.282, 0.01185], [3.27644, 282.734]],
    range: [400, 5000], ref: 'zelmon1998', conditions: 'room temperature', indexReference: 'unstated' },
  { id: 'znse', label: 'Zinc selenide, ZnSe (CVD)', group: CRYSTAL, form: 'sellmeier', A: 0,
    terms: [[4.45813734, 0.200859853 ** 2], [0.467216334, 0.391371166 ** 2], [2.89566290, 47.1362108 ** 2]],
    range: [540, 18200], ref: 'connolly1979', conditions: '23 °C', indexReference: 'unstated' },
  { id: 'si', label: 'Silicon, Si', group: CRYSTAL, form: 'sellmeier', A: 0,
    terms: [[10.6684293, 0.301516485 ** 2], [0.0030434748, 1.13475115 ** 2], [1.54133408, 1104 ** 2]],
    range: [1357, 11040], ref: 'salzberg1957', conditions: '26 °C; purity not stated by the source', indexReference: 'unstated' },

  { id: 'water', label: 'Water, H₂O (distilled)', group: FLUID, form: 'sellmeier', A: 0,
    terms: [[5.684027565e-1, 5.101829712e-3], [1.726177391e-1, 1.821153936e-2], [2.086189578e-2, 2.620722293e-2], [1.130748688e-1, 1.069792721e1]],
    range: [182, 1129], ref: 'daimon2007', conditions: '20.0 °C; absolute index', indexReference: 'vacuum' },
  { id: 'air', label: 'Air (standard, dry)', group: FLUID, form: 'gas',
    terms: [[0.05792105, 238.0185], [0.00167917, 57.362]],
    range: [230, 1690], ref: 'ciddor1996', conditions: '15 °C, 101.325 kPa, dry, 450 ppm CO₂; absolute index', indexReference: 'vacuum' },
];

export const MATERIALS = new Map(MATERIAL_LIST.map(m => [m.id, m]));
export const MATERIAL_OPTIONS = MATERIAL_LIST.map(m => [m.id, m.label, m.group]);
export const materialRange = id => MATERIALS.get(id)?.range ?? null;

export function isInMaterialRange(id, wavelengthNm) {
  const range = materialRange(id);
  return Boolean(range) && typeof wavelengthNm === 'number' && Number.isFinite(wavelengthNm)
    && wavelengthNm >= range[0] && wavelengthNm <= range[1];
}

// The formula's value V (n² for 'sellmeier', n for 'gas') and its first
// three derivatives with respect to λ in µm. Every term is a pole
// K/(λ² − s) plus a constant, whose derivatives are closed-form:
//   'sellmeier'  B λ²/(λ² − C)     = B + B·C/(λ² − C)            K = B·C,   s = C
//   'gas'        B/(C − λ⁻²)       = (B/C) + (B/C²)/(λ² − 1/C)   K = B/C²,  s = 1/C
function formulaTerms(material, um) {
  const l2 = um * um;
  let v = material.form === 'gas' ? 1 : 1 + material.A, d1 = 0, d2 = 0, d3 = 0;
  for (const [B, C] of material.terms) {
    const [K, s, value] = material.form === 'gas'
      ? [B / (C * C), 1 / C, B / (C - 1 / l2)]
      : [B * C, C, B * l2 / (l2 - C)];
    const u = l2 - s, u2 = u * u, u3 = u2 * u, u4 = u3 * u;
    v += value;
    d1 += -2 * K * um / u2;
    d2 += -2 * K / u2 + 8 * K * l2 / u3;
    d3 += 24 * K * um / u3 - 48 * K * l2 * um / u4;
  }
  return { v, d1, d2, d3 };
}

// n and dⁿn/dλⁿ (µm⁻ⁿ) at a vacuum wavelength in nm, or null outside the
// fit domain. For 'sellmeier' the derivatives follow from S = n²:
// S' = 2nn', S'' = 2n'² + 2nn'', S''' = 6n'n'' + 2nn'''.
function indexDerivatives(id, wavelengthNm) {
  const material = MATERIALS.get(id);
  if (!material || !isInMaterialRange(id, wavelengthNm)) return null;
  const um = wavelengthNm / 1000;
  const { v, d1, d2, d3 } = formulaTerms(material, um);
  if (material.form === 'gas') return { um, n: v, n1: d1, n2: d2, n3: d3 };
  if (!(v > 0)) return null;
  const n = Math.sqrt(v);
  const n1 = d1 / (2 * n);
  const n2 = (d2 - 2 * n1 * n1) / (2 * n);
  const n3 = (d3 - 6 * n1 * n2) / (2 * n);
  return { um, n, n1, n2, n3 };
}

// Phase index, group index n_g = n − λ dn/dλ, GVD β₂ = λ³/(2πc²) d²n/dλ²
// and TOD β₃ = −λ⁴/(4π²c³) (3 d²n/dλ² + λ d³n/dλ³). With λ in µm and the
// derivatives in µm⁻ᵏ, 1e21 converts β₂ to fs²/mm and 1e30 converts β₃ to
// fs³/mm.
export function materialDispersion(id, wavelengthNm) {
  const d = indexDerivatives(id, wavelengthNm);
  if (!d) return null;
  const { um, n, n1, n2, n3 } = d;
  const c = C_METRES_PER_SECOND;
  const result = {
    index: n,
    groupIndex: n - um * n1,
    gvdFs2PerMm: um ** 3 * n2 * 1e21 / (2 * Math.PI * c * c),
    todFs3PerMm: -(um ** 4) * (3 * n2 + um * n3) * 1e30 / (4 * Math.PI * Math.PI * c ** 3),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

// Abbe number V_d = (n_d − 1)/(n_F − n_C), or null when the F, d and C
// lines are not all inside the material's fit domain.
export function materialAbbe(id) {
  const [nd, nF, nC] = [LINE_D, LINE_F, LINE_C].map(nm => indexDerivatives(id, nm)?.n);
  return [nd, nF, nC].every(Number.isFinite) && nF !== nC ? (nd - 1) / (nF - nC) : null;
}
