// SVG canvas: rendering + pointer interactions (select, move, rotate, pan, zoom,
// element placement, manual beam drawing/editing).

import { state, changed, pushUndo, findSelected } from './state.js';
import {
  registry, getSize, boxAnchor, getVisualBounds, getDirectManipulation, createElement, labelSVG,
  stageOffsetAt, retroOffsetAt, voxelDepthFactor, displayCableSVG, specimenTypeOf,
  displayActionUpdate,
} from './elements.js';
import {
  OBJECTIVE_FRONT_X, normalizeObjectiveParams, objectiveBackFocalPlaneX, objectiveWorkingDistance,
} from './objective.js';
import { immersionLayerSVG } from './immersion.js';
import { traceScene } from './raytrace.js';
import { pulseArrivalsAtPath, pulseMarkers } from './pulses.js';
import { toLocal, toWorld, rotPt, distToSegment, distinctPoints, manualBeamSVG, esc } from './util.js';
import {
  appendBoundaryGesture, boundaryBounds, boundaryPathData, boundarySegments, isSimpleBoundary,
} from './polygon.js';
import {
  FINE_GRID_PITCH, MICRO_GRID_PITCH, TABLE_HOLE_PITCH,
  gridDetailForZoom, pinchView, snapToGrid, VIEW_MAX_ZOOM, VIEW_MIN_ZOOM, zoomViewAt,
} from './viewport.js';
import {
  MAX_TIME_SCALE, MIN_TIME_SCALE, pulsePeriodNs, pulsesReadAsCW,
} from './timescale.js';

let svg, viewport, gridLayer, highlightLayer, immersionLayer, beamLayer, pulseLayer, manualLayer, elementLayer, voxelLayer, overlayLayer;
let statusEl;
let pulseTracks = [];
let writeHits = [];
let signalHits = [];
const sampleHitPositions = new Map();
let pulseFrame = null;
let motionFrame = null;
let motionStartMs = null;
let motionTimeSeconds = 0;
let motionLastRenderMs = 0;
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pulsePlayback = {
  playing: true, timeNs: 0, speedNsPerSecond: 10, mode: 'schematic', lastFrameMs: null,
  // "Mechanics" mode: pulses stop trying to sync to a numeric time scale
  // (always drawn as steady CW) so galvo/stage/retroreflector motion can run
  // purely illustratively, watchable regardless of their real frequency.
  mechanicsMode: false,
};
// Set while at least one pulse train is being drawn as steady CW light
// because its period sits too far from the current time scale.
let cwFallbackActive = false;
const voxelMarks = new Map();
const voxelEventKeys = new Set();
const MAX_VOXELS_PER_STAGE = 1200;
export let onSelectionChange = () => { };
export function setSelectionCallback(fn) { onSelectionChange = fn; }
export let onMeasurementsChange = () => { };
export function setMeasurementsCallback(fn) { onMeasurementsChange = fn; }

export function initCanvas(svgElement, statusElement) {
  svg = svgElement;
  statusEl = statusElement;
  svg.innerHTML = `
    <defs>
      <linearGradient id="pulseSpectrum" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#7c3aed"/><stop offset="0.22" stop-color="#2563eb"/>
        <stop offset="0.45" stop-color="#10b981"/><stop offset="0.65" stop-color="#eab308"/>
        <stop offset="0.82" stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/>
      </linearGradient>
    </defs>
    <g id="viewport">
      <g id="gridLayer"></g>
      <g id="highlightLayer"></g>
      <g id="immersionLayer" pointer-events="none"></g>
      <g id="beamLayer"></g>
      <g id="pulseLayer" pointer-events="none"></g>
      <g id="manualLayer"></g>
      <g id="elementLayer"></g>
      <g id="voxelLayer" pointer-events="none"></g>
      <g id="overlayLayer"></g>
    </g>`;
  viewport = svg.querySelector('#viewport');
  gridLayer = svg.querySelector('#gridLayer');
  highlightLayer = svg.querySelector('#highlightLayer');
  immersionLayer = svg.querySelector('#immersionLayer');
  beamLayer = svg.querySelector('#beamLayer');
  pulseLayer = svg.querySelector('#pulseLayer');
  manualLayer = svg.querySelector('#manualLayer');
  elementLayer = svg.querySelector('#elementLayer');
  voxelLayer = svg.querySelector('#voxelLayer');
  overlayLayer = svg.querySelector('#overlayLayer');
  bindPointer();
  bindWheel();
  if (reduceMotion) pulsePlayback.playing = false;
  document.addEventListener('visibilitychange', () => {
    pulsePlayback.lastFrameMs = null;
    motionStartMs = null;
  });
}

// ---------- coordinates ----------
export function screenToWorld(sx, sy) {
  const r = svg.getBoundingClientRect();
  const v = state.view;
  return { x: (sx - r.left - v.x) / v.z, y: (sy - r.top - v.y) / v.z };
}

function snapPos(v, bypass = false) {
  if (!state.snap || bypass) return v;
  return snapToGrid(v, state.view.z);
}

// Snap an element so that its OPTICALLY ACTIVE point (mirror face, lens
// plane, laser aperture, detector window... def.snapPt, local coords) lands
// exactly on a table hole — not just the element's center.
function snapElPos(el, wx, wy, bypass = false) {
  if (!state.snap || bypass) return { x: wx, y: wy };
  const def = registry[el.type];
  const spl = def && def.snapPt ? def.snapPt : { x: 0, y: 0 };
  const sp = rotPt(spl.x, spl.y, el.rot || 0);
  return {
    x: snapToGrid(wx + sp.x, state.view.z) - sp.x,
    y: snapToGrid(wy + sp.y, state.view.z) - sp.y,
  };
}

function constrainPoint(origin, point, incrementDeg = 45) {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return { ...origin };
  const step = incrementDeg * Math.PI / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + length * Math.cos(angle), y: origin.y + length * Math.sin(angle) };
}

// ---------- rendering ----------
export function renderAll() {
  const v = state.view;
  viewport.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.z})`);
  renderGrid();
  renderHighlights();
  renderImmersion();
  renderBeams();
  renderManual();
  renderElements();
  renderVoxels();
  renderOverlay();
  syncMotionAnimation();
  notifyViewChange();
}

export function getViewportDetail() {
  const grid = gridDetailForZoom(state.view.z);
  return { zoom: state.view.z, ...grid, snap: state.snap };
}

function notifyViewChange() {
  document.dispatchEvent(new CustomEvent('optics:viewchange', { detail: getViewportDetail() }));
}

function animatedStageElement(el) {
  const local = stageOffsetAt(el.params, motionTimeSeconds);
  if (!local.x && !local.y) return el;
  // Rotate the local XY/Z offset into world space by the element's own
  // rotation (same pattern as animatedRetroElement below), so XY scan stays
  // parallel to the stage's long axis and Z stays perpendicular to it
  // whatever angle the stage is placed at.
  const offset = rotPt(local.x, local.y, el.rot || 0);
  return { ...el, x: el.x + offset.x, y: el.y + offset.y };
}

function animatedRetroElement(el) {
  const local = retroOffsetAt(el.params, motionTimeSeconds);
  if (!local.x && !local.y) return el;
  const offset = rotPt(local.x, local.y, el.rot || 0);
  return { ...el, x: el.x + offset.x, y: el.y + offset.y };
}

// The live excitation spot, drawn where the beam actually lands on the
// specimen. Offered by both holders, so the plain sample gets it too — only
// the piezo stage additionally moves under it.
function withSignalSpot(el, moved = el) {
  if (!moved.params.showSignalSpot) return moved;
  const hit = sampleHitPositions.get(el.id);
  if (!hit) return moved;
  return { ...moved, _signalHitLocal: { ...toLocal(moved, hit.x, hit.y), wl: hit.wl } };
}

function stageWithSignalSpot(el) {
  return withSignalSpot(el, animatedStageElement(el));
}

// The one simulated-time axis shared by pulse packets, chopper gating, AOM
// modulation and galvo scanning, in simulated nanoseconds. When a pulsed
// source is on the table its playback clock IS this clock, so everything is
// phase-locked to the same packets; with no pulses, simulated time is
// derived from the motion clock at the same ns-per-second scale so those
// elements still animate — and still respond to the time-scale selector.
function simulatedTimeNs() {
  return pulseTracks.length
    ? pulsePlayback.timeNs
    : motionTimeSeconds * pulsePlayback.speedNsPerSecond;
}

// Longest a full cycle may take on screen before an element counts as
// unwatchable at the current time scale.
const ILLUSTRATIVE_MAX_CYCLE_S = 12;

// A galvo's real mechanical range (0.01–200 Hz, i.e. periods of 5 ms to 100 s)
// only partly overlaps the 1 ns/s–1 ms/s scale window. Where it does overlap
// the mirror runs on the shared simulated clock and stays phase-locked to
// pulses, chopper gating and AOM modulation. Where it does not — a 1 Hz galvo
// would need ~1000 real seconds per sweep even at 1 ms/s — it falls back to
// the same illustrative wall-clock treatment as the piezo stage and the
// retroreflector, so the mirror still visibly scans instead of freezing.
function galvoAnimationSeconds(params) {
  const hz = Math.max(0.01, params.scanFrequencyHz || 1);
  // Mechanics mode deliberately opts every mechanical element out of the
  // simulated clock, regardless of frequency — see pulsePlayback.mechanicsMode.
  if (!pulsePlayback.mechanicsMode) {
    const cyclesPerRealSecond = hz * (pulsePlayback.speedNsPerSecond / 1e9);
    if (cyclesPerRealSecond * ILLUSTRATIVE_MAX_CYCLE_S >= 1) return simulatedTimeNs() / 1e9;
  }
  return motionTimeSeconds / (hz * ILLUSTRATIVE_MAX_CYCLE_S);
}

// Drives only the wheel icon's rotation — the traced beam no longer depends
// on live time (chopped CW light is drawn as a fixed chunk pattern, the same
// on the live canvas and in static exports; see raytrace.js's 'chop' case).
function animatedChopper(el) {
  return { ...el, _animationTimeS: motionTimeSeconds, _simulationTimeNs: simulatedTimeNs() };
}

function animatedOpticalElements() {
  if (!hasGalvoMotion() && !hasStageMotion() && !hasRetroMotion()) return state.elements;
  return state.elements.map(el => {
    if (el.type === 'galvo' && el.params.scanMode !== 'static') {
      return { ...el, _animationTimeS: galvoAnimationSeconds(el.params) };
    }
    if (el.type === 'stage') return animatedStageElement(el);
    if (el.type === 'retroreflector') return animatedRetroElement(el);
    return el;
  });
}

function animatedVisualElements() {
  if (!hasMotion() && !hasSignalSpotStage()) return state.elements;
  return state.elements.map(el => {
    if (el.type === 'galvo' && el.params.scanMode !== 'static') {
      return { ...el, _animationTimeS: galvoAnimationSeconds(el.params) };
    }
    if (!reduceMotion && el.type === 'chopper' && el.params.modulate) return animatedChopper(el);
    if (el.type === 'stage') return stageWithSignalSpot(el);
    if (el.type === 'sample') return withSignalSpot(el);
    if (el.type === 'retroreflector') return animatedRetroElement(el);
    return el;
  });
}

function renderImmersion() {
  if (!immersionLayer) return;
  immersionLayer.innerHTML = immersionLayerSVG(animatedVisualElements(), state.beams, {
    baseElements: state.elements,
  });
}

function hasMotion() {
  return state.elements.some(el => (el.type === 'galvo' && el.params.scanMode !== 'static')
    || (el.type === 'chopper' && el.params.modulate)
    || (el.type === 'stage' && el.params.pzMode && el.params.pzMode !== 'static')
    || (el.type === 'retroreflector' && el.params.moveMode === 'linear'));
}

function hasGalvoMotion() {
  return state.elements.some(el => el.type === 'galvo' && el.params.scanMode !== 'static');
}

function hasStageMotion() {
  return state.elements.some(el => el.type === 'stage' && el.params.pzMode && el.params.pzMode !== 'static');
}

function hasRetroMotion() {
  return state.elements.some(el => el.type === 'retroreflector' && el.params.moveMode === 'linear');
}

function hasSignalSpotStage() {
  return state.elements.some(el => (el.type === 'stage' || el.type === 'sample') && el.params.showSignalSpot);
}

function hasChopperMotion() {
  return state.elements.some(el => el.type === 'chopper' && el.params.modulate);
}

function animateMotion(nowMs) {
  motionFrame = null;
  if (reduceMotion || !hasMotion()) return;
  if (motionStartMs === null) motionStartMs = nowMs;
  motionTimeSeconds = Math.max(0, (nowMs - motionStartMs) / 1000);
  if (nowMs - motionLastRenderMs >= 1000 / 30) {
    motionLastRenderMs = nowMs;
    const opticalMotion = hasGalvoMotion() || hasStageMotion() || hasRetroMotion();
    if (hasStageMotion()) renderImmersion();
    if (opticalMotion) renderBeams();
    renderElements();
    renderVoxels();
    renderOverlay();
    const selected = findSelected();
    if (opticalMotion && selected && (registry[selected.type]?.readoutKind || selected.type === 'display')) onMeasurementsChange();
  }
  motionFrame = requestAnimationFrame(animateMotion);
}

function syncMotionAnimation() {
  if (!reduceMotion && hasMotion()) {
    if (motionFrame === null) motionFrame = requestAnimationFrame(animateMotion);
  } else if (motionFrame !== null) {
    cancelAnimationFrame(motionFrame);
    motionFrame = null;
    motionStartMs = null;
    motionTimeSeconds = 0;
  }
}

function renderGrid() {
  if (!state.showGrid) { gridLayer.innerHTML = ''; return; }
  const r = svg.getBoundingClientRect(), v = state.view;
  const x0 = -v.x / v.z - TABLE_HOLE_PITCH;
  const y0 = -v.y / v.z - TABLE_HOLE_PITCH;
  const x1 = x0 + r.width / v.z + 2 * TABLE_HOLE_PITCH;
  const y1 = y0 + r.height / v.z + 2 * TABLE_HOLE_PITCH;
  const { level } = gridDetailForZoom(v.z);
  // vector-effect keeps this in screen space, so use a literal hairline
  // width rather than compensating for zoom a second time.
  const lineWidth = 0.55;
  let s = '';

  // The smaller grid lines stay hairline-thin on screen: zoom reveals spatial
  // detail rather than turning the workbench into heavy graph paper.
  if (level === 'micro') s += gridLines(x0, y0, x1, y1, MICRO_GRID_PITCH, '#eef1f4', lineWidth);
  if (level !== 'table') s += gridLines(x0, y0, x1, y1, FINE_GRID_PITCH, '#e2e7ec', lineWidth);

  const majorStartX = Math.floor(x0 / TABLE_HOLE_PITCH) * TABLE_HOLE_PITCH;
  const majorStartY = Math.floor(y0 / TABLE_HOLE_PITCH) * TABLE_HOLE_PITCH;
  const holeRadius = 1.35 / v.z;
  for (let x = majorStartX; x <= x1; x += TABLE_HOLE_PITCH) {
    for (let y = majorStartY; y <= y1; y += TABLE_HOLE_PITCH) {
      s += `<circle cx="${x}" cy="${y}" r="${holeRadius}" fill="#cbd3dc"/>`;
    }
  }
  gridLayer.innerHTML = s;
}

function gridLines(x0, y0, x1, y1, step, color, width) {
  const startX = Math.floor(x0 / step) * step;
  const startY = Math.floor(y0 / step) * step;
  let d = '';
  for (let x = startX; x <= x1; x += step) d += `M ${x} ${y0} V ${y1}`;
  for (let y = startY; y <= y1; y += step) d += `M ${x0} ${y} H ${x1}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
}

function ptsAttr(pts) { return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }

function renderBeams() {
  const scene = traceScene(animatedOpticalElements(), state.beams);
  const drawables = scene.drawables;
  pulseTracks = scene.pulseTracks;
  writeHits = scene.writeHits || [];
  signalHits = scene.signalHits || [];
  sampleHitPositions.clear();
  for (const hit of signalHits) sampleHitPositions.set(hit.stageId, hit);
  let s = '';
  for (const d of drawables) {
    if (d.type === 'poly') {
      s += `<polygon points="${ptsAttr(d.pts)}" fill="${d.color}" opacity="${d.opacity}" stroke="none"/>`;
    } else if (d.type === 'dots') {
      s += `<g fill="${d.color}">` + d.dots.map(o => `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="${o.r.toFixed(2)}" opacity="${o.o.toFixed(2)}"/>`).join('') + `</g>`;
    } else {
      s += `<polyline points="${ptsAttr(d.pts)}" fill="none" stroke="${d.color}" stroke-width="${d.w}" opacity="${d.opacity}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" ${d.dash ? `stroke-dasharray="${d.dash === true ? '6 4' : d.dash}"` : ''}/>`;
    }
  }
  beamLayer.innerHTML = s;
  renderPulseLayer();
  syncPulseAnimation();
  notifyPulseState();
}

function renderVoxels() {
  if (!voxelLayer) return;
  const z = state.view.z || 1;
  let s = '';
  for (const stage of state.elements) {
    if (stage.type !== 'stage' || !stage.params.voxelPreview) continue;
    const marks = voxelMarks.get(stage.id);
    if (!marks?.length) continue;
    const displayedStage = animatedStageElement(stage);
    for (const mark of marks) {
      const point = toWorld(displayedStage, mark.x, mark.y);
      const size = Math.max(0.1, mark.size);
      const half = size / 2;
      s += `<g transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${displayedStage.rot || 0})">` +
        `<rect x="${(-half).toFixed(2)}" y="${(-half).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" rx="${Math.min(0.16, half).toFixed(2)}" fill="#b15cff" opacity="${mark.opacity.toFixed(2)}" stroke="#5b21b6" stroke-width="${(0.55 / z).toFixed(2)}" vector-effect="non-scaling-stroke"/>` +
        `</g>`;
    }
  }
  voxelLayer.innerHTML = s;
}

function recordVoxelHits(fromTimeNs, toTimeNs) {
  if (toTimeNs <= fromTimeNs || !writeHits.length) return;
  for (const hit of writeHits) {
    const stage = state.elements.find(el => el.id === hit.stageId && el.type === 'stage');
    if (!stage || specimenTypeOf(stage.params) !== 'resin' || !stage.params.voxelPreview || !Number.isFinite(hit.opl)) continue;
    const track = {
      pts: [{ x: hit.x - 1, y: hit.y }, { x: hit.x + 1, y: hit.y }],
      opls: [Math.max(0, hit.opl - 1), hit.opl + 1],
      pulse: hit.pulse,
    };
    const arrivals = pulseArrivalsAtPath(track, fromTimeNs, toTimeNs, hit.opl, {
      mode: pulsePlayback.mode,
    });
    if (!arrivals.length) continue;
    const offset = stageOffsetAt(stage.params, motionTimeSeconds);
    const local = toLocal(animatedStageElement(stage), hit.x, hit.y);
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) continue;
    // Volumetric qualitative effect: the further the sample currently sits
    // from the stage's nominal Z=0 focal plane (the local-y axis — see
    // stageOffsetAt), the more the voxel broadens and fades — a 2D stand-in
    // for real axial defocus, not a calculated point-spread function.
    const depthFactor = voxelDepthFactor(offset.y, stage.params.pzTravelZ ?? 8);
    const baseSize = Math.min(6, Math.max(0.1, stage.params.voxelSize ?? 0.6));
    const size = Math.min(10, baseSize * (1 + depthFactor * 1.5));
    for (const arrival of arrivals) {
      const key = `${hit.stageId}:${hit.pulse.sourceId || 'pulse'}:${Math.round(hit.opl * 1000)}:${Math.round(arrival.timeNs * 1e6)}`;
      if (voxelEventKeys.has(key)) continue;
      voxelEventKeys.add(key);
      const marks = voxelMarks.get(hit.stageId) || [];
      marks.push({
        x: local.x,
        y: local.y,
        size,
        opacity: Math.min(0.9, 0.3 + 0.5 * Math.sqrt(Math.max(0, hit.intensity * arrival.transmission))) * (1 - depthFactor * 0.6),
      });
      if (marks.length > MAX_VOXELS_PER_STAGE) marks.splice(0, marks.length - MAX_VOXELS_PER_STAGE);
      voxelMarks.set(hit.stageId, marks);
    }
  }
}

export function clearVoxelPreview(stageId = null) {
  if (stageId) {
    voxelMarks.delete(stageId);
    for (const key of voxelEventKeys) if (key.startsWith(`${stageId}:`)) voxelEventKeys.delete(key);
  } else {
    voxelMarks.clear();
    voxelEventKeys.clear();
  }
  renderVoxels();
}

function notifyPulseState() {
  document.dispatchEvent(new CustomEvent('optics:pulsestate', { detail: getPulsePlayback() }));
}

function renderPulseLayer() {
  if (!pulseLayer) return;
  if (!pulseTracks.length) {
    pulseLayer.innerHTML = '';
    cwFallbackActive = false;
    lastCwFallback = null; // a scene with no pulse trains has nothing to switch between
    return;
  }
  const z = state.view.z || 1;
  let s = '';
  let suppressed = false;
  for (const track of pulseTracks) {
    // Mechanics mode deliberately decouples pulses from any numeric time
    // scale — every train draws as steady CW so galvo/stage/retroreflector
    // motion can be watched illustratively without chasing a pulse rate.
    // Otherwise: too far from the time scale in either direction and the
    // packets stop reading as pulses — drop the overlay and let the steady
    // traced beam stand in for CW light.
    if (pulsePlayback.mechanicsMode
      || pulsesReadAsCW(pulsePeriodNs(track.pulse?.repRateMHz), pulsePlayback.speedNsPerSecond)) {
      suppressed = true;
      continue;
    }
    for (const marker of pulseMarkers(track, pulsePlayback.timeNs, { mode: pulsePlayback.mode })) {
      const physicalMin = 9 / z;
      // Femtosecond packets are far below a screen pixel even in physical
      // mode. The minimum glyph is therefore already schematic; scale that
      // floor by the real duration ratio so GDD remains visible without
      // misreporting the true c·tau length stored on the marker.
      const width = pulsePlayback.mode === 'physical'
        ? Math.max(marker.widthMm, physicalMin * (marker.visualStretch || 1))
        : marker.widthMm;
      const rx = Math.max(2 / z, width / 2);
      const ry = Math.max(2.2 / z, Math.min(5 / z, 2.5 / z + 1.4 * Math.sqrt(Math.max(0, track.intensity || 0)) / z));
      const transmission = marker.transmission ?? 1;
      const opacity = Math.max(0.03, Math.min(0.95,
        (0.45 + 0.45 * (track.intensity || 0)) * transmission));
      const highlightOpacity = Math.max(0.04, 0.82 * Math.sqrt(transmission));
      const packetFill = track.bw >= 200 ? 'url(#pulseSpectrum)' : track.color;
      s += `<g class="pulse-marker" data-duration-fs="${marker.pulseWidthFs.toFixed(3)}" data-gdd-fs2="${marker.gddFs2.toFixed(3)}" transform="translate(${marker.x.toFixed(2)} ${marker.y.toFixed(2)}) rotate(${marker.angle.toFixed(2)})">` +
        `<ellipse rx="${(rx * 1.65).toFixed(2)}" ry="${(ry * 1.8).toFixed(2)}" fill="${packetFill}" opacity="${(opacity * 0.18).toFixed(2)}"/>` +
        `<ellipse rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="${packetFill}" opacity="${opacity.toFixed(2)}"/>` +
        `<ellipse rx="${Math.max(1 / z, rx * 0.32).toFixed(2)}" ry="${Math.max(0.8 / z, ry * 0.45).toFixed(2)}" fill="#fff" opacity="${highlightOpacity.toFixed(2)}"/>` +
        `</g>`;
    }
  }
  pulseLayer.innerHTML = s;
  cwFallbackActive = suppressed;
  announcePulseRepresentation(suppressed);
}

// Announce only the transition between packet and CW-style drawing, anchored
// over the pulsed source it applies to. renderPulseLayer() runs every frame,
// so anything that fires unconditionally here would spam.
let lastCwFallback = null;
function announcePulseRepresentation(nowCw) {
  if (lastCwFallback === nowCw) return;
  const firstObservation = lastCwFallback === null;
  lastCwFallback = nowCw;
  if (firstObservation) return; // the initial state is not a switch
  const source = state.elements.find(el =>
    (el.type === 'pulsedlaser' || el.type === 'sclaser') && el.params.showPulse !== false);
  if (!source) return;
  const v = state.view;
  document.dispatchEvent(new CustomEvent('optics:pulserepresentation', {
    detail: {
      cw: nowCw,
      message: nowCw
        ? 'Time scale not suitable for pulses representation, switching to CW graphics for pulsed laser.'
        : "Switching to temporal representation to show laser's pulses.",
      x: source.x * v.z + v.x,
      y: source.y * v.z + v.y,
    },
  }));
}

function animatePulses(nowMs) {
  pulseFrame = null;
  if (!pulsePlayback.playing || !pulseTracks.length) return;
  const previousTimeNs = pulsePlayback.timeNs;
  if (pulsePlayback.lastFrameMs !== null) {
    const elapsedSeconds = Math.min(0.05, Math.max(0, (nowMs - pulsePlayback.lastFrameMs) / 1000));
    pulsePlayback.timeNs += elapsedSeconds * pulsePlayback.speedNsPerSecond;
  }
  pulsePlayback.lastFrameMs = nowMs;
  recordVoxelHits(previousTimeNs, pulsePlayback.timeNs);
  renderPulseLayer();
  renderVoxels();
  pulseFrame = requestAnimationFrame(animatePulses);
}

function syncPulseAnimation() {
  if (pulsePlayback.playing && pulseTracks.length) {
    if (pulseFrame === null) pulseFrame = requestAnimationFrame(animatePulses);
  } else if (pulseFrame !== null) {
    cancelAnimationFrame(pulseFrame);
    pulseFrame = null;
    pulsePlayback.lastFrameMs = null;
  }
}

export function getPulsePlayback() {
  return { ...pulsePlayback, hasPulses: pulseTracks.length > 0, cwFallback: cwFallbackActive };
}

export function setPulsePlaying(playing) {
  pulsePlayback.playing = !!playing;
  pulsePlayback.lastFrameMs = null;
  syncPulseAnimation();
  notifyPulseState();
}

export function setPulseSpeed(speedNsPerSecond) {
  if (Number.isFinite(speedNsPerSecond)) {
    pulsePlayback.speedNsPerSecond = Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, speedNsPerSecond));
  }
  pulsePlayback.mechanicsMode = false; // picking a numeric scale always leaves Mechanics mode
  pulsePlayback.lastFrameMs = null;
  renderPulseLayer();
  notifyPulseState();
}

// "Mechanics": pulses always draw as CW and galvo motion always runs
// illustratively, regardless of frequency — see pulsePlayback.mechanicsMode.
export function setMechanicsMode(on) {
  pulsePlayback.mechanicsMode = !!on;
  pulsePlayback.lastFrameMs = null;
  renderPulseLayer();
  notifyPulseState();
}

export function setPulseDisplayMode(mode) {
  pulsePlayback.mode = mode === 'physical' ? 'physical' : 'schematic';
  renderPulseLayer();
  notifyPulseState();
}

export function resetPulseTime() {
  pulsePlayback.timeNs = 0;
  pulsePlayback.lastFrameMs = null;
  clearVoxelPreview();
  renderPulseLayer();
  notifyPulseState();
}

function renderManual() {
  let s = '';
  for (const b of state.beams) s += `<g vector-effect="non-scaling-stroke">${manualBeamSVG(b)}</g>`;
  // in-progress beam / fiber
  if (drawing) {
    const c = (drawing.kindType === 'fiber' || drawing.kindType === 'barefiber') ? '#c98f00' : '#e02020';
    const pts = [...drawing.pts];
    if (drawing.cursor) pts.push(drawing.cursor);
    if (pts.length > 1) s += `<polyline points="${ptsAttr(pts)}" fill="none" stroke="${c}" stroke-width="2" opacity="0.6" stroke-dasharray="4 4"/>`;
    for (const p of drawing.pts) s += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${c}"/>`;
  }
  if (polygonDrawing) {
    const z = state.view.z || 1;
    const pts = polygonDrawing.pts.map(p => ({ ...p }));
    if (polygonDrawing.press?.curved) pts.push({ ...polygonDrawing.press.start, arc: true });
    if (polygonDrawing.cursor && polygonDrawing.pts.length) pts.push({ ...polygonDrawing.cursor });
    const openPath = boundaryPathData(pts, { closed: false });
    const anchorCount = pts.filter(p => p.arc !== true).length;
    if (anchorCount >= 3) {
      const closedPath = boundaryPathData(pts);
      if (closedPath) s += `<path d="${closedPath}" fill="rgba(111,177,219,0.15)" stroke="none"/>`;
    }
    if (openPath) {
      s += `<path d="${openPath}" fill="none" stroke="#4a90c4" stroke-width="${1.7 / z}" stroke-dasharray="${5 / z} ${4 / z}" stroke-linejoin="round"/>`;
    }
    if (polygonDrawing.pts.length >= 2 && polygonDrawing.cursor) {
      const first = polygonDrawing.pts[0], cur = polygonDrawing.cursor;
      s += `<line x1="${cur.x}" y1="${cur.y}" x2="${first.x}" y2="${first.y}" stroke="#7ba9ca" stroke-width="${1 / z}" stroke-dasharray="${3 / z} ${4 / z}"/>`;
    }
    polygonDrawing.pts.forEach((p, i) => {
      const r = (i === 0 ? 5.5 : 3.8) / z;
      const curveNode = p.arc === true;
      s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#fff" stroke="${curveNode ? '#8b5cf6' : '#2f6fed'}" stroke-width="${1.5 / z}"/>`;
    });
    if (polygonDrawing.press?.curved) {
      const p = polygonDrawing.press.start;
      s += `<circle cx="${p.x}" cy="${p.y}" r="${4.2 / z}" fill="#fff" stroke="#8b5cf6" stroke-width="${1.7 / z}"/>`;
    }
    if (polygonDrawing.cursor && polygonDrawing.pts.length) {
      const previewSegments = boundarySegments(pts, { closed: false });
      const segment = previewSegments.at(-1);
      const length = segment?.kind === 'arc'
        ? Math.abs(segment.arc.r * segment.arc.sweep)
        : segment ? Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) : 0;
      const angle = segment
        ? Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x) * 180 / Math.PI : 0;
      const label = `${segment?.kind === 'arc' ? 'arc · ' : ''}${length.toFixed(1)} mm · ${angle.toFixed(0)}°`;
      const b = polygonDrawing.cursor;
      s += `<g transform="translate(${b.x + 9 / z} ${b.y - 24 / z})"><rect x="0" y="0" width="${(label.length * 6.1 + 12) / z}" height="${18 / z}" rx="${5 / z}" fill="rgba(255,255,255,0.96)" stroke="#c8d8e8" stroke-width="${1 / z}"/><text x="${6 / z}" y="${12.2 / z}" font-size="${10 / z}" fill="#4f657d">${label}</text></g>`;
    }
  }
  manualLayer.innerHTML = s;
}

// Background elements draw in their own layer, behind the grid holes and
// everything else, so they read as scenery and never sit on top of a beam or
// a device — see the layer order set up in mountCanvas(). A registry entry
// opts in with `background: true`; today that is only the highlight wash.
const isBackground = el => registry[el.type]?.background === true;

function renderHighlights() {
  let s = '';
  for (const el of state.elements) {
    if (!isBackground(el)) continue;
    s += `<g data-element-id="${esc(el.id)}" transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})" vector-effect="non-scaling-stroke">${registry[el.type].svg(el)}</g>`;
    s += labelSVG(el);
  }
  highlightLayer.innerHTML = s;
}

function renderElements() {
  let s = '';
  const elements = animatedVisualElements().filter(el => !isBackground(el));
  for (const el of elements) {
    if (el.type === 'display') s += displayCableSVG(el, elements);
  }
  for (const el of elements) {
    const def = registry[el.type];
    if (!def) continue;
    s += `<g data-element-id="${esc(el.id)}" transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})" vector-effect="non-scaling-stroke">${def.svg(el, elements)}</g>`;
    s += labelSVG(el);
  }
  // placement ghost
  if (placing && placing.pos) {
    const el = placing.el;
    s += `<g transform="translate(${placing.pos.x} ${placing.pos.y}) rotate(${el.rot || 0})" opacity="0.5" vector-effect="non-scaling-stroke">${registry[el.type].svg(el, elements)}</g>`;
  }
  elementLayer.innerHTML = s;
}

// Focal points of a focusing element, in local coordinates. A point may
// carry a `label` to override the default italic "f" marker text.
function focalPoints(el) {
  const p = el.params;
  switch (el.type) {
    case 'lens': case 'lensc': return [{ x: p.f, y: 0 }, { x: -p.f, y: 0 }];
    case 'objective': {
      // Both are real traced planes now: the specimen focus one working
      // distance beyond the tip, and the back focal plane one focal length
      // behind the equivalent lens. Light focused on the BFP leaves the
      // objective collimated, so it is the plane a scan relay images onto and
      // the one widefield illumination is focused into.
      return [
        { x: objectiveBackFocalPlaneX(p), y: 0, label: 'BFP' },
        { x: OBJECTIVE_FRONT_X + objectiveWorkingDistance(p), y: 0, label: 'WD focus' },
      ];
    }
    case 'cmirror': case 'cmirrorx': case 'oap': return [{ x: -p.f, y: 0 }];
    case 'telescope': {
      const s = Math.max(5, p.f1 + p.f2);
      return [{ x: -s / 2 + p.f1, y: 0 }, { x: -s / 2 - p.f1, y: 0 }, { x: s / 2 + p.f2, y: 0 }];
    }
    default: return null;
  }
}

function focalMarkSVG(el, z) {
  const pts = focalPoints(el);
  if (!pts) return '';
  const r = 4.5 / z, lw = 1.3 / z;
  let s = '';
  for (const q of pts) {
    const w = toWorld(el, q.x, q.y);
    s += `<g stroke="#f59e0b" stroke-width="${lw}">` +
      `<line x1="${w.x - r}" y1="${w.y - r}" x2="${w.x + r}" y2="${w.y + r}"/>` +
      `<line x1="${w.x - r}" y1="${w.y + r}" x2="${w.x + r}" y2="${w.y - r}"/></g>` +
      `<text x="${w.x + r + 2 / z}" y="${w.y - 2 / z}" font-size="${10 / z}" fill="#f59e0b" font-style="italic">${q.label || 'f'}</text>`;
  }
  return s;
}

function renderOverlay() {
  const sel = findSelected();
  let s = '';
  const z = state.view.z;
  // focal-point markers: all focusing elements when the flag is on,
  // otherwise only the selected element and the placement ghost
  if (state.showFocal) {
    for (const el of state.elements) s += focalMarkSVG(el, z);
  } else if (sel && state.selection.kind === 'element') {
    s += focalMarkSVG(sel, z);
  }
  if (placing && placing.pos) {
    s += focalMarkSVG({ ...placing.el, x: placing.pos.x, y: placing.pos.y }, z);
  }
  // marquee rectangle while shift-dragging
  if (drag && drag.mode === 'marquee') {
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    s += `<rect x="${x}" y="${y}" width="${Math.abs(drag.x1 - drag.x0)}" height="${Math.abs(drag.y1 - drag.y0)}" fill="rgba(47,111,237,0.08)" stroke="#2f6fed" stroke-width="${1 / z}" stroke-dasharray="${4 / z} ${3 / z}"/>`;
  }
  // multi-selection: dashed box on each member
  if (state.selection?.kind === 'multi') {
    for (const id of state.selection.els) {
      const el = state.elements.find(q => q.id === id);
      if (!el) continue;
      const sz = getSize(el);
      const off = boxAnchor(el);
      s += `<g transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})">` +
        `<rect x="${off.x - sz.w / 2 - 5}" y="${off.y - sz.h / 2 - 5}" width="${sz.w + 10}" height="${sz.h + 10}" fill="none" stroke="#2f6fed" stroke-width="${1.2 / z}" stroke-dasharray="${4 / z} ${3 / z}"/></g>`;
    }
    for (const id of state.selection.beams) {
      const b = state.beams.find(q => q.id === id);
      if (b) s += `<polyline points="${ptsAttr(b.pts)}" fill="none" stroke="#2f6fed" stroke-width="${1.2 / z}" stroke-dasharray="${4 / z} ${3 / z}"/>`;
    }
  }
  if (sel && state.selection.kind === 'element') {
    const sz = getSize(sel);
    const off = boxAnchor(sel);
    const hw = sz.w / 2 + 6, hh = sz.h / 2 + 6;
    const direct = getDirectManipulation(sel);
    const resizeHandles = (direct?.resize ? resizeHandleLocations(direct.resize, hw, hh) : [])
      .map(h => ({ ...h, x: h.x + off.x, y: h.y + off.y }));
    const rotateControl = registry[sel.type]?.rotatable === false ? ''
      : `<line x1="${off.x}" y1="${off.y - hh}" x2="${off.x}" y2="${off.y - hh - 18 / z}" stroke="#2f6fed" stroke-width="${1.2 / z}"/>` +
        `<circle id="rotHandle" cx="${off.x}" cy="${off.y - hh - 22 / z}" r="${5 / z}" fill="#fff" stroke="#2f6fed" stroke-width="${1.5 / z}"/>`;
    s += `<g transform="translate(${sel.x} ${sel.y}) rotate(${sel.rot || 0})">` +
      `<rect x="${off.x - hw}" y="${off.y - hh}" width="${2 * hw}" height="${2 * hh}" fill="none" stroke="#2f6fed" stroke-width="${1.2 / z}" stroke-dasharray="${4 / z} ${3 / z}"/>` +
      rotateControl +
      resizeHandles.map(({ x, y }) =>
        `<rect x="${x - 4.5 / z}" y="${y - 4.5 / z}" width="${9 / z}" height="${9 / z}" rx="${1.4 / z}" fill="#fff" stroke="#2f6fed" stroke-width="${1.5 / z}"/>`).join('') +
      `</g>`;
    const editPoints = registry[sel.type]?.editPoints?.get?.(sel) || [];
    if (editPoints.length) {
      s += `<g transform="translate(${sel.x} ${sel.y}) rotate(${sel.rot || 0})">` +
        editPoints.map((p, i) => `<circle data-element-vtx="${i}" cx="${p.x}" cy="${p.y}" r="${5 / z}" fill="#fff" stroke="${p.arc === true ? '#8b5cf6' : '#2f6fed'}" stroke-width="${1.7 / z}"/>`).join('') +
        `</g>`;
    }
    if (direct?.tune) {
      const side = tuneHandleSide(sel);
      const knob = toWorld(sel, side * (hw + 25 / z), 0);
      const edge = toWorld(sel, side * hw, 0);
      const value = directValueLabel(sel, direct.tune);
      const pillWidth = Math.max(48, value.length * 6.2) / z;
      const pillX = side > 0 ? 10 / z : -10 / z - pillWidth;
      s += `<line x1="${edge.x}" y1="${edge.y}" x2="${knob.x}" y2="${knob.y}" stroke="#8b5cf6" stroke-width="${1.3 / z}"/>` +
        `<circle cx="${knob.x}" cy="${knob.y}" r="${6 / z}" fill="#fff" stroke="#8b5cf6" stroke-width="${1.8 / z}"/>` +
        `<circle cx="${knob.x}" cy="${knob.y}" r="${2.2 / z}" fill="#8b5cf6"/>` +
        `<g transform="translate(${knob.x} ${knob.y - 9 / z})">` +
        `<rect x="${pillX}" y="0" width="${pillWidth}" height="${18 / z}" rx="${6 / z}" fill="rgba(255,255,255,0.96)" stroke="#d8d2f2" stroke-width="${1 / z}"/>` +
        `<text x="${pillX + 6 / z}" y="${12.2 / z}" font-size="${10 / z}" font-weight="650" fill="#6547b3">${value}</text></g>`;
    }
  } else if (sel && state.selection.kind === 'beam') {
    s += `<polyline points="${ptsAttr(sel.pts)}" fill="none" stroke="#2f6fed" stroke-width="${1 / z}" stroke-dasharray="${4 / z} ${3 / z}"/>`;
    sel.pts.forEach((p, i) => {
      s += `<circle data-vtx="${i}" cx="${p.x}" cy="${p.y}" r="${4.5 / z}" fill="#fff" stroke="#2f6fed" stroke-width="${1.5 / z}"/>`;
    });
    if (sel.kind === 'fiber') {
      const a = sel.pts[0], b = sel.pts[sel.pts.length - 1];
      s += `<text x="${a.x + 9 / z}" y="${a.y - 9 / z}" font-size="${12 / z}" font-weight="700" fill="#2f6fed">A</text>`;
      s += `<text x="${b.x + 9 / z}" y="${b.y - 9 / z}" font-size="${12 / z}" font-weight="700" fill="#2f6fed">B</text>`;
    }
  }
  overlayLayer.innerHTML = s;
}

function directValueLabel(el, tune) {
  const value = tune.param.type === 'derived' ? tune.param.get(el.params) : el.params[tune.key];
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
  const unitMatch = tune.param.label.match(/\((nm|mm|°|MHz|Hz|fs|dB\/m)\)/);
  return `${tune.short || tune.param.label} ${rounded}${unitMatch ? ` ${unitMatch[1]}` : ''}`;
}

function resizeHandleLocations(resize, hw, hh) {
  if (resize.uniform || (resize.x && resize.y)) {
    return [{ x: -hw, y: -hh, sx: -1, sy: -1 }, { x: hw, y: -hh, sx: 1, sy: -1 },
      { x: hw, y: hh, sx: 1, sy: 1 }, { x: -hw, y: hh, sx: -1, sy: 1 }];
  }
  if (resize.y) return [{ x: 0, y: -hh, sx: 0, sy: -1 }, { x: 0, y: hh, sx: 0, sy: 1 }];
  if (resize.x) return [{ x: -hw, y: 0, sx: -1, sy: 0 }, { x: hw, y: 0, sx: 1, sy: 0 }];
  return [];
}

// ---------- hit testing ----------
function hitElement(w) {
  // Highlights always draw behind every other element (see renderHighlights),
  // so they must also lose every hit-test tie: clicking a device that sits
  // inside a highlight rectangle should select the device, not the
  // background. Test everything else in normal top-to-bottom order first,
  // then fall back to highlights in the same order.
  const front = [], back = [];
  for (let i = state.elements.length - 1; i >= 0; i--) {
    (isBackground(state.elements[i]) ? back : front).push(state.elements[i]);
  }
  for (const el of [...front, ...back]) {
    const def = registry[el.type];
    const sz = getSize(el);
    const off = boxAnchor(el);
    const l = toLocal(el, w.x, w.y);
    if (def?.hitTest) {
      if (def.hitTest(el, l, 6 / state.view.z)) return el;
    } else if (Math.abs(l.x - off.x) <= sz.w / 2 + 4 && Math.abs(l.y - off.y) <= sz.h / 2 + 4) return el;
  }
  return null;
}

function hitBeam(w) {
  const tol = 6 / state.view.z;
  for (let i = state.beams.length - 1; i >= 0; i--) {
    const b = state.beams[i];
    for (let j = 0; j < b.pts.length - 1; j++) {
      if (distToSegment(w, b.pts[j], b.pts[j + 1]) < tol + b.width / 2) return b;
    }
  }
  return null;
}

function hitVertex(sel, w) {
  if (!sel || state.selection.kind !== 'beam') return -1;
  const tol = 8 / state.view.z;
  for (let i = 0; i < sel.pts.length; i++) {
    if (Math.hypot(sel.pts[i].x - w.x, sel.pts[i].y - w.y) < tol) return i;
  }
  return -1;
}

function hitElementEditPoint(sel, w) {
  if (!sel || state.selection.kind !== 'element') return -1;
  const points = registry[sel.type]?.editPoints?.get?.(sel);
  if (!points?.length) return -1;
  const local = toLocal(sel, w.x, w.y), tol = 10 / state.view.z;
  let best = -1, distance = Infinity;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - local.x, p.y - local.y);
    if (d < tol && d < distance) { best = i; distance = d; }
  });
  return best;
}

function hitRotHandle(sel, w) {
  if (!sel || state.selection.kind !== 'element') return false;
  if (registry[sel.type]?.rotatable === false) return false;
  const sz = getSize(sel);
  const off = boxAnchor(sel);
  const l = toLocal(sel, w.x, w.y);
  const hy = off.y - (sz.h / 2 + 6) - 22 / state.view.z;
  return Math.hypot(l.x - off.x, l.y - hy) < 9 / state.view.z;
}

function hitResizeHandle(sel, w) {
  if (!sel || state.selection.kind !== 'element') return null;
  const direct = getDirectManipulation(sel);
  if (!direct?.resize) return null;
  const sz = getSize(sel), z = state.view.z;
  const off = boxAnchor(sel);
  const hw = sz.w / 2 + 6, hh = sz.h / 2 + 6;
  const l = toLocal(sel, w.x, w.y);
  const corners = resizeHandleLocations(direct.resize, hw, hh);
  return corners.find(corner => Math.hypot(l.x - off.x - corner.x, l.y - off.y - corner.y) < 10 / z) || null;
}

function tuneHandleSide(sel) {
  if (!svg) return 1;
  const screenX = state.view.x + sel.x * state.view.z;
  return screenX > svg.clientWidth - 110 ? -1 : 1;
}

function tuneHandlePoint(sel) {
  const sz = getSize(sel), z = state.view.z;
  return toWorld(sel, tuneHandleSide(sel) * (sz.w / 2 + 6 + 25 / z), 0);
}

function hitTuneHandle(sel, w) {
  if (!sel || state.selection.kind !== 'element') return false;
  if (!getDirectManipulation(sel)?.tune) return false;
  const p = tuneHandlePoint(sel);
  return Math.hypot(w.x - p.x, w.y - p.y) < 11 / state.view.z;
}

// A `derived` param has no storage of its own — reading it means
// recomputing from whatever it derives from,
// and writing it means going through its own setter instead of clobbering a
// key that was never there. Direct-manipulation (resize/tune) drags read and
// write params outside the inspector's normal commit path, so they need
// this too or a derived target would silently desync from what it derives
// from the moment you drag it.
function readParam(el, key) {
  const spec = (registry[el.type]?.params || []).find(param => param.key === key);
  return spec?.type === 'derived' ? spec.get(el.params) : el.params[key];
}
function writeParam(el, key, value) {
  const spec = (registry[el.type]?.params || []).find(param => param.key === key);
  if (spec?.type === 'derived') spec.set(el.params, value);
  else el.params[key] = value;
  if (el.type === 'objective') Object.assign(el.params, normalizeObjectiveParams(el.params));
}

function boundedParam(el, key, value) {
  const spec = (registry[el.type]?.params || []).find(param => param.key === key);
  if (!spec || !Number.isFinite(value)) return readParam(el, key);
  const negative = spec.negative === true;
  const resolve = bound => typeof bound === 'function' ? bound(el.params) : bound;
  let lo = resolve(spec.min) ?? (spec.type === 'optsize' ? 1 : -Number.MAX_SAFE_INTEGER);
  let hi = resolve(spec.max) ?? (spec.type === 'optsize' ? 500 : Number.MAX_SAFE_INTEGER);
  if (el.type === 'sclaser' && key === 'scMax') lo = Math.max(lo, el.params.scMin);
  if (el.type === 'sclaser' && key === 'scMin') hi = Math.min(hi, el.params.scMax);
  const step = Number.isFinite(spec.step) && spec.step > 0 ? spec.step : (spec.type === 'optsize' ? 0.5 : 1);
  let magnitude = negative ? Math.abs(value) : value;
  magnitude = Math.min(hi, Math.max(lo, magnitude));
  magnitude = Math.round(magnitude / step) * step;
  return negative ? -Math.abs(magnitude) : magnitude;
}

// ---------- interactions ----------
let drag = null;     // {mode, ...}
let drawing = null;  // manual beam in progress {pts:[], cursor}
let placing = null;  // {el, pos}
let polygonDrawing = null; // registry-driven closed polygon construction
let spaceDown = false;
const activeTouches = new Map(); // pointer id -> canvas-local point
let touchGesture = null; // two-finger viewport gesture start state
// Manual double-click detection for finishing a beam/fiber/polygon. The
// native 'dblclick' listener is kept as a backup, but some input paths
// (trackpad double-taps, remote/automated pointer events) don't reliably
// synthesize a browser dblclick, so we also detect two close clicks here.
let lastDrawClick = null; // {t, x, y} in screen coords

function isManualDoubleClick(e) {
  const now = performance.now();
  const isDouble = lastDrawClick
    && now - lastDrawClick.t < 450
    && Math.hypot(e.clientX - lastDrawClick.x, e.clientY - lastDrawClick.y) < 8;
  lastDrawClick = { t: now, x: e.clientX, y: e.clientY };
  if (isDouble) lastDrawClick = null;
  return isDouble;
}

function localTouchPoint(e) {
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function touchPair() {
  const points = [...activeTouches.values()];
  if (points.length < 2) return null;
  const [a, b] = points;
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

function beginTouchGesture() {
  const pair = touchPair();
  if (!pair) return;
  // A second finger always controls the viewport. Dropping an in-progress
  // pointer drag prevents object mutations or placement while pinching.
  drag = null;
  if (polygonDrawing) polygonDrawing.press = null;
  touchGesture = { view: { ...state.view }, center: pair.center, distance: Math.max(1, pair.distance) };
  setStatus('');
}

function updateTouchGesture() {
  const pair = touchPair();
  if (!touchGesture || !pair) return;
  state.view = pinchView(touchGesture.view, touchGesture.center, touchGesture.distance, pair.center, pair.distance);
  renderAll();
}

function continueTouchPan() {
  const point = [...activeTouches.values()][0];
  if (!point) return;
  drag = { mode: 'pan', sx: point.x, sy: point.y, vx: state.view.x, vy: state.view.y, touch: true };
}

function placeCurrentElement(w, keepPlacing = false, bypassSnap = false) {
  if (!placing) return false;
  pushUndo();
  const el = placing.el;
  const sp = snapElPos(el, w.x, w.y, bypassSnap);
  el.x = sp.x; el.y = sp.y;
  state.elements.push(el);
  state.selection = { kind: 'element', id: el.id };
  const type = el.type;
  placing = keepPlacing ? { el: createElement(type), pos: { x: sp.x, y: sp.y } } : null;
  if (!placing) { state.tool = 'select'; setStatus(''); notifyTool(); }
  changed(); onSelectionChange({ openMobile: true });
  return true;
}

function notifyTool(detail = { mode: 'select' }) {
  document.dispatchEvent(new CustomEvent('optics:toolchange', { detail }));
}

export function startPlacing(type) {
  drawing = null; polygonDrawing = null;
  const def = registry[type];
  if (def?.singleton) {
    const existing = state.elements.find(el => el.type === type);
    if (existing) {
      placing = null; state.tool = 'select'; state.selection = { kind: 'element', id: existing.id };
      setStatus(`${def.label} already exists`); notifyTool(); renderAll(); onSelectionChange({ openMobile: true });
      return;
    }
  }
  if (def?.construction?.kind === 'polygon') {
    placing = null;
    polygonDrawing = { type, pts: [], cursor: null, press: null };
    lastDrawClick = null;
    state.tool = 'polygon:' + type;
    setStatus(def.construction.circularArcs
      ? 'Click for a straight point · press-drag for a circular arc · Enter closes'
      : 'Click the first point again, double-click, or press Enter to close');
    notifyTool({ mode: 'polygon', type, label: def.label });
    renderAll();
    return;
  }
  placing = { el: createElement(type), pos: null };
  state.tool = 'place:' + type;
  setStatus('');
  notifyTool({ mode: 'place', type, label: registry[type].label });
  renderAll();
}

const BEAM_TOOL_LABELS = { fiber: 'Optical fiber', barefiber: 'Bare fiber' };

export function startBeamTool(kind = 'beam') {
  placing = null; polygonDrawing = null;
  state.tool = 'beam';
  drawing = { pts: [], cursor: null, kindType: kind };
  lastDrawClick = null;
  setStatus('');
  notifyTool({ mode: kind, label: BEAM_TOOL_LABELS[kind] || 'Arrow' });
  renderAll();
}

export function cancelTool() {
  placing = null; drawing = null; polygonDrawing = null;
  lastDrawClick = null;
  state.tool = 'select';
  setStatus('');
  notifyTool();
  renderAll();
}

export function isPlacing() { return !!placing || !!polygonDrawing; }
export function isPolygonDrawing() { return !!polygonDrawing; }
export function rotatePlacing(deg) {
  if (placing) {
    placing.el.rot = ((((placing.el.rot || 0) + deg) % 360) + 360) % 360;
    renderAll();
  }
}

export function undoPolygonPoint() {
  if (!polygonDrawing) return false;
  if (polygonDrawing.pts.length) {
    polygonDrawing.pts.pop();
    if (polygonDrawing.pts.at(-1)?.arc === true) polygonDrawing.pts.pop();
    const anchors = polygonDrawing.pts.filter(p => p.arc !== true).length;
    setStatus(anchors
      ? `${anchors} ${anchors === 1 ? 'anchor' : 'anchors'} · click or press-drag to continue`
      : 'Choose the first boundary point');
    renderManual();
  } else {
    cancelTool();
  }
  return true;
}

export function finishPolygon() {
  if (!polygonDrawing) return false;
  const points = polygonDrawing.pts.map(p => ({ ...p }));
  const anchors = points.filter(p => p.arc !== true).length;
  if (!isSimpleBoundary(points)) {
    setStatus(anchors < 3 ? 'Freeform glass needs at least three anchors' : 'Boundary cannot cross itself or collapse');
    renderManual();
    return false;
  }
  const b = boundaryBounds(points), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const el = createElement(polygonDrawing.type, cx, cy);
  const key = registry[el.type].construction.pointsKey;
  el.params[key] = points.map(p => ({
    x: p.x - cx, y: p.y - cy, ...(p.arc === true ? { arc: true } : {}),
  }));
  el.params.scale = 1;
  pushUndo();
  state.elements.push(el);
  state.selection = { kind: 'element', id: el.id };
  polygonDrawing = null; state.tool = 'select'; setStatus(''); notifyTool();
  changed(); renderAll(); onSelectionChange({ openMobile: true });
  return true;
}

export function finishBeam() {
  const pts = distinctPoints(drawing?.pts);
  if (drawing && pts.length >= 2) {
    pushUndo();
    const isFiber = drawing.kindType === 'fiber' || drawing.kindType === 'barefiber';
    const beam = isFiber
      ? {
        id: 'b' + Math.random().toString(36).slice(2, 9), kind: 'fiber', pts, color: '#e8a800', width: 4, propagate: true,
        bare: drawing.kindType === 'barefiber',
        inputNA: 0.22, groupIndex: 1.468, lossDbPerM: 0.2,
        out0: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
        out1: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
      }
      : { id: 'b' + Math.random().toString(36).slice(2, 9), kind: 'beam', pts, color: '#e02020', width: 2, dash: false, arrow: true };
    state.beams.push(beam);
    state.selection = { kind: 'beam', id: beam.id };
    drawing = null; state.tool = 'select';
    setStatus('');
    notifyTool();
    changed(); onSelectionChange({ openMobile: true });
  } else {
    cancelTool();
  }
}

function setStatus(t) { if (statusEl) statusEl.textContent = t; }

function bindPointer() {
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (state.tool !== 'select') return;
    const w = screenToWorld(e.clientX, e.clientY);
    const el = hitElement(w);
    const beam = el ? null : hitBeam(w);
    const hit = el || beam;
    if (!hit) {
      document.dispatchEvent(new CustomEvent('optics:contextmenu', { detail: null }));
      return;
    }
    const inCurrentGroup = state.selection?.kind === 'multi'
      && (el ? state.selection.els.includes(hit.id) : state.selection.beams.includes(hit.id));
    if (!inCurrentGroup) state.selection = { kind: el ? 'element' : 'beam', id: hit.id };
    renderAll(); onSelectionChange({ openMobile: e.pointerType !== 'touch' });
    document.dispatchEvent(new CustomEvent('optics:contextmenu', {
      detail: {
        clientX: e.clientX, clientY: e.clientY,
        kind: inCurrentGroup ? 'multi' : el ? 'element' : 'beam',
        rotatable: !!el && registry[el.type]?.rotatable !== false,
        duplicable: inCurrentGroup || !el || registry[el.type]?.singleton !== true,
      },
    }));
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  svg.addEventListener('dblclick', e => {
    if (state.tool === 'beam' && drawing) { e.preventDefault(); finishBeam(); }
    else if (polygonDrawing) { e.preventDefault(); finishPolygon(); }
  });
  window.addEventListener('keydown', e => {
    svg.classList.remove('pointer-focused');
    if (e.code === 'Space' && (e.target === document.body || e.target === svg)) {
      spaceDown = true; svg.style.cursor = 'grab'; e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; svg.style.cursor = ''; } });
  window.addEventListener('blur', () => { spaceDown = false; svg.style.cursor = ''; });
}

function onDown(e) {
  // Chrome can classify programmatic focus from a pointer (notably a touch on
  // Android) as `:focus-visible`. Mark that input modality before focusing so
  // the whole SVG does not acquire a focus border. The global keydown listener
  // above removes the marker as soon as the user switches to a keyboard.
  svg.classList.add('pointer-focused');
  svg.focus({ preventScroll: true });
  if (e.pointerType === 'touch') {
    activeTouches.set(e.pointerId, localTouchPoint(e));
    if (activeTouches.size >= 2) {
      beginTouchGesture();
      svg.setPointerCapture(e.pointerId);
      return;
    }
  }
  if (e.button === 1 || spaceDown) {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  const w = screenToWorld(e.clientX, e.clientY);

  if (polygonDrawing) {
    let p = { x: snapPos(w.x, e.altKey), y: snapPos(w.y, e.altKey) };
    const previous = [...polygonDrawing.pts].reverse().find(point => point.arc !== true);
    if (e.shiftKey && previous) p = constrainPoint(previous, p);
    if (!polygonDrawing.pts.length) {
      polygonDrawing.pts.push(p);
      polygonDrawing.cursor = p;
      isManualDoubleClick(e);
      setStatus('1 anchor · click for a straight point or press-drag for an arc');
      renderManual();
      return;
    }
    // manual double-click closes the polygon even when the browser never
    // synthesizes a native dblclick; must run before duplicate rejection
    // because the second click lands on the same point
    const anchors = polygonDrawing.pts.filter(point => point.arc !== true).length;
    if (isManualDoubleClick(e) && anchors >= 3) {
      finishPolygon();
      return;
    }
    const first = polygonDrawing.pts[0];
    if (first && anchors >= 3
        && Math.hypot(p.x - first.x, p.y - first.y) <= 11 / state.view.z) {
      finishPolygon();
      return;
    }
    if (previous && Math.hypot(p.x - previous.x, p.y - previous.y) < 0.25) {
      setStatus('Move to a new point');
      return;
    }
    polygonDrawing.press = {
      pointerId: e.pointerId,
      start: p,
      current: p,
      curved: false,
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType,
    };
    polygonDrawing.cursor = p;
    svg.setPointerCapture(e.pointerId);
    renderManual();
    return;
  }

  if (placing) {
    if (e.pointerType === 'touch') {
      // Touch placement commits on release so a two-finger gesture can pan or
      // zoom the canvas without accidentally dropping the ghost element.
      drag = { mode: 'touchplace' };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    placeCurrentElement(w, e.shiftKey, e.altKey);
    return;
  }

  if (state.tool === 'beam') {
    const p = { x: snapPos(w.x, e.altKey), y: snapPos(w.y, e.altKey) };
    const prev = drawing.pts[drawing.pts.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-6) drawing.pts.push(p);
    if (isManualDoubleClick(e)) { finishBeam(); return; }
    renderAll();
    return;
  }

  const displayControl = e.target.closest?.('[data-display-action]');
  const displayOwner = displayControl?.closest?.('[data-element-id]');
  if (displayControl && displayOwner && !state.demoMode) {
    const display = state.elements.find(element =>
      element.id === displayOwner.getAttribute('data-element-id') && element.type === 'display');
    const result = displayActionUpdate(display, displayControl.getAttribute('data-display-action'), state.elements);
    if (result) {
      const changes = Object.entries(result.updates || {}).filter(([key, value]) => display.params[key] !== value);
      if (changes.length) {
        pushUndo();
        for (const [key, value] of changes) display.params[key] = value;
        changed();
      }
      state.selection = { kind: 'element', id: display.id };
      setStatus(result.message || '');
      renderAll();
      onSelectionChange();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  // Editable control points take precedence over Shift multi-selection so
  // Shift can constrain a point drag to 45° drafting directions.
  const selectedBeforeHit = findSelected();
  const selectedPointIndex = hitElementEditPoint(selectedBeforeHit, w);
  if (selectedPointIndex >= 0 && !state.demoMode) {
    const editor = registry[selectedBeforeHit.type].editPoints;
    drag = {
      mode: 'editpoint', el: selectedBeforeHit, editor, i: selectedPointIndex,
      base: JSON.parse(JSON.stringify(selectedBeforeHit)),
      start: editor.get(selectedBeforeHit)[selectedPointIndex], moved: false,
    };
    svg.setPointerCapture(e.pointerId);
    return;
  }

  // shift interactions: toggle membership on objects, marquee on empty space
  if (e.shiftKey && !state.demoMode) {
    const elHit = hitElement(w);
    const bHit = elHit ? null : hitBeam(w);
    if (elHit || bHit) {
      const s = state.selection;
      let els = [], bms = [];
      if (s?.kind === 'multi') { els = [...s.els]; bms = [...s.beams]; }
      else if (s?.kind === 'element') els = [s.id];
      else if (s?.kind === 'beam') bms = [s.id];
      const list = elHit ? els : bms, id = (elHit || bHit).id;
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
      state.selection = els.length + bms.length > 1 ? { kind: 'multi', els, beams: bms }
        : els.length ? { kind: 'element', id: els[0] }
          : bms.length ? { kind: 'beam', id: bms[0] } : null;
      renderAll(); onSelectionChange();
      return;
    }
    drag = { mode: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y };
    svg.setPointerCapture(e.pointerId);
    return;
  }

  // group drag: clicking any member of a multi-selection moves the whole group
  const msel = state.selection;
  if (msel?.kind === 'multi') {
    const elHit = hitElement(w);
    const bHit = elHit ? null : hitBeam(w);
    if ((elHit && msel.els.includes(elHit.id)) || (bHit && msel.beams.includes(bHit.id))) {
      drag = {
        mode: 'movemulti', sx: w.x, sy: w.y, moved: false,
        items: msel.els.map(id => state.elements.find(q => q.id === id)).filter(Boolean).map(t => ({ el: t, x0: t.x, y0: t.y })),
        bitems: msel.beams.map(id => state.beams.find(q => q.id === id)).filter(Boolean).map(t => ({ b: t, pts0: t.pts.map(p => ({ ...p })) })),
      };
      svg.setPointerCapture(e.pointerId);
      return;
    }
  }

  const sel = findSelected();
  const resizeHandle = hitResizeHandle(sel, w);
  if (resizeHandle) {
    const direct = getDirectManipulation(sel);
    const size = getSize(sel);
    if (direct.resize.anchor) {
      // Crop-style resize: the corner opposite the one being dragged stays
      // put in world space and the dragged corner tracks the cursor, instead
      // of scaling both edges out from a fixed center.
      const anchorLocal = { x: -resizeHandle.sx * size.w / 2, y: -resizeHandle.sy * size.h / 2 };
      drag = {
        mode: 'resizeAnchor', el: sel, direct: direct.resize, corner: resizeHandle,
        angle: sel.rot || 0, anchor: toWorld(sel, anchorLocal.x, anchorLocal.y), moved: false,
      };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const keys = [...new Set(Object.values(direct.resize).filter(value => typeof value === 'string'))];
    drag = {
      mode: 'resize', el: sel, direct: direct.resize, corner: resizeHandle,
      hw: size.w / 2 + 6, hh: size.h / 2 + 6,
      values: Object.fromEntries(keys.map(key => [key, readParam(sel, key)])), moved: false,
    };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  if (hitTuneHandle(sel, w)) {
    const tune = getDirectManipulation(sel).tune;
    drag = { mode: 'tune', el: sel, tune, clientY: e.clientY, value: readParam(sel, tune.key), moved: false };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  // rotation handle?
  if (hitRotHandle(sel, w) && !state.demoMode) {
    drag = { mode: 'rotate', el: sel, moved: false };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  // beam vertex?
  const vi = hitVertex(sel, w);
  if (vi >= 0) {
    drag = { mode: 'vertex', beam: sel, i: vi, moved: false };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  // element?
  const el = hitElement(w);
  if (el) {
    state.selection = { kind: 'element', id: el.id };
    if (!state.demoMode) {
      drag = { mode: 'move', el, ox: el.x - w.x, oy: el.y - w.y, moved: false };
      svg.setPointerCapture(e.pointerId);
    }
    renderAll(); onSelectionChange({ openMobile: e.pointerType !== 'touch' });
    return;
  }
  // manual beam?
  const b = state.demoMode ? null : hitBeam(w);
  if (b) {
    state.selection = { kind: 'beam', id: b.id };
    drag = { mode: 'movebeam', beam: b, lx: w.x, ly: w.y, moved: false };
    svg.setPointerCapture(e.pointerId);
    renderAll(); onSelectionChange({ openMobile: e.pointerType !== 'touch' });
    return;
  }
  // empty space: deselect + pan
  if (state.selection) { state.selection = null; renderAll(); onSelectionChange(); }
  drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
  svg.setPointerCapture(e.pointerId);
}

function onMove(e) {
  if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
    activeTouches.set(e.pointerId, localTouchPoint(e));
    if (touchGesture) {
      updateTouchGesture();
      return;
    }
  }
  const w = screenToWorld(e.clientX, e.clientY);
  if (statusEl && !drag && !placing && state.tool === 'select') {
    statusEl.textContent = `x ${Math.round(w.x)} mm,  y ${Math.round(w.y)} mm`;
    const hoverSel = findSelected();
    const resize = hitResizeHandle(hoverSel, w);
    svg.style.cursor = hitElementEditPoint(hoverSel, w) >= 0 ? 'move'
      : resize ? (resize.sx === 0 ? 'ns-resize' : resize.sy === 0 ? 'ew-resize'
      : resize.sx === resize.sy ? 'nwse-resize' : 'nesw-resize')
      : hitTuneHandle(hoverSel, w) ? 'ns-resize' : '';
  }
  if (polygonDrawing) {
    let p = { x: snapPos(w.x, e.altKey), y: snapPos(w.y, e.altKey) };
    const previous = [...polygonDrawing.pts].reverse().find(point => point.arc !== true);
    if (e.shiftKey && previous) p = constrainPoint(previous, p);
    const press = polygonDrawing.press;
    if (press?.pointerId === e.pointerId) {
      press.current = p;
      const threshold = press.pointerType === 'touch' ? 10 : 6;
      if (Math.hypot(e.clientX - press.clientX, e.clientY - press.clientY) >= threshold) {
        press.curved = true;
        setStatus('Circular arc · release to place its next anchor');
      }
    }
    polygonDrawing.cursor = p;
    renderManual();
    return;
  }
  if (placing) { placing.pos = snapElPos(placing.el, w.x, w.y, e.altKey); renderElements(); return; }
  if (drawing) { drawing.cursor = { x: snapPos(w.x), y: snapPos(w.y) }; renderManual(); return; }
  if (!drag) return;

  if (drag.mode === 'pan') {
    state.view.x = drag.vx + (e.clientX - drag.sx);
    state.view.y = drag.vy + (e.clientY - drag.sy);
    renderAll();
  } else if (drag.mode === 'move') {
    const { x, y } = snapElPos(drag.el, w.x + drag.ox, w.y + drag.oy, e.altKey);
    if (x === drag.el.x && y === drag.el.y) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    drag.el.x = x;
    drag.el.y = y;
    renderAll();
  } else if (drag.mode === 'rotate') {
    let a = Math.atan2(w.y - drag.el.y, w.x - drag.el.x) * 180 / Math.PI + 90;
    if (!e.shiftKey) a = Math.round(a / 5) * 5;
    a = ((a % 360) + 360) % 360;
    if (a === drag.el.rot) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    drag.el.rot = a;
    renderAll();
  } else if (drag.mode === 'resizeAnchor') {
    const rel = rotPt(w.x - drag.anchor.x, w.y - drag.anchor.y, -drag.angle);
    const rawW = Math.max(1, drag.corner.sx * rel.x);
    const rawH = Math.max(1, drag.corner.sy * rel.y);
    const wKey = drag.direct.x, hKey = drag.direct.y;
    const nextW = boundedParam(drag.el, wKey, rawW);
    const nextH = boundedParam(drag.el, hKey, rawH);
    const centerOffset = rotPt(drag.corner.sx * nextW / 2, drag.corner.sy * nextH / 2, drag.angle);
    const centerWorld = { x: drag.anchor.x + centerOffset.x, y: drag.anchor.y + centerOffset.y };
    if (nextW === readParam(drag.el, wKey) && nextH === readParam(drag.el, hKey)
      && centerWorld.x === drag.el.x && centerWorld.y === drag.el.y) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    writeParam(drag.el, wKey, nextW);
    writeParam(drag.el, hKey, nextH);
    drag.el.x = centerWorld.x;
    drag.el.y = centerWorld.y;
    setStatus(`${wKey} ${nextW} · ${hKey} ${nextH}`);
    renderAll();
  } else if (drag.mode === 'resize') {
    const local = toLocal(drag.el, w.x, w.y);
    const sx = Math.max(0.08, Math.abs(local.x) / Math.max(1, drag.hw));
    const sy = Math.max(0.08, Math.abs(local.y) / Math.max(1, drag.hh));
    const assignments = [];
    if (drag.direct.x) assignments.push([drag.direct.x, sx]);
    if (drag.direct.y) assignments.push([drag.direct.y, sy]);
    if (drag.direct.uniform) assignments.push([drag.direct.uniform, Math.max(sx, sy)]);
    const changes = assignments.map(([key, ratio]) => [key, boundedParam(drag.el, key, drag.values[key] * ratio)])
      .filter(([key, next]) => next !== readParam(drag.el, key));
    if (!changes.length) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    for (const [key, value] of Object.entries(drag.direct.set || {})) drag.el.params[key] = value;
    for (const [key, next] of changes) writeParam(drag.el, key, next);
    const labels = assignments.map(([key]) => `${key} ${readParam(drag.el, key)}`).join(' · ');
    setStatus(labels);
    renderAll();
  } else if (drag.mode === 'tune') {
    const spec = drag.tune.param;
    const step = Number.isFinite(spec.step) && spec.step > 0 ? spec.step : 1;
    const min = typeof spec.min === 'function' ? spec.min(drag.el.params) : spec.min;
    const max = typeof spec.max === 'function' ? spec.max(drag.el.params) : spec.max;
    const rangeSteps = Number.isFinite(min) && Number.isFinite(max)
      ? Math.max(1, (max - min) / step) : 100;
    const pixelsPerStep = drag.tune.pixelsPerStep
      || Math.max(0.2, Math.min(4, 200 / rangeSteps));
    const steps = Math.round((drag.clientY - e.clientY) / pixelsPerStep);
    const next = boundedParam(drag.el, drag.tune.key, drag.value + steps * step);
    if (next === readParam(drag.el, drag.tune.key)) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    writeParam(drag.el, drag.tune.key, next);
    setStatus(directValueLabel(drag.el, drag.tune));
    renderAll();
  } else if (drag.mode === 'editpoint') {
    const snapped = { x: snapPos(w.x, e.altKey), y: snapPos(w.y, e.altKey) };
    let local = toLocal(drag.base, snapped.x, snapped.y);
    if (e.shiftKey) local = constrainPoint(drag.start, local);
    const next = drag.editor.candidate(drag.base, drag.i, local);
    if (!next) {
      setStatus('Boundary cannot cross itself or collapse');
      return;
    }
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    drag.el.x = next.x; drag.el.y = next.y;
    drag.el.params.vertices = next.vertices;
    setStatus(`vertex ${drag.i + 1} · ${local.x.toFixed(1)}, ${local.y.toFixed(1)} mm`);
    renderAll();
  } else if (drag.mode === 'marquee') {
    drag.x1 = w.x; drag.y1 = w.y;
    renderAll();
  } else if (drag.mode === 'movemulti') {
    const dx = snapPos(w.x - drag.sx), dy = snapPos(w.y - drag.sy);
    if (dx === drag.dx && dy === drag.dy) return;
    if (!drag.moved && dx === 0 && dy === 0) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    drag.dx = dx; drag.dy = dy;
    for (const it of drag.items) { it.el.x = it.x0 + dx; it.el.y = it.y0 + dy; }
    for (const it of drag.bitems) {
      it.b.pts.forEach((p, i) => { p.x = it.pts0[i].x + dx; p.y = it.pts0[i].y + dy; });
    }
    renderAll();
  } else if (drag.mode === 'vertex') {
    const p = { x: snapPos(w.x), y: snapPos(w.y) };
    const old = drag.beam.pts[drag.i];
    if (p.x === old.x && p.y === old.y) return;
    const before = drag.beam.pts[drag.i - 1], after = drag.beam.pts[drag.i + 1];
    if ((before && Math.hypot(p.x - before.x, p.y - before.y) <= 1e-6)
      || (after && Math.hypot(p.x - after.x, p.y - after.y) <= 1e-6)) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    drag.beam.pts[drag.i] = p;
    renderAll();
  } else if (drag.mode === 'movebeam') {
    const dx = w.x - drag.lx, dy = w.y - drag.ly;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      if (!drag.moved) { pushUndo(); drag.moved = true; }
      for (const p of drag.beam.pts) { p.x += dx; p.y += dy; }
      drag.lx = w.x; drag.ly = w.y;
      renderAll();
    }
  }
}

function onUp(e) {
  if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
    activeTouches.delete(e.pointerId);
    if (touchGesture) {
      touchGesture = null;
      if (activeTouches.size === 1) continueTouchPan();
      return;
    }
    if (drag?.mode === 'touchplace') {
      drag = null;
      if (e.type === 'pointercancel') { renderAll(); return; }
      const w = screenToWorld(e.clientX, e.clientY);
      placeCurrentElement(w, false, false);
      return;
    }
  }
  if (polygonDrawing?.press?.pointerId === e.pointerId) {
    const press = polygonDrawing.press;
    polygonDrawing.press = null;
    if (e.type === 'pointercancel') {
      renderManual();
      return;
    }
    const w = screenToWorld(e.clientX, e.clientY);
    const previous = [...polygonDrawing.pts].reverse().find(point => point.arc !== true);
    let release = { x: snapPos(w.x, e.altKey), y: snapPos(w.y, e.altKey) };
    if (e.shiftKey && previous) release = constrainPoint(previous, release);
    const threshold = press.pointerType === 'touch' ? 10 : 6;
    const supportsArcs = registry[polygonDrawing.type]?.construction?.circularArcs === true;
    const curved = supportsArcs && (press.curved
      || Math.hypot(e.clientX - press.clientX, e.clientY - press.clientY) >= threshold);
    const first = polygonDrawing.pts[0];
    const anchors = polygonDrawing.pts.filter(point => point.arc !== true).length;

    if (curved && anchors >= 3
        && Math.hypot(release.x - first.x, release.y - first.y) <= 11 / state.view.z) {
      const closing = [...polygonDrawing.pts, { ...press.start, arc: true }];
      if (isSimpleBoundary(closing)) {
        polygonDrawing.pts = closing;
        polygonDrawing.cursor = first;
        finishPolygon();
      } else {
        polygonDrawing.cursor = release;
        setStatus('That circular arc would cross or collapse the boundary');
        renderManual();
      }
      return;
    }

    const next = appendBoundaryGesture(polygonDrawing.pts, press.start, release, curved);
    if (!next) {
      polygonDrawing.cursor = release;
      setStatus(curved ? 'That circular arc would cross or collapse the boundary' : 'That edge would cross the boundary');
      renderManual();
      return;
    }
    polygonDrawing.pts = next;
    polygonDrawing.cursor = release;
    const nextAnchors = next.filter(point => point.arc !== true).length;
    setStatus(nextAnchors < 3
      ? `${nextAnchors} anchors · add ${3 - nextAnchors} more`
      : 'Click for straight · press-drag for arc · click first or press Enter to close');
    renderManual();
    return;
  }
  if (!drag) return;
  if (e.type === 'pointercancel') {
    const wasChange = drag.moved === true && ['move', 'rotate', 'resize', 'resizeAnchor', 'tune', 'editpoint', 'vertex', 'movebeam', 'movemulti'].includes(drag.mode);
    drag = null;
    renderAll();
    if (wasChange) { changed(); onSelectionChange(); }
    return;
  }
  if (drag.mode === 'marquee') {
    const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1);
    const y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1);
    const inside = p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    const els = state.elements.filter(el => inside(el)).map(el => el.id);
    const bms = state.beams.filter(b => b.pts.some(inside)).map(b => b.id);
    state.selection = els.length + bms.length > 1 ? { kind: 'multi', els, beams: bms }
      : els.length ? { kind: 'element', id: els[0] }
        : bms.length ? { kind: 'beam', id: bms[0] } : null;
    drag = null;
    renderAll(); onSelectionChange();
    return;
  }
  const dragMode = drag.mode;
  const wasChange = drag.moved === true && ['move', 'rotate', 'resize', 'resizeAnchor', 'tune', 'editpoint', 'vertex', 'movebeam', 'movemulti'].includes(dragMode);
  drag = null;
  if (wasChange) { setStatus(''); changed(); onSelectionChange(); }
  else if (e.pointerType === 'touch' && (dragMode === 'move' || dragMode === 'movebeam')) onSelectionChange({ openMobile: true });
}

function bindWheel() {
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const v = state.view;
    if (e.ctrlKey || e.metaKey) {
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.012);
      state.view = zoomViewAt(v, { x: mx, y: my }, factor);
    } else {
      v.x -= e.deltaX;
      v.y -= e.deltaY;
    }
    renderAll();
  }, { passive: false });
}

export function zoomBy(factor) {
  const r = svg.getBoundingClientRect();
  const v = state.view;
  const mx = r.width / 2, my = r.height / 2;
  state.view = zoomViewAt(v, { x: mx, y: my }, factor);
  renderAll();
}

export function zoomFit() {
  // if the canvas hasn't been laid out yet, retry on the next frame
  const rect = svg.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) { requestAnimationFrame(zoomFit); return; }
  const pts = [];
  for (const el of state.elements) {
    const b = getVisualBounds(el);
    if (b) pts.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 });
  }
  for (const b of state.beams) pts.push(...b.pts);
  if (!pts.length) { state.view = { x: 60, y: 40, z: 1 }; renderAll(); return; }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40;
  const y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
  const r = svg.getBoundingClientRect();
  const z = Math.min(VIEW_MAX_ZOOM, Math.max(VIEW_MIN_ZOOM, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
  state.view = { x: (r.width - (x0 + x1) * z) / 2, y: (r.height - (y0 + y1) * z) / 2, z };
  renderAll();
}
