// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Pure viewport and pointer-gesture decisions shared by the workbench.

export const VIEW_MIN_ZOOM = 0.15;
export const VIEW_MAX_ZOOM = 64;

// The 25 mm pitch remains the optical-table reference. At closer views, the
// workbench reveals subdivisions that are useful for sketching without
// pretending they are extra table holes.
export const TABLE_HOLE_PITCH = 25;
export const FINE_GRID_PITCH = 5;
export const MICRO_GRID_PITCH = 1;
export const PRECISION_GRID_PITCH = 0.25;
export const FINE_GRID_MIN_ZOOM = 2;
export const MICRO_GRID_MIN_ZOOM = 8;
export const PRECISION_GRID_MIN_ZOOM = 30;
export const PRECISION_SNAP_MIN_ZOOM = 10;
export const PRECISION_SNAP_PITCH = 0.25;

const INSPECTABLE_SELECTION_MODES = new Set(['move', 'movebeam']);

export function shouldOpenInspectorAfterSelectionGesture({
  mode,
  changed = false,
  maxDistancePx = 0,
  pointerType = 'mouse',
} = {}) {
  if (!INSPECTABLE_SELECTION_MODES.has(mode) || changed) return false;
  // Keep normal click jitter a click while making touch taps forgiving.
  const threshold = pointerType === 'touch' ? 10 : 4;
  return Number.isFinite(maxDistancePx) && maxDistancePx < threshold;
}

export function clampZoom(value, min = VIEW_MIN_ZOOM, max = VIEW_MAX_ZOOM) {
  return Math.min(max, Math.max(min, value));
}

export function gridDetailForZoom(zoom) {
  const z = Number.isFinite(zoom) ? zoom : 1;
  // Two pitches share the 'micro' level, so callers must draw the returned
  // `step` rather than the MICRO_GRID_PITCH constant — see canvas.js.
  if (z >= PRECISION_GRID_MIN_ZOOM) return { step: PRECISION_GRID_PITCH, level: 'micro' };
  if (z >= MICRO_GRID_MIN_ZOOM) return { step: MICRO_GRID_PITCH, level: 'micro' };
  if (z >= FINE_GRID_MIN_ZOOM) return { step: FINE_GRID_PITCH, level: 'fine' };
  return { step: TABLE_HOLE_PITCH, level: 'table' };
}

export function snapToGrid(value, zoom) {
  if (!Number.isFinite(value)) return 0;
  const z = Number.isFinite(zoom) ? zoom : 1;
  // Once the user is past 1000%, pointer movement becomes a precision task.
  // Refine snapping independently of the visible grid so the canvas does not
  // become visually dense until the deeper 3000% zoom tier.
  const step = z >= PRECISION_SNAP_MIN_ZOOM
    ? PRECISION_SNAP_PITCH
    : gridDetailForZoom(z).step;
  return Math.round(value / step) * step;
}

// Zoom around a screen-space point. Coordinates are local to the canvas.
export function zoomViewAt(view, point, factor, min = VIEW_MIN_ZOOM, max = VIEW_MAX_ZOOM) {
  const z = clampZoom(view.z * factor, min, max);
  return {
    x: point.x - (point.x - view.x) * (z / view.z),
    y: point.y - (point.y - view.y) * (z / view.z),
    z,
  };
}

// Zoom rate per pixel of Ctrl/Cmd-wheel delta, and the largest delta one
// event may use: a mouse notch (about 100 px) zooms at most e^(60·0.012) ≈ 2×
// instead of jumping several zoom levels, while a trackpad pinch, which sends
// many small deltas, keeps its continuous feel.
export const WHEEL_ZOOM_RATE = 0.012;
export const WHEEL_ZOOM_MAX_DELTA = 60;

// Browsers deliver a trackpad's two-finger swipe as plain wheel events, the
// same as a mouse wheel, and a trackpad pinch as Ctrl+wheel (Chrome, Edge,
// Firefox). The two devices cannot be told apart reliably, so the modifier
// decides, and every device keeps one consistent meaning:
//   wheel, two-finger swipe  -> pan, both axes (a mouse's X wheel pans sideways)
//   Shift + wheel            -> pan sideways, for mice with one wheel
//   Ctrl/Cmd + wheel, pinch  -> zoom at the pointer
export function wheelView(view, anchor, {
  deltaX = 0, deltaY = 0, deltaMode = 0,
  ctrlKey = false, metaKey = false, shiftKey = false, viewportHeight = 800,
} = {}) {
  // WheelEvent deltas can be pixels, lines or pages depending on the device.
  const pageHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1;
  const dx = Number.isFinite(deltaX) ? deltaX * unit : 0;
  const dy = Number.isFinite(deltaY) ? deltaY * unit : 0;

  if (ctrlKey || metaKey) {
    const delta = Math.max(-WHEEL_ZOOM_MAX_DELTA, Math.min(WHEEL_ZOOM_MAX_DELTA, dy));
    return delta === 0 ? { ...view } : zoomViewAt(view, anchor, Math.exp(-delta * WHEEL_ZOOM_RATE));
  }
  // Some browsers turn Shift+wheel into deltaX themselves; others leave it in
  // deltaY, which then pans sideways here.
  if (shiftKey && dx === 0) return { ...view, x: view.x - dy };
  return { ...view, x: view.x - dx, y: view.y - dy };
}

// Keep the world point below the initial pinch centre below the moving centre.
// This combines two-finger panning and scaling without accumulating drift.
export function pinchView(startView, startCenter, startDistance, center, distance, min = VIEW_MIN_ZOOM, max = VIEW_MAX_ZOOM) {
  const scale = startDistance > 0 ? distance / startDistance : 1;
  const z = clampZoom(startView.z * scale, min, max);
  const worldX = (startCenter.x - startView.x) / startView.z;
  const worldY = (startCenter.y - startView.y) / startView.z;
  return { x: center.x - worldX * z, y: center.y - worldY * z, z };
}
