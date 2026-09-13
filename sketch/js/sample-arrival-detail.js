// A fixed-scale view of actual specimen hits. These are geometric ray
// samples and their support, never a PSF, calculated focus or exposure dose.
import { toLocal } from './util.js';

const MAX_CHANNELS = 128;
const MAX_POSITIONS = 1024;
const defaults = Object.freeze({
  arrivalDetailRangeUm: 100, arrivalDetailOffsetX: 45, arrivalDetailOffsetY: -150,
  arrivalDetailWidth: 220, arrivalDetailHeight: 120, arrivalDetailFontSize: 18,
});
const ranges = Object.freeze({
  arrivalDetailRangeUm: [1, 100000], arrivalDetailOffsetX: [-5000, 5000],
  arrivalDetailOffsetY: [-5000, 5000], arrivalDetailWidth: [210, 1000],
  arrivalDetailHeight: [110, 500], arrivalDetailFontSize: [12, 36],
});
const finite = value => typeof value === 'number' && Number.isFinite(value);

export const SAMPLE_ARRIVAL_DETAIL_PARAMS = [
  { key: 'arrivalDetailHeading', label: 'Sample-plane arrival detail', type: 'section', open: false },
  { key: 'showArrivalDetail', label: 'Show arrival-detail inset', type: 'checkbox', def: false,
    note: 'Actual sampled ray positions on a fixed transverse scale; not a PSF, voxel size, or dose.' },
  ...[
    ['arrivalDetailRangeUm', 'Fixed transverse field (± µm)', 10],
    ['arrivalDetailOffsetX', 'Inset horizontal offset (mm)', 5],
    ['arrivalDetailOffsetY', 'Inset vertical offset (mm)', 5],
    ['arrivalDetailWidth', 'Inset width (mm)', 10],
    ['arrivalDetailHeight', 'Inset height (mm)', 10],
    ['arrivalDetailFontSize', 'Inset text size (mm)', 1],
  ].map(([key, label, step]) => ({ key, label, step, type: 'number',
    min: ranges[key][0], max: ranges[key][1], def: defaults[key],
    show: p => p.showArrivalDetail === true })),
];

export function sampleArrivalDetailOptions(params = {}) {
  const options = { enabled: params.showArrivalDetail === true };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = finite(params[key]) ? params[key] : fallback;
    options[key] = Math.min(ranges[key][1], Math.max(ranges[key][0], value));
  }
  return options;
}

let stages = new Map();

export function resetSampleArrivalDetails() {
  stages = new Map();
}

// Called only at actual specimen hits, excluding mount surfaces and probe
// passes. Every spatial sample participates, including a serial beam's edges.
export function recordSampleArrivalDetail(element, hit, ray) {
  if (element?.type !== 'stage' || element.params?.showArrivalDetail !== true
      || !(ray.intensity > 1e-12) || !finite(ray.intensity)
      || !finite(hit?.x) || !finite(hit?.y)) return;
  const positionUm = toLocal(element, hit.x, hit.y).x * 1000;
  if (!finite(positionUm) || Math.abs(positionUm) > 1e9) return;
  let stage = stages.get(element.id);
  if (!stage) stages.set(element.id, stage = { channels: new Map(), channelsTruncated: false });
  // Physical ports are propagated independently of numerical sample tags.
  // A serial source has one channel even when its beam contains many rays.
  const source = ray.sourceId || ray.pulse?.sourceId || ray.originId || 'source';
  const route = ray.arrivalGroup || ray.arrivalPath || 'direct';
  const key = JSON.stringify([source, route]);
  let channel = stage.channels.get(key);
  if (!channel) {
    if (stage.channels.size >= MAX_CHANNELS) { stage.channelsTruncated = true; return; }
    stage.channels.set(key, channel = {
      key, sourceId: source, route, minUm: positionUm, maxUm: positionUm,
      positionsUm: [], sampleCount: 0, samplesTruncated: false,
    });
  }
  channel.minUm = Math.min(channel.minUm, positionUm);
  channel.maxUm = Math.max(channel.maxUm, positionUm);
  channel.sampleCount++;
  if (channel.positionsUm.length < MAX_POSITIONS) channel.positionsUm.push(positionUm);
  else channel.samplesTruncated = true;
}

export function sampleArrivalDetailReading(stageId) {
  const stage = stages.get(stageId);
  const channels = [...(stage?.channels.values() || [])]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(channel => ({ ...channel, positionsUm: [...channel.positionsUm] }));
  return { channels, channelsTruncated: stage?.channelsTruncated || false };
}

export function sampleArrivalDetailBounds(element) {
  const options = sampleArrivalDetailOptions(element.params);
  if (!options.enabled || !finite(element.x) || !finite(element.y)) return null;
  const x0 = element.x + options.arrivalDetailOffsetX;
  const y0 = element.y + options.arrivalDetailOffsetY;
  return { x0, y0, x1: x0 + options.arrivalDetailWidth, y1: y0 + options.arrivalDetailHeight };
}

const number = value => (Math.abs(value) < 1e-9 ? 0 : value).toFixed(2);
const label = value => Number(value.toPrecision(4)).toString();

export function sampleArrivalDetailSVG(element) {
  const options = sampleArrivalDetailOptions(element.params);
  if (!options.enabled) return '';
  // Scale an internal logical canvas, leaving placement and outer world
  // bounds unchanged. Cap typography to preserve the smallest readable
  // layout rather than overflowing a panel smaller than the requested type.
  const scale = Math.min(options.arrivalDetailFontSize / 18,
    options.arrivalDetailWidth / 210, options.arrivalDetailHeight / 110);
  const width = options.arrivalDetailWidth / scale;
  const height = options.arrivalDetailHeight / scale;
  const range = options.arrivalDetailRangeUm;
  const left = 18, right = width - 18, top = 55, bottom = height - 30;
  const plotX = value => left + (value + range) / (2 * range) * (right - left);
  const reading = sampleArrivalDetailReading(element.id);
  const maxRows = Math.max(1, Math.min(8, Math.floor((bottom - top) / 18)));
  const visible = reading.channels.slice(0, maxRows);
  const count = reading.channels.length;
  const clipped = count > visible.length || reading.channelsTruncated;
  const outside = reading.channels.some(channel => channel.minUm < -range || channel.maxUm > range);
  const truncated = reading.channels.some(channel => channel.samplesTruncated);
  const rotation = finite(element.rot) ? element.rot : 0;
  let svg = `<g class="sample-arrival-detail" transform="rotate(${-rotation}) translate(${options.arrivalDetailOffsetX} ${options.arrivalDetailOffsetY})" font-family="Helvetica, Arial, sans-serif" data-outside-field="${outside}">`;
  svg += '<title>Actual sampled specimen-surface arrivals. Bars show sampled support, not a PSF or dose.';
  if (outside) svg += ' Arrows indicate arrivals outside the fixed field.';
  if (clipped) svg += ` Showing ${visible.length} of ${count}${reading.channelsTruncated ? '+' : ''} physical channels.`;
  if (truncated) svg += ' Some ticks omitted at the display budget; support includes all arrivals.';
  svg += '</title>';
  svg += `<g class="sample-arrival-detail-layout" transform="scale(${scale})">`;
  svg += `<rect width="${width}" height="${height}" rx="6" fill="#ffffff" stroke="#64748b" stroke-width="0.8"/>`;
  svg += `<text x="14" y="24" font-size="18" font-weight="700" fill="#172033">Ray arrivals</text>`;
  if (count) {
    const countLabel = clipped ? `${visible.length}/${count}${reading.channelsTruncated ? '+' : ''}` : `${count} path${count === 1 ? '' : 's'}`;
    svg += `<text x="${width - 14}" y="24" text-anchor="end" font-size="16" fill="#475569">${countLabel}</text>`;
  }
  svg += `<text x="14" y="45" font-size="16" fill="#475569">Fixed ±${label(range)} µm</text>`;
  svg += `<rect x="${left}" y="${top - 4}" width="${right - left}" height="${bottom - top + 8}" fill="#f8fafc"/>`;
  for (const fraction of [-1, 0, 1]) {
    const x = plotX(fraction * range);
    svg += `<path d="M ${number(x)} ${top - 4} V ${bottom + 4}" fill="none" stroke="${fraction === 0 ? '#94a3b8' : '#e2e8f0'}" stroke-width="0.6"/>`;
    const anchor = fraction < 0 ? 'start' : fraction > 0 ? 'end' : 'middle';
    svg += `<text x="${number(x)}" y="${bottom + 23}" font-size="16" text-anchor="${anchor}" fill="#475569">${label(fraction * range)}</text>`;
  }
  if (!count) svg += `<text x="${width / 2}" y="${(top + bottom) / 2 + 5}" text-anchor="middle" font-size="16" fill="#64748b">No arrivals</text>`;
  for (const [index, channel] of visible.entries()) {
    const y = top + (index + 0.5) * (bottom - top) / Math.max(1, visible.length);
    const lo = Math.max(-range, channel.minUm), hi = Math.min(range, channel.maxUm);
    svg += `<g class="sample-arrival-channel" data-channel="${index + 1}" data-span-um="${number(channel.maxUm - channel.minUm)}">`;
    // The horizontal bar is explicitly sampled min–max support, not an
    // intensity curve. Ticks mark real arrivals; no synthetic centroid dot.
    if (hi >= lo) svg += `<path class="sample-arrival-support" d="M ${number(plotX(lo))} ${number(y)} H ${number(plotX(hi))}" fill="none" stroke="#7c3aed" stroke-opacity="0.25" stroke-width="5"/>`;
    const ticks = new Set(channel.positionsUm.filter(value => value >= -range && value <= range)
      .map(value => number(plotX(value))));
    const halfTick = Math.min(8, Math.max(2, (bottom - top) / Math.max(1, visible.length) / 3));
    for (const x of ticks) svg += `<path class="sample-arrival-tick" d="M ${x} ${number(y - halfTick)} V ${number(y + halfTick)}" stroke="#6d28d9" stroke-width="0.8"/>`;
    // Off-field arrivals get arrows, never falsely clamped arrival ticks.
    if (channel.minUm < -range) svg += `<path d="M ${left + 4} ${number(y - 3)} L ${left} ${number(y)} L ${left + 4} ${number(y + 3)}" fill="none" stroke="#b45309" stroke-width="1"/>`;
    if (channel.maxUm > range) svg += `<path d="M ${right - 4} ${number(y - 3)} L ${right} ${number(y)} L ${right - 4} ${number(y + 3)}" fill="none" stroke="#b45309" stroke-width="1"/>`;
    svg += '</g>';
  }
  svg += '</g></g>';
  return svg;
}
