// Optical glass catalogue.
//
// Each glass is a two-term Cauchy fit, n(λ) = A + B/λ² with λ in nm. That is
// enough to reproduce a glass's two defining catalogue numbers exactly — its
// index at the d line (587.6 nm) and its Abbe number V = (nd−1)/(nF−nC) — which
// between them are what set focal length and axial colour. A full Sellmeier fit
// would add accuracy in the deep blue and the infrared that this qualitative
// tracer has no way to make use of.
//
// A and B are derived from (nd, V) rather than typed in, so a new glass only
// needs the two numbers any catalogue prints on its front page:
//     B = (nd − 1) / (V · (1/λF² − 1/λC²))
//     A = nd − B/λd²
const LAMBDA_D = 587.6, LAMBDA_F = 486.1, LAMBDA_C = 656.3;
const DISPERSION_SPAN = 1 / (LAMBDA_F * LAMBDA_F) - 1 / (LAMBDA_C * LAMBDA_C);

function cauchyFrom(nd, abbe) {
  const B = (nd - 1) / (abbe * DISPERSION_SPAN);
  return { A: nd - B / (LAMBDA_D * LAMBDA_D), B };
}

// `legacy` pins the exact coefficients a glass shipped with before this
// catalogue existed, so sketches that already use it keep tracing identically.
// Its Abbe number (58.0) is a little low for real N-BK7 — prefer `nbk7` for
// new work, and see the note in the wiki.
const CATALOGUE = [
  { id: 'bk7', label: 'BK7-like (legacy)', nd: 1.51815, legacy: { A: 1.5046, B: 4680 } },
  { id: 'nbk7', label: 'N-BK7 crown (nd 1.517 / V 64.2)', nd: 1.5168, abbe: 64.17 },
  { id: 'silica', label: 'Fused silica (nd 1.459 / V 67.8)', nd: 1.4585, abbe: 67.82 },
  { id: 'nsf5', label: 'N-SF5 flint (nd 1.673 / V 32.3)', nd: 1.6727, abbe: 32.25 },
  { id: 'nsf11', label: 'N-SF11 dense flint (nd 1.785 / V 25.7)', nd: 1.7847, abbe: 25.68 },
];

export const GLASSES = new Map(CATALOGUE.map(g => {
  const { A, B } = g.legacy || cauchyFrom(g.nd, g.abbe);
  return [g.id, {
    ...g, A, B,
    // report the Abbe number the coefficients actually produce, not the one
    // that was asked for — they differ for the legacy entry
    abbe: (A + B / (LAMBDA_D * LAMBDA_D) - 1) / (B * DISPERSION_SPAN),
  }];
}));

export const GLASS_OPTIONS = CATALOGUE.map(g => [g.id, GLASSES.get(g.id).label]);

export const isDispersiveGlass = id => GLASSES.has(id);

// Refractive index of a catalogue glass at a wavelength, in nm.
export function glassIndex(id, wavelength = LAMBDA_D) {
  const g = GLASSES.get(id);
  if (!g) return null;
  const wl = Math.min(20000, Math.max(150, Number(wavelength) || LAMBDA_D));
  return g.A + g.B / (wl * wl);
}

export const glassAbbe = id => GLASSES.get(id)?.abbe ?? null;
