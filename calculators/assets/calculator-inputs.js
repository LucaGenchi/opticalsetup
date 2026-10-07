// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// DOM-free schema parsing shared by the small model calculators.
export function isInputActive(input, raw) {
  return !input.when || (input.whenValue === undefined
    ? Boolean(raw[input.when]) : raw[input.when] === input.whenValue);
}

export function parseInputs(inputs, raw) {
  const values = {}, errors = [];
  for (const input of inputs) {
    const v = raw[input.id];
    if (input.type === 'checkbox') {
      values[input.id] = v === true;
      continue;
    }
    if (!isInputActive(input, raw)) continue;
    if (input.type === 'select') {
      if (!input.options.some(([id]) => id === v)) errors.push({ id: input.id, message: `${input.label}: choose an option.` });
      else values[input.id] = v;
      continue;
    }
    const text = String(v ?? '').trim();
    const number = typeof v === 'number' ? v : Number(text.replace(',', '.'));
    if (!text || !Number.isFinite(number) || number < input.min || number > input.max) {
      errors.push({ id: input.id, message: `${input.label}: enter ${input.min}–${input.max}${input.unit ? ` ${input.unit}` : ''}.` });
    } else values[input.id] = number;
  }
  return { values, errors };
}

export const defaultsFor = inputs => Object.fromEntries(inputs.map(i => [i.id, i.value]));
export const unavailable = (message, ...ids) => ({ ok: false, errors: ids.map(id => ({ id, message })) });
