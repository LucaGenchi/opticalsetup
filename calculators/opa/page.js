// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The OPA calculator page: inputs -> opa-calculator.js -> results and graphs.

import { OPA_INPUTS, OPA_DEFAULTS, validateOpaInputs, computeOpa, stateText, delayScan, lengthScan, intensityScan } from './opa-calculator.js';
import { renderForm, readForm, syncForm, lineChart, formatNumber, formatSI } from '../assets/calculator-kit.js';

const GROUPS = {
  pump: { title: 'Pump' },
  crystal: { title: 'Crystal' },
  seed: { title: 'Seed (signal)' },
  seed2: { title: 'Second seed (optional)', optional: true },
};
const REGIME = {
  exponential: 'exponential growth',
  boundary: 'boundary, |Δk| = 2Γ',
  oscillatory: 'oscillatory, |Δk| > 2Γ',
  unity: 'no gain',
};

const form = document.getElementById('calc-form');
const status = document.getElementById('calc-status');
const results = document.getElementById('calc-results');
const notes = document.getElementById('calc-notes');
const hosts = Object.fromEntries([...document.querySelectorAll('[data-chart]')].map(h => [h.dataset.chart, h]));
const tables = Object.fromEntries([...document.querySelectorAll('[data-table]')].map(t => [t.dataset.table, t]));

renderForm(form, OPA_INPUTS, GROUPS, OPA_DEFAULTS);
const reset = document.createElement('button');
reset.type = 'button';
reset.className = 'calc-reset';
reset.textContent = 'Reset to the example values';
reset.addEventListener('click', () => { renderForm(form, OPA_INPUTS, GROUPS, OPA_DEFAULTS); form.append(reset); update(); });
form.append(reset);

function row(label, href, value, detail) {
  const tr = results.insertRow();
  const th = document.createElement('th');
  th.scope = 'row';
  if (href) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    th.append(a);
  } else th.textContent = label;
  const td = document.createElement('td');
  td.textContent = value;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    td.append(small);
  }
  tr.append(th, td);
}
function group(title) {
  const tr = results.insertRow();
  tr.className = 'group';
  const th = document.createElement('th');
  th.colSpan = 2;
  th.textContent = title;
  tr.append(th);
}
const percent = x => (Number.isFinite(x) ? `${formatNumber(100 * x)} %` : '—');

function showStatus(kind, text, list) {
  status.className = `calc-status${kind === 'error' ? ' is-error' : ''}`;
  status.textContent = '';
  const lead = document.createElement(kind === 'good' ? 'span' : 'div');
  if (kind === 'good') lead.className = 'state-good';
  lead.textContent = text;
  status.append(lead);
  if (list?.length) {
    const ul = document.createElement('ul');
    for (const item of list) { const li = document.createElement('li'); li.textContent = item; ul.append(li); }
    status.append(ul);
  }
}

function renderResults(v, r) {
  results.textContent = '';
  notes.textContent = '';
  const seed = r.seed;
  const extra = [];
  if (seed?.saturated) extra.push(`limited by the pump energy (depletion limit ${formatNumber(v.maxDepletion)})`);
  if (seed?.lowOverlap) extra.push('the pulses barely overlap');
  showStatus(seed?.state === 'amplifying' ? 'good' : 'info', `${stateText(seed?.state ?? 'invalidGain')}${extra.length ? ` ${extra.join('; ')}.` : ''}`);

  group('Waves');
  row('Idler wavelength λi', '#physics', r.pair ? `${formatNumber(r.pair.idlerWl, 5)} nm` : '—');
  group('Gain');
  row('Gain coefficient Γ at the peak', '#physics', r.gammaPerM === null ? '—' : `${formatNumber(r.gammaPerM / 1000)} /mm`, r.gammaL === null ? '' : `ΓL = ${formatNumber(r.gammaL)}`);
  row('Peak small-signal gain G', '#physics', r.small ? formatNumber(r.small.gain) : '—',
    r.small ? `${formatNumber(10 * Math.log10(r.small.gain))} dB · ${REGIME[r.small.regime] ?? r.small.regime}${r.small.capped ? ' · beyond 10¹⁰⁰, shown capped' : ''}` : '');
  row('Achieved signal gain Ḡ (average power)', '#physics', seed ? formatNumber(seed.achievedGain) : '—',
    r.undepletedGain ? `without the energy limit: ${formatNumber(r.undepletedGain)}` : '');
  group('Powers');
  const perPulse = e => (e === null ? '' : `${formatSI(e, 'J')} per pulse`);
  row('Signal out', '#physics', seed ? formatSI(seed.signalOutW, 'W') : '—', seed ? `in: ${formatSI(seed.signalInW, 'W')}${r.signalEnergyJ !== null ? ` · ${perPulse(r.signalEnergyJ)}` : ''}` : '');
  row('Idler out', '#physics', seed ? formatSI(seed.idlerOutW, 'W') : '—', r.idlerEnergyJ !== null && seed?.idlerOutW > 0 ? perPulse(r.idlerEnergyJ) : '');
  row('Pump out', '#physics', r.allocation ? formatSI(r.allocation.pumpOutW, 'W') : '—', r.allocation ? `in: ${formatSI(r.allocation.pumpInW, 'W')}` : '');
  row('Pump conversion η', '#physics', r.allocation ? percent(r.allocation.conversionFraction) : '—');
  if (seed?.signalGainW > 0 && r.pair) {
    row('Manley–Rowe check', '#physics', formatNumber(seed.idlerOutW / seed.signalGainW, 6), `idler/signal gain; λs/λi = ${formatNumber(v.seedWl / r.pair.idlerWl, 6)}`);
  }
  row('Energy balance (out − in)', '#precision', r.energyErrorW === null ? '—' : formatSI(r.energyErrorW, 'W'));
  if (v.pumpPulsed && v.seedPulsed && seed) {
    group('Timing');
    row('Envelope overlap', '#physics', formatNumber(seed.overlap), seed.skewNs === null ? '' : `peaks ${formatNumber(seed.skewNs * 1e6)} fs apart`);
  }
  group('Pump beam (derived)');
  if (r.pumpEnergyJ !== null) row('Pulse energy', '#physics', formatSI(r.pumpEnergyJ, 'J'));
  row(v.pumpPulsed ? 'Peak power' : 'Power', '#physics', formatSI(r.pumpPeakW, 'W'));
  row('Implied beam radius w (1/e²)', '#physics', r.beamRadiusM === null ? '—' : `${formatNumber(r.beamRadiusM * 1e6)} µm`, 'for a Gaussian beam with this peak intensity');
  if (r.seed2) {
    group('Second seed');
    row('State', null, stateText(r.seed2.state));
    row('Achieved gain', null, formatNumber(r.seed2.achievedGain), `pump taken: ${formatSI(r.seed2.depletedPumpW, 'W')}`);
  }
  for (const text of r.notes) {
    const li = document.createElement('li');
    li.textContent = text;
    notes.append(li);
  }
}

function clearResults(reasons) {
  results.textContent = '';
  notes.textContent = '';
  showStatus('error', 'No result: correct these inputs.', reasons);
  for (const [id, host] of Object.entries(hosts)) lineChart(host, tables[id], { message: 'No graph until the inputs are valid.' });
}

let chartTimer = null;
function renderCharts(v, r) {
  const seedOk = r.seed?.state === 'amplifying';
  const off = seedOk ? null : 'No gain at these settings, so nothing to plot.';
  // 1. delay
  const delay = seedOk ? delayScan(v) : null;
  lineChart(hosts.delay, tables.delay, delay ? {
    x: delay.map(p => p.x), xLabel: 'Seed delay after the pump (fs)', xUnit: 'fs', yLabel: 'Signal gain Ḡ (log scale)', yLog: true,
    series: [
      { name: 'With pump depletion', color: '--series-1', values: delay.map(p => p.depleted) },
      { name: 'Without depletion', color: '--series-3', values: delay.map(p => p.undepleted) },
    ],
    marker: { x: v.delayFs, y: r.seed.achievedGain },
  } : { message: off ?? 'The delay matters only when both the pump and the seed are pulsed.' });
  // 2. length
  const length = seedOk ? lengthScan(v) : null;
  const series = length ? [{ name: 'Model: energy limit', color: '--series-1', values: length.map(p => (p.model === null ? null : 100 * p.model)) }] : [];
  if (length && length.some(p => p.reference !== null)) {
    series.push({ name: 'Exact plane-wave solution', color: '--series-2', values: length.map(p => (p.reference === null ? null : 100 * p.reference)) });
  }
  lineChart(hosts.length, tables.length, length ? {
    x: length.map(p => p.x), xLabel: 'Crystal length L (mm)', xUnit: 'mm', yLabel: 'Pump conversion η (%)', yMin: 0, yMax: 100,
    series, marker: { x: v.lengthMm, y: 100 * r.allocation.conversionFraction },
  } : { message: off });
  if (length && series.length === 1) {
    const p = document.createElement('p');
    p.className = 'chart-note';
    p.textContent = v.seed2On ? 'The exact curve is drawn for one seed only.' : 'The exact curve could not be computed at these settings.';
    hosts.length.append(p);
  }
  // 3. intensity
  const intensity = seedOk ? intensityScan(v) : null;
  lineChart(hosts.intensity, tables.intensity, intensity ? {
    x: intensity.map(p => p.x), xLabel: 'Peak pump intensity Ip (GW/cm²)', xUnit: 'GW/cm²', yLabel: 'Signal gain Ḡ (log scale)', yLog: true,
    series: [
      { name: 'With pump depletion', color: '--series-1', values: intensity.map(p => p.depleted) },
      { name: 'Without depletion', color: '--series-3', values: intensity.map(p => p.undepleted) },
    ],
    marker: { x: v.pumpIntensityGWcm2, y: r.seed.achievedGain },
  } : { message: off });
}

let last = null;
function update() {
  const raw = readForm(form, OPA_INPUTS);
  const { values, reasons } = validateOpaInputs(raw);
  const invalid = new Set(OPA_INPUTS.filter(i => reasons.some(text => text.startsWith(`${i.label} (`))).map(i => i.id));
  syncForm(form, OPA_INPUTS, raw, invalid);
  clearTimeout(chartTimer);
  if (reasons.length) { last = null; clearResults(reasons); return; }
  const r = computeOpa(values);
  renderResults(values, r);
  last = { values, r };
  // The scans rerun the whole calculation 300-odd times; let typing breathe.
  chartTimer = setTimeout(() => renderCharts(values, r), 120);
}

form.addEventListener('input', update);
form.addEventListener('change', update);
new ResizeObserver(() => { if (last) { clearTimeout(chartTimer); chartTimer = setTimeout(() => renderCharts(last.values, last.r), 150); } })
  .observe(document.querySelector('.calc-graphs'));
update();
