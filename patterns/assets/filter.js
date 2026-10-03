// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export const filterFields = ['function', 'discipline', 'application', 'type', 'mode'];
const keys = { function: 'function', discipline: 'disciplines', application: 'applications', type: 'type', mode: 'mode' };
export const fold = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function readFilters(params) {
  return { q: params.get('q') || '', ...Object.fromEntries(filterFields.map(field => [field, params.getAll(field)])) };
}

export function filterParams(filters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  for (const field of filterFields) for (const value of filters[field] || []) params.append(field, value);
  return params;
}

export function matchesPattern(entry, filters) {
  const text = fold(entry.searchText || [entry.id, entry.title, entry.description, entry.function, ...(entry.disciplines || []), ...(entry.applications || []), entry.type].join(' '));
  if (!fold(filters.q || '').trim().split(/\s+/).every(word => text.includes(word))) return false;
  return filterFields.every(field => {
    const selected = filters[field] || [];
    const value = entry[keys[field]];
    const values = Array.isArray(value) ? value : [value];
    return !selected.length || selected.some(item => values.includes(item));
  });
}
