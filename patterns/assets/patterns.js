// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { filterFields, readFilters, filterParams, matchesPattern, fold } from './filter.js';

const form = document.querySelector('#pattern-filters');
if (form) {
  const catalogue = JSON.parse(document.querySelector('#pattern-data').textContent);
  const rows = new Map([...document.querySelectorAll('[data-pattern]')].map(row => [row.dataset.pattern, row]));
  const status = document.querySelector('#result-count');
  const query = form.elements.q;
  const checkboxes = [...form.querySelectorAll('input[type=checkbox]')];
  const current = () => ({ q: query.value, ...Object.fromEntries(filterFields.map(field => [field, checkboxes.filter(box => box.name === field && box.checked).map(box => box.value)])) });
  function update(writeURL = true) {
    const filters = current();
    let count = 0;
    for (const entry of catalogue) {
      const matches = matchesPattern(entry, filters);
      rows.get(entry.id).hidden = !matches;
      if (matches) count++;
    }
    for (const group of document.querySelectorAll('[data-group]')) group.hidden = ![...group.querySelectorAll('[data-pattern]')].some(row => !row.hidden);
    status.textContent = `${count} of ${catalogue.length} patterns`;
    document.querySelector('#no-results').hidden = count > 0;
    for (const field of filterFields) {
      const counter = document.querySelector(`[data-count="${field}"]`);
      counter.textContent = filters[field].length ? `(${filters[field].length})` : '';
    }
    if (writeURL) {
      const url = new URL(location.href);
      url.search = filterParams(filters).toString();
      history.replaceState(null, '', url);
    }
  }
  function restore() {
    const filters = readFilters(new URLSearchParams(location.search));
    query.value = filters.q;
    for (const box of checkboxes) box.checked = filters[box.name].includes(box.value);
    update(false);
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => {
    if (event.target.matches('[data-option-search]')) {
      const text = fold(event.target.value);
      for (const label of event.target.closest('details').querySelectorAll('.filter-option')) label.hidden = !fold(label.textContent).includes(text);
    } else update();
  });
  form.addEventListener('reset', () => {
    // reset fires before the browser restores form-control defaults.
    queueMicrotask(() => {
      for (const label of form.querySelectorAll('.filter-option')) label.hidden = false;
      update();
    });
  });
  document.querySelector('#clear-empty')?.addEventListener('click', () => form.reset());
  addEventListener('popstate', restore);
  restore();
}

const nodes = [...document.querySelectorAll('.diagram-node')];
function inspect(node) {
  for (const item of nodes) item.setAttribute('aria-pressed', String(item === node));
  const detail = document.getElementById(`node-${node.dataset.node}`);
  const output = document.querySelector('#node-inspector');
  if (detail && output) output.textContent = detail.textContent;
}
for (const node of nodes) {
  node.setAttribute('aria-pressed', 'false');
  node.addEventListener('click', () => inspect(node));
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(node); }
  });
}
const launch = document.querySelector('[data-embed-src]');
launch?.addEventListener('click', () => {
  const target = document.querySelector('#workbench');
  if (!target.querySelector('iframe')) {
    const iframe = document.createElement('iframe');
    iframe.src = launch.dataset.embedSrc;
    iframe.title = launch.dataset.embedTitle;
    iframe.allow = 'clipboard-write';
    target.append(iframe);
  }
  target.hidden = false;
  launch.hidden = true;
  target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
});
