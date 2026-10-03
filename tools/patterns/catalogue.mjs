// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile } from 'node:fs/promises';

const fields = {
  Description: 'description', 'Main function': 'function', Disciplines: 'disciplines',
  Applications: 'applications', Type: 'type', 'Arrangement and variants': 'arrangement',
  'Key constraints': 'constraints', 'Related patterns': 'related',
  'Usually combined with': 'combined', 'Usually followed by': 'followed',
};

export const slugify = text => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function parseSurvey(source) {
  const records = [];
  let current;
  for (const line of source.split('\n')) {
    const heading = /^### ([A-Z]+-\d{2}) — (.+)$/.exec(line);
    if (heading) {
      current = { id: heading[1], slug: slugify(heading[2]), title: heading[2] };
      records.push(current);
    } else if (/^## /.test(line)) current = null;
    const field = /^- \*\*([^*]+):\*\* (.+)$/.exec(line);
    if (current && field && fields[field[1]]) current[fields[field[1]]] = field[2];
  }
  const ids = new Set();
  for (const entry of records) {
    if (ids.has(entry.id)) throw new Error(`Duplicate pattern ${entry.id}`);
    ids.add(entry.id);
    for (const key of Object.values(fields)) {
      if (!entry[key]) throw new Error(`${entry.id}: missing ${key}`);
    }
    for (const key of ['disciplines', 'applications']) {
      entry[key] = entry[key].replace(/\.$/, '').split(';').map(value => value.trim());
    }
    entry.type = entry.type.replace(/\.$/, '');
  }
  if (!records.length) throw new Error('The pattern survey is empty');
  for (const entry of records) {
    for (const key of ['related', 'combined', 'followed']) {
      for (const link of entry[key].matchAll(/\]\(#([a-z]+-\d+)\)/g)) {
        if (!ids.has(link[1].toUpperCase())) throw new Error(`${entry.id}: unknown relation ${link[1]}`);
      }
    }
  }
  return records;
}

export async function readCatalogue() {
  return parseSurvey(await readFile(new URL('../../Patterns.md', import.meta.url), 'utf8'));
}

export function joinExamples(catalogue, examples) {
  const byId = new Map();
  for (const example of examples) {
    if (byId.has(example.id)) throw new Error(`Duplicate example ${example.id}`);
    byId.set(example.id, example);
  }
  const ids = new Set(catalogue.map(entry => entry.id));
  for (const id of byId.keys()) if (!ids.has(id)) throw new Error(`Unknown example ${id}`);
  return catalogue.map(entry => {
    if (!byId.has(entry.id)) throw new Error(`${entry.id}: missing authored example`);
    return { ...entry, example: byId.get(entry.id) };
  });
}
