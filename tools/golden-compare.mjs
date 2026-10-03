// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Shared by the regression suite and update-golden --check.
const REL_TOL = 1e-6;

export function goldenDifferences(expected, actual, path = '', out = []) {
  if (typeof expected === 'number' || typeof actual === 'number') {
    // A NaN is equal to nothing and an infinity makes the relative scale
    // infinite, so neither can be allowed into the tolerance comparison:
    // both would pass as "no difference".
    // Either side being non-finite is a difference, even if both are: a
    // committed snapshot can never hold one (they are recorded as markers),
    // so this keeps the comparator's own contract simple.
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
      out.push(`${path}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
      return out;
    }
    const scale = Math.max(Math.abs(expected), Math.abs(actual), 1e-12);
    if (Math.abs(expected - actual) > REL_TOL * scale) out.push(`${path}: ${expected} → ${actual}`);
    return out;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      out.push(`${path}: array ${JSON.stringify(expected)?.slice(0, 80)} → ${JSON.stringify(actual)?.slice(0, 80)}`);
      return out;
    }
    expected.forEach((v, i) => goldenDifferences(v, actual[i], `${path}[${i}]`, out));
    return out;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      goldenDifferences(expected[key], actual[key], path ? `${path}.${key}` : key, out);
    }
    return out;
  }
  if (expected !== actual) out.push(`${path}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
  return out;
}
