// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Drawn paths share this catalogue with the palette and browser-independent tools.
export const PATH_TOOLS = [
  { tool: 'beam', kind: 'beam', label: 'Manual beam', desc: 'Draw an explanatory beam path; it does not affect traced rays.' },
  { tool: 'fiber', kind: 'fiber', label: 'Fiber', desc: 'Draw an optical fiber patch cable: click waypoints, double-click to finish.', bare: false },
  { tool: 'barefiber', kind: 'fiber', label: 'Bare fiber', desc: 'Draw a bare optical fiber, without connectors: click waypoints, double-click to finish.', bare: true },
];
export const FIBER_TOOLS = PATH_TOOLS.filter(p => p.kind === 'fiber');
export const PATH_WIDTH_FIELD = { key: 'width', label: 'Width (px)', min: 0.5, max: 20, step: 0.5 };
export const FIBER_INPUT_FIELDS = [
  { key: 'inputNA', label: 'Input NA', default: 0.22, min: 0.01, max: 0.95, step: 0.01 },
  { key: 'groupIndex', label: 'Group index', default: 1.468, min: 1, max: 2.2, step: 0.001 },
  { key: 'lossDbPerM', label: 'Loss (dB/m)', default: 0.2, min: 0, max: 100, step: 0.1 },
];
export const FIBER_OUTPUT_FIELDS = [
  { key: 'mode', label: 'Style', type: 'select', default: 'diverge', options: [['diverge', 'Diverging (NA)'], ['focus', 'Lensed (focus)']] },
  { key: 'na', label: 'NA', type: 'number', default: 0.12, min: 0.01, max: 0.95, step: 0.01 },
  { key: 'focal', label: 'Focal length (mm)', type: 'number', default: 20, min: 2, max: 500, step: 1 },
  { key: 'dia', label: 'Output beam Ø (mm)', type: 'number', default: 6, min: 1, max: 30, step: 0.5 },
];
export function createDrawnPath(type, pts) {
  const def = PATH_TOOLS.find(p => p.tool === type);
  if (!def) throw new Error('Unknown path type: ' + type);
  const base = { id: 'b' + Math.random().toString(36).slice(2, 9), kind: def.kind, pts, color: def.kind === 'fiber' ? '#e8a800' : '#e02020', width: def.kind === 'fiber' ? 4 : 2 };
  if (def.kind === 'beam') return { ...base, dash: false, arrow: true };
  const output = () => Object.fromEntries(FIBER_OUTPUT_FIELDS.map(p => [p.key, p.default]));
  return { ...base, bare: def.bare, propagate: true, ...Object.fromEntries(FIBER_INPUT_FIELDS.map(p => [p.key, p.default])), out0: output(), out1: output() };
}
export function pathMeta(path) {
  const fiber = path.kind === 'fiber';
  return {
    tier: fiber ? (path.propagate ? 'simulated' : 'configurable') : 'diagram',
    label: fiber ? (path.propagate ? 'Simulated' : 'Needs setup') : 'Diagram only',
    description: fiber ? (path.propagate ? 'Routes incoming light between its two configured ends.' : 'Enable propagation to route light through this fiber path.') : 'A visual beam path for explanatory diagrams; it does not affect traced rays.',
    limits: fiber ? (path.fiberModel === 'argon' ? 'Existing single-mode argon capillary model; no ionization, higher modes, resonances or self-steepening.' : 'Existing linear delay, attenuation and constant dispersion model; no higher-order, modal or nonlinear propagation.') : 'Diagram only; never supplies, absorbs or redirects traced rays.',
  };
}
