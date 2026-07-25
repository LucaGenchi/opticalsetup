import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_DESTINATIONS = new Map([
  ['opticalsetup.com', 'https://opticalsetup.com/sketch/'],
  ['picsetup.com', 'https://picsetup.com/'],
  ['electricalsetup.com', 'https://electricalsetup.com/'],
  ['biologicalsetup.com', 'https://biologicalsetup.com/'],
  ['gravitysetup.com', 'https://gravitysetup.com/'],
  ['twophotonlithography.com', 'https://twophotonlithography.com/'],
  ['egosetup.com', 'https://egosetup.com/'],
  ['quantumsetup.ai', 'https://quantumsetup.ai/'],
  ['noeticsetup.com', 'https://noeticsetup.com/'],
  ['computationsetup.com', 'https://computationsetup.com/'],
  ['logisticsetup.com', 'https://logisticsetup.com/'],
  ['molecularsetup.com', 'https://molecularsetup.com/'],
]);

function readAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
}

function setupLinks(html) {
  const menu = html.match(/<nav class="setup-universe-menu"[\s\S]*?<\/nav>/);
  assert.ok(menu, 'missing Setup Universe navigation');
  return [...menu[0].matchAll(/<a\b[^>]*>/g)].map(match => ({
    host: readAttribute(match[0], 'data-setup-host'),
    href: readAttribute(match[0], 'href'),
    current: readAttribute(match[0], 'aria-current'),
    target: readAttribute(match[0], 'target'),
  }));
}

for (const file of ['index.html', 'sketch/index.html']) {
  test(`${file} exposes the complete Setup Universe`, async () => {
    const html = await readFile(resolve(ROOT, file), 'utf8');
    const links = setupLinks(html);

    assert.equal(links.length, EXPECTED_DESTINATIONS.size);
    assert.deepEqual(
      new Map(links.map(({ host, href }) => [host, href])),
      EXPECTED_DESTINATIONS,
    );
    assert.deepEqual(
      links.filter(({ current }) => current).map(({ host, current }) => [host, current]),
      [['opticalsetup.com', 'page']],
    );
    assert.ok(links.every(({ target }) => target === null), 'destinations should open in the same tab');
  });
}

test('the workbench uses the compact navigator treatment', async () => {
  const html = await readFile(resolve(ROOT, 'sketch/index.html'), 'utf8');
  assert.match(html, /class="setup-universe-nav setup-universe-compact"/);
  assert.match(html, /aria-label="Open Setup Universe"/);
});
