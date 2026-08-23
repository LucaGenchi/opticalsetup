// Export the sketch as standalone SVG or PNG.

import { state } from './state.js';
import {
  registry, getVisualBounds, labelSVG, displayCableSVG, stageOffsetAt, retroOffsetAt,
} from './elements.js';
import { traceScene } from './raytrace.js';
import { pulseMarkers } from './pulses.js';
import { pulsePeriodNs, pulsesReadAsCW } from './timescale.js';
import { encodeGIF, imageDataToRGB332, validateGIFOptions } from './gif.js';
import { immersionLayerSVG } from './immersion.js';
import { download, manualBeamSVG, rotPt } from './util.js';

function sceneBounds(elements = state.elements, drawables = null) {
  const frame = [...elements].reverse().find(el => registry[el.type]?.exportFrame);
  if (frame) {
    const crop = getVisualBounds(frame, { includeLabel: false });
    if (crop) return { x: crop.x0, y: crop.y0, w: crop.x1 - crop.x0, h: crop.y1 - crop.y0 };
  }
  const pts = [];
  const clampPts = [];
  for (const el of elements) {
    const def = registry[el.type];
    if (!def) continue;
    const clamp = getVisualBounds(el, { includeLabel: !def.hideInExport });
    if (!clamp) continue;
    const bounds = [{ x: clamp.x0, y: clamp.y0 }, { x: clamp.x1, y: clamp.y1 }];
    clampPts.push(...bounds);
    if (!def.hideInExport) pts.push(...bounds);
  }
  for (const b of state.beams) pts.push(...b.pts);
  const traced = drawables || traceScene(elements, state.beams).drawables;
  for (const d of traced) {
    // beams can extend far; clamp their contribution so an unterminated ray
    // doesn't blow up the export canvas
    if (d.pts) pts.push(...d.pts);
    if (d.dots) pts.push(...d.dots);
  }
  if (!pts.length) return { x: 0, y: 0, w: 400, h: 300 };
  // clamp runaway rays to the element bounding box + margin
  const elPts = clampPts;
  let bx0, bx1, by0, by1;
  if (elPts.length) {
    bx0 = Math.min(...elPts.map(p => p.x)) - 150; bx1 = Math.max(...elPts.map(p => p.x)) + 150;
    by0 = Math.min(...elPts.map(p => p.y)) - 150; by1 = Math.max(...elPts.map(p => p.y)) + 150;
  } else { bx0 = -1e9; bx1 = 1e9; by0 = -1e9; by1 = 1e9; }
  const xs = pts.map(p => Math.min(bx1, Math.max(bx0, p.x)));
  const ys = pts.map(p => Math.min(by1, Math.max(by0, p.y)));
  const m = 30;
  const x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  return { x: x0, y: y0, w: Math.max(...xs) + m - x0, h: Math.max(...ys) + m - y0 };
}

function ptsAttr(pts) { return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }

function animatedElementsAt(seconds, playback) {
  const motionTimeSeconds = Math.max(0, Number(seconds) || 0);
  const speed = Math.max(1, Number(playback?.speedNsPerSecond) || 10);
  const simulationTimeNs = motionTimeSeconds * speed;
  const mechanicsMode = playback?.mechanicsMode === true;
  return state.elements.map(source => {
    let el = { ...source, _animationTimeS: motionTimeSeconds, _simulationTimeNs: simulationTimeNs };
    if (source.type === 'galvo' && source.params.scanMode !== 'static') {
      const hz = Math.max(0.01, source.params.scanFrequencyHz || 1);
      const followsSimulationClock = !mechanicsMode && hz * speed / 1e9 * 12 >= 1;
      el._animationTimeS = followsSimulationClock
        ? simulationTimeNs / 1e9
        : motionTimeSeconds / (hz * 12);
    } else if (source.type === 'stage') {
      const local = stageOffsetAt(source.params, motionTimeSeconds);
      const offset = rotPt(local.x, local.y, source.rot || 0);
      el.x = source.x + offset.x;
      el.y = source.y + offset.y;
    } else if (source.type === 'retroreflector') {
      const local = retroOffsetAt(source.params, motionTimeSeconds);
      const offset = rotPt(local.x, local.y, source.rot || 0);
      el.x = source.x + offset.x;
      el.y = source.y + offset.y;
    }
    return el;
  });
}

function pulseLayerSVG(tracks, timeNs, playback) {
  if (playback?.mechanicsMode) return '';
  let body = '';
  for (const track of tracks) {
    if (pulsesReadAsCW(pulsePeriodNs(track.pulse?.repRateMHz), playback?.speedNsPerSecond)) continue;
    for (const marker of pulseMarkers(track, timeNs, { mode: playback?.mode })) {
      const width = playback?.mode === 'physical'
        ? Math.max(marker.widthMm, 9 * (marker.visualStretch || 1))
        : marker.widthMm;
      const rx = Math.max(2, width / 2);
      const ry = Math.max(2.2, Math.min(5, 2.5 + 1.4 * Math.sqrt(Math.max(0, track.intensity || 0))));
      const transmission = marker.transmission ?? 1;
      const opacity = Math.max(0.03, Math.min(0.95, (0.45 + 0.45 * (track.intensity || 0)) * transmission));
      const highlightOpacity = Math.max(0.04, 0.82 * Math.sqrt(transmission));
      const fill = track.bw >= 200 ? 'url(#pulseSpectrum)' : track.color;
      body += `<g class="pulse-marker" data-duration-fs="${marker.pulseWidthFs.toFixed(3)}" data-gdd-fs2="${marker.gddFs2.toFixed(3)}" transform="translate(${marker.x.toFixed(2)} ${marker.y.toFixed(2)}) rotate(${marker.angle.toFixed(2)})">` +
        `<ellipse rx="${(rx * 1.65).toFixed(2)}" ry="${(ry * 1.8).toFixed(2)}" fill="${fill}" opacity="${(opacity * 0.18).toFixed(2)}"/>` +
        `<ellipse rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="${fill}" opacity="${opacity.toFixed(2)}"/>` +
        `<ellipse rx="${Math.max(1, rx * 0.32).toFixed(2)}" ry="${Math.max(0.8, ry * 0.45).toFixed(2)}" fill="#fff" opacity="${highlightOpacity.toFixed(2)}"/>` +
        `</g>`;
    }
  }
  return body;
}

function unionBounds(bounds) {
  const x0 = Math.min(...bounds.map(b => b.x));
  const y0 = Math.min(...bounds.map(b => b.y));
  const x1 = Math.max(...bounds.map(b => b.x + b.w));
  const y1 = Math.max(...bounds.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function buildSVG({ whiteBg = false, animation = null, bounds = null } = {}) {
  const playback = animation?.playback || {};
  const elements = animation ? animatedElementsAt(animation.seconds, playback) : state.elements;
  const traced = traceScene(elements, state.beams);
  const b = bounds || sceneBounds(elements, traced.drawables);
  let body = '';
  const frame = [...elements].reverse().find(el => registry[el.type]?.exportFrame);

  if (whiteBg || frame?.params.background === 'white') body += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#ffffff"/>`;

  // Objective-owned medium is derived from authored target identity, then
  // follows the current animation pose. Draw it below optical energy and
  // components so it reads as a relationship rather than a selectable part.
  body += immersionLayerSVG(elements, state.beams, { baseElements: state.elements });

  for (const d of traced.drawables) {
    if (d.type === 'poly') body += `<polygon points="${ptsAttr(d.pts)}" fill="${d.color}" opacity="${d.opacity}"/>`;
    else if (d.type === 'dots') body += `<g fill="${d.color}">` + d.dots.map(o => `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="${o.r.toFixed(2)}" opacity="${o.o.toFixed(2)}"/>`).join('') + `</g>`;
    else body += `<polyline points="${ptsAttr(d.pts)}" fill="none" stroke="${d.color}" stroke-width="${d.w}" opacity="${d.opacity}" stroke-linejoin="round" stroke-linecap="round" ${d.dash ? `stroke-dasharray="${d.dash === true ? '6 4' : d.dash}"` : ''}/>`;
  }

  if (animation) {
    const speed = Math.max(1, Number(playback.speedNsPerSecond) || 10);
    body += pulseLayerSVG(traced.pulseTracks, animation.seconds * speed, playback);
  }

  for (const mb of state.beams) body += manualBeamSVG(mb);

  for (const el of elements) {
    if (el.type === 'display') body += displayCableSVG(el, elements);
  }

  for (const el of elements) {
    const def = registry[el.type];
    if (!def || def.hideInExport) continue;
    body += `<g transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})">${def.svg(el, elements)}</g>`;
    body += labelSVG(el);
  }

  const defs = '<defs><linearGradient id="pulseSpectrum" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c3aed"/><stop offset="0.22" stop-color="#2563eb"/><stop offset="0.45" stop-color="#10b981"/><stop offset="0.65" stop-color="#eab308"/><stop offset="0.82" stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${Math.round(b.w)}" height="${Math.round(b.h)}" font-family="Helvetica, Arial, sans-serif">${defs}${body}</svg>`;
}

export function exportSVG() {
  download('optical-setup.svg', buildSVG(), 'image/svg+xml');
}

export function exportPNG(scale = 3) {
  const svgText = buildSVG({ whiteBg: true });
  const m = svgText.match(/width="(\d+)" height="(\d+)"/);
  const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    cv.toBlob(blob => {
      if (blob) download('optical-setup.png', blob);
      else alert('Could not create the PNG export. Try exporting SVG instead.');
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Could not render the PNG export. Try exporting SVG instead.');
  };
  img.src = url;
}

function imageFromSVG(svgText) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render an animation frame')); };
    image.src = url;
  });
}

export async function buildGIF({ durationSeconds = 4, fps = 20, maxDimension = 960, playback = {}, onProgress } = {}) {
  const duration = Math.min(12, Math.max(0.25, Number(durationSeconds) || 4));
  const rate = Math.min(30, Math.max(1, Math.round(Number(fps) || 20)));
  const frameCount = Math.round(duration * rate);
  const edge = Math.min(1600, Math.max(320, Math.round(Number(maxDimension) || 960)));
  const times = Array.from({ length: frameCount }, (_, index) => index * duration / frameCount);
  const frames = times.map(seconds => {
    const elements = animatedElementsAt(seconds, playback);
    const traced = traceScene(elements, state.beams);
    return { seconds, bounds: sceneBounds(elements, traced.drawables) };
  });
  const hasFrame = state.elements.some(el => registry[el.type]?.exportFrame);
  const bounds = hasFrame ? frames[0].bounds : unionBounds(frames.map(frame => frame.bounds));
  const scale = edge / Math.max(bounds.w, bounds.h);
  const width = Math.max(1, Math.round(bounds.w * scale));
  const height = Math.max(1, Math.round(bounds.h * scale));
  validateGIFOptions({ width, height, fps: rate, frameCount });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const indexedFrames = [];
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const svgText = buildSVG({
      whiteBg: true,
      bounds,
      animation: { seconds: frame.seconds, playback },
    });
    const image = await imageFromSVG(svgText);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    indexedFrames.push(imageDataToRGB332(context.getImageData(0, 0, width, height)));
    onProgress?.((index + 1) / frames.length);
    if (index % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return encodeGIF({ width, height, fps: rate, frames: indexedFrames });
}

export async function exportGIF(options) {
  const bytes = await buildGIF(options);
  download('optical-setup.gif', bytes, 'image/gif');
  return bytes;
}
