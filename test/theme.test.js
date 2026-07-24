import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, toggledTheme } from '../sketch/js/theme.js';

test('theme preference falls back to the operating-system appearance', () => {
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme('unexpected', true), 'dark');
});

test('an explicit appearance overrides the operating-system preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('theme toggle always selects the opposite appearance', () => {
  assert.equal(toggledTheme('light'), 'dark');
  assert.equal(toggledTheme('dark'), 'light');
});
