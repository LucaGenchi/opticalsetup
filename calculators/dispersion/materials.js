// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Material dispersion for the dispersion calculator: refractive index, group
// index, GVD and TOD from published dispersion formulas, with analytic
// wavelength derivatives up to third order. DOM-free.
//
// Every material comes from the shared catalogue
// (sketch/js/materials/catalogue.js), which the canvas and the lens designer
// read too, so the three evaluate the same coefficients. The catalogue keeps
// each source's own formula form, so a transcription can be compared with
// the source directly:
//
//   'sellmeier'  n² − 1 = A + Σ B λ² / (λ² − C)      λ in µm, C in µm²
//   'gas'        n − 1  = Σ B / (C − λ⁻²)             λ in µm, C in µm⁻²
//
// The catalogue records each fit's dataset (refractiveindex.info, CC0), its
// primary source and that source's access status. `range` is the source's
// fit domain in nm: outside it the functions return null rather than
// extrapolating. `indexReference` is what the source's indices are relative
// to: 'air' (the SCHOTT catalogue), 'vacuum' (absolute: Daimon and
// Masumura's water, Ciddor's air) or 'unstated' where the source as
// consulted does not say. A uniaxial crystal appears here as its two
// principal entries, ordinary and extraordinary.

import { MATERIAL_RECORDS } from '../../sketch/js/materials/catalogue.js';

const C_METRES_PER_SECOND = 299792458;
// Fraunhofer d, F and C lines for the Abbe number (true wavelengths, nm).
const LINE_D = 587.5618, LINE_F = 486.1327, LINE_C = 656.2725;

const GLASS = 'Optical glass (SCHOTT)';
const CRYSTAL = 'Fused silica and crystals';
const FLUID = 'Liquids and gases';

const fitEntry = (fit, fields) => ({
  ...fields, form: fit.form, ...(fit.form === 'sellmeier' ? { A: fit.A } : {}),
  terms: fit.terms.map(term => [...term]), range: [...fit.range],
});

const isotropic = (id, group) => {
  const record = MATERIAL_RECORDS.get(id);
  return fitEntry(record, {
    id, label: record.dispersionLabel ?? record.label, group,
    ref: record.reference, conditions: record.conditions, indexReference: record.indexReference,
  });
};

const principal = (id, ray, group) => {
  const record = MATERIAL_RECORDS.get(id), fit = record[ray];
  return fitEntry(fit, {
    id: `${id}-${ray === 'ordinary' ? 'o' : 'e'}`, label: `${record.label}, ${ray} ray`, group,
    ref: record.reference, conditions: fit.conditions, birefringent: true, indexReference: fit.indexReference,
  });
};

const MATERIAL_LIST = [
  ...['nbk7', 'nfk51a', 'nsk16', 'f2', 'nsf5', 'nsf10', 'nsf11', 'nsf14', 'nsf57', 'nlasf9'].map(id => isotropic(id, GLASS)),
  isotropic('silica', CRYSTAL),
  isotropic('caf2', CRYSTAL),
  ...['sapphire', 'quartz', 'bbo'].flatMap(id => [principal(id, 'ordinary', CRYSTAL), principal(id, 'extraordinary', CRYSTAL)]),
  ...['yag', 'znse', 'si'].map(id => isotropic(id, CRYSTAL)),
  ...['water', 'air'].map(id => isotropic(id, FLUID)),
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
export function materialIndexDerivatives(id, wavelengthNm) {
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
  const d = materialIndexDerivatives(id, wavelengthNm);
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
  const [nd, nF, nC] = [LINE_D, LINE_F, LINE_C].map(nm => materialIndexDerivatives(id, nm)?.n);
  return [nd, nF, nC].every(Number.isFinite) && nF !== nC ? (nd - 1) / (nF - nC) : null;
}
