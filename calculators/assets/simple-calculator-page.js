// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { renderForm, readForm, syncForm, lineChart, formatNumber } from './calculator-kit.js';

// Mounts one calculator panel. `panel` is the id prefix the page generator
// gave it (`calc` for the main panel: calc-form, calc-status, ...). A group
// with `form: '<id>'` renders into that form instead, for controls placed
// elsewhere on the page; the plot range below the graphs uses `plot-form`.
// `rows` returns [label, value, unit, digits] arrays, or { group } headings;
// a page with several result tables returns { <id>: rows } for the tables
// `<id>-results` (the main one is the panel's own id).
export function mountCalculator({ panel = 'calc', inputs, defaults, groups, compute, rows, notes = () => [], graphs = null }) {
  const mainId = `${panel}-form`;
  const formIds = [...new Set([mainId, ...Object.values(groups).map(g => g.form ?? mainId)])];
  const forms = formIds.map(id => document.getElementById(id));
  const status = document.getElementById(`${panel}-status`);
  const tables = [...forms[0].closest('section').querySelectorAll('table.calc-results')];
  const noteList = document.getElementById(`${panel}-notes`);
  const hosts = graphs ? [...document.querySelectorAll('[data-chart]')] : [];
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'calc-reset';
  reset.textContent = 'Reset to the example values';
  function init() {
    formIds.forEach((id, k) => renderForm(forms[k], inputs,
      Object.fromEntries(Object.entries(groups).filter(([, g]) => (g.form ?? mainId) === id)), defaults));
    (document.getElementById(`${panel}-actions`) ?? forms[0]).append(reset);
    update();
  }
  function fill(table, list) {
    for (const row of list) {
      const tr = table.insertRow();
      const th = document.createElement('th');
      if (row.group) {
        tr.className = 'group';
        th.colSpan = 2; th.scope = 'colgroup'; th.textContent = row.group;
        tr.append(th);
        continue;
      }
      const [label, value, unit = '', digits = 6] = row;
      th.scope = 'row'; th.textContent = label;
      const td = document.createElement('td');
      const shown = formatNumber(value, digits);
      td.textContent = shown === '—' || !unit ? shown : `${shown} ${unit}`;
      tr.append(th, td);
    }
  }
  function draw(result) {
    const charts = result.ok ? graphs(result) : {};
    for (const host of hosts) {
      const id = host.dataset.chart;
      lineChart(host, document.querySelector(`[data-table="${id}"]`), charts[id] ?? { message: 'No graph until the inputs are valid.' });
    }
  }
  function update() {
    const raw = readForm(forms, inputs);
    const result = compute(raw);
    syncForm(forms, inputs, raw, new Set((result.errors ?? []).map(e => e.id)));
    for (const table of tables) table.textContent = '';
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
      const out = rows(result);
      for (const [id, list] of Object.entries(Array.isArray(out) ? { [panel]: out } : out)) {
        fill(document.getElementById(`${id}-results`), list);
      }
      for (const text of notes(result)) {
        const li = document.createElement('li'); li.textContent = text; noteList.append(li);
      }
    }
    if (graphs) draw(result);
  }
  for (const form of forms) {
    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('input', update);
    form.addEventListener('change', update);
  }
  reset.addEventListener('click', init);
  if (graphs) {
    let resize;
    window.addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(update, 100); });
  }
  init();
}
