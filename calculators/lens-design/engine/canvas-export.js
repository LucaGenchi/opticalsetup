// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// A design as an OpticalSetup canvas scene: one Lens group (the canvas's
// surface-table element, sketch/js/lensgroup.js) lit by a collimated laser
// at the primary wavelength. The canvas traces in 2D and spaces cemented
// faces by its tracer's 0.06 mm gap, so its numbers are its own; this only
// carries the prescription across. What the Lens group cannot hold is
// refused with a reason, never approximated. The Lens group also gives every
// surface one clear diameter and thickens a lens whose faces would cross at
// that height; when that or the cement gap moves the focal length, `note`
// says by how much.

import { MAX_SURFACE_ROWS, ROW_RADIUS_MAX, ROW_THICKNESS_MIN, ROW_THICKNESS_MAX, MIN_CEMENT_GAP, normalizeSurfaceTable, surfaceTableCardinals } from '../../../sketch/js/lensgroup.js';
import { AIR, CONSTANT } from './materials.js';

const LASER_WIDTH = [1, 60];

export function canvasScene(system, result = null) {
  const S = system.surfaces;
  const reasons = [];
  if (S.length < 2) reasons.push('a Lens group needs at least two surfaces');
  if (S.length > MAX_SURFACE_ROWS) reasons.push(`a Lens group holds at most ${MAX_SURFACE_ROWS} surfaces`);
  if (S.some(s => s.type === 'paraxial')) reasons.push('the canvas has no ideal-lens surface (use its Lens element instead)');
  if (S.some(s => s.conic || s.asphere.some(Boolean))) reasons.push('Lens group surfaces are spherical (the canvas’s Aspheric lens is a singlet)');
  if (S.some(s => s.material === CONSTANT)) reasons.push('Lens group glasses come from the catalogue; a constant index has no equivalent');
  if (S.some(s => Math.abs(s.radius) > ROW_RADIUS_MAX)) reasons.push(`Lens group radii are limited to ±${ROW_RADIUS_MAX} mm (use ∞ for flat)`);
  if (S.slice(0, -1).some(s => s.thickness < ROW_THICKNESS_MIN || s.thickness > ROW_THICKNESS_MAX)) reasons.push(`Lens group spacings run from ${ROW_THICKNESS_MIN} to ${ROW_THICKNESS_MAX} mm`);
  if (S.at(-1).material !== AIR) reasons.push('the last surface must exit into air');
  if (reasons.length) return { ok: false, reasons };

  const stop = S.find(s => s.stop);
  const stopRadius = result?.firstOrder?.stopRadius;
  const rows = S.map(s => {
    const row = { r: s.radius, thickness: s.thickness, glass: s.material };
    if (s === stop && s.material === AIR && Number.isFinite(stopRadius)) {
      row.stop = true;
      row.stopDiameter = 2 * stopRadius;
    }
    return row;
  });
  const sd = result?.surfaces ? Math.max(...result.surfaces.map(d => d.rim ?? d.sd)) : 12.7;
  const dia = Math.min(500, Math.max(1, 2 * sd));
  const nm = system.wavelengthsNm[system.primaryWavelength];
  const length = S.slice(0, -1).reduce((sum, s) => sum + s.thickness, 0);
  const epd = result?.firstOrder?.epd ?? 10;
  const canvasEfl = surfaceTableCardinals(normalizeSurfaceTable(rows), nm, { diameter: dia }).f;
  const efl = result?.firstOrder?.efl;
  const note = Number.isFinite(efl) && Math.abs(canvasEfl - efl) > 1e-5 * Math.abs(efl)
    ? `The canvas’s Lens group gives every surface one ${Number(dia.toFixed(2))} mm clear aperture (thickening any lens whose faces would cross there) and holds cemented faces ${MIN_CEMENT_GAP} mm apart, so it reports f = ${Number(canvasEfl.toPrecision(6))} mm (here ${Number(efl.toPrecision(6))} mm).`
    : '';
  return {
    ok: true, canvasEfl, note,
    scene: {
      app: 'optics2d', version: 1, beams: [],
      elements: [
        {
          id: 'laser', type: 'cwlaser', x: -Math.round(length / 2 + 80), y: 0, rot: 0,
          label: `${Number(nm.toFixed(1))} nm`, showLabel: true,
          params: { wavelength: nm, avgPowerW: 0.01, beamMode: 'beam', beamWidth: Math.min(LASER_WIDTH[1], Math.max(LASER_WIDTH[0], epd)) },
        },
        {
          id: 'lens', type: 'lensgroup', x: 0, y: 0, rot: 0,
          label: system.name, showLabel: true, labelPos: 'b',
          params: { preset: 'custom', rows, dia, transEff: 100 },
        },
      ],
    },
  };
}
