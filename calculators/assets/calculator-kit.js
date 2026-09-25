// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Shared pieces of the calculator pages: the input form built from a
// calculator's schema, number formatting, and a small SVG line chart with
// real axes, a legend, a crosshair tooltip (pointer and keyboard) and a data
// table. No dependencies. Text from data is inserted with textContent.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = n => String(n).split('').map(c => SUPERSCRIPT[c] ?? c).join('');

// 3 significant figures; scientific as "1.29 × 10⁵" outside 1e-3..1e5.
export function formatNumber(x, digits = 3) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 1e5 || abs < 1e-3) {
    const exp = Math.floor(Math.log10(abs));
    let mant = x / 10 ** exp;
    if (Math.abs(Number(mant.toPrecision(digits))) >= 10) { mant /= 10; return `${Number(mant.toPrecision(digits))} × 10${sup(exp + 1)}`; }
    return `${Number(mant.toPrecision(digits))} × 10${sup(exp)}`;
  }
  return String(Number(x.toPrecision(digits)));
}

// Power with an SI prefix: 0.000012 -> "12.0 µW".
export function formatSI(x, unit, digits = 3) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  if (x === 0) return `0 ${unit}`;
  const prefixes = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  const abs = Math.abs(x);
  const [scale, prefix] = prefixes.find(([s]) => abs >= s * 0.9995) ?? prefixes.at(-1);
  if (abs < 1e-18 || abs >= 1e12) return `${formatNumber(x, digits)} ${unit}`;
  return `${Number((x / scale).toPrecision(digits))} ${prefix}${unit}`;
}

// ---------------- form ----------------

// Render the schema's inputs into fieldsets. `groups` maps group id to a
// title; a group with `optional: true` is shown collapsed-looking and wide.
export function renderForm(form, inputs, groups, values) {
  form.textContent = '';
  for (const [groupId, group] of Object.entries(groups)) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `calc-group${group.optional ? ' optional' : ''}`;
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    fieldset.append(legend);
    for (const input of inputs.filter(i => i.group === groupId)) {
      const row = document.createElement('div');
      row.className = `calc-field${input.type === 'checkbox' ? ' check' : ''}`;
      row.dataset.field = input.id;
      const id = `in-${input.id}`;
      const helpId = `${id}-help`;
      const label = document.createElement('label');
      label.htmlFor = id;
      const control = document.createElement('input');
      control.id = id;
      control.name = input.id;
      control.setAttribute('aria-describedby', helpId);
      if (input.type === 'checkbox') {
        control.type = 'checkbox';
        control.checked = Boolean(values[input.id]);
        label.append(control, document.createTextNode(input.label));
        row.append(label);
      } else {
        control.type = 'number';
        control.inputMode = 'decimal';
        // Arrows move by arrowStep (1 without one). The browser counts steps
        // from `min`, so it is aligned to the step: 300 fs goes to 350, not
        // 301. Range checks are the schema's, done by the page, not here.
        control.step = input.arrowStep ?? 'any';
        control.min = input.arrowStep ? Math.floor(input.min / input.arrowStep) * input.arrowStep : input.min;
        control.max = input.max;
        control.value = values[input.id];
        label.append(document.createTextNode(input.label));
        if (input.symbol) {
          const sym = document.createElement('span');
          sym.className = 'sym';
          sym.innerHTML = input.symbol; // schema-authored markup, not user data
          label.append(sym);
        }
        const wrap = document.createElement('span');
        wrap.className = 'control';
        wrap.append(control);
        if (input.unit) {
          const unit = document.createElement('span');
          unit.className = 'unit';
          unit.textContent = input.unit;
          wrap.append(unit);
        }
        row.append(label, wrap);
      }
      const help = document.createElement('div');
      help.className = 'help';
      help.id = helpId;
      help.textContent = input.help;
      row.append(help);
      fieldset.append(row);
    }
    form.append(fieldset);
  }
}

export function readForm(form, inputs) {
  const raw = {};
  for (const input of inputs) {
    const el = form.elements[input.id];
    raw[input.id] = input.type === 'checkbox' ? el.checked : el.value;
  }
  return raw;
}

// Dim and disable inputs whose `when` checkbox is off; mark invalid ones.
export function syncForm(form, inputs, raw, invalidIds = new Set()) {
  for (const input of inputs) {
    const el = form.elements[input.id];
    const off = Boolean(input.when) && !raw[input.when];
    el.disabled = off;
    el.closest('.calc-field').classList.toggle('is-off', off);
    if (input.type !== 'checkbox') el.setAttribute('aria-invalid', String(invalidIds.has(input.id)));
  }
}

// ---------------- chart ----------------

function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}
function linearTicks(lo, hi, target) {
  if (!(hi > lo)) { const d = Math.abs(lo) || 1; lo -= d; hi += d; }
  const step = niceStep(hi - lo, target);
  const start = Math.ceil(lo / step - 1e-9) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { lo, hi, ticks };
}
function logTicks(lo, hi, target) {
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
  const every = Math.max(1, Math.ceil((b - a) / target));
  const ticks = [];
  for (let e = a; e <= b; e += every) ticks.push(e);
  return { lo: 10 ** a, hi: 10 ** Math.max(b, a + 1), ticks: ticks.map(e => 10 ** e), exps: ticks };
}
const logLabel = v => { const e = Math.round(Math.log10(v)); return e === 0 ? '1' : e === 1 ? '10' : `10${sup(e)}`; };

const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
};

// series: [{ key, name, color (CSS var), values: number|null per x }]
// options: { x: [...], xLabel, yLabel, yLog, yMin, yMax, marker: {x, y} | null,
//            formatX, formatY, message }
export function lineChart(host, table, options) {
  host.textContent = '';
  if (table) table.textContent = '';
  if (options.message) {
    const p = document.createElement('p');
    p.className = 'chart-message';
    p.textContent = options.message;
    host.append(p);
    return;
  }
  const { x, series } = options;
  const formatX = options.formatX ?? (v => formatNumber(v));
  const formatY = options.formatY ?? (v => formatNumber(v));
  const shown = series.filter(s => s.values.some(v => v !== null && Number.isFinite(v)));

  if (shown.length > 1) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    for (const s of shown) {
      const item = document.createElement('span');
      const key = document.createElement('i');
      key.style.background = `var(${s.color})`;
      item.append(key, document.createTextNode(s.name));
      legend.append(item);
    }
    host.append(legend);
  }

  const width = Math.max(280, Math.round(host.clientWidth || 360));
  const height = Math.round(Math.min(300, Math.max(220, width * 0.62)));
  const pad = { left: 56, right: 14, top: 10, bottom: 44 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;

  const xs = linearTicks(Math.min(...x), Math.max(...x), Math.max(3, Math.round(plotW / 80)));
  const all = shown.flatMap(s => s.values).filter(v => v !== null && Number.isFinite(v) && (!options.yLog || v > 0));
  let ys;
  if (options.yLog) {
    const lo = Math.max(1, Math.min(...all, options.yMin ?? Infinity));
    const hi = Math.max(lo * 10, ...all);
    ys = logTicks(lo, hi, 5);
  } else {
    ys = linearTicks(options.yMin ?? Math.min(0, ...all), options.yMax ?? Math.max(...all, 1e-12), 5);
  }
  const sx = v => pad.left + (v - xs.lo) / (xs.hi - xs.lo) * plotW;
  const sy = options.yLog
    ? v => pad.top + plotH - (Math.log10(Math.max(v, ys.lo)) - Math.log10(ys.lo)) / (Math.log10(ys.hi) - Math.log10(ys.lo)) * plotH
    : v => pad.top + plotH - (v - ys.lo) / (ys.hi - ys.lo) * plotH;

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', tabindex: '0',
    'aria-label': `${options.yLabel} against ${options.xLabel}. Use the left and right arrow keys to read values; the data table below lists them all.` });
  host.append(svg);

  // grid and ticks
  for (const t of ys.ticks) {
    const y = sy(t);
    el('line', { class: 'chart-grid', x1: pad.left, x2: pad.left + plotW, y1: y, y2: y }, svg);
    el('text', { class: 'chart-tick', x: pad.left - 7, y: y + 3.5, 'text-anchor': 'end' }, svg).textContent = options.yLog ? logLabel(t) : formatY(t);
  }
  for (const t of xs.ticks) {
    const xPos = sx(t);
    el('line', { class: 'chart-axis', x1: xPos, x2: xPos, y1: pad.top + plotH, y2: pad.top + plotH + 4 }, svg);
    el('text', { class: 'chart-tick', x: xPos, y: pad.top + plotH + 17, 'text-anchor': 'middle' }, svg).textContent = formatX(t);
  }
  el('line', { class: 'chart-axis', x1: pad.left, x2: pad.left + plotW, y1: pad.top + plotH, y2: pad.top + plotH }, svg);
  el('line', { class: 'chart-axis', x1: pad.left, x2: pad.left, y1: pad.top, y2: pad.top + plotH }, svg);
  el('text', { class: 'chart-label', x: pad.left + plotW / 2, y: height - 6, 'text-anchor': 'middle' }, svg).textContent = options.xLabel;
  el('text', { class: 'chart-label', x: 13, y: pad.top + plotH / 2, 'text-anchor': 'middle', transform: `rotate(-90 13 ${pad.top + plotH / 2})` }, svg).textContent = options.yLabel;

  // lines (a null value breaks the line); drawn last-first so the first
  // series, the one the page is about, sits on top where they coincide
  for (const s of [...shown].reverse()) {
    let d = '', pen = false;
    s.values.forEach((v, k) => {
      if (v === null || !Number.isFinite(v) || (options.yLog && !(v > 0))) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${sx(x[k]).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    el('path', { class: 'chart-line', d, stroke: `var(${s.color})` }, svg);
  }
  if (options.marker && Number.isFinite(options.marker.y)) {
    el('circle', { class: 'chart-marker', cx: sx(options.marker.x), cy: sy(options.marker.y), r: 5, fill: `var(${shown[0]?.color ?? '--series-1'})` }, svg);
  }

  // crosshair + tooltip, pointer and keyboard
  const cross = el('line', { class: 'chart-cross', y1: pad.top, y2: pad.top + plotH, visibility: 'hidden' }, svg);
  const dots = shown.map(s => el('circle', { r: 4, fill: `var(${s.color})`, class: 'chart-marker', visibility: 'hidden' }, svg));
  const tip = document.createElement('div');
  tip.className = 'chart-tooltip';
  tip.hidden = true;
  host.append(tip);
  let index = null;
  const showAt = k => {
    index = Math.max(0, Math.min(x.length - 1, k));
    const xPos = sx(x[index]);
    cross.setAttribute('x1', xPos); cross.setAttribute('x2', xPos); cross.setAttribute('visibility', 'visible');
    tip.textContent = '';
    const head = document.createElement('div');
    head.className = 'tt-x';
    head.textContent = `${options.xLabel.replace(/\s*\(.*\)$/, '')}: ${formatX(x[index])}${options.xUnit ? ` ${options.xUnit}` : ''}`;
    tip.append(head);
    shown.forEach((s, j) => {
      const v = s.values[index];
      const ok = v !== null && Number.isFinite(v) && (!options.yLog || v > 0);
      dots[j].setAttribute('visibility', ok ? 'visible' : 'hidden');
      if (ok) { dots[j].setAttribute('cx', xPos); dots[j].setAttribute('cy', sy(v)); }
      const row = document.createElement('div');
      row.className = 'tt-row';
      const key = document.createElement('i');
      key.style.background = `var(${s.color})`;
      const value = document.createElement('b');
      value.textContent = ok ? formatY(v) : '—';
      const name = document.createElement('span');
      name.textContent = s.name;
      row.append(key, value, name);
      tip.append(row);
    });
    tip.hidden = false;
    const scale = host.clientWidth / width || 1;
    const left = xPos * scale;
    tip.style.left = `${Math.min(Math.max(0, left + 12), host.clientWidth - tip.offsetWidth)}px`;
    tip.style.top = `${pad.top * scale + 6}px`;
  };
  const hide = () => {
    index = null; tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    dots.forEach(d => d.setAttribute('visibility', 'hidden'));
  };
  const nearest = clientX => {
    const box = svg.getBoundingClientRect();
    const px = (clientX - box.left) * (width / box.width);
    const value = xs.lo + (px - pad.left) / plotW * (xs.hi - xs.lo);
    let best = 0;
    x.forEach((v, k) => { if (Math.abs(v - value) < Math.abs(x[best] - value)) best = k; });
    return best;
  };
  svg.addEventListener('pointermove', e => showAt(nearest(e.clientX)));
  svg.addEventListener('pointerdown', e => showAt(nearest(e.clientX)));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    showAt(index === null ? Math.floor(x.length / 2) : index + (e.key === 'ArrowRight' ? step : -step));
  });

  if (table) {
    const t = document.createElement('table');
    const head = t.createTHead().insertRow();
    for (const text of [options.xLabel, ...shown.map(s => s.name)]) {
      const th = document.createElement('th');
      th.textContent = text;
      head.append(th);
    }
    const body = t.createTBody();
    x.forEach((xv, k) => {
      const r = body.insertRow();
      r.insertCell().textContent = formatX(xv);
      for (const s of shown) r.insertCell().textContent = formatY(s.values[k]);
    });
    table.append(t);
  }
}
