// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Display-only styling. Never reorder the simulation's element array.
export function displayOpacity(el) {
  const value = Number(el.opacity ?? 100);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 1;
}

export function displayOrder(elements) {
  const rank = el => Number.isFinite(el.displayOrder) ? el.displayOrder : 0;
  return [...elements].sort((a, b) => rank(a) - rank(b));
}

export function moveToEdge(elements, selected, edge) {
  if (!elements.includes(selected)) return;
  const ordered = displayOrder(elements).filter(el => el !== selected);
  if (edge === 'front') ordered.push(selected);
  else ordered.unshift(selected);
  ordered.forEach((el, index) => { el.displayOrder = index; });
}
