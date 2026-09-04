// Spectral-lamp data and the helpers that read it. A leaf module so both the
// element registry and the spectrum resolver can use it without either
// importing the other.

import { wavelengthToColor } from './util.js';

// Spectral lamps. Wavelengths are the standard lines these discharges are
// bought for (RP Photonics, "Spectral Lamps"); the relative strengths are
// nominal and deliberately coarse, because a real lamp's line ratios are not
// a specified property at all -- they shift with drive current and with age,
// and are usually left unquoted. They are here to make each lamp
// recognisable, not to be photometry.
export const LAMP_PRESETS = {
  hg: {
    label: 'Mercury (Hg)',
    lines: [
      { nm: 365.0146, w: 0.6 }, { nm: 404.6561, w: 0.5 }, { nm: 435.8343, w: 1.0 },
      { nm: 546.074, w: 1.0 }, { nm: 576.96, w: 0.4 }, { nm: 579.07, w: 0.4 },
      { nm: 1013.98, w: 0.2 },
    ],
  },
  na: {
    label: 'Sodium (Na)',
    // The D doublet rather than its 589.2938 nm mean: the mean is the
    // calibration line, but the pair is what makes sodium recognisable, and
    // the spectrometer keys to 0.1 nm so the two do resolve.
    lines: [{ nm: 588.9950, w: 1.0 }, { nm: 589.5924, w: 0.5 }, { nm: 819.48, w: 0.15 }],
  },
  cd: {
    label: 'Cadmium (Cd)',
    lines: [
      { nm: 361.05, w: 0.4 }, { nm: 467.8149, w: 0.6 }, { nm: 479.9914, w: 0.7 },
      { nm: 508.5822, w: 1.0 }, { nm: 643.8469, w: 0.9 },
    ],
  },
  he: {
    label: 'Helium (He)',
    lines: [
      { nm: 388.86, w: 0.4 }, { nm: 447.15, w: 0.5 }, { nm: 471.31, w: 0.2 },
      { nm: 501.57, w: 0.6 }, { nm: 587.5618, w: 1.0 }, { nm: 667.82, w: 0.4 },
      { nm: 706.5188, w: 0.5 },
    ],
  },
  h: {
    label: 'Hydrogen (H, Balmer)',
    lines: [
      { nm: 410.17, w: 0.15 }, { nm: 434.05, w: 0.3 }, { nm: 486.1327, w: 0.6 },
      { nm: 656.2725, w: 1.0 },
    ],
  },
  ne: {
    label: 'Neon (Ne)',
    // Neon's visible output is dominated by a dense red/orange group, which
    // is why the lamp looks the colour it does.
    lines: [
      { nm: 585.25, w: 0.7 }, { nm: 594.48, w: 0.6 }, { nm: 607.43, w: 0.5 },
      { nm: 614.31, w: 0.7 }, { nm: 626.65, w: 0.6 }, { nm: 640.2248, w: 1.0 },
      { nm: 650.65, w: 0.7 }, { nm: 703.24, w: 0.5 },
    ],
  },
  cs: {
    label: 'Caesium (Cs)',
    lines: [{ nm: 455.53, w: 0.3 }, { nm: 852.11, w: 1.0 }, { nm: 894.35, w: 0.6 }],
  },
  ar: {
    label: 'Argon (Ar)',
    // The near-infrared group is the strongest, but the blue-violet lines are
    // why an argon discharge looks lilac rather than red.
    lines: [
      { nm: 415.86, w: 0.5 }, { nm: 420.07, w: 0.5 }, { nm: 425.94, w: 0.4 },
      { nm: 470.23, w: 0.3 }, { nm: 696.54, w: 0.6 }, { nm: 706.72, w: 0.5 },
      { nm: 738.40, w: 0.6 }, { nm: 750.39, w: 1.0 }, { nm: 763.51, w: 0.9 },
      { nm: 811.53, w: 0.9 },
    ],
  },
};

// The colour a lamp is drawn in: its own lines, weighted, which is why the
// sodium lamp comes out orange and the mercury one blue-white.
export function lampColor(type) {
  const preset = LAMP_PRESETS[type] || LAMP_PRESETS.hg;
  const visible = preset.lines.filter(l => l.nm >= 380 && l.nm <= 780);
  const lines = visible.length ? visible : preset.lines;
  let r = 0, g = 0, b = 0;
  for (const line of lines) {
    const hex = wavelengthToColor(line.nm);
    r += parseInt(hex.slice(1, 3), 16) * line.w;
    g += parseInt(hex.slice(3, 5), 16) * line.w;
    b += parseInt(hex.slice(5, 7), 16) * line.w;
  }
  // Normalised to the brightest channel rather than to the total weight.
  // Averaging washes every multi-line lamp toward grey -- mercury's blue,
  // green and yellow lines average to olive, when a mercury lamp plainly
  // looks blue-white. Scaling to full brightness keeps the hue the lines
  // actually make.
  const peak = Math.max(r, g, b);
  if (!(peak > 0)) return '#cccccc';
  const to = v => Math.max(0, Math.min(255, Math.round((v / peak) * 255)))
    .toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function lampLineSummary(type) {
  const preset = LAMP_PRESETS[type] || LAMP_PRESETS.hg;
  const nm = preset.lines.map(l => l.nm);
  return `${preset.lines.length} lines · ${Math.round(Math.min(...nm))}–${Math.round(Math.max(...nm))} nm`;
}
