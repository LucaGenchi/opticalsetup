// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The enlarged view inside a zoom: the part of the bench under its region,
// drawn again at the zoom's magnification. Shared by the canvas and the
// export so the figure shows what the workbench shows.
//
// Geometry grows with the magnification; line weights do not. A traced ray
// stays a fine line, so where rays really cross is what the view shows, and
// a component's outline keeps the weight it has on the bench instead of
// swelling over what it surrounds. Beam envelopes are areas, not lines, and
// grow with everything else.

import { registry, getVisualBounds, displayCableSVG } from './elements.js';
import { immersionLayerSVG } from './immersion.js';
import { manualBeamSVG } from './util.js';
import { formatLength, zoomFrameSVG, zoomGeometry, zoomMapper } from './zoom.js';
import { focusEnvelope, zoomFoci } from './zoom-focus.js';

// Notes about the setup -- text, arrows, probe readouts, the figure frame,
// other zooms -- keep their own size and are not magnified. A highlight is
// the exception: it colours the bench beneath, so it belongs in the view.
function magnified(el) {
  const def = registry[el.type];
  return !!def && (def.category !== 'Annotations' || def.background === true);
}

function overlaps(box, region) {
  return !!box && box.x0 <= region.x1 && box.x1 >= region.x0 && box.y0 <= region.y1 && box.y1 >= region.y0;
}

function pointsBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return null;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return pts.length ? { x0, y0, x1, y1 } : null;
}

// Divide every stroke width by the magnification, so a group drawn under
// scale(mag) keeps its bench line weight.
function benchStrokes(svg, mag) {
  return svg.replace(/stroke-width="([^"]*)"/g, (whole, value) => {
    const width = Number(value);
    return Number.isFinite(width) ? `stroke-width="${Number((width / mag).toPrecision(4))}"` : whole;
  });
}

function ptsAttr(pts) { return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }

// Traced rays and beams, mapped point by point into the view. Each shape is
// only a fill or only a stroke, so fill- and stroke-opacity draw what the
// bench's opacity draws, without compositing every ray as its own layer.
function drawablesSVG(drawables, region, map, nonScalingStroke) {
  let s = '';
  for (const d of drawables) {
    if (d.type === 'dots') {
      const dots = (d.dots || []).filter(o => overlaps(pointsBox([o]), region));
      if (!dots.length) continue;
      s += `<g fill="${d.color}">` + dots.map(o => {
        const q = map(o);
        return `<circle cx="${q.x.toFixed(2)}" cy="${q.y.toFixed(2)}" r="${o.r.toFixed(2)}" fill-opacity="${o.o.toFixed(2)}"/>`;
      }).join('') + `</g>`;
      continue;
    }
    if (!d.pts?.length || !overlaps(pointsBox(d.pts), region)) continue;
    const pts = d.pts.map(map);
    if (d.type === 'poly') {
      s += `<polygon points="${ptsAttr(pts)}" fill="${d.color}" fill-opacity="${d.opacity}" stroke="none"/>`;
    } else {
      s += `<polyline points="${ptsAttr(pts)}" fill="none" stroke="${d.color}" stroke-width="${d.w}" stroke-opacity="${d.opacity}" stroke-linejoin="round" stroke-linecap="round"${nonScalingStroke ? ' vector-effect="non-scaling-stroke"' : ''} ${d.dash ? `stroke-dasharray="${d.dash === true ? '6 4' : d.dash}"` : ''}${d.dash && d.dashOffset ? ` stroke-dashoffset="${d.dashOffset}"` : ''}/>`;
    }
  }
  return s;
}

// The bench box around a zoom's region, turned or not.
function regionBox(zoom, g) {
  const ex = g.rx * Math.abs(g.cos) + g.ry * Math.abs(g.sin);
  const ey = g.rx * Math.abs(g.sin) + g.ry * Math.abs(g.cos);
  return { x0: zoom.x - ex, x1: zoom.x + ex, y0: zoom.y - ey, y1: zoom.y + ey };
}

// Where a pulse marker on the bench lands in a zoom's view: its point mapped
// like the rays, its heading turned into the drawing frame, and `scale` for
// the packet's length on the bench, which grows with the magnification when
// it is a physical c·τ length. A schematic packet is a mark and keeps its
// size. Markers clear of the region are left out (null).
export function zoomPulsePlacement(zoom) {
  const g = zoomGeometry(zoom.params, zoom.rot);
  const map = zoomMapper(g, zoom);
  const region = regionBox(zoom, g);
  return marker => {
    const reach = Math.max(12, marker.widthMm || 0);
    if (!(marker.x >= region.x0 - reach && marker.x <= region.x1 + reach
      && marker.y >= region.y0 - reach && marker.y <= region.y1 + reach)) return null;
    const q = map(marker);
    return { x: q.x, y: q.y, angle: marker.angle - g.turn, scale: g.mag };
  };
}

// The diffraction-limited focus of each beam that focuses in the region:
// its 1/e² envelope, and a note for the view naming its 1/e² radius and
// Rayleigh range unless that is turned off. The envelope is mapped point by point into the view, as
// the rays are: a waist is microns wide, and written in bench millimetres
// to the hundredth it would be rounded into steps once magnified.
function focusLayer(zoom, g, paths, nonScalingStroke) {
  const named = zoom.params.focusNote !== false;
  const reach = Math.hypot(g.rx, g.ry);
  const map = zoomMapper(g, zoom);
  let svg = '';
  const notes = [];
  for (const focus of zoomFoci(zoom, paths)) {
    const outline = focusEnvelope(focus, reach).map(map);
    if (!outline.length) continue;
    svg += `<polygon points="${ptsAttr(outline)}" fill="${focus.color}" fill-opacity="0.28" stroke="${focus.color}" stroke-width="0.8" stroke-opacity="0.9" stroke-linejoin="round"${nonScalingStroke ? ' vector-effect="non-scaling-stroke"' : ''} data-zoom-focus="true"/>`;
    // Two short lines rather than one long one, so a round view of modest
    // size still has room for them.
    if (named) notes.push({ text: `w₀ ${formatLength(focus.w0Mm)}` }, { text: `zR ${formatLength(focus.zRMm)}` });
  }
  return { svg, notes };
}

// The zoom drawn in its local frame, view filled. `scene` is what the bench
// is drawn from: the traced drawables, the manual beams, the elements as
// drawn (animated poses on the canvas) and the authored ones the immersion
// layer is derived from. `exporting` leaves out canvas-only elements;
// `nonScalingStroke` matches the canvas, whose rays keep a screen width;
// `pulses` is the view's pulse packets, already placed; `paths` is the
// traced rays, which the diffraction-limited focus is found from.
export function zoomSceneSVG(zoom, scene = {}) {
  const {
    drawables = [], beams = [], elements = [], baseElements = elements,
    exporting = false, nonScalingStroke = false, background = '#ffffff', pulses = '', paths = [],
  } = scene;
  const g = zoomGeometry(zoom.params, zoom.rot);
  const region = regionBox(zoom, g);
  // Bench -> drawing frame: about the zoom's origin, turned back by the
  // frame's angle, magnified, then moved to the view. Explicit widths are
  // divided by benchStrokes(); a stroke that leaves its width to SVG's
  // default of 1 inherits the group's 1/mag instead.
  const onBench = body => body
    ? `<g transform="translate(${g.ix} ${g.iy}) scale(${g.mag}) rotate(${-g.turn}) translate(${-zoom.x} ${-zoom.y})" stroke-width="${Number((1 / g.mag).toPrecision(4))}">${benchStrokes(body, g.mag)}</g>`
    : '';
  const shown = elements.filter(el => el.id !== zoom.id && magnified(el)
    && !(exporting && registry[el.type].hideInExport)
    && overlaps(getVisualBounds(el, { includeLabel: false, elements }), region));
  const draw = el => `<g transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})">${registry[el.type].svg(el, elements)}</g>`;
  const isBackground = el => registry[el.type].background === true;

  let content = onBench(shown.filter(isBackground).map(draw).join(''));
  content += onBench(immersionLayerSVG(elements, beams, { baseElements }));
  content += drawablesSVG(drawables, region, zoomMapper(g, zoom), nonScalingStroke);
  // On unless turned off, so a zoom saved before the setting draws it too.
  const focus = zoom.params.diffraction !== false ? focusLayer(zoom, g, paths, nonScalingStroke) : { svg: '', notes: [] };
  content += focus.svg;
  // Pulse packets, already placed with zoomPulsePlacement(), sit on the rays
  // and under the parts, as on the bench. The canvas passes an empty slot
  // here and fills it on every pulse frame.
  content += pulses;
  // Drawn beams are the Arrow tool's annotations and stay out, like text;
  // fibers are optical parts of the bench and are enlarged.
  content += onBench(beams.filter(b => b.kind === 'fiber' && overlaps(pointsBox(b.pts || []), region)).map(manualBeamSVG).join('')
    + elements.filter(el => el.type === 'display').map(el => displayCableSVG(el, elements)).join('')
    + shown.filter(el => !isBackground(el)).map(draw).join(''));
  const clipId = `zoom-view-${String(zoom.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
  return zoomFrameSVG(zoom.params, { content, background, clipId, rot: zoom.rot, notes: focus.notes });
}
