// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { canonicalJSON } from './snapshot.js';

const groups = ['elements', 'beams'];

function patchItems(before, after) {
  const previous = new Map(before.map(item => [item.id, item]));
  const ids = new Set(after.map(item => item.id));
  const remove = before.filter(item => !ids.has(item.id)).map(item => item.id);
  const put = after.filter(item => !previous.has(item.id) || canonicalJSON(previous.get(item.id)) !== canonicalJSON(item));
  const usualOrder = [...before.filter(item => ids.has(item.id)), ...put.filter(item => !previous.has(item.id))];
  const order = after.some((item, index) => item.id !== usualOrder[index]?.id) ? after.map(item => item.id) : undefined;
  if (remove.length || put.length || order) return { remove, put, ...(order && { order }) };
}

export function diffScene(before, after) {
  const patch = {};
  for (const key of groups) {
    const change = patchItems(before[key], after[key]);
    if (change) patch[key] = change;
  }
  return patch;
}

export function applyScenePatch(scene, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !groups.includes(key))) throw new Error('Invalid scene patch');
  const next = { ...scene };
  for (const key of groups) {
    if (!Object.hasOwn(patch, key)) continue;
    const { remove, put, order } = patch[key];
    const items = new Map(scene[key].map(item => [item.id, item]));
    if (!Array.isArray(remove) || !Array.isArray(put)) throw new Error('Invalid scene patch');
    for (const id of remove) if (!items.delete(id)) throw new Error('Unknown removed item');
    const changed = new Set();
    for (const item of put) {
      if (typeof item?.id !== 'string' || changed.has(item.id)) throw new Error('Invalid patched item');
      changed.add(item.id);
      items.set(item.id, item);
    }
    if (order === undefined) next[key] = [...items.values()];
    else {
      if (!Array.isArray(order) || order.length !== items.size || new Set(order).size !== items.size || order.some(id => !items.has(id))) throw new Error('Invalid item order');
      next[key] = order.map(id => items.get(id));
    }
  }
  return next;
}
