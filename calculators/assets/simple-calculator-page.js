// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { renderForm, readForm, syncForm, lineChart, formatNumber } from './calculator-kit.js';

export function mountCalculator({ inputs, defaults, groups, compute, rows, notes = () => [], graphs = () => ({}) }) {
  const form = document.getElementById('calc-form');
  const status = document.getElementById('calc-status');
  const results = document.getElementById('calc-results');
  const noteList = document.getElementById('calc-notes');
  const hosts = [...document.querySelectorAll('[data-chart]')];
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'calc-reset';
  reset.textContent = 'Reset to the example values';
  function init() { renderForm(form, inputs, groups, defaults); form.append(reset); update(); }
  function draw(result) {
    const charts = result.ok ? graphs(result) : {};
    for (const host of hosts) {
      const id = host.dataset.chart;
      lineChart(host, document.querySelector(`[data-table="${id}"]`), charts[id] ?? { message: 'No graph until the inputs are valid.' });
    }
  }
  function update() {
    const raw = readForm(form, inputs);
    const result = compute(raw);
    syncForm(form, inputs, raw, new Set((result.errors ?? []).map(e => e.id)));
    results.textContent = '';
    noteList.textContent = '';
    status.className = `calc-status${result.ok ? '' : ' is-error'}`;
    status.textContent = result.ok ? 'Calculated within the stated model.' : 'Unavailable: correct these inputs.';
    if (!result.ok) {
      const ul = document.createElement('ul');
      for (const message of new Set(result.errors.map(e => e.message))) {
        const li = document.createElement('li'); li.textContent = message; ul.append(li);
      }
      status.append(ul);
    } else {
      for (const [label, value, unit = '', digits = 6] of rows(result)) {
        const tr = results.insertRow();
        const th = document.createElement('th'); th.scope = 'row'; th.textContent = label;
        const td = document.createElement('td');
        td.textContent = `${formatNumber(value, digits)}${unit ? ` ${unit}` : ''}`;
        tr.append(th, td);
      }
      for (const text of notes(result)) {
        const li = document.createElement('li'); li.textContent = text; noteList.append(li);
      }
    }
    draw(result);
  }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  reset.addEventListener('click', init);
  let resize;
  window.addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(update, 100); });
  init();
}
