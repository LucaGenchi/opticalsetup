// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// DOM-free schema parsing shared by the small model calculators.

// An input with `when` is active while that checkbox is ticked, or, with
// `whenValue`, while that select holds the value (or one of an array of them).
// With `all`, a list of such conditions, it is active while every one holds.
export function isInputActive(input, raw) {
  if (input.all) return input.all.every(condition => isInputActive(condition, raw));
  if (!input.when) return true;
  if (input.whenValue === undefined) return Boolean(raw[input.when]);
  const wanted = Array.isArray(input.whenValue) ? input.whenValue : [input.whenValue];
  return wanted.includes(raw[input.when]);
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
    // A file input reads as the chosen file's name; the page parses the
    // file itself and hands the result to the calculator.
    if (input.type === 'file') {
      values[input.id] = String(v ?? '');
      continue;
    }
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
