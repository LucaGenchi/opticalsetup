// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { renderForm, readForm, syncForm, lineChart, formatNumber } from './calculator-kit.js';

// Mounts one calculator panel. `panel` is the id prefix the page generator
// gave it (`calc` for the main panel: calc-form, calc-status, ...). A group
// with `form: '<id>'` renders into that form instead, for controls placed
// elsewhere on the page; the plot range below the graphs uses `plot-form`.
// `rows` returns [label, value, unit, digits] arrays, or { group } headings;
// a page with several result tables returns { <id>: rows } for the tables
// `<id>-results` (the main one is the panel's own id). A value may be text.
// `compute` may return { pending: true, message } while data loads, and
// `onResult` sees every result, so one panel can feed another; the returned
// `update` recomputes the panel. With `hideInactive`, fields whose `when`
// condition is off disappear instead of being greyed out, for pages where
// a mode selector decides which fields apply. `context` adds values from
// elsewhere on the page that `when` conditions may test (a source chosen in
// another panel). On a page where several panels draw graphs, `charts`
// lists the chart ids this panel owns; without it the panel draws them all.
export function mountCalculator({ panel = 'calc', inputs, defaults, groups, compute, rows, notes = () => [], graphs = null, charts = null, onResult = () => {}, hideInactive = false, context = () => ({}) }) {
  const mainId = `${panel}-form`;
  const formIds = [...new Set([mainId, ...Object.values(groups).map(g => g.form ?? mainId)])];
  const forms = formIds.map(id => document.getElementById(id));
  if (hideInactive) forms.forEach(form => form.classList.add('hide-inactive'));
  const status = document.getElementById(`${panel}-status`);
  const tables = [...forms[0].closest('section').querySelectorAll('table.calc-results')];
  // Tables elsewhere on the page that the last result filled.
  const filled = new Set();
  const noteList = document.getElementById(`${panel}-notes`);
  const hosts = graphs ? [...document.querySelectorAll('[data-chart]')].filter(h => !charts || charts.includes(h.dataset.chart)) : [];
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
      if (typeof value === 'string') { td.className = 'text'; td.textContent = value; tr.append(th, td); continue; }
      const shown = formatNumber(value, digits);
      td.textContent = shown === '—' || !unit ? shown : `${shown} ${unit}`;
      tr.append(th, td);
    }
  }
  function draw(result) {
    const drawn = result.ok ? graphs(result) : {};
    const message = result.pending ? result.message : 'No graph until the inputs are valid.';
    for (const host of hosts) {
      const id = host.dataset.chart;
      lineChart(host, document.querySelector(`[data-table="${id}"]`), drawn[id] ?? { message });
    }
  }
  function update() {
    const raw = readForm(forms, inputs);
    const result = compute(raw);
    syncForm(forms, inputs, { ...raw, ...context() }, new Set((result.errors ?? []).map(e => e.id)));
    for (const table of [...tables, ...filled]) table.textContent = '';
    filled.clear();
    noteList.textContent = '';
    status.className = `calc-status${result.ok || result.pending ? '' : ' is-error'}`;
    // A valid result needs no banner; the status line appears only for an
    // error or while data loads.
    status.textContent = result.ok ? '' : result.pending ? result.message : 'Unavailable: correct these inputs.';
    if (result.pending) {
      // Nothing to list while data loads.
    } else if (!result.ok) {
      const ul = document.createElement('ul');
      for (const message of new Set(result.errors.map(e => e.message))) {
        const li = document.createElement('li'); li.textContent = message; ul.append(li);
      }
      status.append(ul);
    } else {
      const out = rows(result);
      for (const [id, list] of Object.entries(Array.isArray(out) ? { [panel]: out } : out)) {
        const table = document.getElementById(`${id}-results`);
        fill(table, list);
        filled.add(table);
      }
      for (const text of notes(result)) {
        const li = document.createElement('li'); li.textContent = text; noteList.append(li);
      }
    }
    if (graphs) draw(result);
    onResult(result);
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
  return { update };
}
